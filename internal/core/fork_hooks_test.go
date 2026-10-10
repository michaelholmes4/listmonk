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
