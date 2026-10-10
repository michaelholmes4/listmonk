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
