package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/riverqueue/river/rivertype"
)

// sendLease is how long a run is held while its email is sent. It is longer than a job may run,
// so it only runs out when the process died mid-send.
const sendLease = 2*jobTimeout + time.Minute

// sendStep runs an email step. Sending is the one thing that must not happen twice, and the one
// thing that can't be rolled back, so it is done in three parts:
//
//  1. In a transaction: decide whether to send at all (the window, consent), write the step row
//     as 'sending' (unique per enrollment, node and visit) and hold the run for sendLease: its
//     next_run_at moves that far ahead, so any other wake-up meanwhile finds it not due and leaves
//     it alone. A wake-up is queued for when the lease ends.
//  2. Outside any transaction: hand the message to the sender, which returns once the messenger
//     has it.
//  3. In a new transaction: mark the step done and move the enrollment on.
//
// If the process dies between 1 and 3, the wake-up at the end of the lease finds the 'sending' row
// and carries on without sending again: a message may be lost in that rare crash, but is never sent
// twice. If the sender reports that it did not hand the message over, the row and the lease's wake-up
// are removed and the run made due again, so the job's retry sends it.
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
	leaseEnd := now.Add(sendLease)
	if _, err := tx.ExecContext(ctx, `UPDATE enrollments SET status = 'active', next_run_at = $2 WHERE id = $1`, enr.ID, leaseEnd); err != nil {
		return false, err
	}
	leaseJob, err := e.enqueueJob(ctx, tx, enr.ID, leaseEnd)
	if err != nil {
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

	// From here on the outcome must be recorded even if the job is being cancelled (a shutdown).
	wctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	if err != nil {
		// Over the sending limit: send it when the window ends. That is not a failure, so it is
		// rescheduled rather than left to the job's retry, whose attempts are limited.
		var rl *RateLimitedError
		if errors.As(err, &rl) {
			if uerr := e.unsend(wctx, enr.ID, n.ID, leaseJob, rl.Until); uerr != nil {
				e.log.Printf("automation: deferring step %s of enrollment %d: %v", n.ID, enr.ID, uerr)
				return false, err
			}
			return false, nil
		}
		// Not handed over: forget that we tried, so the job's retry sends it. If this
		// fails, the wake-up at the end of the lease finds the 'sending' row and the email is lost.
		if uerr := e.unsend(wctx, enr.ID, n.ID, leaseJob, time.Time{}); uerr != nil {
			e.log.Printf("automation: clearing step %s of enrollment %d: %v", n.ID, enr.ID, uerr)
		}
		return false, err
	}

	// Part 3.
	tx2, err := e.db.BeginTxx(wctx, nil)
	if err != nil {
		return false, err
	}
	defer tx2.Rollback()
	var cur Enrollment
	if err := tx2.GetContext(wctx, &cur, e.q.get("lock-enrollment"), enr.ID); err != nil {
		return false, err
	}
	o := outcome{next: ix.Next(n.ID, ""), stepStatus: StepDone, result: map[string]any{"message_type": c.MessageType}}
	curNode := ix.Graph.Root
	if cur.CurrentNode != nil && *cur.CurrentNode != "" {
		curNode = *cur.CurrentNode
	}
	live := cur.Status == EnrollmentActive || cur.Status == EnrollmentWaiting
	if !live || curNode != n.ID || cur.CurrentVisit != enr.CurrentVisit {
		// Archived or failed meanwhile, or the lease ran out (a send slower than any job may run) and
		// the wake-up at its end carried on: just record that the message went. Moving the run here
		// would take it back to the step after this one, and a wait it has already started there would
		// count as over.
		raw, _ := json.Marshal(o.result)
		if _, err := tx2.ExecContext(wctx, `UPDATE enrollment_steps SET status = $4, finished_at = NOW(), result = $5
			WHERE enrollment_id = $1 AND node_id = $2 AND visit = $3`, enr.ID, n.ID, enr.CurrentVisit, StepDone, raw); err != nil {
			return false, err
		}
		return false, tx2.Commit()
	}
	return e.commitApply(wctx, tx2, &cur, n, o, now)
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

// unsend undoes part 1 of sendStep for a message that was not handed over: it removes the step's
// 'sending' row and the lease's wake-up, and makes the run due again. With no retryAt it is due at
// once and the job's own retry (with its backoff and its limit) sends it; were the wake-up left,
// every failed attempt would add one more job that retries on its own. With retryAt it is due then,
// and a wake-up is queued for that time.
func (e *Engine) unsend(ctx context.Context, enrollmentID int64, nodeID string, leaseJob int64, retryAt time.Time) error {
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := retryAt
	if at.IsZero() {
		at = e.clock.Now()
	}
	var undone []int64
	if err := tx.SelectContext(ctx, &undone, `WITH d AS (
			DELETE FROM enrollment_steps WHERE enrollment_id = $1 AND node_id = $2 AND status = $3
			AND visit = (SELECT current_visit FROM enrollments WHERE id = $1)
			RETURNING enrollment_id)
		UPDATE enrollments SET next_run_at = $4 WHERE id IN (SELECT enrollment_id FROM d) AND status IN ('active', 'waiting')
		RETURNING id`,
		enrollmentID, nodeID, StepSending, at); err != nil {
		return err
	}
	if !retryAt.IsZero() && len(undone) > 0 {
		if _, err := e.enqueueJob(ctx, tx, enrollmentID, retryAt); err != nil {
			return err
		}
	}
	// Running only if the lease ran out meanwhile, and that job is carrying the run on: leave it.
	if _, err := e.river.JobDeleteTx(ctx, tx.Tx, leaseJob); err != nil && !errors.Is(err, rivertype.ErrNotFound) && !errors.Is(err, rivertype.ErrJobRunning) {
		return err
	}
	return tx.Commit()
}
