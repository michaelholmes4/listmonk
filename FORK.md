# Fork notes

librelist tracks upstream listmonk (`upstream` remote). Base: v6.2.0.

## Merging upstream
```
git fetch upstream
git merge upstream/master        # or a release tag
```
Known conflict hotspots (the only upstream files we edit):
- `cmd/handlers.go` (routes), `cmd/init.go` (wiring), `cmd/upgrade.go` (fork-migration call)
- `queries/campaigns.sql` (exclude `automation` campaigns from the manager and default list)
- `internal/core/subscribers.go` (automation trigger hooks)
- `Makefile` (fork section is appended at the end), `permissions.json`, `docs/swagger/*`
- `.devcontainer/*`, `.gitignore`

Everything else we add lives in new files: `web/`, `internal/automation/`,
`internal/migrations/fork/`, `queries/automations.sql`, `cmd/automations.go`, `cmd/track.go`.

## Migrations
Fork migrations are a separate sequence in `internal/migrations/fork/`, tracked under the
settings key `fork_migrations`, so upstream version numbers never collide with ours.

## After the old UI is retired
Upstream changes under `frontend/src/` become "port to `web/`" tasks during each merge.
