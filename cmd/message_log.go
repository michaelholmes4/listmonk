package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/knadh/listmonk/internal/manager"
	"github.com/knadh/listmonk/internal/msglog"
	"github.com/knadh/listmonk/models"
	"github.com/labstack/echo/v4"
)

// fork: the message log (internal/msglog). Messengers are wrapped so that every email
// handed to one is recorded with its outcome. There is one wrapper per kind of sender, and the
// wrapper supplies the source of messages that don't say (a campaign says so itself):
//
//	logMessenger(m, msglog.SourceTx)           the campaign manager: campaigns, /api/tx, automations
//	logMessenger(m, msglog.SourceNotification) admin notifications and opt-in confirmations
//	logMessenger(m, msglog.SourceSystem)       password resets, data exports: recorded without content
//
// /api/tx mail is recorded without content too, unless `message_log.tx_content` is set:
// other apps send their password resets and login codes through it. Automation mail is always kept.

// defaultMessageLogDays is how long entries are kept unless `message_log.retention_days` says otherwise.
const defaultMessageLogDays = 90

// logKeepsContent reports whether the body of a source's messages is stored.
func logKeepsContent(source string) bool {
	switch source {
	case msglog.SourceNotification:
		return true
	case msglog.SourceTx:
		return ko.Bool("message_log.tx_content")
	}
	return false
}

var msgLog struct {
	once   sync.Once
	store  *msglog.Store
	writer *msglog.Writer
}

func messageLog() (*msglog.Store, *msglog.Writer) {
	msgLog.once.Do(func() {
		days := defaultMessageLogDays
		if ko.Exists("message_log.retention_days") {
			days = ko.Int("message_log.retention_days")
		}
		msgLog.store = msglog.NewStore(db)
		msgLog.writer = msglog.NewWriter(msgLog.store, lo, time.Duration(days)*24*time.Hour)
	})
	return msgLog.store, msgLog.writer
}

// wrapMessageLog wraps a messenger of the campaign manager.
func wrapMessageLog(m manager.Messenger) manager.Messenger {
	return logMessenger(m, msglog.SourceTx)
}

// logMessenger wraps m so that what it sends is logged.
func logMessenger(m manager.Messenger, source string) manager.Messenger {
	_, w := messageLog()
	return msglog.Wrap(m, w, source, logKeepsContent(source))
}

// closeMessageLog writes out what is queued. Call it before the database is closed.
func closeMessageLog() {
	_, w := messageLog()
	w.Close()
}

const maxMessageLogPage = 1000

// messageDetail is a logged message as the API returns it. The content itself is served by
// the preview endpoint.
type messageDetail struct {
	msglog.Detail
	// Content is "stored" (the exact email was kept), "rerender" (it is rebuilt from the campaign
	// and subscriber when viewed) or "none" (not kept, as for password resets).
	Content string `json:"content"`
}

func contentKind(d msglog.Detail) string {
	switch {
	case d.Body != nil:
		return "stored"
	case d.CampaignID != nil && d.SubscriberID != nil:
		return "rerender"
	default:
		return "none"
	}
}

// GetMessageLog lists logged messages.
func (a *App) GetMessageLog(c echo.Context) error {
	var (
		q  = c.Request().URL.Query()
		pg = a.pg.NewFromURL(q)
		f  = msglog.Filter{
			Search:    q.Get("query"),
			Status:    q.Get("status"),
			Source:    q.Get("source"),
			Ascending: q.Get("order") == "asc",
			Offset:    pg.Offset,
			Limit:     pg.Limit,
		}
	)
	f.SubscriberID, _ = strconv.Atoi(q.Get("subscriber_id"))
	f.CampaignID, _ = strconv.Atoi(q.Get("campaign_id"))
	f.AutomationID, _ = strconv.Atoi(q.Get("automation_id"))
	for k, dst := range map[string]*time.Time{"since": &f.Since, "until": &f.Until} {
		if v := q.Get(k); v != "" {
			t, err := time.Parse(time.RFC3339, v)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, a.i18n.T("globals.messages.invalidData"))
			}
			*dst = t
		}
	}

	// per_page=all would be one row per campaign recipient.
	if f.Limit <= 0 || f.Limit > maxMessageLogPage {
		f.Limit = maxMessageLogPage
	}

	store, _ := messageLog()
	rows, total, err := store.Query(c.Request().Context(), f)
	if err != nil {
		a.log.Printf("error querying the message log: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, a.i18n.T("globals.messages.internalError"))
	}
	return c.JSON(http.StatusOK, okResp{models.PageResults{Results: rows, Total: total, Page: pg.Page, PerPage: pg.PerPage}})
}

