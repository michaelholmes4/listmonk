package fork

import (
	"context"
	"io"
	"log"
	"testing"

	"github.com/knadh/listmonk/internal/testdb"
)

var quiet = log.New(io.Discard, "", 0)

func TestRunAppliesEverythingOnceAndRecordsIt(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()

	if n, err := Applied(ctx, db); err != nil || n != 0 {
		t.Fatalf("fresh database: applied = %d, err = %v", n, err)
	}
	if todo, _ := Pending(ctx, db); len(todo) != len(All) {
		t.Fatalf("pending = %d, want %d", len(todo), len(All))
	}

	if err := Run(ctx, db, quiet); err != nil {
		t.Fatalf("first run: %v", err)
	}
	if n, _ := Applied(ctx, db); n != All[len(All)-1].Version {
		t.Fatalf("applied = %d after run", n)
	}

	// Running again changes nothing and doesn't fail.
	if err := Run(ctx, db, quiet); err != nil {
		t.Fatalf("second run: %v", err)
	}
	var recorded int
	if err := db.Get(&recorded, `SELECT JSONB_ARRAY_LENGTH(value) FROM settings WHERE key = $1`, SettingsKey); err != nil || recorded != len(All) {
		t.Fatalf("recorded versions = %d (%v), want %d", recorded, err, len(All))
	}
}

func TestSchemaIsUsable(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()
	if err := Run(ctx, db, quiet); err != nil {
		t.Fatal(err)
	}

	// An automation campaign type exists and river's tables are there.
	if _, err := db.Exec(`
		INSERT INTO campaigns (uuid, name, subject, from_email, body, messenger, type)
		VALUES (gen_random_uuid(), 'step', 's', 'a@b.c', 'b', 'email', 'automation')`); err != nil {
		t.Fatalf("automation campaign type: %v", err)
	}
	var n int
	if err := db.Get(&n, `SELECT COUNT(*) FROM river_job`); err != nil {
		t.Fatalf("river tables: %v", err)
	}

	// Deleting a subscriber removes their events and enrollments.
	var subID, autoID, verID int
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(db.Get(&subID, `INSERT INTO subscribers (uuid, email, name) VALUES (gen_random_uuid(), 'x@y.z', 'X') RETURNING id`))
	must(db.Get(&autoID, `INSERT INTO automations (uuid, name) VALUES (gen_random_uuid(), 'a') RETURNING id`))
	must(db.Get(&verID, `INSERT INTO automation_versions (automation_id, version) VALUES ($1, 1) RETURNING id`, autoID))
	_, err := db.Exec(`INSERT INTO subscriber_events (subscriber_id, name) VALUES ($1, 'e')`, subID)
	must(err)
	_, err = db.Exec(`INSERT INTO enrollments (automation_id, version_id, subscriber_id) VALUES ($1, $2, $3)`, autoID, verID, subID)
	must(err)
	// Only one live enrollment per subscriber and automation.
	if _, err := db.Exec(`INSERT INTO enrollments (automation_id, version_id, subscriber_id) VALUES ($1, $2, $3)`, autoID, verID, subID); err == nil {
		t.Fatal("a second live enrollment was accepted")
	}
	_, err = db.Exec(`DELETE FROM subscribers WHERE id = $1`, subID)
	must(err)
	for _, table := range []string{"subscriber_events", "enrollments"} {
		var c int
		must(db.Get(&c, `SELECT COUNT(*) FROM `+table))
		if c != 0 {
			t.Fatalf("%s kept rows after the subscriber was deleted", table)
		}
	}
}

func TestDashboardCountsIgnoreAutomationCampaigns(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()
	if err := Run(ctx, db, quiet); err != nil {
		t.Fatal(err)
	}
	for _, typ := range []string{"regular", "regular", "automation", "automation", "automation"} {
		if _, err := db.Exec(`INSERT INTO campaigns (uuid, name, subject, from_email, body, messenger, type) VALUES (gen_random_uuid(), 'c', 's', 'a@b.c', 'b', 'email', $1::campaign_type)`, typ); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`REFRESH MATERIALIZED VIEW mat_dashboard_counts`); err != nil {
		t.Fatal(err)
	}
	var total int
	if err := db.Get(&total, `SELECT (data->'campaigns'->>'total')::INT FROM mat_dashboard_counts`); err != nil || total != 2 {
		t.Fatalf("campaign total = %d (%v), want 2", total, err)
	}
}
