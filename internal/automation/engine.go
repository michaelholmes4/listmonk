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

// Sender delivers a Message. Returning an error means it was NOT queued, so the step is retried.
type Sender interface {
	SendEmail(ctx context.Context, m Message) error
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

const maxAttempts = 8

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
	rc, err := river.NewClient(riverdatabasesql.New(cfg.DB.DB), &river.Config{
		Queues:            map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: cfg.Workers}},
		Workers:           workers,
		PollOnly:          true, // database/sql has no LISTEN
		FetchPollInterval: cfg.PollInterval,
		MaxAttempts:       maxAttempts,
		JobTimeout:        2 * time.Minute,
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

// enqueue schedules a wake-up inside the caller's transaction, so the state change and the job
// either both happen or neither does.
func (e *Engine) enqueue(ctx context.Context, tx *sqlx.Tx, enrollmentID int64, at time.Time) error {
	// Always set explicitly, from the engine's clock (the real one outside tests).
	_, err := e.river.InsertTx(ctx, tx.Tx, AdvanceArgs{EnrollmentID: enrollmentID}, &river.InsertOpts{ScheduledAt: at})
	return err
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
	raw, _ := json.Marshal(ev)
	return e.fire(ctx, TriggerEvent, subscriberID, func(c TriggerConfig) bool { return c.Event == ev.Name }, EnrollContext{Event: raw})
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

// EnrollMany manually enrolls subscribers (an API call or "also enroll current matches"). It
// returns how many went in.
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
	return e.store.SetStatus(ctx, id, StatusPaused)
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

	var out Automation
	if err := tx.GetContext(ctx, &out, e.q.get("set-automation-status"), id, StatusActive); err != nil {
		return nil, err
	}
	var live []Enrollment
	if err := tx.SelectContext(ctx, &live, `SELECT * FROM enrollments WHERE automation_id = $1 AND status IN ('active', 'waiting')`, id); err != nil {
		return nil, err
	}
	for _, enr := range live {
		at := e.clock.Now()
		if enr.NextRunAt != nil && enr.NextRunAt.After(at) {
			at = *enr.NextRunAt
		}
		if err := e.enqueue(ctx, tx, enr.ID, at); err != nil {
			return nil, err
		}
	}
	return &out, tx.Commit()
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
	res, _ := json.Marshal(map[string]string{"error": cause.Error()})
	_, err := e.db.ExecContext(ctx, `
		UPDATE enrollments SET status = 'failed', exit_reason = 'error', exited_at = NOW(), next_run_at = NULL, context = context || $2::JSONB
		WHERE id = $1 AND status IN ('active', 'waiting')`, id, res)
	return err
}
