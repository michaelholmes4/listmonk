package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/jmoiron/sqlx"
	"time"
)

// sendStep runs an email step. Sending is the one thing that must not happen twice, and the one
// thing that can't be rolled back, so it is done in three parts:
//
//  1. In a transaction: decide whether to send at all (the window, consent) and write the step row
//     as 'sending'. The row is unique per (enrollment, node).
//  2. Outside any transaction: hand the message to the sender.
//  3. In a new transaction: mark the step done and move the enrollment on.
//
// If the process dies between 1 and 3, a retry finds the 'sending' row and carries on without
// sending again: a message may be lost in that rare crash, but is never sent twice. If the sender
// reports that it did not queue the message, the row is removed so the retry sends it.
func (e *Engine) sendStep(ctx context.Context, tx *sqlx.Tx, enr *Enrollment, a *Automation, ix *Index, n *Node, s Settings, sub subscriberRow, now time.Time) (bool, error) {
	var c SendEmailConfig
	if err := decodeConfig(n, &c); err != nil {
		return false, err
	}

	// A previous run got past part 1.
	var st Step
	err := tx.GetContext(ctx, &st, e.q.get("get-step"), enr.ID, n.ID)
	switch {
	case err == nil:
		o := outcome{next: ix.Next(n.ID, ""), stepStatus: StepDone, result: map[string]string{"note": "resumed after an interruption"}}
		if st.Status == StepSkipped || st.Status == StepDone {
			o.result = nil
		}
		return e.commitApply(ctx, tx, enr, n, o, now)
	case !errors.Is(err, sql.ErrNoRows):
		return false, err
	}

	// A transactional template carries no unsubscribe link or List-Unsubscribe header. Saving refuses
	// this; versions published before that check get here.
	if c.MessageType == MessageMarketing && c.TemplateID > 0 {
		return false, permanent("step %s: a marketing email needs its own content, with an unsubscribe link, not a transactional template", n.ID)
	}

	// Outside the send window: wait for it to open.
	if open := NextSendTime(now, s.SendWindow, locationFor(sub.attribs(), s.Timezone)); open.After(now) {
		o := outcome{wait: &open, noStep: true}
		return e.commitApply(ctx, tx, enr, n, o, now)
	}

	d, err := Consent(ctx, tx, e.q, sub.ID, c.MessageType, c.ListID)
	if err != nil {
		return false, err
	}
	if !d.Allowed {
		// They are not to get this (or anything further): record why and end the enrollment.
		if err := e.recordStep(ctx, tx, enr.ID, n.ID, StepSkipped, map[string]string{"reason": string(d.Reason)}, ""); err != nil {
			return false, err
		}
		if err := e.finish(ctx, tx, enr, outcome{exit: string(d.Reason)}, now); err != nil {
			return false, err
		}
		return false, tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, e.q.get("insert-step"), enr.ID, n.ID, StepSending); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}

	// Part 2.
	var ec EnrollContext
	_ = json.Unmarshal(enr.Context, &ec)
	err = e.cfg.Sender.SendEmail(ctx, Message{
		SubscriberID:   sub.ID,
		MessageType:    c.MessageType,
		ListID:         c.ListID,
		CampaignID:     c.CampaignID,
		TemplateID:     c.TemplateID,
		AutomationID:   a.ID,
		AutomationName: a.Name,
		AutomationUUID: a.UUID,
		NodeID:         n.ID,
		EnrollmentID:   enr.ID,
		Event:          ec.Event,
	})
	if err != nil {
		// Not queued: forget that we tried so the retry sends it.
		if _, derr := e.db.ExecContext(ctx, `DELETE FROM enrollment_steps WHERE enrollment_id = $1 AND node_id = $2 AND status = $3
			AND visit = (SELECT current_visit FROM enrollments WHERE id = $1)`, enr.ID, n.ID, StepSending); derr != nil {
			e.log.Printf("automation: clearing step %s of enrollment %d: %v", n.ID, enr.ID, derr)
		}
		return false, err
	}

	// Part 3.
	tx2, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx2.Rollback()
	var cur Enrollment
	if err := tx2.GetContext(ctx, &cur, e.q.get("lock-enrollment"), enr.ID); err != nil {
		return false, err
	}
	o := outcome{next: ix.Next(n.ID, ""), stepStatus: StepDone, result: map[string]any{"message_type": c.MessageType}}
	curNode := ix.Graph.Root
	if cur.CurrentNode != nil && *cur.CurrentNode != "" {
		curNode = *cur.CurrentNode
	}
	live := cur.Status == EnrollmentActive || cur.Status == EnrollmentWaiting
	if !live || curNode != n.ID || cur.CurrentVisit != enr.CurrentVisit {
		// Archived or failed meanwhile, or another wake-up of the same run found this step under way
		// and carried on: just record that the message went. Moving the run here would take it back
		// to the step after this one, and a wait it has already started there would count as over.
		raw, _ := json.Marshal(o.result)
		if _, err := tx2.ExecContext(ctx, `UPDATE enrollment_steps SET status = $4, finished_at = NOW(), result = $5
			WHERE enrollment_id = $1 AND node_id = $2 AND visit = $3`, enr.ID, n.ID, enr.CurrentVisit, StepDone, raw); err != nil {
			return false, err
		}
		return false, tx2.Commit()
	}
	return e.commitApply(ctx, tx2, &cur, n, o, now)
}

// commitApply applies an outcome and commits.
func (e *Engine) commitApply(ctx context.Context, tx *sqlx.Tx, enr *Enrollment, n *Node, o outcome, now time.Time) (bool, error) {
	again, err := e.apply(ctx, tx, enr, n, o, now)
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
