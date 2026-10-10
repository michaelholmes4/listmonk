package msglog

import (
	"context"
	"errors"
	"io"
	"log"
	"net/textproto"
	"sync"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/knadh/listmonk/internal/migrations/fork"
	"github.com/knadh/listmonk/internal/testdb"
	"github.com/knadh/listmonk/models"
)

var quiet = log.New(io.Discard, "", 0)

// memSink keeps what a Writer stores.
type memSink struct {
	mu      sync.Mutex
	entries []Entry
	pruned  []time.Time
}

func (s *memSink) Insert(_ context.Context, e []Entry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = append(s.entries, e...)
	return nil
}

func (s *memSink) DeleteBefore(_ context.Context, t time.Time) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruned = append(s.pruned, t)
	return 0, nil
}

// fakeMessenger records what it was asked to push.
type fakeMessenger struct {
	name string
	err  error
	got  []models.Message
}

func (f *fakeMessenger) Name() string { return f.name }
func (f *fakeMessenger) Flush() error { return nil }
func (f *fakeMessenger) Close() error { return nil }
func (f *fakeMessenger) Push(m models.Message) error {
	f.got = append(f.got, m)
	return f.err
}

func wrapped(f *fakeMessenger, source string) (Messenger, *memSink, *Writer) {
	return wrappedKeeping(f, source, source != SourceSystem)
}

func wrappedKeeping(f *fakeMessenger, source string, keepContent bool) (Messenger, *memSink, *Writer) {
	s := &memSink{}
	w := newWriter(s, quiet, 0)
	return Wrap(f, w, source, keepContent), s, w
}

func TestWrapClassifiesAndKeepsContentOnlyWhereItShould(t *testing.T) {
	campaign := &models.Campaign{Type: "regular"}
	campaign.ID = 7
	hidden := &models.Campaign{Type: "automation"}
	hidden.ID = 8

	auto := textproto.MIMEHeader{}
	auto.Set(HdrAutomation, "3")

	tests := []struct {
		name     string
		source   string
		keep     bool
		msg      models.Message
		want     string
		wantBody bool
	}{
		{"campaign mail keeps no body", SourceTx, true, models.Message{Campaign: campaign, Body: []byte("hi")}, SourceCampaign, false},
		{"automation campaign keeps its body", SourceTx, false, models.Message{Campaign: hidden, Body: []byte("hi")}, SourceAutomation, true},
		{"automation template keeps its body", SourceTx, false, models.Message{Body: []byte("hi"), Headers: auto}, SourceAutomation, true},
		{"tx keeps no body by default", SourceTx, false, models.Message{Body: []byte("reset link")}, SourceTx, false},
		{"tx keeps its body when asked", SourceTx, true, models.Message{Body: []byte("hi")}, SourceTx, true},
		{"notification", SourceNotification, true, models.Message{Body: []byte("hi")}, SourceNotification, true},
		{"system mail keeps no body", SourceSystem, false, models.Message{Body: []byte("reset link")}, SourceSystem, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := &fakeMessenger{name: "email"}
			m, s, w := wrappedKeeping(f, tt.source, tt.keep)
			tt.msg.To = []string{"a@example.com"}
			if err := m.Push(tt.msg); err != nil {
				t.Fatal(err)
			}
			w.Close()

			if len(s.entries) != 1 {
				t.Fatalf("logged %d entries", len(s.entries))
			}
			e := s.entries[0]
			if e.Source != tt.want || e.Status != StatusSent {
				t.Errorf("source/status = %s/%s, want %s/sent", e.Source, e.Status, tt.want)
			}
			if (e.Body != nil) != tt.wantBody {
				t.Errorf("body kept = %v, want %v", e.Body != nil, tt.wantBody)
			}
			if e.CampaignID != campaignID(tt.msg) {
				t.Errorf("campaign id = %d", e.CampaignID)
			}
		})
	}
}

func TestWrapStripsInternalHeadersAndSetsMessageID(t *testing.T) {
	f := &fakeMessenger{name: "email"}
	m, s, w := wrapped(f, SourceTx)

	h := textproto.MIMEHeader{}
	h.Set(HdrAutomation, "12")
	h.Set(HdrEnrollment, "34")
	h.Set("X-Other", "kept")
	if err := m.Push(models.Message{From: "Me <me@example.com>", To: []string{"a@example.com"}, Headers: h}); err != nil {
		t.Fatal(err)
	}
	w.Close()

	sent := f.got[0].Headers
	if sent.Get(HdrAutomation) != "" || sent.Get(HdrEnrollment) != "" {
		t.Errorf("internal headers reached the messenger: %v", sent)
	}
	if sent.Get("X-Other") != "kept" {
		t.Errorf("other headers were lost: %v", sent)
	}
	id := sent.Get("Message-Id")
	if id == "" {
		t.Fatal("no Message-Id was set")
	}
	e := s.entries[0]
	if e.MessageID != id {
		t.Errorf("logged id %q, sent %q", e.MessageID, id)
	}
	if e.AutomationID != 12 || e.EnrollmentID != 34 || e.Source != SourceAutomation {
		t.Errorf("automation = %d/%d (%s)", e.AutomationID, e.EnrollmentID, e.Source)
	}
}

