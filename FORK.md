# Fork notes

This fork tracks upstream listmonk (`upstream` remote). Base: v6.2.0.

## Merging upstream
```
git fetch upstream
git merge upstream/master        # or a release tag
```
Known conflict hotspots (the only upstream files we edit):
- `cmd/handlers.go` (routes; `/app` redirect), `cmd/init.go` (wiring; the UI is mapped to `/admin` from `web/dist`; the message log wraps each messenger in `initCampaignManager`, and `initNotifs` takes a `notifs.Pusher`), `cmd/upgrade.go` and `cmd/install.go` (fork-migration call; on install it runs before the queries are prepared)
- `queries/campaigns.sql` (exclude `automation` campaigns from the manager, the list, the dashboard counts and both deletes)
- `internal/core/core.go`, `subscribers.go`, `subscriptions.go` (automation trigger hooks: `Hooks.OnSubscriptionsConfirmed`
  / `OnAttribsChanged`, and one `forkBegin`/`forkEnd` pair around each mutation; the logic is in `fork_hooks.go`)
- `internal/manager/manager.go` (`Event` and `Automation` fields on `CampaignMessage`; the constructor is in `fork.go`; one `msg.forkLogHeaders(h)` line tells the message log which automation a message belongs to; a `delivery` field and two worker lines, `if !msg.forkClaim() { continue }` before the push and `msg.forkSent()` after it, let an automation step wait until its email reaches the messenger (and withdraw it if no worker takes it); `&& !msg.forkTransactional()` on the List-Unsubscribe condition leaves the header off transactional automation emails; a `forkSlide` mutex field guards the sliding-window count)
- `internal/manager/pipe.go` (the sliding-window block in `NextSubscribers` is one `slidingCountPipe()` call and a sleep; the window, shared with automation emails, is in `slide.go`)
- `internal/subimporter/importer.go` (an `Options.ForkBatch` hook, wired to `core.ForkImportBatch` in `cmd/init.go`; `s.forkAdd(email)` per row and `done := s.forkBatch()` / `done()` around each batch commit, so imports fire the automation triggers; the rest is in `subimporter/fork.go`)
- `internal/notifs/notifs.go` (a 1-line `Pusher` interface in place of `*email.Emailer`, so notifications can go through the message log)
- `cmd/main.go` (`App.automation`, `initAutomation(...)` after `go mgr.Run()`, `stopAutomations(eng)` in the shutdown closure (it must fit the 3 s before `awaitReload` forces the reload); `logMessenger(...)` around the two uses of `emailMsgr`, and `closeMessageLog()` before `db.Close()`)
- `cmd/users.go` (DisableTOTP reads the password with `utils.FormValue`, which also parses DELETE bodies; helper in `internal/utils/formvalue.go`)
- `Makefile` (fork section is appended at the end), `permissions.json`, `docs/swagger/*`
- `.github/workflows/build-sanity.yml` (sets up Node with corepack: `make dist` builds the UI with pnpm and the email builder with yarn)
- `static/public/templates/index.html` (one `<link>` for `admin-auth.css`, one `<script>` for `admin-auth.js`)
- `.devcontainer/*`, `.gitignore`
- `README.md` is the fork's own: on a conflict keep ours, and port anything upstream added that still applies

The hooks are one-liners that call into `cmd/web.go` (`/app` routes, `webFSFiles()`), so a
conflict there is resolved by re-adding the line.

`docs/swagger/collections.yaml` is patched where it was wrong or missing (unwrapped `ServerConfig`,
`DashboardCount`, `ImportStatus`; added `/profile`, `/logout`, `/about`). These feed the generated
TS types in `web/src/api/schema.d.ts`; after a merge run `pnpm -C web gen:api` and
`pnpm -C web spec:coverage`.

Admin login, 2FA, forgot/reset and OIDC stay server-rendered (the security boundary); the new UI only
themes them (and the root home page with its login button) via `static/public/static/admin-auth.css`, scoped to `section.login` or `.home-options` so the public
subscriber pages are untouched; `admin-auth.js` applies the light/dark choice the admin saved (same origin). Post-login `next` still defaults to `/admin` until Phase 7.

Everything else we add lives in new files: `web/`, `internal/automation/`,
`internal/migrations/fork/`, `queries/automations.sql`, `cmd/automations.go`, `cmd/automation_sender.go`,
`cmd/track.go`, `cmd/web.go`, `cmd/message_log.go`, `internal/msglog/`, `static/public/static/admin-auth.css`, `admin-auth.js`.

