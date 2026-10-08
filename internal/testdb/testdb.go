// Package testdb gives tests a throwaway Postgres database with listmonk's schema installed.
// Tests skip (not fail) when no server is reachable, so `go test ./...` works without one.
//
// The server comes from LISTMONK_TEST_DB (a lib/pq connection string for any database on it);
// the default is the devcontainer's.
package testdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

const defaultDSN = "host=db port=5432 user=listmonk-dev password=listmonk-dev dbname=listmonk-dev sslmode=disable"

// New creates a database with the upstream schema installed (no fork migrations) and returns a
// handle to it. The database is dropped when the test ends.
func New(t testing.TB) *sqlx.DB {
	t.Helper()

	dsn := os.Getenv("LISTMONK_TEST_DB")
	if dsn == "" {
		dsn = defaultDSN
	}

	admin, err := sqlx.Open("postgres", dsn)
	if err != nil {
		t.Skipf("no test database: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		admin.Close()
		t.Skipf("no test database: %v", err)
	}

	b := make([]byte, 6)
	_, _ = rand.Read(b)
	name := "lmtest_" + hex.EncodeToString(b)
	if _, err := admin.Exec(fmt.Sprintf("CREATE DATABASE %s", name)); err != nil {
		admin.Close()
		t.Skipf("cannot create a test database: %v", err)
	}

	db, err := sqlx.Open("postgres", replaceDBName(dsn, name))
	if err != nil {
		t.Fatalf("opening test database: %v", err)
	}
	// Keep one connection's worth of surprises away from concurrent tests in the same package.
	db.SetMaxOpenConns(10)

	t.Cleanup(func() {
		db.Close()
		_, _ = admin.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE)", name))
		admin.Close()
	})

	schema, err := os.ReadFile(filepath.Join(repoRoot(), "schema.sql"))
	if err != nil {
		t.Fatalf("reading schema.sql: %v", err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		t.Fatalf("installing schema: %v", err)
	}
	return db
}

// replaceDBName swaps the dbname in a key=value connection string.
func replaceDBName(dsn, name string) string {
	parts := strings.Fields(dsn)
	for i, p := range parts {
		if strings.HasPrefix(p, "dbname=") {
			parts[i] = "dbname=" + name
			return strings.Join(parts, " ")
		}
	}
	return dsn + " dbname=" + name
}

func repoRoot() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..")
}
