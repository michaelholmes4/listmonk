package automation

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// The real job queue, running: joining a list sends the first email without anyone calling Advance.
func TestRealWorkerRunsTheJobs(t *testing.T) {
	h := newHarness(t)
	// Real time, since River schedules by the database clock.
	h.clock.t = time.Now()
	eng, err := New(Config{DB: h.db, Queries: h.eng.q, Sender: h.sender, Log: h.eng.log}) // real clock, as in production
	if err != nil {
		t.Fatal(err)
	}
	h.eng = eng
	h.store = eng.Store()

	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("w", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")

	h.must(eng.Start(ctx))
	defer eng.Stop(ctx)
	h.clock.t = time.Now()
	h.must(eng.OnListJoined(ctx, sub, list))

	deadline := time.Now().Add(15 * time.Second)
	for h.sender.count() == 0 && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if h.sender.count() != 1 {
		t.Fatal("the worker never ran the job")
	}
	for h.enrollment(auto, sub).Status != EnrollmentCompleted && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if h.enrollment(auto, sub).Status != EnrollmentCompleted {
		t.Fatalf("status = %s", h.enrollment(auto, sub).Status)
	}
}

// When the last retry fails the enrollment is marked failed (and the job ends), instead of waiting
// forever for a job that will not come.
func TestLastRetryFailsTheEnrollment(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("w", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	var id int64
	h.must(h.db.Get(&id, `SELECT id FROM enrollments WHERE automation_id = $1`, auto))
	h.sender.Err = errors.New("smtp is down")

	w := &advanceWorker{e: h.eng}
	job := func(attempt int) *river.Job[AdvanceArgs] {
		return &river.Job[AdvanceArgs]{JobRow: &rivertype.JobRow{Attempt: attempt, MaxAttempts: maxAttempts}, Args: AdvanceArgs{EnrollmentID: id}}
	}
	if err := w.Work(ctx, job(1)); err == nil {
		t.Fatal("an early failure should be returned so the job is retried")
	}
	if h.enrollment(auto, sub).Status != EnrollmentActive {
		t.Fatal("failed too early")
	}
	if err := w.Work(ctx, job(maxAttempts)); err != nil {
		t.Fatalf("the final failure should end the job, got %v", err)
	}
	if enr := h.enrollment(auto, sub); enr.Status != EnrollmentFailed {
		t.Fatalf("status = %s", enr.Status)
	}
}
