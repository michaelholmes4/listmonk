package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
)

// Message is one email an automation wants sent. The Sender turns it into a real message and
// pushes it through the same queue campaigns and /api/tx use.
type Message struct {
	SubscriberID int
	MessageType  string
	ListID       int
	// Exactly one of these is set: a hidden campaign, or a transactional template.
	CampaignID int
	TemplateID int

	AutomationID   int
	AutomationName string
	AutomationUUID string
	NodeID         string
	EnrollmentID   int64
	// Event is what started the enrollment, if an event did (exposed to templates as .Event).
	Event json.RawMessage
}

// Sender delivers a Message, returning once the messenger has it. Returning an error means it was
// NOT handed over and never will be, so the step is retried.
type Sender interface {
	SendEmail(ctx context.Context, m Message) error
}

// RateLimitedError is returned by a Sender that did not send because the sending limit (the
// sliding window) is reached. The step is sent again at Until, without counting as a failed attempt.
type RateLimitedError struct{ Until time.Time }

func (e *RateLimitedError) Error() string {
	return "sending limit reached until " + e.Until.Format(time.RFC3339)
}

// Clock lets tests control time.
type Clock interface{ Now() time.Time }

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// EnrollContext is remembered with an enrollment: what started it.
type EnrollContext struct {
	Trigger string          `json:"trigger"`
	ListID  int             `json:"list_id,omitempty"`
	Event   json.RawMessage `json:"event,omitempty"`
	// TriggerEventID is the event that started the run. Event is replaced when a wait_for_event
	// restarts, so this is what tells a retried event job that it already started this run.
	TriggerEventID int64 `json:"trigger_event_id,omitempty"`
}

// Config wires an Engine.
type Config struct {
	DB      *sqlx.DB
	Queries Queries
	Sender  Sender
	Clock   Clock
	Log     *log.Logger
	// Workers is how many jobs run at once.
	Workers int
	// FixedSchedule always gives a job its scheduled time, even when it is due now. Tests with a fake
	// clock need that (they pick jobs by it); in production an explicit time makes River park the job
	// as "scheduled" until its maintenance leader promotes it, seconds later.
	FixedSchedule bool
	// PollInterval is how often the queue looks for due jobs.
	PollInterval time.Duration
}

// Engine enrolls subscribers and advances them through their automation's graph.
type Engine struct {
	cfg   Config
	store *Store
	q     Queries
	db    *sqlx.DB
	river *river.Client[*sql.Tx]
	clock Clock
	log   *log.Logger

	mu     sync.RWMutex
	graphs map[int]*Index // version ID -> graph; published versions are immutable

	// afterJoin runs after a subscription becomes confirmed through the engine (add_to_list), so
	// automations can start others. Set by New.
	started bool
}

// AdvanceArgs is the only job: wake an enrollment and run it forward.
type AdvanceArgs struct {
	EnrollmentID int64 `json:"enrollment_id"`
}

// Kind names the job type.
func (AdvanceArgs) Kind() string { return "automation.advance" }

type advanceWorker struct {
	river.WorkerDefaults[AdvanceArgs]
	e *Engine
}

const (
	maxAttempts = 8
	jobTimeout  = 2 * time.Minute
)

func (w *advanceWorker) Work(ctx context.Context, job *river.Job[AdvanceArgs]) error {
	err := w.e.Advance(ctx, job.Args.EnrollmentID)
	if err == nil {
		return nil
	}
	w.e.log.Printf("automation: enrollment %d: %v", job.Args.EnrollmentID, err)
	// Out of retries: stop the enrollment instead of leaving it waiting for a job that won't come.
	if job.Attempt >= job.MaxAttempts {
		if ferr := w.e.fail(ctx, job.Args.EnrollmentID, err); ferr != nil {
			return ferr
		}
		return nil
	}
	return err
}

// EventArgs is the job that acts on a recorded event: it hands it to the runs waiting for it and
// starts the automations it triggers. Recording the event and queueing this job happen together, and
// the job retries, so a passing failure can't lose what an event should have done.
type EventArgs struct {
	EventID int64 `json:"event_id"`
}

