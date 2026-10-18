package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// waitResult is the step result of a wait_for_event. The advance worker and event delivery both
// read and write it, so it lives in one struct.
type waitResult struct {
	Since       time.Time  `json:"since"`
	Until       time.Time  `json:"until"`
	Branch      string     `json:"branch,omitempty"`
	Event       string     `json:"event,omitempty"`
	EventID     int64      `json:"event_id,omitempty"`
	Restarts    int        `json:"restarts,omitempty"`
	RestartedAt *time.Time `json:"restarted_at,omitempty"`
}

// runWaitForEvent is the node itself: it starts the wait, and on a wake-up follows whatever
// resolved it (an event's path, or time's up).
//
// The wait counts events from when the run reached it (reached), not from when this step ran.
// Events are often recorded in batches a little after they happen, so the event a wait is for can
// be recorded before the run gets here, even when it happened after: once the wait has started,
// the events already recorded since then are handed to it as if they had just arrived.
func (e *Engine) runWaitForEvent(ctx context.Context, tx *sqlx.Tx, enr *Enrollment, ix *Index, n *Node, now, reached time.Time) (outcome, error) {
	var st Step
	err := tx.GetContext(ctx, &st, e.q.get("get-step"), enr.ID, n.ID)
	if errors.Is(err, sql.ErrNoRows) {
		var c WaitForEventConfig
		if err := decodeConfig(n, &c); err != nil {
			return outcome{}, err
		}
		d, err := ParseDuration(c.Timeout)
		if err != nil || d <= 0 {
			return outcome{}, permanent("step %s: invalid time limit", n.ID)
		}
		until := now.Add(d)
		since := reached
		if since.IsZero() || since.After(now) {
			since = now
		}
		o := outcome{wait: &until, stepStatus: StepWaiting, result: waitResult{Since: since, Until: until}}
		row := *enr
		o.after = append(o.after, func(ctx context.Context) {
			if err := e.catchUp(ctx, row, ix, n, c, since); err != nil {
				e.log.Printf("automation: events recorded before step %s of enrollment %d: %v", n.ID, row.ID, err)
			}
		})
		return o, nil
	}
	if err != nil {
		return outcome{}, err
	}

	var r waitResult
	if err := json.Unmarshal(st.Result, &r); err != nil {
		return outcome{}, permanent("step %s: unreadable result: %v", n.ID, err)
	}
	switch {
	case r.Branch != "":
		return outcome{next: ix.Next(n.ID, r.Branch), stepStatus: StepDone, result: r}, nil
	case !now.Before(r.Until):
		r.Branch = HandleTimeout
		return outcome{next: ix.Next(n.ID, HandleTimeout), stepStatus: StepDone, result: r}, nil
	}
	// Woken too early (shouldn't normally happen): sleep again.
	until := r.Until
	return outcome{wait: &until, stepStatus: StepWaiting, result: r}, nil
}

// catchUp hands a wait that has just started the subscriber's recorded events it is watching for
// that happened since it was reached, oldest first. Each is delivered as a live one would be, so
// the first that matches takes its path (or restarts the wait), and once the run has moved on the
// rest are ignored.
func (e *Engine) catchUp(ctx context.Context, row Enrollment, ix *Index, n *Node, c WaitForEventConfig, since time.Time) error {
	names := make([]string, 0, len(c.Events))
	for _, we := range c.Events {
		names = append(names, we.Name)
	}
	if len(names) == 0 {
		return nil
	}
	var evs []Event
	trigger := e.env(ix, &row, since).TriggerEventID
	if err := e.db.SelectContext(ctx, &evs, e.q.get("events-since"), row.SubscriberID, pq.Array(names), since, trigger); err != nil {
		return err
	}
	node := n.ID
	row.CurrentNode = &node
	for _, ev := range evs {
		if err := e.deliverTo(ctx, row, ev); err != nil {
			return err
		}
	}
	return nil
}

