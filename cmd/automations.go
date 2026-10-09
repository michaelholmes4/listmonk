package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/knadh/koanf/v2"
	"github.com/knadh/listmonk/internal/auth"
	"github.com/knadh/listmonk/internal/automation"
	"github.com/knadh/listmonk/internal/core"
	"github.com/knadh/listmonk/internal/manager"
	"github.com/knadh/listmonk/models"
	"github.com/knadh/stuffbin"
	"github.com/labstack/echo/v4"
)

// librelist fork: marketing automation. The engine lives in internal/automation; this file wires
// it to the app (startup, trigger hooks) and exposes the admin API.

// initAutomation creates the engine and connects it to the core's trigger hooks. Workers only run
// when the instance processes campaigns (not in passive mode), since they send through the manager.
func initAutomation(fs stuffbin.FileSystem, db *sqlx.DB, co *core.Core, mgr *manager.Manager, lo *log.Logger, ko *koanf.Koanf) *automation.Engine {
	b, err := fs.Read("/queries/automations.sql")
	if err != nil {
		lo.Fatalf("error reading automation queries: %v", err)
	}
	q, err := automation.ParseQueries(b)
	if err != nil {
		lo.Fatalf("error loading automation queries: %v", err)
	}

	eng, err := automation.New(automation.Config{
		DB:      db,
		Queries: q,
		Sender:  newAutomationSender(co, mgr),
		Log:     lo,
		Workers: 4,
	})
	if err != nil {
		lo.Fatalf("error initializing automations: %v", err)
	}

	if !ko.Bool("passive") {
		if err := eng.Start(context.Background()); err != nil {
			lo.Fatalf("error starting automations: %v", err)
		}
	}

	ctx := context.Background()
	co.SetAutomationHooks(
		func(subID int, listIDs []int) {
			for _, l := range listIDs {
				if err := eng.OnListJoined(ctx, subID, l); err != nil {
					lo.Printf("automation: list trigger for subscriber %d: %v", subID, err)
				}
			}
		},
		func(subID int, before, after map[string]any) {
			if err := eng.OnAttributesChanged(ctx, subID, before, after); err != nil {
				lo.Printf("automation: attribute trigger for subscriber %d: %v", subID, err)
			}
		},
	)
	return eng
}

// --- Responses ------------------------------------------------------------------------------------