// Kind names the job type.
func (EventArgs) Kind() string { return "automation.event" }

type eventWorker struct {
	river.WorkerDefaults[EventArgs]
	e *Engine
}

func (w *eventWorker) Work(ctx context.Context, job *river.Job[EventArgs]) error {
	err := w.e.processEvent(ctx, job.Args.EventID)
	if err != nil {
		w.e.log.Printf("automation: event %d (attempt %d of %d): %v", job.Args.EventID, job.Attempt, job.MaxAttempts, err)
	}
	return err
}

// processEvent runs an event's job. Running it again does no harm: a wait it already ended stays
// ended, and an automation it already started is not started again for it.
func (e *Engine) processEvent(ctx context.Context, id int64) error {
	ev, err := e.store.Event(ctx, id)
	if errors.Is(err, ErrNotFound) {
		return nil // pruned, or the subscriber was deleted
	}
	if err != nil {
		return err
	}
	return e.OnEvent(ctx, ev.SubscriberID, *ev)
}

// RecordEvent stores an event and, in the same transaction, the job that acts on it. It reports false
// (and no event) when the idempotency key was used before.
func (e *Engine) RecordEvent(ctx context.Context, subscriberID int, name string, properties json.RawMessage, key string, at time.Time) (*Event, bool, error) {
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	ev, created, err := e.store.recordEvent(ctx, tx, subscriberID, name, properties, key, at)
	if err != nil || !created {
		return ev, created, err
	}
	if _, err := e.river.InsertTx(ctx, tx.Tx, EventArgs{EventID: ev.ID}, nil); err != nil {
		return nil, false, err
	}
	return ev, true, tx.Commit()
}

// New builds an engine. Call Start to begin processing jobs.
func New(cfg Config) (*Engine, error) {
	if cfg.Clock == nil {
		cfg.Clock = realClock{}
	}
	if cfg.Log == nil {
		cfg.Log = log.Default()
	}
	if cfg.Workers <= 0 {
		cfg.Workers = 10
	}
	// River's queue does not poll usefully faster than this.
	if cfg.PollInterval < time.Second {
		cfg.PollInterval = time.Second
	}
	e := &Engine{
		cfg:    cfg,
		store:  NewStore(cfg.DB, cfg.Queries),
		q:      cfg.Queries,
		db:     cfg.DB,
		clock:  cfg.Clock,
		log:    cfg.Log,
		graphs: map[int]*Index{},
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &advanceWorker{e: e})
	river.AddWorker(workers, &eventWorker{e: e})
	rc, err := river.NewClient(riverdatabasesql.New(cfg.DB.DB), &river.Config{
		Queues:            map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: cfg.Workers}},
		Workers:           workers,
		PollOnly:          true, // database/sql has no LISTEN
		FetchPollInterval: cfg.PollInterval,
		MaxAttempts:       maxAttempts,
		JobTimeout:        jobTimeout,
	})
	if err != nil {
		return nil, err
	}
	e.river = rc
	return e, nil
}

// Store returns the engine's definition store.
func (e *Engine) Store() *Store { return e.store }

// Start begins processing jobs.
func (e *Engine) Start(ctx context.Context) error {
	e.started = true
	return e.river.Start(ctx)
}

// Stop finishes in-flight jobs and stops.
func (e *Engine) Stop(ctx context.Context) error {
	if !e.started {
		return nil
	}
	return e.river.Stop(ctx)
}

// StopAndCancel cancels in-flight jobs and stops. An email step still waiting for the queue gives
// up and is sent again later; one already being handed to the messenger is let finish.
func (e *Engine) StopAndCancel(ctx context.Context) error {
	if !e.started {
		return nil
	}
	return e.river.StopAndCancel(ctx)
}

// enqueue schedules a wake-up inside the caller's transaction, so the state change and the job
// either both happen or neither does.
func (e *Engine) enqueue(ctx context.Context, tx *sqlx.Tx, enrollmentID int64, at time.Time) error {
	_, err := e.enqueueJob(ctx, tx, enrollmentID, at)
	return err
}

