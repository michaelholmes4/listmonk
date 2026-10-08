# Parity with the classic admin UI

A row is checked only when **every** action available in the classic view works in the new one.
Until then the sidebar item links to the classic screen (`legacy` in `src/nav.ts`).
Routes derive from `frontend/src/router/index.js`.

| Done | Route | Classic view | Notes |
|:---:|---|---|---|
| ◐ | `/` dashboard | Dashboard | Counts, breakdowns and both charts done. Left: "slow queries cached" note (needs `app.cache_slow_queries` from `/api/settings`) and the global refresh action |
| ◐ | `/lists` | Lists | Search, archived view, sort, paging, create/edit/delete, bulk delete ("select all N" resolves IDs first; the backend's delete-by-query ignores the status filter), opt-in campaign shortcut. Left: "slow queries cached" note (needs `app.cache_slow_queries`). Opt-in campaign, send-campaign and import links still hand off to the classic UI until those screens are ported |
| ☑ | `/lists/:id` | List form | Sheet: name, type, opt-in, tags, description, archive; read-only without `list:manage` |
| ☐ | `/lists/forms` | Forms generator | |
| ◐ | `/subscribers` | Subscribers | Search, advanced SQL query (gated by `subscribers:sql_query`), list/status filter, sort, paging, export, bulk blocklist/delete/manage lists, row actions. e2e covers by-ID bulk; the "select all N" by-query path is not covered yet |
| ☑ | `/subscribers/:id` | Subscriber form | Sheet over the table: lists, preconfirm, send opt-in, subscriptions, bounces, activity, attributes |
| ☑ | `/subscribers/lists/:listID` | Subscribers of a list | Same view; `?subscription_status=` honoured |
| ☐ | `/subscribers/import` | Import | CSV + progress |
| ☐ | `/subscribers/bounces` | Bounces | |
| ☐ | `/campaigns` | Campaigns | |
| ☐ | `/campaigns/:id` | Campaign editor | richtext (TinyMCE 7), HTML, markdown, visual |
| ☐ | `/campaigns/media` | Media | |
| ☐ | `/campaigns/templates` | Templates | |
| ☐ | `/campaigns/analytics` | Analytics | |
| ☐ | `/users` | Users | |
| ☐ | `/users/roles/users` | User roles | |
| ☐ | `/users/roles/lists` | List roles | |
| ☐ | `/user/profile` | Profile | |
| ☐ | `/settings` | Settings | all tabs, in `AdminSplitLayout` |
| ☐ | `/settings/logs` | Logs | |
| ☐ | `/settings/maintenance` | Maintenance | |
| ☑ | `404` | Not found | `NotFoundView` |

## Cross-cutting

- [x] Permission-gated nav, routes and actions (`usePermission`, `nav.ts`, `meta.perms`)
- [x] i18n from `/api/lang/:lang`
- [x] Dark mode
- [x] Command palette + provider registry
- [x] Login, 2FA, forgot/reset, OIDC: **decision: keep the server-rendered pages** (they are the security boundary) and theme them with `librelist-auth.css`. They return to `/app` when `next` says so; the default `next` stays `/admin` until Phase 7. Upstream's `SanitizeURI` drops query strings from `next`
- [ ] "Settings changed, restart needed" flow (`/api/config` `needs_restart`, `/api/admin/reload`)
- [ ] Global "about" / update notice
- [ ] Source-code link (AGPL §13). The classic UI has none in v6.2 and the fork has no public repo URL yet; add it to the user menu once `origin` exists

## OpenAPI spec gaps

`pnpm spec:coverage` lists routes missing from `docs/swagger/collections.yaml` (users, roles,
a few misc). Document each when its screen is ported.