func TestWrapRecordsFailures(t *testing.T) {
	f := &fakeMessenger{name: "email", err: errors.New("connection refused")}
	m, s, w := wrapped(f, SourceTx)

	err := m.Push(models.Message{To: []string{"a@example.com"}})
	w.Close()

	if err == nil || err.Error() != "connection refused" {
		t.Fatalf("the messenger's error must be returned unchanged, got %v", err)
	}
	if e := s.entries[0]; e.Status != StatusFailed || e.Error != "connection refused" {
		t.Errorf("status = %s, error = %q", e.Status, e.Error)
	}
}

func TestPostbackGetsNoGeneratedMessageID(t *testing.T) {
	f := &fakeMessenger{name: "pb"}
	m, _, w := wrapped(f, SourceTx)
	_ = m.Push(models.Message{To: []string{"a@example.com"}})
	w.Close()
	if f.got[0].Headers.Get("Message-Id") != "" {
		t.Error("a non-email messenger's payload must not change")
	}
}

func TestWriterDrainsOnCloseAndIgnoresLaterEntries(t *testing.T) {
	s := &memSink{}
	w := newWriter(s, quiet, 0)
	for i := 0; i < 1200; i++ {
		w.Add(Entry{Source: SourceTx})
	}
	w.Close()
	w.Close() // idempotent
	w.Add(Entry{})
	if len(s.entries) != 1200 {
		t.Fatalf("stored %d, want 1200", len(s.entries))
	}
}

