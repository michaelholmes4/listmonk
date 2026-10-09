// Package fork holds librelist's own database migrations. They are a separate sequence from
// upstream's (internal/migrations), tracked under the settings key `fork_migrations`, so upstream
// version numbers can never collide with ours. Run after upstream's migrations by `--install` and
// `--upgrade` (see cmd/fork_migrate.go).
package fork

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"log"

	"github.com/jmoiron/sqlx"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
	"github.com/riverqueue/river/rivermigrate"
)

// SettingsKey is the row in the `settings` table that records the applied migration numbers.
const SettingsKey = "fork_migrations"

// Migration is one numbered, idempotent step.
type Migration struct {
	Version int
	Name    string
	Up      func(ctx context.Context, db *sqlx.DB) error
}

//go:embed 001_automations.sql
var sqlAutomations string

//go:embed 002_automation_campaign_type.sql
var sqlCampaignType string

//go:embed 005_event_idempotency_scope.sql
var sqlEventIdem string

//go:embed 004_dashboard_counts.sql
var sqlDashboardCounts string

//go:embed 006_message_log.sql
var sqlMessageLog string

// All is every migration in order. Add new ones at the end with the next number.
var All = []Migration{
	{1, "automation tables", func(ctx context.Context, db *sqlx.DB) error { return execTx(ctx, db, sqlAutomations) }},
	// ALTER TYPE ... ADD VALUE can't be used in the transaction that adds it, so it's its own step.
	{2, "automation campaign type", func(ctx context.Context, db *sqlx.DB) error { return execTx(ctx, db, sqlCampaignType) }},
	{3, "job queue tables", upRiver},
	{4, "dashboard counts skip automation campaigns", func(ctx context.Context, db *sqlx.DB) error { return execTx(ctx, db, sqlDashboardCounts) }},
	{5, "event idempotency keys are per subscriber", func(ctx context.Context, db *sqlx.DB) error { return execTx(ctx, db, sqlEventIdem) }},
	{6, "message log", func(ctx context.Context, db *sqlx.DB) error { return execTx(ctx, db, sqlMessageLog) }},
}

func execTx(ctx context.Context, db *sqlx.DB, query string) error {
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, query); err != nil {
		return err
	}
	return tx.Commit()
}

// upRiver installs River's own schema (the job queue used by the automation engine).
func upRiver(ctx context.Context, db *sqlx.DB) error {
	m, err := rivermigrate.New(riverdatabasesql.New(db.DB), nil)
	if err != nil {
		return err
	}
	_, err = m.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}

// Applied returns the highest migration number recorded in the DB (0 if none).
func Applied(ctx context.Context, db *sqlx.DB) (int, error) {
	var n int
	err := db.GetContext(ctx, &n, `
		SELECT COALESCE((SELECT MAX(v::INT) FROM settings, JSONB_ARRAY_ELEMENTS_TEXT(value) AS v WHERE key = $1), 0)`, SettingsKey)
	if err != nil {
		// A database that predates the settings table has nothing applied.
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	return n, nil
}

// Pending returns the migrations that have not been applied yet.
func Pending(ctx context.Context, db *sqlx.DB) ([]Migration, error) {
	done, err := Applied(ctx, db)
	if err != nil {
		return nil, err
	}
	var out []Migration
	for _, m := range All {
		if m.Version > done {
			out = append(out, m)
		}
	}
	return out, nil
}

// Run applies every pending migration in order, recording each as it completes.
func Run(ctx context.Context, db *sqlx.DB, lo *log.Logger) error {
	todo, err := Pending(ctx, db)
	if err != nil {
		return err
	}
	for _, m := range todo {
		lo.Printf("running fork migration %d: %s", m.Version, m.Name)
		if err := m.Up(ctx, db); err != nil {
			return fmt.Errorf("fork migration %d (%s): %w", m.Version, m.Name, err)
		}
		if _, err := db.ExecContext(ctx, `
			INSERT INTO settings (key, value) VALUES ($1, JSONB_BUILD_ARRAY($2::INT))
			ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value, updated_at = NOW()`,
			SettingsKey, m.Version); err != nil {
			return fmt.Errorf("recording fork migration %d: %w", m.Version, err)
		}
	}
	return nil
}