## Automation: things to know
- **Engine.** River (poll-only; jobs: advance a run, act on a recorded event) drives `internal/automation`; one DB transaction per node. Email steps are
  at-most-once (guard + `sending` row, send, finish). While the email is with the sender the run is leased: its `next_run_at`
  moves `sendLease` ahead, so any other wake-up leaves it alone, and a wake-up queued for the lease's end picks up a run whose
  process died mid-send (it carries on without sending). The sender returns once the messenger has the email: a campaign-content
  step waits for a campaign worker to take it (`manager.SendAutomationMessage`), a template step pushes directly
  (`manager.SendMessageNow`), so nothing is marked sent while it only sits in memory. An email not handed over (no worker took it
  in time, e.g. at shutdown) is withdrawn and retried; the last failed attempt marks the enrollment `failed`.
  Marketing automation emails count toward the sliding window (the "N messages per period" limit) together with
  campaigns; one over the limit is not sent and the run waits until the window ends, without using up a retry.
  Transactional ones are neither counted nor held back, like `/api/tx`. Once the messenger
  has it, the automation never retries it: an SMTP rejection shows in the message log, not in the step.
- **Email content** is a hidden campaign (`campaigns.type = 'automation'`) per step, linked to the step's topic list so the
  unsubscribe link records an opt-out. Automation campaigns are filtered out of every upstream campaign query and of the
  manager's scan (`queries/campaigns.sql`); if a merge adds a new campaign query, check it excludes them.
  A step's campaign is shared by all versions of the automation: editing it changes what in-flight enrollments send.
  Its unsubscribe list is set when the automation is **published**, not on draft save; if a step changes topic (or marketing/transactional) while another version still sends that campaign, the step gets a copy, so each version's unsubscribe link matches the list its consent check uses.
  Its status is always `cancelled` (migration 8 converted the old drafts), so that upstream's own handlers refuse to
  start, schedule or edit it; the fork never reads that status (the step editor saves through `core.UpdateCampaign`,
  and tracking, the browser view and unsubscribe don't check it). If a merge adds a status check to one of those, revisit this.
- **Consent** (`internal/automation/consent.go`): blocklisted gets nothing; transactional is otherwise sent; marketing needs
  an enabled subscriber with a live subscription to the topic (confirmed, or unconfirmed on a single opt-in list). No
  subscription means no send, never an implicit subscribe: listmonk deletes the row on removal, so "never joined" and
  "was removed" look the same. A marketing step can't use a transactional template (no unsubscribe link). An Add to list
  step never undoes an `unsubscribed` status or downgrades a confirmed one. `POST /api/tx`
  keeps its upstream behaviour and does *not* check the blocklist: the two differ on purpose.
- **Triggers** fire from core hooks after the mutation commits, in the background. "Joined a list" means a *live*
  subscription: confirmed, or unconfirmed on a single opt-in list. The by-query bulk subscription endpoints
  (`/api/subscribers/query/lists`) do not fire triggers; CSV imports (subscribe mode) do, per batch: new subscribers and
  ones newly on the import's lists start list triggers, and changed attributes (overwrite on) start attribute triggers. An automation that adds people to lists can start another
  (chains are possible; the re-entry rule is what stops loops).
- **Opened / clicked conditions** only work when `privacy.individual_tracking` is on (otherwise views and clicks carry no
  subscriber). The builder should say so.
- **Raw SQL conditions** need `subscribers:sql_query` to create or edit, run in a read-only transaction with a 5 s timeout.
- **`POST /api/track`** records the event and queues a job to act on it (waiting runs, triggers) in one transaction, so a passing failure cannot lose what the event starts. It merges `upsert_attribs` (top-level keys) into the subscriber *before* recording the event, in one statement that writes nothing else (so it never undoes a concurrent blocklisting);
  retrying with the same `Idempotency-Key` re-applies those values but does not record or trigger twice.
- **Wait for an event.** `POST /api/track` events also reach runs waiting on a `wait_for_event` step (before triggers fire).
  `.Event` in emails is the event that started the run, or the latest one that restarted a wait.
- **Go to.** A `go_to` step ends its path and sends the run to another step of the same version (join a path further down, or
  go back to a wait). A run can therefore visit a step more than once (migration 7: `enrollments.current_visit`,
  `enrollment_steps.visit`); each visit sends and waits afresh, and "has this step run?" looks only at the current visit. Every
  loop must pass through a Delay or Wait for an event (checked on save; a Wait until doesn't count). A run passes one go-to at
  most its `max_runs` times (default 25, up to 100), then exits as `loop_limit`. Opened / clicked conditions look at the step's
  latest visit; stats count people, not visits.
- **Retention.** `DELETE /api/maintenance/events?before_date=` prunes events. Deleting a subscriber cascades to their events
  and enrollments.

## Message log
Every email handed to a messenger is recorded in `message_log` (migration 6) with the messenger's real answer
(`sent` = the SMTP server accepted it, `failed` + the error otherwise). It is a decorator, `msglog.Wrap`, around each
messenger, so no send site is edited. There is one wrapper per kind of sender, and it supplies the source of messages that
do not say (a campaign says so itself): the campaign manager (campaigns, `/api/tx`, automations), notifications (admin
mails and opt-in confirmations), and system mail (password resets, data exports).
- **Content.** Kept, as the exact email, for automation and notification mail. *Not* kept for `/api/tx` mail by default,
  since other apps send password resets and login codes through it; `message_log.tx_content = true` keeps it. *Not* kept for campaign
  mail (it would be one copy per recipient): the row stores campaign + subscriber, and `GET /api/message-log/:id/preview`
  re-renders it, with a dummy campaign UUID so that looking never counts as an open or click. System mail is recorded
  without a body because it carries credentials (a reset link). Both previews (`msglog.PreviewHTML`) strip the tracking pixel and
  point listmonk links (clicks, unsubscribe, preferences, browser view) at `#`, since they would act on the real subscriber.
- **Writes are asynchronous** (`msglog.Writer`: queue, batches of 500 or 1 s). A full queue drops entries (counted in the
  log) rather than slowing a send; a clean shutdown drains it (`closeMessageLog()`).
- **Erasure.** Deleting a subscriber deletes their rows (FK cascade); an entry whose subscriber vanished before the
  flush is dropped, not kept anonymously. A deleted campaign leaves its rows, without the campaign.
- **Retention.** 90 days by default; `message_log.retention_days` (0 = forever), pruned daily by the writer, or
  by hand with `DELETE /api/maintenance/message-log?before_date=`.
- **Internal headers.** The automation sender and `manager.forkLogHeaders` pass `X-Listmonk-Log-Automation` /
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
Tag the fork `vX.Y.Z-fork.N` (for example `v6.2.0-fork.1`); upstream's own `v*` tags, which come in
with merges, never match. `.github/workflows/fork-release.yml` then runs GoReleaser with
`.goreleaser.fork.yml` (upstream's `.goreleaser.yml` is untouched): both UIs are built once, packed into the
binary with `make pack-bin-only`, and `ghcr.io/<owner>/listmonk:<tag>` (linux amd64/arm64) is pushed. The
`VITE_SOURCE_URL` it sets is the "Source code" link in the admin (AGPL §13).

The image is a drop-in for `listmonk/listmonk` in an existing compose file: change `image:`, back up with
`pg_dump`, then run `./listmonk --upgrade --yes` (upstream migrations first, then the fork's). Try the upgrade on
a restored copy of the production database first.

## Rolling back to upstream
The fork only adds to the schema, so stock listmonk (the same upstream version as the fork's base, or newer) runs
on a fork database: switch `image:` back. Stock listmonk ignores the fork's tables and its `settings` keys,
accepts the extra `automation` campaign type, and can read the dashboard view as migration 4 rewrote it.
What changes:
- Automations stop: runs stay frozen where they are, and `POST /api/track` returns 404, so the site's calls to it
  must fail softly.
- The step campaigns show up in the campaign list (stock listmonk doesn't hide `type = 'automation'`). They are
  `cancelled`, so they can't be started or edited; delete them when convenient with
  `DELETE FROM campaigns WHERE type = 'automation';` (their message-log rows keep the message, without the campaign).
- Returning to the fork later just works if its tables were kept, once the fork has merged whatever upstream
  version stock listmonk upgraded the database to. If they were dropped, delete the `fork_migrations` setting too,
  so `--upgrade` recreates them.

`.github/workflows/fork-ci.yml` lints, type-checks, tests and builds `web/` and vets the Go code on every
push and pull request. The GoReleaser config and the workflows are syntax-checked only so far; the first tag is
their real test. A single binary packed with `make pack-bin-only` was verified to serve `/app` (index, deep links
and hashed assets) and `/admin` from its embedded files.
