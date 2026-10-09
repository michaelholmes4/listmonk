# Fork notes

librelist tracks upstream listmonk (`upstream` remote). Base: v6.2.0.

## Merging upstream
```
git fetch upstream
git merge upstream/master        # or a release tag
```
Known conflict hotspots (the only upstream files we edit):
- `cmd/handlers.go` (routes; `/app` redirect), `cmd/init.go` (wiring; the UI is mapped to `/admin` from `web/dist`; the message log wraps each messenger in `initCampaignManager`, and `initNotifs` takes a `notifs.Pusher`), `cmd/upgrade.go` (fork-migration call)
- `queries/campaigns.sql` (exclude `automation` campaigns from the manager, the list and the dashboard counts)
- `internal/core/core.go`, `subscribers.go`, `subscriptions.go` (automation trigger hooks: `Hooks.OnSubscriptionsConfirmed`
  / `OnAttribsChanged`, and one `forkBegin`/`forkEnd` pair around each mutation; the logic is in `fork_hooks.go`)
- `internal/manager/manager.go` (`Event` and `Automation` fields on `CampaignMessage`; the constructor is in `fork.go`; one `msg.forkLogHeaders(h)` line tells the message log which automation a message belongs to)
- `internal/notifs/notifs.go` (a 1-line `Pusher` interface in place of `*email.Emailer`, so notifications can go through the message log)
- `cmd/main.go` (`App.automation`, `initAutomation(...)` after `go mgr.Run()`, `eng.Stop` in the shutdown closure; `logMessenger(...)` around the two uses of `emailMsgr`, and `closeMessageLog()` before `db.Close()`)
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
`internal/migrations/fork/`, `queries/automations.sql`, `cmd/automations.go`, `cmd/automation_sender.go`,
`cmd/track.go`, `cmd/web.go`, `cmd/message_log.go`, `internal/msglog/`, `static/public/static/librelist-auth.css`.

## Automation: things to know
- **Engine.** River (poll-only, one job kind) drives `internal/automation`; one DB transaction per node. Email steps are
  at-most-once per attempt (guard + `sending` row, send, finish); a failed send is retried, and the last failed
  attempt marks the enrollment `failed`.
- **Email content** is a hidden campaign (`campaigns.type = 'automation'`) per step, linked to the step's topic list so the
  unsubscribe link records an opt-out. Automation campaigns are filtered out of every upstream campaign query and of the
  manager's scan (`queries/campaigns.sql`); if a merge adds a new campaign query, check it excludes them.
  A step's campaign is shared by all versions of the automation: editing it changes what in-flight enrollments send.
- **Consent** (`internal/automation/consent.go`): blocklisted gets nothing; transactional is otherwise sent; marketing needs
  an enabled subscriber who has not unsubscribed from the topic (and has confirmed, on a double opt-in list). `POST /api/tx`
  keeps its upstream behaviour and does *not* check the blocklist: the two differ on purpose.
- **Triggers** fire from core hooks after the mutation commits, in the background. "Joined a list" means a *live*
  subscription: confirmed, or unconfirmed on a single opt-in list. The by-query bulk subscription endpoints
  (`/api/subscribers/query/lists`) do not fire triggers. An automation that adds people to lists can start another
  (chains are possible; the re-entry rule is what stops loops).
- **Opened / clicked conditions** only work when `privacy.individual_tracking` is on (otherwise views and clicks carry no
  subscriber). The builder should say so.
- **Raw SQL conditions** need `subscribers:sql_query` to create or edit, run in a read-only transaction with a 5 s timeout.
- **`POST /api/track`** merges `upsert_attribs` (top-level keys) into the subscriber *before* recording the event;
  retrying with the same `Idempotency-Key` re-applies those values but does not record or trigger twice.
- **Retention.** `DELETE /api/maintenance/events?before_date=` prunes events. Deleting a subscriber cascades to their events
  and enrollments.

## Message log
Every email handed to a messenger is recorded in `librelist_messages` (migration 6) with the messenger's real answer
(`sent` = the SMTP server accepted it, `failed` + the error otherwise). It is a decorator, `msglog.Wrap`, around each
messenger, so no send site is edited. There is one wrapper per kind of sender, and it supplies the source of messages that
do not say (a campaign says so itself): the campaign manager (campaigns, `/api/tx`, automations), notifications (admin
mails and opt-in confirmations), and system mail (password resets, data exports).
- **Content.** Kept, as the exact email, for transactional, automation and notification mail. *Not* kept for campaign
  mail (it would be one copy per recipient): the row stores campaign + subscriber, and `GET /api/message-log/:id/preview`
  re-renders it, with a dummy campaign UUID so that looking never counts as an open or click. System mail is recorded
  without a body because it carries credentials (a reset link). The stored copy has the tracking pixel stripped on preview.
- **Writes are asynchronous** (`msglog.Writer`: queue, batches of 500 or 1 s). A full queue drops entries (counted in the
  log) rather than slowing a send; a clean shutdown drains it (`closeMessageLog()`).
- **Erasure.** Deleting a subscriber deletes their rows (FK cascade); an entry whose subscriber vanished before the
  flush is dropped, not kept anonymously. A deleted campaign leaves its rows, without the campaign.
- **Retention.** 90 days by default; `librelist.message_log_retention_days` (0 = forever), pruned daily by the writer, or
  by hand with `DELETE /api/maintenance/message-log?before_date=`.
- **Internal headers.** The automation sender and `manager.forkLogHeaders` pass `X-Librelist-Log-Automation` /
  `-Enrollment` to the wrapper, which removes them before the messenger sees the message.
- **Merging upstream:** if a merge adds a new `Messenger.Push` call site, decide which wrapper it should go through.
  `message_log:get` is deliberately not part of a new role's default permissions: the log shows every subscriber's mail.

## Migrations
Fork migrations are a separate sequence in `internal/migrations/fork/`, tracked under the
settings key `fork_migrations`, so upstream version numbers never collide with ours.

## The classic UI is gone
`frontend/` is deleted except `frontend/email-builder` (the React visual email builder; `make build-email-builder`
copies its build into `web/public/static/email-builder`). The admin UI is `web/`, served at `/admin`; `/app` redirects.

When merging upstream, expect modify/delete conflicts on `frontend/**`: resolve them by deleting the file, and turn
what the upstream change did into a "port to `web/`" task. `web/PARITY.md` lists what was ported. Upstream's
Cypress tests (`frontend/cypress`) are gone too; `web/e2e` (Playwright) replaces them.

Upstream's `.goreleaser.yml`, `.goreleaser-nightly.yml` and the `dev/` Docker suite still name `make build-frontend` /
`make run-frontend`; both are kept as aliases of `build-web` / `run-web`, but the Docker suite (`dev/`) is not maintained
here and its `front` service no longer applies.

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