// enqueueJob is enqueue, returning the job's ID.
func (e *Engine) enqueueJob(ctx context.Context, tx *sqlx.Tx, enrollmentID int64, at time.Time) (int64, error) {
	// The time comes from the engine's clock (the real one outside tests). See Config.FixedSchedule.
	opts := &river.InsertOpts{ScheduledAt: at}
	if !e.cfg.FixedSchedule && !at.After(e.clock.Now()) {
		opts.ScheduledAt = time.Time{} // due now: available at once
	}
	res, err := e.river.InsertTx(ctx, tx.Tx, AdvanceArgs{EnrollmentID: enrollmentID}, opts)
	if err != nil {
		return 0, err
	}
	return res.Job.ID, nil
}

// graph returns the (cached) graph of a version.
func (e *Engine) graph(ctx context.Context, versionID int) (*Index, error) {
	e.mu.RLock()
	ix, ok := e.graphs[versionID]
	e.mu.RUnlock()
	if ok {
		return ix, nil
	}
	v, err := e.store.Version(ctx, versionID)
	if err != nil {
		return nil, err
	}
	g, err := ParseGraph(v.Graph)
	if err != nil {
		return nil, err
	}
	ix = NewIndex(g)
	// Only frozen versions are cached; a draft can still change.
	if v.PublishedAt != nil {
		e.mu.Lock()
		e.graphs[versionID] = ix
		e.mu.Unlock()
	}
	return ix, nil
}

// --- Enrolling ----------------------------------------------------------------------------------

// Enroll puts a subscriber into an automation's current version, unless re-entry rules or an
// existing live enrollment say no. It reports whether they went in.
func (e *Engine) Enroll(ctx context.Context, automationID, subscriberID int, ec EnrollContext) (bool, error) {
	a, err := e.store.Get(ctx, automationID)
	if err != nil {
		return false, err
	}
	if a.Status != StatusActive || a.CurrentVersionID == nil {
		return false, nil
	}
	return e.enroll(ctx, a, subscriberID, ec)
}

func (e *Engine) enroll(ctx context.Context, a *Automation, subscriberID int, ec EnrollContext) (bool, error) {
	settings, err := ParseSettings(a.Settings)
	if err != nil {
		return false, err
	}

	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var sub struct {
		ID     int    `db:"id"`
		Status string `db:"status"`
	}
	if err := tx.GetContext(ctx, &sub, `SELECT id, status::TEXT AS status FROM subscribers WHERE id = $1`, subscriberID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if sub.Status == "blocklisted" {
		return false, nil
	}

	// An event's job can run more than once (it retries); the event starts a run only once.
	if len(ec.Event) > 0 {
		var ev struct {
			ID int64 `json:"id"`
		}
		if json.Unmarshal(ec.Event, &ev) == nil && ev.ID > 0 {
			var done bool
			if err := tx.GetContext(ctx, &done, e.q.get("enrolled-by-event"), a.ID, subscriberID, ev.ID); err != nil {
				return false, err
			}
			if done {
				return false, nil
			}
			ec.TriggerEventID = ev.ID
		}
	}

	var hist struct {
		LastEntered time.Time `db:"last_entered"`
		Entries     int       `db:"entries"`
	}
	if err := tx.GetContext(ctx, &hist, e.q.get("enrollment-history"), a.ID, subscriberID); err != nil {
		return false, err
	}
	if hist.Entries > 0 {
		switch settings.Reentry.Mode {
		case "always":
		case "interval":
			d, err := ParseDuration(settings.Reentry.Interval)
			if err != nil || e.clock.Now().Sub(hist.LastEntered) < d {
				return false, nil
			}
		default: // once
			return false, nil
		}
	}

	ecRaw, err := json.Marshal(ec)
	if err != nil {
		return false, err
	}
	var enr Enrollment
	if err := tx.GetContext(ctx, &enr, e.q.get("insert-enrollment"), a.ID, *a.CurrentVersionID, subscriberID, ecRaw, e.clock.Now()); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil // already inside
		}
		return false, err
	}
	if err := e.enqueue(ctx, tx, enr.ID, e.clock.Now()); err != nil {
		return false, err
	}
	return true, tx.Commit()
}

