package automation

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"sync"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/knadh/listmonk/internal/migrations/fork"
	"github.com/knadh/listmonk/internal/testdb"
)

// fakeClock only moves when told to.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// fakeSender records what would have been sent.
type fakeSender struct {
	mu   sync.Mutex
	Sent []Message
	Err  error
	// Before runs at the start of each send (to simulate slowness or a crash).
	Before func(Message)
}

func (f *fakeSender) SendEmail(_ context.Context, m Message) error {
	if f.Before != nil {
		f.Before(m)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return f.Err
	}
	f.Sent = append(f.Sent, m)
	return nil
}

func (f *fakeSender) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.Sent)
}

type harness struct {
	t      *testing.T
	db     *sqlx.DB
	eng    *Engine
	store  *Store
	clock  *fakeClock
	sender *fakeSender
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	db := testdb.New(t)
	if err := fork.Run(context.Background(), db, log.New(io.Discard, "", 0)); err != nil {
		t.Fatal(err)
	}
	q, err := LoadQueries(DefaultQueriesPath())
	if err != nil {
		t.Fatal(err)
	}
	h := &harness{
		t:      t,
		db:     db,
		clock:  &fakeClock{t: time.Now().UTC().Truncate(time.Second)},
		sender: &fakeSender{},
	}
	h.eng, err = New(Config{DB: db, Queries: q, Sender: h.sender, Clock: h.clock, FixedSchedule: true, Log: log.New(io.Discard, "", 0)})
	if err != nil {
		t.Fatal(err)
	}
	h.store = h.eng.Store()
	return h
}

func (h *harness) must(err error) {
	h.t.Helper()
	if err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) list(name, optin string) int {
	h.t.Helper()
	var id int
	h.must(h.db.Get(&id, `INSERT INTO lists (uuid, name, type, optin) VALUES (gen_random_uuid(), $1, 'private', $2::list_optin) RETURNING id`, name, optin))
	return id
}

func (h *harness) subscriber(email, status string, attribs map[string]any) int {
	h.t.Helper()
	b, _ := json.Marshal(attribs)
	var id int
	h.must(h.db.Get(&id, `INSERT INTO subscribers (uuid, email, name, status, attribs) VALUES (gen_random_uuid(), $1, $1, $2::subscriber_status, $3) RETURNING id`, email, status, b))
	return id
}

func (h *harness) subscribe(sub, list int, status string) {
	h.t.Helper()
	_, err := h.db.Exec(`INSERT INTO subscriber_lists (subscriber_id, list_id, status) VALUES ($1, $2, $3::subscription_status)
		ON CONFLICT (subscriber_id, list_id) DO UPDATE SET status = EXCLUDED.status`, sub, list, status)
	h.must(err)
}

func (h *harness) campaign() int {
	h.t.Helper()
	var id int
	h.must(h.db.Get(&id, `INSERT INTO campaigns (uuid, name, subject, from_email, body, messenger, type, status) VALUES (gen_random_uuid(), 'step', 's', 'a@b.c', 'b', 'email', 'automation', 'cancelled') RETURNING id`))
	return id
}

// publish creates an automation with the graph, publishes it, and returns its ID.
func (h *harness) publish(name string, g *Graph, s Settings) int {
	h.t.Helper()
	ctx := context.Background()
	a, err := h.store.Create(ctx, name, s)
	h.must(err)
	_, problems, err := h.store.SaveDraft(ctx, a.ID, g, true)
	h.must(err)
	if len(problems) > 0 {
		h.t.Fatalf("graph problems: %s", messages(problems))
	}
	_, _, err = h.store.Publish(ctx, a.ID, true)
	h.must(err)
	return a.ID
}

// drain stands in for the job queue: it runs every job that is due by the fake clock,
// until none are left. It returns how many ran.
func (h *harness) drain() int {
	h.t.Helper()
	n := 0
	for {
		now := h.clock.Now()
		var jobs []struct {
			ID   int64           `db:"id"`
			Args json.RawMessage `db:"args"`
		}
		h.must(h.db.Select(&jobs, `SELECT id, args FROM river_job WHERE state IN ('available', 'scheduled') AND scheduled_at <= $1 ORDER BY id`, now))
		if len(jobs) == 0 {
			return n
		}
		for _, j := range jobs {
			var a AdvanceArgs
			h.must(json.Unmarshal(j.Args, &a))
			h.must(h.db.QueryRow(`DELETE FROM river_job WHERE id = $1 RETURNING id`, j.ID).Scan(new(int64)))
			h.must(h.eng.Advance(context.Background(), a.EnrollmentID))
			n++
		}
	}
}

func (h *harness) enrollment(automationID, sub int) Enrollment {
	h.t.Helper()
	var e Enrollment
	h.must(h.db.Get(&e, `SELECT * FROM enrollments WHERE automation_id = $1 AND subscriber_id = $2 ORDER BY id DESC LIMIT 1`, automationID, sub))
	return e
}

func (h *harness) steps(enrollmentID int64) map[string]string {
	h.t.Helper()
	var rows []Step
	h.must(h.db.Select(&rows, `SELECT * FROM enrollment_steps WHERE enrollment_id = $1`, enrollmentID))
	out := map[string]string{}
	for _, r := range rows {
		out[r.NodeID] = r.Status
	}
	return out
}

func (h *harness) pendingJobs() int {
	var n int
	h.must(h.db.Get(&n, `SELECT COUNT(*) FROM river_job WHERE state IN ('available', 'scheduled')`))
	return n
}

func mail(msgType string, list, campaign int) json.RawMessage {
	return cfg(SendEmailConfig{MessageType: msgType, ListID: list, CampaignID: campaign})
}

func listTrigger(list int) []Trigger {
	return []Trigger{{ID: "t1", Type: TriggerListJoined, Config: cfg(TriggerConfig{ListID: list})}}
}