// GetMessageLogEntry returns one logged message, without its content.
func (a *App) GetMessageLogEntry(c echo.Context) error {
	d, err := a.messageLogEntry(c)
	if err != nil {
		return err
	}
	out := messageDetail{Detail: d, Content: contentKind(d)}
	out.Body = nil
	return c.JSON(http.StatusOK, okResp{out})
}

// PreviewMessageLogEntry returns the HTML of a logged message: the exact email when it was
// kept, otherwise the campaign's email re-rendered for that subscriber.
func (a *App) PreviewMessageLogEntry(c echo.Context) error {
	d, err := a.messageLogEntry(c)
	if err != nil {
		return err
	}

	// Whatever the email contains runs in the admin's origin if this URL is opened directly.
	c.Response().Header().Set("Content-Security-Policy", "sandbox allow-scripts")

	switch contentKind(d) {
	case "stored":
		return c.HTML(http.StatusOK, msglog.PreviewHTML(*d.Body, d.ContentType == models.CampaignContentTypePlain))

	case "rerender":
		camp, err := a.core.GetCampaignForPreview(*d.CampaignID, 0)
		if err != nil {
			return err
		}
		sub, err := a.core.GetSubscriber(*d.SubscriberID, "", "")
		if err != nil {
			return err
		}
		// A dummy campaign UUID keeps {{ TrackView }} and {{ TrackLink }} from registering anything.
		camp.UUID = dummySubscriber.UUID
		if err := camp.CompileTemplate(a.manager.TemplateFuncs(&camp)); err != nil {
			a.log.Printf("error compiling campaign %d for the message log: %v", camp.ID, err)
			return echo.NewHTTPError(http.StatusInternalServerError, a.i18n.T("globals.messages.internalError"))
		}
		msg, err := a.manager.NewCampaignMessage(&camp, sub)
		if err != nil {
			a.log.Printf("error rendering campaign %d for the message log: %v", camp.ID, err)
			return echo.NewHTTPError(http.StatusInternalServerError, a.i18n.T("globals.messages.internalError"))
		}
		// Rendered for the real subscriber, so its links act on them: strip them like a stored one's.
		return c.HTML(http.StatusOK, msglog.PreviewHTML(string(msg.Body()), camp.ContentType == models.CampaignContentTypePlain))
	}
	return echo.NewHTTPError(http.StatusNotFound, a.i18n.Ts("globals.messages.notFound", "name", "message"))
}

func (a *App) messageLogEntry(c echo.Context) (msglog.Detail, error) {
	store, _ := messageLog()
	d, err := store.Get(c.Request().Context(), int64(getID(c)))
	if errors.Is(err, sql.ErrNoRows) {
		return d, echo.NewHTTPError(http.StatusNotFound, a.i18n.Ts("globals.messages.notFound", "name", "message"))
	}
	if err != nil {
		a.log.Printf("error reading the message log: %v", err)
		return d, echo.NewHTTPError(http.StatusInternalServerError, a.i18n.T("globals.messages.internalError"))
	}
	return d, nil
}

// DeleteOldMessageLog is the maintenance action that removes logged messages older than `before_date`.
func (a *App) DeleteOldMessageLog(c echo.Context) error {
	t, err := time.Parse(time.RFC3339, c.FormValue("before_date"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, a.i18n.T("globals.messages.invalidData"))
	}
	store, _ := messageLog()
	n, err := store.DeleteBefore(c.Request().Context(), t)
	if err != nil {
		a.log.Printf("error deleting from the message log: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, a.i18n.T("globals.messages.internalError"))
	}
	return c.JSON(http.StatusOK, okResp{map[string]int64{"deleted": n}})
}

// initMessageLogRoutes registers the message log API (called from initAutomationRoutes, see FORK.md).
func initMessageLogRoutes(g *echo.Group, a *App) {
	pm := a.auth.Perm
	const get = "message_log:get"

	g.GET("/api/message-log", pm(a.GetMessageLog, get))
	g.GET("/api/message-log/:id", pm(hasID(a.GetMessageLogEntry), get))
	g.GET("/api/message-log/:id/preview", pm(hasID(a.PreviewMessageLogEntry), get))
	g.DELETE("/api/maintenance/message-log", pm(a.DeleteOldMessageLog, "settings:maintain"))
}
