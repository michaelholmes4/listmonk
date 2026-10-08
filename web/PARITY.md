# Parity with the classic admin UI

A row is checked only when **every** action available in the classic view works in the new one.
Until then the sidebar item links to the classic screen (`legacy` in `src/nav.ts`).
Routes derive from `frontend/src/router/index.js`.

| Done | Route | Classic view | Notes |
|:---:|---|---|---|
| ☑ | `/` dashboard | Dashboard | Counts, breakdowns and both charts, each loading on its own; slow-queries footnote. The classic UI's page-refresh action is the refresh button in the header (refetches whatever is on screen) |
| ☑ | `/lists` | Lists | Search, archived view, sort, paging, create/edit/delete, bulk delete ("select all N" resolves IDs first; the backend's delete-by-query ignores the status filter), send-campaign and import shortcuts, slow-queries footnote |
| ☑ | `/lists/:id` | List form | Page (+ `/lists/new`): name, type, opt-in, tags, description, archive; read-only without `list:manage` |
| ☑ | `/lists/forms` | Forms generator | Read-only CodeMirror view; list names and descriptions are HTML-escaped (the classic generator pasted them raw) |
| ☑ | `/subscribers` | Subscribers | Search, advanced SQL query (gated by `subscribers:sql_query`), list/status filter, sort, paging, export, bulk blocklist/delete/manage lists, row actions. e2e covers both bulk paths: by ID, and "select all N" (by query, beyond the visible page) |
| ☑ | `/subscribers/:id` | Subscriber form | Page (+ `/subscribers/new`): lists, preconfirm, send opt-in, subscriptions, bounces, activity, attributes |
| ☑ | `/subscribers/lists/:listID` | Subscribers of a list | Same view; `?subscription_status=` honoured |
| ☑ | `/subscribers/import` | Import | CSV/ZIP upload, subscribe/blocklist modes, overwrite options (with confirm), live progress and log, stop/done. `?list_id=` preselects lists |
| ☑ | `/subscribers/bounces` | Bounces | Filters (campaign, source), sort, paging, details, delete and blocklist by ID. "Select all N" resolves the filtered IDs: the server's delete-all and blocklist-all ignore filters. The classic UI's "type" filter never worked (the API has none) and is omitted. Tested against a mocked API |
| ☑ | `/campaigns` | Campaigns | Search, status filter, sort, paging, live running stats (1 s poll while any campaign runs), start/pause/resume/cancel/schedule, clone, delete, bulk delete ("select all N" resolves IDs first) |
| ☑ | `/campaigns/:id` | Campaign editor | Tabs (campaign, content, attributes, archive; in the URL), unsaved-changes guard, Ctrl+S, test send with the unsaved form, attachments from the media picker. Formats: rich text (TinyMCE 7, self-hosted, themed from the tokens, tracked-link and embed-image options kept), HTML and markdown (CodeMirror), plain, visual (the email-builder in an iframe, import a visual template). Format switching converts with a confirm. **Omissions:** TinyMCE's own UI is English-only (no language packs bundled), and its help plugin is dropped. The visual builder keeps its own light look |
| ☑ | `/campaigns/media` | Media | Search, multi-file upload, delete, paging (page and search in the URL). `MediaGallery` has a `selectable` mode for the campaign editor's picker |
| ☑ | `/campaigns/templates` | Templates | List (client-side sort), create/edit pages, preview (also of unsaved edits, F9), clone, set default, delete. Visual templates are edited with the email-builder |
| ☑ | `/campaigns/analytics` | Analytics | Campaign picker, date range, views/clicks/bounces/links series and totals, top links, per-campaign charts |
| ☑ | `/users` | Users | Client-side sort, create/edit pages (person or API user, password login, user and list role), delete. A new API user is shown its one-time token (verified to authenticate). The classic search box is omitted: `GET /api/users` takes no query, so it never filtered |
| ☑ | `/users/roles/users` | User roles | List, create/edit pages with the grouped permission grid (select/none, SQL-query warning), clone, delete; Super Admin is view-only |
| ☑ | `/users/roles/lists` | List roles | List, create/edit pages (add lists, view/manage per list), clone, delete. The classic "lists:*_all overrides" warning never rendered (it read an empty field) and is omitted |
| ☑ | `/user/profile` | Profile | Name, email, password change, TOTP two-factor on (QR, secret, code) and off (password). Needed a backend fix: DELETE bodies were never parsed, so turning 2FA off failed in both UIs (`utils.FormValue`) |
| ☑ | `/settings` | Settings | All nine tabs (general, performance, privacy, security, media, mail servers, bounces, messengers, appearance) in `AdminSplitLayout`, tab in the URL, validation that jumps to the broken tab, unsaved-changes guard, Ctrl+S. Secrets stay masked and are only sent when retyped. Saving reloads the server and the page waits for it. A test saves from the UI and checks every other setting is unchanged. Not carried over: nothing found missing |
| ☑ | `/settings/logs` | Logs | Server log, refreshed every 10 s |
| ☑ | `/settings/maintenance` | Maintenance | Delete orphan/blocklisted subscribers, unconfirmed subscriptions and analytics (each confirmed), analytics CSV export, scheduled vacuum |
| ☑ | `404` | Not found | `NotFoundView` |

## Cross-cutting

- [x] Permission-gated nav, routes and actions (`usePermission`, `nav.ts`, `meta.perms`)
- [x] i18n from `/api/lang/:lang`
- [x] Dark mode
- [x] Command palette + provider registry
- [x] Login, 2FA, forgot/reset, OIDC: **decision: keep the server-rendered pages** (they are the security boundary) and theme them with `librelist-auth.css`. They return to `/app` when `next` says so; the default `next` stays `/admin` until Phase 7. Upstream's `SanitizeURI` drops query strings from `next`
- [x] "Settings changed, restart needed" flow: save waits for the reload; `GlobalNotices` shows the restart banner (with a Restart action) when campaigns blocked the automatic reload
- [x] Update notice and project messages (`GlobalNotices`), and the legacy-admin-credentials warning
- [x] Source-code link (AGPL §13): shown in the user menu when `VITE_SOURCE_URL` is set at build time (the release workflow sets it to the repository); hidden otherwise, since the classic UI has none and local builds have no public URL

## OpenAPI spec gaps

`pnpm spec:coverage` lists routes missing from `docs/swagger/collections.yaml` (a few misc: settings by key,
exports, subscriber PATCH). Document each when its screen is ported.

## librelist-only screens (no classic equivalent)

| Route | Screen | Notes |
|---|---|---|
| `/automations` | Automations | Search, status filter, sort, paging, create, pause/resume/archive/delete (confirmed) |
| `/automations/:id` | Builder | Flow tab (triggers, vertical steps, condition branches side by side, per-step settings sheet, draft/publish bar, unsaved-changes guard, Ctrl+S), Activity (enrollments, per-person step log), Settings (re-entry, send window, timezone, goal), Versions. An email step is written with the campaign editor inside the step. Tested end to end (`e2e/automations.spec.ts`, `e2e/automations-api.spec.ts`) |
| `/subscribers/:id` → Automations tab | Subscriber automations | The automations a subscriber is or was in, and their tracked events |
| `/settings/maintenance` → Tracked events | Event cleanup | Deletes events older than a date |
