package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/knadh/listmonk/internal/auth"
	"github.com/knadh/listmonk/internal/subimporter"
	"github.com/knadh/listmonk/models"
	"github.com/labstack/echo/v4"
)

// fork: POST /api/track records an event about a subscriber and starts any automation
// that listens for it. It is how an application tells listmonk what its users did.

type trackReq struct {
	Subscriber struct {
		ID    int    `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	} `json:"subscriber"`
	Name        string         `json:"name"`
	Properties  map[string]any `json:"properties"`
	OccurredAt  *time.Time     `json:"occurred_at"`
	UpsertAttrs map[string]any `json:"upsert_attribs"`
}

const (
	trackMaxName    = 200
	trackMaxFuture  = 5 * time.Minute
	trackMaxKeySize = 255
)

// TrackEvent handles the call. The subscriber is found by `id` or `email`; an unknown email
// creates the subscriber (with no list subscriptions: they get messages through automations
// whose topic allows it). `upsert_attribs` is merged into the subscriber's attributes (top-level
// keys) before the event is recorded, so the automation it starts already sees the new values.
// An Idempotency-Key header makes a retried request record, and trigger, only once.
func (a *App) TrackEvent(c echo.Context) error {
	var req trackReq
	if err := c.Bind(&req); err != nil {
		return err
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > trackMaxName {
		return echo.NewHTTPError(http.StatusBadRequest, a.i18n.Ts("globals.messages.invalidFields", "name", "name"))
	}
	if (req.Subscriber.ID == 0) == (strings.TrimSpace(req.Subscriber.Email) == "") {
		return echo.NewHTTPError(http.StatusBadRequest, a.i18n.Ts("globals.messages.invalidFields", "name", "subscriber (send either id or email)"))
	}
	key := strings.TrimSpace(c.Request().Header.Get("Idempotency-Key"))
	if len(key) > trackMaxKeySize {
		return echo.NewHTTPError(http.StatusBadRequest, a.i18n.Ts("globals.messages.invalidFields", "name", "Idempotency-Key"))
	}
	now := time.Now()
	at := now
	if req.OccurredAt != nil {
		at = *req.OccurredAt
		if at.After(now.Add(trackMaxFuture)) {
			return echo.NewHTTPError(http.StatusBadRequest, a.i18n.Ts("globals.messages.invalidFields", "name", "occurred_at (in the future)"))
		}
	}
	props, err := json.Marshal(req.Properties)
	if err != nil || req.Properties == nil {
		props = []byte(`{}`)
	}

	// Find, or create, the subscriber. An existing one must be on a list the user may see, as for
	// the other subscriber endpoints: the event can change their attributes and email them.
	var sub models.Subscriber
	if req.Subscriber.ID != 0 {
		sub, err = a.core.GetSubscriber(req.Subscriber.ID, "", "")
		if err != nil {
			return err
		}
		if err := a.hasSubPerm(auth.GetUser(c), []int{sub.ID}); err != nil {
			return err
		}
	} else {
		sr, verr := a.importer.ValidateFields(subimporter.SubReq{Subscriber: models.Subscriber{
			Email: req.Subscriber.Email, Name: req.Subscriber.Name,
		}})
		if verr != nil {
			return echo.NewHTTPError(http.StatusBadRequest, verr.Error())
		}
		sub, err = a.core.GetSubscriber(0, "", sr.Email)
		if err != nil {
			if he, ok := err.(*echo.HTTPError); !ok || he.Code != http.StatusBadRequest {
				return err
			}
			// Not found: create. A concurrent request creating the same one is a conflict (409);
			// the client retries and finds it.
			sr.Subscriber.Status = models.SubscriberStatusEnabled
			sub, _, err = a.core.InsertSubscriber(sr.Subscriber, nil, nil, false, false)
			if err != nil {
				return err
			}
		} else if err := a.hasSubPerm(auth.GetUser(c), []int{sub.ID}); err != nil {
			return err
		}
	}

	// Merged in the database: writing back the whole subscriber as read above could undo a
	// blocklisting (a bounce, an unsubscribe) or another call's attributes made in between.
	if len(req.UpsertAttrs) > 0 {
		if err := a.core.MergeSubscriberAttribs(sub.ID, req.UpsertAttrs); err != nil {
			return err
		}
	}

	// The event and the job that acts on it (waiting runs, triggers) are saved together; the job runs
	// in the background and retries, so what the event starts never depends on this request.
	ev, created, err := a.automation.RecordEvent(c.Request().Context(), sub.ID, req.Name, props, key, at)
	if err != nil {
		return a.autoErr(c, err)
	}
	if !created {
		// The same Idempotency-Key was seen before: nothing more to do.
		return c.JSON(http.StatusOK, okResp{map[string]any{"subscriber_id": sub.ID, "duplicate": true}})
	}
	return c.JSON(http.StatusOK, okResp{map[string]any{"subscriber_id": sub.ID, "event_id": ev.ID, "duplicate": false}})
}
