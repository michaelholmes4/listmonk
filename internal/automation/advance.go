package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
)

// permanentError is a problem retrying won't fix (a broken rule, a missing campaign): the
// enrollment is failed instead of retried.
type permanentError struct{ err error }

func (p *permanentError) Error() string { return p.err.Error() }
func (p *permanentError) Unwrap() error { return p.err }

func permanent(format string, a ...any) error { return &permanentError{fmt.Errorf(format, a...)} }

// subscriberRow is what steps need to know about the person.
type subscriberRow struct {
	ID      int             `db:"id"`
	UUID    string          `db:"uuid"`
	Email   string          `db:"email"`
	Name    string          `db:"name"`
	Attribs json.RawMessage `db:"attribs"`
	Status  string          `db:"status"`
}

func (s subscriberRow) attribs() map[string]any {
	m := map[string]any{}
	_ = json.Unmarshal(s.Attribs, &m)
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// outcome is what running one node decided.
type outcome struct {
	next       string     // node to run next; "" ends the branch
	wait       *time.Time // pause until then, staying on this node
	exit       string     // end the enrollment with this reason
	stepStatus string
	result     any
	// after runs once the transaction has committed (starting other automations).
	after []func(context.Context)
	// noStep: nothing to record (a deferred send that hasn't started).
	noStep bool
}

// Advance runs an enrollment forward until it has to wait, finishes or fails. It is what the job
// queue calls, and it is safe to call at any time and any number of times: it only acts when the
// enrollment is live, its automation is running, and it is due.
func (e *Engine) Advance(ctx context.Context, id int64) error {
	for first := true; ; first = false {
		again, err := e.step(ctx, id, first)
		var perm *permanentError
		if errors.As(err, &perm) {
			return e.fail(ctx, id, perm)
		}
		if err != nil || !again {
			return err
		}
	}
}

// step runs one node in one transaction. It reports whether the enrollment can carry straight on.
func (e *Engine) step(ctx context.Context, id int64, first bool) (again bool, err error) {
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var enr Enrollment
	if err := tx.GetContext(ctx, &enr, e.q.get("lock-enrollment"), id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if enr.Status != EnrollmentActive && enr.Status != EnrollmentWaiting {
		return false, nil
	}

	var a Automation
	if err := tx.GetContext(ctx, &a, e.q.get("get-automation"), enr.AutomationID); err != nil {
		return false, err
	}
	now := e.clock.Now()
	switch a.Status {
	case StatusPaused:
		return false, nil // Resume wakes it again
	case StatusArchived:
		return false, e.exitNow(ctx, tx, &enr, ExitArchived, now)
	case StatusActive:
	default:
		return false, nil
	}
	// Woken early, or a duplicate wake-up.
	if enr.NextRunAt != nil && enr.NextRunAt.After(now) {
		return false, nil
	}

	ix, err := e.graph(ctx, enr.VersionID)
	if err != nil {
		return false, err
	}
	settings, err := ParseSettings(a.Settings)
	if err != nil {
		return false, permanent("%v", err)
	}
	var sub subscriberRow
	if err := tx.GetContext(ctx, &sub, e.q.get("get-subscriber"), enr.SubscriberID); err != nil {
		return false, err
	}

	// After every pause: still allowed to be here, and not already done?
	if first {
		if sub.Status == "blocklisted" {
			return false, e.exitNow(ctx, tx, &enr, ExitBlocklisted, now)
		}
		if settings.Goal != nil {
			hit, err := e.evalRule(ctx, *settings.Goal, e.env(ix, enr.ID, now), sub.ID)
			if err != nil {
				return false, permanent("goal: %v", err)
			}
			if hit {
				return false, e.exitNow(ctx, tx, &enr, ExitGoalReached, now)
			}
		}
	}

	nodeID := ix.Graph.Root
	if enr.CurrentNode != nil && *enr.CurrentNode != "" {
		nodeID = *enr.CurrentNode
	}
	node := ix.Nodes[nodeID]
	if node == nil {
		return false, permanent("step %q no longer exists", nodeID)
	}

	if node.Type == NodeSendEmail {
		return e.sendStep(ctx, tx, &enr, &a, ix, node, settings, sub, now)
	}

	o, err := e.runNode(ctx, tx, &enr, ix, node, settings, sub, now)
	if err != nil {
		return false, err
	}
	again, err = e.apply(ctx, tx, &enr, node, o, now)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	for _, f := range o.after {
		f(ctx)
	}
	return again, nil
}

func (e *Engine) env(ix *Index, enrollmentID int64, now time.Time) Env {
	return Env{EnrollmentID: enrollmentID, CampaignOf: ix.CampaignOf, Now: now, AllowSQL: true}
}

// evalRule runs a condition for a subscriber in a read-only transaction with a time limit, so even
// an advanced raw-SQL rule can neither change data nor run away.
func (e *Engine) evalRule(ctx context.Context, r Rule, env Env, subscriberID int) (bool, error) {
	c, err := r.Compile(env)
	if err != nil {
		return false, err
	}
	tx, err := e.db.BeginTxx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SET LOCAL statement_timeout = 5000`); err != nil {
		return false, err
	}
	var ok sql.NullBool
	args := append([]any{subscriberID}, c.Args...)
	if err := tx.GetContext(ctx, &ok, "SELECT ("+c.SQL+") FROM subscribers s WHERE s.id = $1", args...); err != nil {
		return false, err
	}
	return ok.Valid && ok.Bool, nil
}

func decodeConfig(n *Node, v any) error {
	if err := json.Unmarshal(n.Config, v); err != nil {
		return permanent("step %s has invalid options: %v", n.ID, err)
	}
	return nil
}

// runNode executes every node type except send_email.
func (e *Engine) runNode(ctx context.Context, tx *sqlx.Tx, enr *Enrollment, ix *Index, n *Node, s Settings, sub subscriberRow, now time.Time) (outcome, error) {
	done := func(next string, result any) outcome {
		return outcome{next: next, stepStatus: StepDone, result: result}
	}

	switch n.Type {
	case NodeDelay, NodeWaitUntil:
		// A step row means we were here before and the wait is over.
		var st Step
		err := tx.GetContext(ctx, &st, e.q.get("get-step"), enr.ID, n.ID)
		if err == nil {
			return done(ix.Next(n.ID, ""), nil), nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return outcome{}, err
		}

		var until time.Time
		if n.Type == NodeDelay {
			var c DelayConfig
			if err := decodeConfig(n, &c); err != nil {
				return outcome{}, err
			}
			d, err := ParseDuration(c.Duration)
			if err != nil || d <= 0 {
				return outcome{}, permanent("step %s: invalid duration", n.ID)
			}
			until = now.Add(d)
		} else {
			var c WaitUntilConfig
			if err := decodeConfig(n, &c); err != nil {
				return outcome{}, err
			}
			t, ok := e.waitTarget(c, sub, s)
			if !ok {
				return outcome{next: ix.Next(n.ID, ""), stepStatus: StepSkipped, result: map[string]string{"reason": "no date"}}, nil
			}
			until = t
			if !until.After(now) {
				return done(ix.Next(n.ID, ""), map[string]string{"note": "already passed"}), nil
			}
		}
		return outcome{wait: &until, stepStatus: StepWaiting, result: map[string]any{"until": until}}, nil

	case NodeWaitForEvent:
		return e.runWaitForEvent(ctx, tx, enr, ix, n, now)

	case NodeCondition:
		var c ConditionConfig
		if err := decodeConfig(n, &c); err != nil {
			return outcome{}, err
		}
		yes, err := e.evalRule(ctx, c.Rule, e.env(ix, enr.ID, now), sub.ID)
		if err != nil {
			var perr *permanentError
			if errors.As(err, &perr) {
				return outcome{}, err
			}
			// A rule that can't compile or run will not start working on retry.
			return outcome{}, permanent("step %s: %v", n.ID, err)
		}
		handle := HandleNo
		if yes {
			handle = HandleYes
		}
		return done(ix.Next(n.ID, handle), map[string]string{"branch": handle}), nil

	case NodeUpdateAttribute:
		var c UpdateAttributeConfig
		if err := decodeConfig(n, &c); err != nil {
			return outcome{}, err
		}
		var raw json.RawMessage
		if err := tx.GetContext(ctx, &raw, e.q.get("lock-subscriber-attribs"), sub.ID); err != nil {
			return outcome{}, err
		}
		before, after := map[string]any{}, map[string]any{}
		_ = json.Unmarshal(raw, &before)
		_ = json.Unmarshal(raw, &after)
		// A JSON null (or anything but an object) in the column is treated as no attributes.
		if before == nil {
			before = map[string]any{}
		}
		if after == nil {
			after = map[string]any{}
		}
		var val any
		if !c.Unset {
			if err := json.Unmarshal(c.Value, &val); err != nil {
				return outcome{}, permanent("step %s: invalid value", n.ID)
			}
		}
		setAttrPath(after, c.Attribute, val, c.Unset)
		b, _ := json.Marshal(after)
		if _, err := tx.ExecContext(ctx, e.q.get("set-subscriber-attribs"), sub.ID, b); err != nil {
			return outcome{}, err
		}
		o := done(ix.Next(n.ID, ""), map[string]string{"attribute": c.Attribute})
		o.after = append(o.after, func(ctx context.Context) {
			if err := e.OnAttributesChanged(ctx, sub.ID, before, after); err != nil {
				e.log.Printf("automation: attribute triggers for subscriber %d: %v", sub.ID, err)
			}
		})
		return o, nil

	case NodeAddToList:
		var c ListConfig
		if err := decodeConfig(n, &c); err != nil {
			return outcome{}, err
		}
		status := c.Status
		if status == "" {
			var optin string
			if err := tx.GetContext(ctx, &optin, e.q.get("get-list-optin"), c.ListID); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return outcome{}, permanent("step %s: the list no longer exists", n.ID)
				}
				return outcome{}, err
			}
			status = "confirmed"
			if optin == "double" {
				status = "unconfirmed"
			}
		}
		var res struct {
			Previous string `db:"previous"`
			Current  string `db:"current"`
		}
		if err := tx.GetContext(ctx, &res, e.q.get("subscribe"), sub.ID, c.ListID, status); err != nil {
			return outcome{}, err
		}
		o := done(ix.Next(n.ID, ""), map[string]any{"list_id": c.ListID, "status": res.Current})
		if res.Current == "confirmed" && res.Previous != "confirmed" {
			o.after = append(o.after, func(ctx context.Context) {
				if err := e.OnListJoined(ctx, sub.ID, c.ListID); err != nil {
					e.log.Printf("automation: list triggers for subscriber %d: %v", sub.ID, err)
				}
			})
		}
		return o, nil

	case NodeRemoveFromList:
		var c ListConfig
		if err := decodeConfig(n, &c); err != nil {
			return outcome{}, err
		}
		q := "remove-subscription"
		if c.Status == "unsubscribe" {
			q = "unsubscribe"
		}
		if _, err := tx.ExecContext(ctx, e.q.get(q), sub.ID, c.ListID); err != nil {
			return outcome{}, err
		}
		return done(ix.Next(n.ID, ""), map[string]any{"list_id": c.ListID, "mode": q}), nil

	case NodeGoTo:
		var c GoToConfig
		if err := decodeConfig(n, &c); err != nil {
			return outcome{}, err
		}
		if ix.Nodes[c.Target] == nil {
			return outcome{}, permanent("step %s: goes to a step that no longer exists", n.ID)
		}
		limit := c.MaxRuns
		if limit == 0 {
			limit = defaultGoToRuns
		}
		// The run's visit to this step is how many times it has arrived here.
		if enr.CurrentVisit > limit {
			return outcome{exit: ExitLoopLimit, stepStatus: StepSkipped, result: map[string]string{"reason": "loop_limit"}}, nil
		}
		return done(c.Target, map[string]string{"to": c.Target}), nil

	case NodeExit:
		var c ExitConfig
		_ = json.Unmarshal(n.Config, &c)
		reason := c.Reason
		if reason == "" {
			reason = ExitNode
		}
		return outcome{exit: reason, stepStatus: StepDone}, nil
	}
	return outcome{}, permanent("step %s: unknown type %q", n.ID, n.Type)
}

// waitTarget resolves a wait_until to a moment, if there is one.
func (e *Engine) waitTarget(c WaitUntilConfig, sub subscriberRow, s Settings) (time.Time, bool) {
	var t time.Time
	if c.At != nil {
		t = *c.At
	} else {
		attribs := sub.attribs()
		v, ok := attrPath(attribs, c.Attribute)
		if !ok {
			return time.Time{}, false
		}
		t, ok = parseMoment(v, locationFor(attribs, s.Timezone))
		if !ok {
			return time.Time{}, false
		}
	}
	if c.Offset != "" {
		if d, err := ParseDuration(c.Offset); err == nil {
			t = t.Add(d)
		}
	}
	return t, true
}

// apply records the node's outcome and moves the enrollment: on to the next node, into a wait, or
// out. It reports whether the caller can carry straight on.
func (e *Engine) apply(ctx context.Context, tx *sqlx.Tx, enr *Enrollment, n *Node, o outcome, now time.Time) (bool, error) {
	if !o.noStep {
		if err := e.recordStep(ctx, tx, enr.ID, n.ID, o.stepStatus, o.result, ""); err != nil {
			return false, err
		}
	}
	switch {
	case o.wait != nil:
		node := n.ID
		if err := e.updateEnrollment(ctx, tx, enr.ID, EnrollmentWaiting, &node, o.wait, enr.Context, nil); err != nil {
			return false, err
		}
		return false, e.enqueue(ctx, tx, enr.ID, *o.wait)
	case o.exit != "":
		return false, e.finish(ctx, tx, enr, o, now)
	case o.next == "":
		return false, e.updateEnrollment(ctx, tx, enr.ID, EnrollmentCompleted, nil, nil, enr.Context, strptr(ExitCompleted))
	default:
		next := o.next
		return true, e.updateEnrollment(ctx, tx, enr.ID, EnrollmentActive, &next, &now, enr.Context, nil)
	}
}

// finish ends the enrollment with the outcome's exit reason (the caller commits).
func (e *Engine) finish(ctx context.Context, tx *sqlx.Tx, enr *Enrollment, o outcome, now time.Time) error {
	return e.updateEnrollment(ctx, tx, enr.ID, EnrollmentExited, enr.CurrentNode, nil, enr.Context, strptr(o.exit))
}

// exitNow ends the enrollment and commits; used by the checks that run before any node.
func (e *Engine) exitNow(ctx context.Context, tx *sqlx.Tx, enr *Enrollment, reason string, now time.Time) error {
	if err := e.finish(ctx, tx, enr, outcome{exit: reason}, now); err != nil {
		return err
	}
	return tx.Commit()
}

func strptr(s string) *string { return &s }

func (e *Engine) updateEnrollment(ctx context.Context, tx *sqlx.Tx, id int64, status EnrollmentStatus, node *string, next *time.Time, ec json.RawMessage, reason *string) error {
	_, err := tx.ExecContext(ctx, e.q.get("update-enrollment"), id, status, node, next, []byte(ec), reason)
	return err
}

func (e *Engine) recordStep(ctx context.Context, tx *sqlx.Tx, enrollmentID int64, nodeID, status string, result any, errMsg string) error {
	raw, err := json.Marshal(result)
	if err != nil || result == nil {
		raw = []byte(`{}`)
	}
	if _, err := tx.ExecContext(ctx, e.q.get("insert-step"), enrollmentID, nodeID, StepWaiting); err != nil {
		return err
	}
	var em any
	if errMsg != "" {
		em = errMsg
	}
	_, err = tx.ExecContext(ctx, e.q.get("update-step"), enrollmentID, nodeID, status, raw, em)
	return err
}