// deliverEvent hands an event to the subscriber's runs that are waiting for it. It is safe to call
// twice for the same event. One bad run does not stop the others.
func (e *Engine) deliverEvent(ctx context.Context, subscriberID int, ev Event) error {
	var rows []Enrollment
	if err := e.db.SelectContext(ctx, &rows, e.q.get("waiting-enrollments"), subscriberID); err != nil {
		return err
	}
	var errs []error
	for _, enr := range rows {
		if err := e.deliverTo(ctx, enr, ev); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// watched returns the node's config and the watched events named name, in their order, if the run
// is waiting on a wait_for_event that lists it. Their filters are not checked yet.
func watched(ix *Index, nodeID *string, name string) (*Node, []*WaitEvent, WaitForEventConfig) {
	var c WaitForEventConfig
	if nodeID == nil {
		return nil, nil, c
	}
	n := ix.Nodes[*nodeID]
	if n == nil || n.Type != NodeWaitForEvent || json.Unmarshal(n.Config, &c) != nil {
		return nil, nil, c
	}
	var out []*WaitEvent
	for i := range c.Events {
		if c.Events[i].Name == name {
			out = append(out, &c.Events[i])
		}
	}
	if len(out) == 0 {
		return nil, nil, c
	}
	return n, out, c
}

// matchWait returns the first watched event whose filter the event passes, or nil.
func (e *Engine) matchWait(ctx context.Context, enr Enrollment, ix *Index, cands []*WaitEvent, ev Event) (*WaitEvent, error) {
	for _, we := range cands {
		if we.Where == nil {
			return we, nil
		}
		ok, err := e.evalFilter(ctx, *we.Where, ev.Properties, e.env(ix, &enr, e.clock.Now()), enr.SubscriberID)
		if err != nil {
			return nil, err
		}
		if ok {
			return we, nil
		}
	}
	return nil, nil
}

func (e *Engine) deliverTo(ctx context.Context, row Enrollment, ev Event) error {
	// Cheap look before taking a lock.
	ix, err := e.graph(ctx, row.VersionID)
	if err != nil {
		return err
	}
	if n, _, _ := watched(ix, row.CurrentNode, ev.Name); n == nil {
		return nil
	}

	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var enr Enrollment
	if err := tx.GetContext(ctx, &enr, e.q.get("lock-enrollment"), row.ID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	// Re-check under the lock: it may have moved on or finished.
	if enr.Status != EnrollmentWaiting || enr.CurrentNode == nil || row.CurrentNode == nil || *enr.CurrentNode != *row.CurrentNode {
		return nil
	}
	n, cands, c := watched(ix, enr.CurrentNode, ev.Name)
	if n == nil {
		return nil
	}

	var st Step
	if err := tx.GetContext(ctx, &st, e.q.get("get-step"), enr.ID, n.ID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	var r waitResult
	if err := json.Unmarshal(st.Result, &r); err != nil {
		return err
	}
	if r.Branch != "" || ev.OccurredAt.Before(r.Since) {
		return nil
	}
	// The event that started the run never counts for it, and an event that already restarted the
	// wait (it can be handed over twice: when it arrives, and by catchUp) doesn't again.
	var ec EnrollContext
	var last struct {
		ID int64 `json:"id"`
	}
	if json.Unmarshal(enr.Context, &ec) == nil && len(ec.Event) > 0 {
		_ = json.Unmarshal(ec.Event, &last)
	}
	if ev.ID != 0 && (ev.ID == ec.TriggerEventID || ev.ID == last.ID) {
		return nil
	}
	we, err := e.matchWait(ctx, enr, ix, cands, ev)
	if err != nil {
		return err
	}
	if we == nil {
		return nil
	}

	now := e.clock.Now()
	node := n.ID
	if we.Restart {
		d, err := ParseDuration(c.Timeout)
		if err != nil || d <= 0 {
			return permanent("step %s: invalid time limit", n.ID)
		}
		until := ev.OccurredAt.Add(d)
		if until.Before(now) {
			until = now
		}
		r.Until = until
		r.Restarts++
		r.RestartedAt = &now

		var ctxMap map[string]json.RawMessage
		if len(enr.Context) > 0 {
			_ = json.Unmarshal(enr.Context, &ctxMap)
		}
		if ctxMap == nil {
			ctxMap = map[string]json.RawMessage{}
		}
		ctxMap["event"], _ = json.Marshal(ev)
		newCtx, _ := json.Marshal(ctxMap)

		if err := e.setWaitStep(ctx, tx, enr.ID, n.ID, StepWaiting, r); err != nil {
			return err
		}
		if err := e.updateEnrollment(ctx, tx, enr.ID, EnrollmentWaiting, &node, &until, newCtx, nil); err != nil {
			return err
		}
		if err := e.enqueue(ctx, tx, enr.ID, until); err != nil {
			return err
		}
		return tx.Commit()
	}

	r.Branch, r.Event, r.EventID = we.ID, ev.Name, ev.ID
	if err := e.setWaitStep(ctx, tx, enr.ID, n.ID, StepDone, r); err != nil {
		return err
	}
	if err := e.updateEnrollment(ctx, tx, enr.ID, EnrollmentWaiting, &node, &now, enr.Context, nil); err != nil {
		return err
	}
	if err := e.enqueue(ctx, tx, enr.ID, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (e *Engine) setWaitStep(ctx context.Context, tx *sqlx.Tx, enrollmentID int64, nodeID, status string, r waitResult) error {
	raw, err := json.Marshal(r)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, e.q.get("update-step"), enrollmentID, nodeID, status, raw, nil)
	return err
}