// autoErr maps the engine's errors to HTTP ones. Validation problems are returned in full, as
// `data.problems`, so the builder can mark every step at fault.
func (a *App) autoErr(c echo.Context, err error) error {
	var inv *automation.InvalidError
	switch {
	case errors.As(err, &inv):
		return c.JSON(http.StatusBadRequest, map[string]any{
			"message": inv.Error(),
			"data":    map[string]any{"problems": inv.Problems},
		})
	case errors.Is(err, automation.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, a.i18n.Ts("globals.messages.notFound", "name", "automation"))
	case errors.Is(err, automation.ErrConflict):
		return echo.NewHTTPError(http.StatusConflict, strings.TrimPrefix(err.Error(), "conflict: "))
	case errors.Is(err, automation.ErrInvalid):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	a.log.Printf("automation: %v", err)
	return echo.NewHTTPError(http.StatusInternalServerError, "automation error: "+err.Error())
}

// allowSQL says whether the user may use raw SQL conditions (the same permission as the
// subscribers' advanced query: it runs arbitrary SELECTs).
func allowSQL(c echo.Context) bool {
	u := auth.GetUser(c)
	return u.HasPerm(auth.PermSubscribersSqlQuery)
}

// --- Automations ----------------------------------------------------------------------------------

type automationReq struct {
	Name     string              `json:"name"`
	Settings automation.Settings `json:"settings"`
}

// GetAutomations lists automations with their enrollment counts.
func (a *App) GetAutomations(c echo.Context) error {
	pg := a.pg.NewFromURL(c.Request().URL.Query())
	o := automation.ListOpts{
		Query:   strings.TrimSpace(c.FormValue("query")),
		Manual:  c.FormValue("manual") == "true",
		OrderBy: c.FormValue("order_by"),
		Order:   c.FormValue("order"),
		Page:    pg.Page,
		PerPage: pg.PerPage,
	}
	if pg.PerPage == 0 {
		o.PerPage = 0
	}
	for _, s := range c.QueryParams()["status"] {
		o.Statuses = append(o.Statuses, automation.Status(s))
	}
	rows, total, err := a.automation.Store().List(c.Request().Context(), o)
	if err != nil {
		return a.autoErr(c, err)
	}
	if rows == nil {
		rows = []automation.Row{}
	}
	return c.JSON(http.StatusOK, okResp{models.PageResults{
		Query: o.Query, Results: rows, Total: total, Page: pg.Page, PerPage: pg.PerPage,
	}})
}

// GetAutomation returns one automation with its counts.
func (a *App) GetAutomation(c echo.Context) error {
	au, err := a.automation.Store().Get(c.Request().Context(), getID(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{au})
}

// CreateAutomation creates an empty draft.
func (a *App) CreateAutomation(c echo.Context) error {
	var req automationReq
	if err := c.Bind(&req); err != nil {
		return err
	}
	au, err := a.automation.Store().Create(c.Request().Context(), req.Name, req.Settings)
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{au})
}

// UpdateAutomation changes the name and the automation-wide settings.
func (a *App) UpdateAutomation(c echo.Context) error {
	var req automationReq
	if err := c.Bind(&req); err != nil {
		return err
	}
	au, err := a.automation.Store().Update(c.Request().Context(), getID(c), req.Name, req.Settings, allowSQL(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{au})
}

// DeleteAutomation removes an automation that is not live.
func (a *App) DeleteAutomation(c echo.Context) error {
	if err := a.automation.Store().Delete(c.Request().Context(), getID(c)); err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{true})
}

// GetAutomationDraft returns the draft graph (created on first use).
func (a *App) GetAutomationDraft(c echo.Context) error {
	v, err := a.automation.Store().Draft(c.Request().Context(), getID(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{v})
}

// SaveAutomationDraft stores the draft. An incomplete draft is fine; the problems found so far
// come back with it so the builder can show them while editing.
func (a *App) SaveAutomationDraft(c echo.Context) error {
	var g automation.Graph
	if err := c.Bind(&g); err != nil {
		return err
	}
	v, problems, err := a.automation.Store().SaveDraft(c.Request().Context(), getID(c), &g, allowSQL(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	if problems == nil {
		problems = []automation.Problem{}
	}
	return c.JSON(http.StatusOK, okResp{map[string]any{"version": v, "problems": problems}})
}

// PublishAutomation freezes the draft and makes it live. With `enroll_existing`, the current
// members of the lists that trigger it are enrolled too (in the background, as there may be many).
func (a *App) PublishAutomation(c echo.Context) error {
	var req struct {
		EnrollExisting bool `json:"enroll_existing"`
	}
	_ = c.Bind(&req)

	ctx := c.Request().Context()
	au, v, err := a.automation.Store().Publish(ctx, getID(c), allowSQL(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	if req.EnrollExisting {
		go a.enrollExisting(au.ID, v.Graph)
	}
	return c.JSON(http.StatusOK, okResp{map[string]any{"automation": au, "version": v}})
}

// enrollExisting enrolls the members of a "joined a list" trigger's lists, in pages.
func (a *App) enrollExisting(id int, raw json.RawMessage) {
	g, err := automation.ParseGraph(raw)
	if err != nil {
		return
	}
	ctx := context.Background()
	for _, t := range g.Triggers {
		if t.Type != automation.TriggerListJoined {
			continue
		}
		var cfg automation.TriggerConfig
		if json.Unmarshal(t.Config, &cfg) != nil || cfg.ListID == 0 {
			continue
		}
		after := 0
		for {
			ids, err := a.automation.Store().SubscriberIDsOnList(ctx, cfg.ListID, after, 500)
			if err != nil {
				a.log.Printf("automation %d: listing existing members: %v", id, err)
				break
			}
			if len(ids) == 0 {
				break
			}
			if _, err := a.automation.EnrollMany(ctx, id, ids, automation.TriggerListJoined); err != nil {
				a.log.Printf("automation %d: enrolling existing members: %v", id, err)
				break
			}
			after = ids[len(ids)-1]
		}
	}
}

func (a *App) PauseAutomation(c echo.Context) error {
	au, err := a.automation.Pause(c.Request().Context(), getID(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{au})
}

func (a *App) ResumeAutomation(c echo.Context) error {
	au, err := a.automation.Resume(c.Request().Context(), getID(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{au})
}

func (a *App) ArchiveAutomation(c echo.Context) error {
	au, err := a.automation.Archive(c.Request().Context(), getID(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{au})
}

// EnrollInAutomation enrolls subscribers into an active automation that has a manual trigger.
func (a *App) EnrollInAutomation(c echo.Context) error {
	var req struct {
		SubscriberIDs []int `json:"subscriber_ids"`
	}
	if err := c.Bind(&req); err != nil {
		return err
	}
	if len(req.SubscriberIDs) == 0 || len(req.SubscriberIDs) > 1000 {
		return echo.NewHTTPError(http.StatusBadRequest, a.i18n.Ts("globals.messages.invalidFields", "name", "subscriber_ids (1 to 1000)"))
	}
	n, err := a.automation.EnrollManually(c.Request().Context(), getID(c), req.SubscriberIDs)
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{map[string]int{"enrolled": n}})
}

func (a *App) GetAutomationVersions(c echo.Context) error {
	vs, err := a.automation.Store().Versions(c.Request().Context(), getID(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	if vs == nil {
		vs = []automation.Version{}
	}
	return c.JSON(http.StatusOK, okResp{vs})
}

// GetAutomationEnrollments lists who is, or was, in an automation.
func (a *App) GetAutomationEnrollments(c echo.Context) error {
	pg := a.pg.NewFromURL(c.Request().URL.Query())
	var statuses []automation.EnrollmentStatus
	for _, s := range c.QueryParams()["status"] {
		statuses = append(statuses, automation.EnrollmentStatus(s))
	}
	query := strings.TrimSpace(c.FormValue("query"))
	rows, total, err := a.automation.Store().Enrollments(c.Request().Context(), getID(c), statuses, query, pg.Page, pg.PerPage)
	if err != nil {
		return a.autoErr(c, err)
	}
	if rows == nil {
		rows = []automation.EnrollmentRow{}
	}
	return c.JSON(http.StatusOK, okResp{models.PageResults{
		Query: query, Results: rows, Total: total, Page: pg.Page, PerPage: pg.PerPage,
	}})
}

// GetEnrollmentSteps returns the step-by-step history of one enrollment.
func (a *App) GetEnrollmentSteps(c echo.Context) error {
	eid, _ := strconv.ParseInt(c.Param("eid"), 10, 64)
	if eid < 1 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid ID")
	}
	// The enrollment must belong to the automation in the URL.
	rows, _, err := a.automation.Store().Enrollments(c.Request().Context(), getID(c), nil, "", 1, 0)
	if err != nil {
		return a.autoErr(c, err)
	}
	found := false
	for _, r := range rows {
		if r.ID == eid {
			found = true
			break
		}
	}
	if !found {
		return a.autoErr(c, automation.ErrNotFound)
	}
	steps, err := a.automation.Store().Steps(c.Request().Context(), eid)
	if err != nil {
		return a.autoErr(c, err)
	}
	if steps == nil {
		steps = []automation.Step{}
	}
	return c.JSON(http.StatusOK, okResp{steps})
}

// GetAutomationStats returns how many enrollments reached, passed and failed each step.
func (a *App) GetAutomationStats(c echo.Context) error {
	st, err := a.automation.Store().NodeStats(c.Request().Context(), getID(c))
	if err != nil {
		return a.autoErr(c, err)
	}
	if st == nil {
		st = []automation.NodeStat{}
	}
	return c.JSON(http.StatusOK, okResp{st})
}

// CreateAutomationEmail creates the hidden campaign that holds a new email step's content. The
// builder then edits it with the ordinary campaign editor and puts its ID in the step.
func (a *App) CreateAutomationEmail(c echo.Context) error {
	var req struct {
		Name        string `json:"name"`
		Subject     string `json:"subject"`
		FromEmail   string `json:"from_email"`
		ListID      int    `json:"list_id"`
		ContentType string `json:"content_type"`
		Body        string `json:"body"`
		TemplateID  int    `json:"template_id"`
	}
	if err := c.Bind(&req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, a.i18n.Ts("globals.messages.invalidFields", "name", "name"))
	}
	if req.FromEmail == "" {
		req.FromEmail = a.cfg.FromEmail
	}
	// The topic list must be one the user may manage.
	if req.ListID > 0 {
		u := auth.GetUser(c)
		if err := u.HasListPerm(auth.PermTypeManage, req.ListID); err != nil {
			return err
		}
	}
	id, err := a.automation.Store().CreateStepCampaign(c.Request().Context(), automation.StepCampaign{
		Name: req.Name, Subject: req.Subject, FromEmail: req.FromEmail, Messenger: "email",
		ContentType: req.ContentType, Body: req.Body, TemplateID: req.TemplateID, ListID: req.ListID,
	})
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{map[string]int{"campaign_id": id}})
}

// UpdateAutomationEmail updates the content of an email step's hidden campaign. It takes the same
// fields as PUT /api/campaigns/:id but needs no `lists`: the campaign's list is its step's topic,
// which the automation's draft sets (a transactional step has none). Edits go out on the next send.
func (a *App) UpdateAutomationEmail(c echo.Context) error {
	id := getID(c)
	cm, err := a.core.GetCampaign(id, "", "")
	if err != nil {
		return err
	}
	if cm.Type != "automation" {
		return echo.NewHTTPError(http.StatusNotFound, a.i18n.Ts("globals.messages.notFound", "name", "{globals.terms.campaign}"))
	}

	// As in UpdateCampaign: fields not in the request keep their stored values.
	cm.Attribs = nil
	o := campReq{Campaign: cm}
	if err := c.Bind(&o); err != nil {
		return err
	}
	lists, media := jsonIDs(cm.Lists), jsonIDs(cm.Media)
	if o.MediaIDs != nil {
		media = o.MediaIDs
	}
	// Never scheduled or archived: the automation engine sends it, one subscriber at a time.
	o.SendAt.Valid, o.Archive = false, false

	// validateCampaignFields insists on lists, which an automation email may not have.
	o.ListIDs = []int{0}
	if o, err = a.validateCampaignFields(o); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	out, err := a.core.UpdateCampaign(id, o.Campaign, lists, media)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, okResp{out})
}

// jsonIDs reads the IDs out of a campaign's `lists` or `media` JSON ([{"id": 1, ...}, ...]).
func jsonIDs(j []byte) []int {
	var rows []struct {
		ID int `json:"id"`
	}
	_ = json.Unmarshal(j, &rows)
	ids := make([]int, 0, len(rows))
	for _, r := range rows {
		if r.ID > 0 {
			ids = append(ids, r.ID)
		}
	}
	return ids
}

// --- A subscriber's side --------------------------------------------------------------------------

// GetSubscriberAutomations lists the automations a subscriber is, or was, in.
func (a *App) GetSubscriberAutomations(c echo.Context) error {
	id := getID(c)
	if err := a.hasSubPerm(auth.GetUser(c), []int{id}); err != nil {
		return err
	}
	rows, err := a.automation.Store().SubscriberEnrollments(c.Request().Context(), id)
	if err != nil {
		return a.autoErr(c, err)
	}
	if rows == nil {
		rows = []automation.SubscriberEnrollment{}
	}
	return c.JSON(http.StatusOK, okResp{rows})
}

// GetSubscriberEvents lists the events recorded for a subscriber, newest first.
func (a *App) GetSubscriberEvents(c echo.Context) error {
	id := getID(c)
	if err := a.hasSubPerm(auth.GetUser(c), []int{id}); err != nil {
		return err
	}
	pg := a.pg.NewFromURL(c.Request().URL.Query())
	evs, total, err := a.automation.Store().Events(c.Request().Context(), id, pg.Page, pg.PerPage)
	if err != nil {
		return a.autoErr(c, err)
	}
	if evs == nil {
		evs = []automation.Event{}
	}
	return c.JSON(http.StatusOK, okResp{models.PageResults{Results: evs, Total: total, Page: pg.Page, PerPage: pg.PerPage}})
}

// initAutomationRoutes registers the automation API (see FORK.md: one call from initHTTPHandlers).
func initAutomationRoutes(g *echo.Group, a *App) {
	pm := a.auth.Perm
	const get, manage = "automations:get", "automations:manage"

	g.GET("/api/automations", pm(a.GetAutomations, get))
	g.POST("/api/automations", pm(a.CreateAutomation, manage))
	g.GET("/api/automations/:id", pm(hasID(a.GetAutomation), get))
	g.PUT("/api/automations/:id", pm(hasID(a.UpdateAutomation), manage))
	g.DELETE("/api/automations/:id", pm(hasID(a.DeleteAutomation), manage))
	g.GET("/api/automations/:id/draft", pm(hasID(a.GetAutomationDraft), get))
	g.PUT("/api/automations/:id/draft", pm(hasID(a.SaveAutomationDraft), manage))
	g.POST("/api/automations/:id/publish", pm(hasID(a.PublishAutomation), manage))
	g.POST("/api/automations/:id/pause", pm(hasID(a.PauseAutomation), manage))
	g.POST("/api/automations/:id/resume", pm(hasID(a.ResumeAutomation), manage))
	g.POST("/api/automations/:id/archive", pm(hasID(a.ArchiveAutomation), manage))
	g.POST("/api/automations/:id/enroll", pm(hasID(a.EnrollInAutomation), manage))
	g.GET("/api/automations/:id/versions", pm(hasID(a.GetAutomationVersions), get))
	g.GET("/api/automations/:id/enrollments", pm(hasID(a.GetAutomationEnrollments), get))
	g.GET("/api/automations/:id/enrollments/:eid/steps", pm(hasID(a.GetEnrollmentSteps), get))
	g.GET("/api/automations/:id/stats", pm(hasID(a.GetAutomationStats), get))
	g.POST("/api/automations/emails", pm(a.CreateAutomationEmail, manage))
	g.PUT("/api/automations/emails/:id", pm(hasID(a.UpdateAutomationEmail), manage))

	g.GET("/api/subscribers/:id/automations", pm(hasID(a.GetSubscriberAutomations), "subscribers:get_all", "subscribers:get"))
	g.GET("/api/subscribers/:id/events", pm(hasID(a.GetSubscriberEvents), "subscribers:get_all", "subscribers:get"))

	g.POST("/api/track", pm(a.TrackEvent, "track:send"))
	g.DELETE("/api/maintenance/events", pm(a.DeleteOldEvents, "settings:maintain"))

	initMessageLogRoutes(g, a)
}

// DeleteOldEvents is the maintenance action that removes tracked events older than `before_date`.
func (a *App) DeleteOldEvents(c echo.Context) error {
	t, err := time.Parse(time.RFC3339, c.FormValue("before_date"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, a.i18n.T("globals.messages.invalidData"))
	}
	n, err := a.automation.Store().DeleteEventsBefore(c.Request().Context(), t)
	if err != nil {
		return a.autoErr(c, err)
	}
	return c.JSON(http.StatusOK, okResp{map[string]int64{"deleted": n}})
}
