package core

import (
	"io"
	"log"
	"testing"
	"time"

	"github.com/knadh/listmonk/internal/testdb"
)

func TestMergeSubscriberAttribs(t *testing.T) {
	db := testdb.New(t)
	var id int
	if err := db.Get(&id, `INSERT INTO subscribers (uuid, email, name, status, attribs)
		VALUES (gen_random_uuid(), 'a@example.com', 'A', 'enabled', '{"plan": "free", "city": "Oslo"}') RETURNING id`); err != nil {
		t.Fatal(err)
	}

	changed := make(chan map[string]any, 1)
	c := &Core{db: db, log: log.New(io.Discard, "", 0), h: &Hooks{
		OnAttribsChanged: func(_ int, _, after map[string]any) { changed <- after },
	}}

	// Blocklisted after the caller read the subscriber: the merge must not touch the status.
	if _, err := db.Exec(`UPDATE subscribers SET status = 'blocklisted' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if err := c.MergeSubscriberAttribs(id, map[string]any{"plan": "pro", "company": "Acme"}); err != nil {
		t.Fatal(err)
	}

	var row struct {
		Status  string `db:"status"`
		Plan    string `db:"plan"`
		City    string `db:"city"`
		Company string `db:"company"`
	}
	if err := db.Get(&row, `SELECT status, attribs->>'plan' AS plan, attribs->>'city' AS city, attribs->>'company' AS company
		FROM subscribers WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if row.Status != "blocklisted" {
		t.Errorf("status = %q, want blocklisted kept", row.Status)
	}
	if row.Plan != "pro" || row.City != "Oslo" || row.Company != "Acme" {
		t.Errorf("attribs = %+v, want plan=pro city=Oslo company=Acme", row)
	}

	select {
	case after := <-changed:
		if after["plan"] != "pro" {
			t.Errorf("hook saw %v", after)
		}
	case <-time.After(2 * time.Second):
		t.Error("attribute hook not called")
	}
}

// A snapshot read that fails must skip the triggers: an empty "before" would make every list the
// subscriber is already on, and every attribute they have, look new, and start those automations again.
func TestForkReadFailureSkipsTriggers(t *testing.T) {
	db := testdb.New(t)
	var subID, listID int
	if err := db.Get(&subID, `INSERT INTO subscribers (uuid, email, name, status, attribs)
		VALUES (gen_random_uuid(), 'b@example.com', 'B', 'enabled', '{"plan": "pro"}') RETURNING id`); err != nil {
		t.Fatal(err)
	}
	if err := db.Get(&listID, `INSERT INTO lists (uuid, name, type, optin) VALUES (gen_random_uuid(), 'L', 'public', 'single') RETURNING id`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO subscriber_lists (subscriber_id, list_id, status) VALUES ($1, $2, 'confirmed')`, subID, listID); err != nil {
		t.Fatal(err)
	}

	fired := make(chan string, 4)
	hooks := &Hooks{
		OnSubscriptionsConfirmed: func(int, []int) { fired <- "confirmed" },
		OnAttribsChanged:         func(int, map[string]any, map[string]any) { fired <- "attribs" },
	}
	good := &Core{db: db, log: log.New(io.Discard, "", 0), h: hooks}

	closed := testdb.New(t)
	closed.Close()
	bad := &Core{db: closed, log: log.New(io.Discard, "", 0), h: hooks}

	// The read before the mutation fails, the one after succeeds.
	if s := bad.forkBegin([]int{subID}, nil); s != nil {
		t.Fatalf("forkBegin returned a snapshot after a failed read: %+v", s)
	}
	good.forkEnd(nil)

	// The read before succeeds, the one after fails.
	s := good.forkBegin([]int{subID}, nil)
	if s == nil {
		t.Fatal("forkBegin: no snapshot")
	}
	bad.forkEnd(s)

	// Both reads succeed and nothing changed.
	good.forkEnd(good.forkBegin([]int{subID}, nil))

	select {
	case h := <-fired:
		t.Errorf("hook %q fired for a subscriber who already had that state", h)
	case <-time.After(300 * time.Millisecond):
	}
}

// An import batch is compared with the state before it, read while the batch is not committed yet:
// a new subscriber and an existing one newly on the list start automations; one already on it does not.
func TestForkImportBatch(t *testing.T) {
	db := testdb.New(t)
	var listID, onList, offList int
	if err := db.Get(&listID, `INSERT INTO lists (uuid, name, type, optin) VALUES (gen_random_uuid(), 'L', 'public', 'single') RETURNING id`); err != nil {
		t.Fatal(err)
	}
	for _, s := range []struct {
		email string
		id    *int
	}{{"on@example.com", &onList}, {"off@example.com", &offList}} {
		if err := db.Get(s.id, `INSERT INTO subscribers (uuid, email, name, status) VALUES (gen_random_uuid(), $1, 'x', 'enabled') RETURNING id`, s.email); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO subscriber_lists (subscriber_id, list_id, status) VALUES ($1, $2, 'confirmed')`, onList, listID); err != nil {
		t.Fatal(err)
	}

	joined := make(chan int, 4)
	c := &Core{db: db, log: log.New(io.Discard, "", 0), h: &Hooks{
		OnSubscriptionsConfirmed: func(sub int, _ []int) { joined <- sub },
	}}

	// The batch, as the importer writes it: subscribers upserted and added to the list in one transaction.
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	emails := []string{"On@example.com", "off@example.com", "new@example.com"}
	for _, e := range emails {
		if _, err := tx.Exec(`WITH sub AS (
				INSERT INTO subscribers (uuid, email, name, status) VALUES (gen_random_uuid(), LOWER($1), 'x', 'enabled')
				ON CONFLICT (email) DO UPDATE SET updated_at = NOW() RETURNING id)
			INSERT INTO subscriber_lists (subscriber_id, list_id, status) SELECT id, $2, 'confirmed' FROM sub
			ON CONFLICT (subscriber_id, list_id) DO UPDATE SET updated_at = NOW()`, e, listID); err != nil {
			t.Fatal(err)
		}
	}
	done := c.ForkImportBatch(emails, []int{listID})
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	done()

	var newSub int
	if err := db.Get(&newSub, `SELECT id FROM subscribers WHERE email = 'new@example.com'`); err != nil {
		t.Fatal(err)
	}
	got := map[int]bool{}
	for len(got) < 2 {
		select {
		case id := <-joined:
			got[id] = true
		case <-time.After(2 * time.Second):
			t.Fatalf("joined %v, want subscribers %d and %d", got, offList, newSub)
		}
	}
	if !got[offList] || !got[newSub] {
		t.Fatalf("joined %v, want subscribers %d and %d", got, offList, newSub)
	}
	select {
	case id := <-joined:
		t.Errorf("subscriber %d joined again, already on the list: %v", id, id == onList)
	case <-time.After(300 * time.Millisecond):
	}
}
