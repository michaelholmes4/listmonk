package core

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"

	"github.com/labstack/echo/v4"
	"github.com/lib/pq"
)

// fork: automation triggers. Core calls these helpers around the few mutations that can
// start an automation (a subscription becoming confirmed, an attribute changing). They do nothing
// unless the app has set the matching hooks, and the hooks run in the background so a slow or
// failing automation never delays or breaks the request that caused it.

type forkSnap struct {
	subIDs  []int
	listIDs []int           // nil: all of the subscribers' lists
	subs    map[[2]int]bool // subscription is live (see forkRead)
	attribs map[int]map[string]any
}

func (c *Core) forkOn() bool {
	return c.h != nil && (c.h.OnSubscriptionsConfirmed != nil || c.h.OnAttribsChanged != nil)
}

// forkBegin records the state that matters for triggers before a mutation.
func (c *Core) forkBegin(subIDs, listIDs []int) *forkSnap {
	if !c.forkOn() || len(subIDs) == 0 {
		return nil
	}
	s := &forkSnap{subIDs: subIDs, listIDs: listIDs}
	var err error
	if s.subs, s.attribs, err = c.forkRead(subIDs, listIDs); err != nil {
		// Without the state before, everything would look new: skip this mutation's triggers.
		c.log.Printf("automation hook: %v; triggers skipped", err)
		return nil
	}
	return s
}

// forkEnd compares with the state after the mutation and fires the hooks for what changed.
func (c *Core) forkEnd(s *forkSnap) {
	if s == nil || !c.forkOn() {
		return
	}
	subs, attribs, err := c.forkRead(s.subIDs, s.listIDs)
	if err != nil {
		c.log.Printf("automation hook: %v; triggers skipped", err)
		return
	}

	var calls []func()
	if c.h.OnSubscriptionsConfirmed != nil {
		became := map[int][]int{}
		for k, live := range subs {
			if live && !s.subs[k] {
				became[k[0]] = append(became[k[0]], k[1])
			}
		}
		for sub, lists := range became {
			calls = append(calls, func() { c.h.OnSubscriptionsConfirmed(sub, lists) })
		}
	}
	if c.h.OnAttribsChanged != nil {
		for id, after := range attribs {
			before := s.attribs[id]
			// Only those whose attributes changed (a bulk list change touches many and changes none).
			if reflect.DeepEqual(before, after) || (before == nil && len(after) == 0) {
				continue
			}
			calls = append(calls, func() { c.h.OnAttribsChanged(id, before, after) })
		}
	}
	if len(calls) == 0 {
		return
	}

	// One background task per mutation, and only a few at a time: a bulk change of thousands of
	// subscribers must not become thousands of concurrent trigger lookups on the database.
	go func() {
		forkSlots <- struct{}{}
		defer func() { <-forkSlots }()
		for _, f := range calls {
			c.forkRun(f)
		}
	}()
}

// forkSlots limits how many mutations' hooks run at once.
var forkSlots = make(chan struct{}, 4)

// forkRun runs a hook, keeping a panic in it from taking the process down.
func (c *Core) forkRun(f func()) {
	defer func() {
		if r := recover(); r != nil {
			c.log.Printf("automation hook panicked: %v", r)
		}
	}()
	f()
}

// A subscription is live when messages may go out on it: confirmed, or unconfirmed on a single
// opt-in list (where that is the normal state; only double opt-in waits for a confirmation).
//
// A read that fails, even partway, returns an error and no state: half a snapshot would make what
// it missed look new, and fire the triggers again for subscriptions and attributes they already had.
func (c *Core) forkRead(subIDs, listIDs []int) (map[[2]int]bool, map[int]map[string]any, error) {
	subs := map[[2]int]bool{}
	attribs := map[int]map[string]any{}

	if c.h.OnSubscriptionsConfirmed != nil {
		var lists any
		if listIDs != nil {
			lists = pq.Array(listIDs)
		}
		rows, err := c.db.Query(`SELECT sl.subscriber_id, sl.list_id,
				(sl.status = 'confirmed' OR (sl.status = 'unconfirmed' AND l.optin = 'single')) AS live
			FROM subscriber_lists sl JOIN lists l ON l.id = sl.list_id
			WHERE sl.subscriber_id = ANY($1) AND ($2::INT[] IS NULL OR sl.list_id = ANY($2::INT[]))`, pq.Array(subIDs), lists)
		if err != nil {
			return nil, nil, fmt.Errorf("reading subscriptions: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var sub, list int
			var live bool
			if err := rows.Scan(&sub, &list, &live); err != nil {
				return nil, nil, fmt.Errorf("reading subscriptions: %w", err)
			}
			subs[[2]int{sub, list}] = live
		}
		if err := rows.Err(); err != nil {
			return nil, nil, fmt.Errorf("reading subscriptions: %w", err)
		}
	}

	if c.h.OnAttribsChanged != nil {
		rows, err := c.db.Query(`SELECT id, attribs FROM subscribers WHERE id = ANY($1)`, pq.Array(subIDs))
		if err != nil {
			return nil, nil, fmt.Errorf("reading attributes: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var id int
			var raw []byte
			if err := rows.Scan(&id, &raw); err != nil {
				return nil, nil, fmt.Errorf("reading attributes: %w", err)
			}
			m := map[string]any{}
			if err := json.Unmarshal(raw, &m); err != nil {
				return nil, nil, fmt.Errorf("reading attributes of subscriber %d: %w", id, err)
			}
			attribs[id] = m
		}
		if err := rows.Err(); err != nil {
			return nil, nil, fmt.Errorf("reading attributes: %w", err)
		}
	}
	return subs, attribs, nil
}

// MergeSubscriberAttribs merges attribs into a subscriber's attributes (top-level keys) in one
// statement, firing the attribute hook. Nothing else about the subscriber is written, so a
// concurrent blocklisting or attribute change is never overwritten with what was read earlier.
func (c *Core) MergeSubscriberAttribs(id int, attribs map[string]any) error {
	b, err := json.Marshal(attribs)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, c.i18n.Ts("globals.messages.invalidFields", "name", "attribs"))
	}

	snap := c.forkBegin([]int{id}, nil)
	res, err := c.db.Exec(`UPDATE subscribers SET attribs = COALESCE(attribs, '{}'::JSONB) || $2::JSONB, updated_at = NOW() WHERE id = $1`, id, b)
	if err != nil {
		c.log.Printf("error updating subscriber attributes: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError,
			c.i18n.Ts("globals.messages.errorUpdating", "name", "{globals.terms.subscriber}", "error", pqErrMsg(err)))
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, c.i18n.Ts("globals.messages.notFound", "name", "{globals.terms.subscriber}"))
	}
	c.forkEnd(snap)
	return nil
}

// forkSubscriberID resolves a subscriber UUID (the optin link carries one).
func (c *Core) forkSubscriberID(uuid string) int {
	var id int
	if err := c.db.Get(&id, `SELECT id FROM subscribers WHERE uuid = $1`, uuid); err != nil {
		return 0
	}
	return id
}

// SetAutomationHooks installs the automation trigger hooks. The automation engine needs the core
// (to send) and the core needs the engine (to trigger), so the hooks are set after both exist.
func (c *Core) SetAutomationHooks(onConfirmed func(subscriberID int, listIDs []int), onAttribs func(subscriberID int, before, after map[string]any)) {
	if c.h == nil {
		c.h = &Hooks{}
	}
	c.h.OnSubscriptionsConfirmed = onConfirmed
	c.h.OnAttribsChanged = onAttribs
}