type triggerRow struct {
	AutomationID int             `db:"automation_id"`
	VersionID    int             `db:"version_id"`
	Type         string          `db:"type"`
	Config       json.RawMessage `db:"config"`
	Settings     json.RawMessage `db:"settings"`
}

// fire enrolls the subscriber into every active automation with a matching trigger.
func (e *Engine) fire(ctx context.Context, typ string, subscriberID int, match func(TriggerConfig) bool, ec EnrollContext) error {
	var rows []triggerRow
	if err := e.db.SelectContext(ctx, &rows, e.q.get("find-triggers"), typ); err != nil {
		return err
	}
	var errs []error
	seen := map[int]bool{}
	for _, r := range rows {
		var c TriggerConfig
		if len(r.Config) > 0 {
			if err := json.Unmarshal(r.Config, &c); err != nil {
				continue
			}
		}
		if seen[r.AutomationID] || !match(c) {
			continue
		}
		seen[r.AutomationID] = true
		ec.Trigger = typ
		if _, err := e.Enroll(ctx, r.AutomationID, subscriberID, ec); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// OnListJoined is called when a subscription becomes confirmed: on a single opt-in list that is
// when they subscribe, on a double opt-in list when they confirm.
func (e *Engine) OnListJoined(ctx context.Context, subscriberID, listID int) error {
	return e.fire(ctx, TriggerListJoined, subscriberID, func(c TriggerConfig) bool { return c.ListID == listID }, EnrollContext{ListID: listID})
}

// OnEvent is called for every recorded event.
func (e *Engine) OnEvent(ctx context.Context, subscriberID int, ev Event) error {
	// Runs already waiting for this event first; the event that starts a run never counts for it.
	derr := e.deliverEvent(ctx, subscriberID, ev)
	raw, _ := json.Marshal(ev)
	return errors.Join(derr, e.fire(ctx, TriggerEvent, subscriberID, func(c TriggerConfig) bool { return c.Event == ev.Name }, EnrollContext{Event: raw}))
}

// OnAttributesChanged is called with a subscriber's attributes before and after an update.
func (e *Engine) OnAttributesChanged(ctx context.Context, subscriberID int, before, after map[string]any) error {
	return e.fire(ctx, TriggerAttributeChanged, subscriberID, func(c TriggerConfig) bool {
		old, _ := attrPath(before, c.Attribute)
		now, ok := attrPath(after, c.Attribute)
		if jsonEqual(old, now) {
			return false
		}
		if c.Equals != nil {
			if !ok {
				return false
			}
			var want any
			if json.Unmarshal(*c.Equals, &want) != nil {
				return false
			}
			return jsonEqual(now, want)
		}
		return true
	}, EnrollContext{})
}

func jsonEqual(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}

// EnrollManually enrolls subscribers picked by hand (in the admin or through the API). Only an
// automation with an "added by hand or by API" trigger takes them. It returns how many went in.
func (e *Engine) EnrollManually(ctx context.Context, automationID int, subscriberIDs []int) (int, error) {
	a, err := e.store.Get(ctx, automationID)
	if err != nil {
		return 0, err
	}
	if a.Status != StatusActive || a.CurrentVersionID == nil {
		return 0, fmt.Errorf("%w: the automation is not active", ErrConflict)
	}
	ok, err := e.store.HasTrigger(ctx, automationID, TriggerManual)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, fmt.Errorf("%w: the automation does not take people added by hand: add the \"Added by hand or by API\" trigger and publish", ErrConflict)
	}
	return e.EnrollMany(ctx, automationID, subscriberIDs, TriggerManual)
}

// EnrollMany enrolls subscribers whatever the automation's triggers (EnrollManually, or "also
// enroll current matches" on publish). It returns how many went in.
func (e *Engine) EnrollMany(ctx context.Context, automationID int, subscriberIDs []int, trigger string) (int, error) {
	a, err := e.store.Get(ctx, automationID)
	if err != nil {
		return 0, err
	}
	if a.Status != StatusActive || a.CurrentVersionID == nil {
		return 0, fmt.Errorf("%w: the automation is not active", ErrConflict)
	}
	n := 0
	for _, id := range subscriberIDs {
		ok, err := e.enroll(ctx, a, id, EnrollContext{Trigger: trigger})
		if err != nil {
			return n, err
		}
		if ok {
			n++
		}
	}
	return n, nil
}

// --- Lifecycle ----------------------------------------------------------------------------------

// Pause stops advancing enrollments; they keep their place.
func (e *Engine) Pause(ctx context.Context, id int) (*Automation, error) {
	a, err := e.store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if a.Status != StatusActive {
		return nil, fmt.Errorf("%w: only an active automation can be paused", ErrConflict)
	}
	return e.store.SetStatus(ctx, id, StatusActive, StatusPaused)
}

// Resume continues a paused automation: every live enrollment gets a wake-up again.
func (e *Engine) Resume(ctx context.Context, id int) (*Automation, error) {
	a, err := e.store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if a.Status != StatusPaused {
		return nil, fmt.Errorf("%w: only a paused automation can be resumed", ErrConflict)
	}
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Only from paused: an archive in between stays archived, and a second resume queues nothing.
	out, err := moveStatus(ctx, tx, e.q, id, StatusPaused, StatusActive)
	if err != nil {
		return nil, err
	}
	var live []Enrollment
	if err := tx.SelectContext(ctx, &live, `SELECT * FROM enrollments WHERE automation_id = $1 AND status IN ('active', 'waiting')`, id); err != nil {
		return nil, err
	}
	// A run whose wake-up hadn't come yet when it was paused still has its job: a second one, due at
	// the same moment, would advance it twice at once. (A later job, such as a wait's time limit after
	// an event already ended the wait, doesn't count.)
	var queued []struct {
		ID int64     `db:"id"`
		At time.Time `db:"at"`
	}
	if err := tx.SelectContext(ctx, &queued, `SELECT (args->>'enrollment_id')::BIGINT AS id, MIN(scheduled_at) AS at FROM river_job
		WHERE kind = $1 AND state IN ('available', 'scheduled', 'retryable') GROUP BY 1`, AdvanceArgs{}.Kind()); err != nil {
		return nil, err
	}
	nextJob := make(map[int64]time.Time, len(queued))
	for _, j := range queued {
		nextJob[j.ID] = j.At
	}
	for _, enr := range live {
		at := e.clock.Now()
		if enr.NextRunAt != nil && enr.NextRunAt.After(at) {
			at = *enr.NextRunAt
		}
		if j, ok := nextJob[enr.ID]; ok && !j.After(at) {
			continue
		}
		if err := e.enqueue(ctx, tx, enr.ID, at); err != nil {
			return nil, err
		}
	}
	return out, tx.Commit()
}

// Archive retires an automation and ends everyone still inside it.
func (e *Engine) Archive(ctx context.Context, id int) (*Automation, error) {
	if _, err := e.store.Get(ctx, id); err != nil {
		return nil, err
	}
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var out Automation
	if err := tx.GetContext(ctx, &out, e.q.get("set-automation-status"), id, StatusArchived); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE enrollments SET status = 'exited', exit_reason = $2, exited_at = NOW(), next_run_at = NULL
		WHERE automation_id = $1 AND status IN ('active', 'waiting')`, id, ExitArchived); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM automation_triggers WHERE automation_id = $1`, id); err != nil {
		return nil, err
	}
	return &out, tx.Commit()
}

// fail ends an enrollment that can't continue.
func (e *Engine) fail(ctx context.Context, id int64, cause error) error {
	// Often called because the job's time ran out: with its context already done, the update would
	// never run and the run would wait for good for a job that won't come.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	res, _ := json.Marshal(map[string]string{"error": cause.Error()})
	_, err := e.db.ExecContext(ctx, `
		UPDATE enrollments SET status = 'failed', exit_reason = 'error', exited_at = NOW(), next_run_at = NULL, context = context || $2::JSONB
		WHERE id = $1 AND status IN ('active', 'waiting')`, id, res)
	return err
}
