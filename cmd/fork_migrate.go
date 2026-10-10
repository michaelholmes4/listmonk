package main

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/knadh/listmonk/internal/migrations/fork"
)

// fork: the fork's own migrations (internal/migrations/fork) run after upstream's, on
// `--install` and `--upgrade`, and a pending one stops startup the same way an upstream one does.

// forkUpgrade applies pending fork migrations.
func forkUpgrade(db *sqlx.DB) {
	if err := fork.Run(context.Background(), db, lo); err != nil {
		lo.Fatalf("error running fork migrations: %v", err)
	}
}

// forkCheckUpgrade exits if there are fork migrations that have not been applied.
func forkCheckUpgrade(db *sqlx.DB) {
	todo, err := fork.Pending(context.Background(), db)
	if err != nil {
		if isTableNotExistErr(err) {
			return
		}
		lo.Fatalf("error checking fork migrations: %v", err)
	}
	if len(todo) > 0 {
		lo.Fatalf("there are %d pending fork database upgrade(s). Backup the database and run listmonk --upgrade", len(todo))
	}
}