func newDB(t *testing.T) *sqlx.DB {
	t.Helper()
	db := testdb.New(t)
	if err := fork.Run(context.Background(), db, quiet); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestStoreQueryFiltersAndFlags(t *testing.T) {
	db := newDB(t)
	st := NewStore(db)
	ctx := context.Background()

	var subA, subB, camp int
	if err := db.Get(&subA, `INSERT INTO subscribers (uuid, email, name) VALUES (gen_random_uuid(), 'a@example.com', 'A') RETURNING id`); err != nil {
		t.Fatal(err)
	}
	if err := db.Get(&subB, `INSERT INTO subscribers (uuid, email, name) VALUES (gen_random_uuid(), 'b@example.com', 'B') RETURNING id`); err != nil {
		t.Fatal(err)
	}
	if err := db.Get(&camp, `INSERT INTO campaigns (uuid, name, subject, from_email, body, content_type, messenger, type, template_id)
		VALUES (gen_random_uuid(), 'Spring', 'Hello', 'x@example.com', 'b', 'richtext', 'email', 'regular',
		(SELECT id FROM templates LIMIT 1)) RETURNING id`); err != nil {
		t.Fatal(err)
	}

	now := time.Now()
	body := "<p>hi</p>"
	err := st.Insert(ctx, []Entry{
		{CreatedAt: now.Add(-3 * time.Hour), Source: SourceCampaign, Messenger: "email", Status: StatusSent, SubscriberID: subA, CampaignID: camp, To: []string{"a@example.com"}, Subject: "Spring sale"},
		{CreatedAt: now.Add(-2 * time.Hour), Source: SourceCampaign, Messenger: "email", Status: StatusSent, SubscriberID: subB, CampaignID: camp, To: []string{"b@example.com"}, Subject: "Spring sale"},
		{CreatedAt: now.Add(-time.Hour), Source: SourceTx, Messenger: "email", Status: StatusFailed, Error: "boom", To: []string{"c@example.com"}, Subject: "Receipt 100%", Body: &body},
	})
	if err != nil {
		t.Fatal(err)
	}

	// B bounced; A opened and clicked.
	db.MustExec(`INSERT INTO bounces (subscriber_id, campaign_id, type, source) VALUES ($1, $2, 'hard', 'api')`, subB, camp)
	db.MustExec(`INSERT INTO campaign_views (campaign_id, subscriber_id) VALUES ($1, $2)`, camp, subA)
	var linkID int
	db.Get(&linkID, `INSERT INTO links (uuid, url) VALUES (gen_random_uuid(), 'https://example.com') RETURNING id`)
	db.MustExec(`INSERT INTO link_clicks (campaign_id, subscriber_id, link_id) VALUES ($1, $2, $3)`, camp, subA, linkID)

	count := func(f Filter) int {
		t.Helper()
		_, total, err := st.Query(ctx, f)
		if err != nil {
			t.Fatal(err)
		}
		return total
	}

	rows, total, err := st.Query(ctx, Filter{Limit: 2})
	if err != nil || total != 3 || len(rows) != 2 {
		t.Fatalf("page: %d rows of %d (%v)", len(rows), total, err)
	}
	if rows[0].Source != SourceTx {
		t.Errorf("newest first: got %s", rows[0].Source)
	}
	if !rows[0].HasBody || rows[1].HasBody {
		t.Errorf("has_body = %v/%v", rows[0].HasBody, rows[1].HasBody)
	}

	for name, tt := range map[string]struct {
		f    Filter
		want int
	}{
		"failed":          {Filter{Status: StatusFailed}, 1},
		"sent":            {Filter{Status: StatusSent}, 2},
		"bounced":         {Filter{Status: StatusBounced}, 1},
		"source":          {Filter{Source: SourceCampaign}, 2},
		"campaign":        {Filter{CampaignID: camp}, 2},
		"subscriber":      {Filter{SubscriberID: subA}, 1},
		"search to":       {Filter{Search: "b@example"}, 1},
		"search subject":  {Filter{Search: "spring"}, 2},
		"percent literal": {Filter{Search: "100%"}, 1},
		"percent only":    {Filter{Search: "%"}, 1},
		"since":           {Filter{Since: now.Add(-150 * time.Minute)}, 2},
		"until":           {Filter{Until: now.Add(-150 * time.Minute)}, 1},
	} {
		if got := count(tt.f); got != tt.want {
			t.Errorf("%s: %d, want %d", name, got, tt.want)
		}
	}

	all, _, _ := st.Query(ctx, Filter{CampaignID: camp, Ascending: true})
	if len(all) != 2 || all[0].SubscriberID == nil || *all[0].SubscriberID != subA {
		t.Fatalf("ascending order wrong: %+v", all)
	}
	a, b := all[0], all[1]
	if !a.Opened || !a.Clicked || a.Bounced || a.CampaignName != "Spring" {
		t.Errorf("A flags = opened %v clicked %v bounced %v, campaign %q", a.Opened, a.Clicked, a.Bounced, a.CampaignName)
	}
	if !b.Bounced || b.Opened || b.Clicked {
		t.Errorf("B flags = opened %v clicked %v bounced %v", b.Opened, b.Clicked, b.Bounced)
	}

	d, err := st.Get(ctx, rows[0].ID)
	if err != nil || d.Body == nil || *d.Body != body || d.Error != "boom" {
		t.Fatalf("get: %+v (%v)", d, err)
	}
	if _, err := st.Get(ctx, 999999); err != ErrNotFound {
		t.Errorf("unknown id: %v", err)
	}

	n, err := st.DeleteBefore(ctx, now.Add(-150*time.Minute))
	if err != nil || n != 1 {
		t.Fatalf("delete before: %d (%v)", n, err)
	}
}

func TestInsertAfterADeletionKeepsOnlyWhatMayBeKept(t *testing.T) {
	db := newDB(t)
	st := NewStore(db)
	ctx := context.Background()

	var sub, camp int
	db.Get(&sub, `INSERT INTO subscribers (uuid, email, name) VALUES (gen_random_uuid(), 'a@example.com', 'A') RETURNING id`)
	db.Get(&camp, `INSERT INTO campaigns (uuid, name, subject, from_email, body, content_type, messenger, type, template_id)
		VALUES (gen_random_uuid(), 'Gone', 's', 'x@example.com', 'b', 'richtext', 'email', 'regular', (SELECT id FROM templates LIMIT 1)) RETURNING id`)
	db.MustExec(`DELETE FROM subscribers WHERE id = $1`, sub)
	db.MustExec(`DELETE FROM campaigns WHERE id = $1`, camp)

	// Each entry points at something that no longer exists, and one is fine. The batch must not be lost with them.
	err := st.Insert(ctx, []Entry{
		{CreatedAt: time.Now(), Source: SourceTx, Status: StatusSent, SubscriberID: sub, To: []string{"erased@example.com"}},
		{CreatedAt: time.Now(), Source: SourceCampaign, Status: StatusSent, CampaignID: camp, To: []string{"kept-1@example.com"}},
		{CreatedAt: time.Now(), Source: SourceTx, Status: StatusSent, To: []string{"kept-2@example.com"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	rows, total, _ := st.Query(ctx, Filter{Search: "@example.com"})
	if total != 2 {
		t.Fatalf("stored %d, want 2 (the deleted subscriber's message must not be kept): %+v", total, rows)
	}
	for _, r := range rows {
		if r.To[0] == "erased@example.com" {
			t.Fatal("a deleted subscriber's message was kept")
		}
		if r.CampaignID != nil {
			t.Errorf("campaign id %d kept for a deleted campaign", *r.CampaignID)
		}
	}
}

func TestDeletingASubscriberDeletesTheirMessages(t *testing.T) {
	db := newDB(t)
	st := NewStore(db)
	ctx := context.Background()

	var sub int
	db.Get(&sub, `INSERT INTO subscribers (uuid, email, name) VALUES (gen_random_uuid(), 'a@example.com', 'A') RETURNING id`)
	_ = st.Insert(ctx, []Entry{{CreatedAt: time.Now(), Source: SourceTx, Status: StatusSent, SubscriberID: sub, To: []string{"a@example.com"}}})
	db.MustExec(`DELETE FROM subscribers WHERE id = $1`, sub)
	if _, total, _ := st.Query(ctx, Filter{}); total != 0 {
		t.Fatalf("%d messages left after the subscriber was deleted", total)
	}
}

func campaignID(m models.Message) int {
	if m.Campaign == nil {
		return 0
	}
	return m.Campaign.ID
}
