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
- `cmd/users.go` (DisableTOTP reads the password with `utils.FormValue`, which also parses DELETE bodies; helper in `internal/utils/formvalue.go`)
- `Makefile` (fork section is appended at the end), `permissions.json`, `docs/swagger/*`
- `static/public/templates/index.html` (one `<link>` for `librelist-auth.css`)
- `.devcontainer/*`, `.gitignore`

The hooks are one-liners that call into `cmd/web.go` (`/app` routes, `webFSFiles()`), so a
conflict there is resolved by re-adding the line.

`docs/swagger/collections.yaml` is patched where it was wrong or missing (unwrapped `ServerConfig`,
`DashboardCount`, `ImportStatus`; added `/profile`, `/logout`, `/about`). These feed the generated
TS types in `web/src/api/schema.d.ts`; after a merge run `pnpm -C web gen:api` and
`pnpm -C web spec:coverage`.

Admin login, 2FA, forgot/reset and OIDC stay server-rendered (the security boundary); the new UI only
themes them via `static/public/static/librelist-auth.css`, scoped to `section.login` so the public
subscriber pages are untouched. Post-login `next` still defaults to `/admin` until Phase 7.

Everything else we add lives in new files: `web/`, `internal/automation/`,
`internal/migrations/fork/`, `queries/automations.sql`, `cmd/automations.go`, `cmd/track.go`,
`cmd/web.go`, `static/public/static/librelist-auth.css`.

## Migrations
Fork migrations are a separate sequence in `internal/migrations/fork/`, tracked under the
settings key `fork_migrations`, so upstream version numbers never collide with ours.

## After the old UI is retired
Upstream changes under `frontend/src/` become "port to `web/`" tasks during each merge.

## Releasing
Tag the fork `vX.Y.Z-librelist.N` (for example `v6.2.0-librelist.1`); upstream's own `v*` tags, which come in
with merges, never match. `.github/workflows/librelist-release.yml` then runs GoReleaser with
`.goreleaser.librelist.yml` (upstream's `.goreleaser.yml` is untouched): both UIs are built once, packed into the
binary with `make pack-bin-only`, and `ghcr.io/<owner>/librelist:<tag>` (linux amd64/arm64) is pushed. The
`VITE_SOURCE_URL` it sets is the "Source code" link in the admin (AGPL §13).

The image is a drop-in for `listmonk/listmonk` in an existing compose file: change `image:`, back up with
`pg_dump`, then run `./listmonk --upgrade --yes` (upstream migrations first, then the fork's). Try the upgrade on
a restored copy of the production database first.

`.github/workflows/librelist-ci.yml` lints, type-checks, tests and builds `web/` and vets the Go code on every
push and pull request. The GoReleaser config and the workflows are syntax-checked only so far; the first tag is
their real test. A single binary packed with `make pack-bin-only` was verified to serve `/app` (index, deep links
and hashed assets) and `/admin` from its embedded files.
