# Parity with the classic admin UI

A row is checked only when **every** action available in the classic view works in the new one.
Until then the sidebar item links to the classic screen (`legacy` in `src/nav.ts`).
Routes derive from `frontend/src/router/index.js`.

| Done | Route | Classic view | Notes |
|:---:|---|---|---|
| ◐ | `/` dashboard | Dashboard | Counts, breakdowns and both charts done. Left: "slow queries cached" note (needs `app.cache_slow_queries` from `/api/settings`) and the global refresh action |
| ☐ | `/lists` | Lists | |
| ☐ | `/lists/:id` | List form | |
| ☐ | `/lists/forms` | Forms generator | |
| ☐ | `/subscribers` | Subscribers | incl. SQL query builder, bulk actions |
| ☐ | `/subscribers/:id` | Subscriber form | |
| ☐ | `/subscribers/lists/:listID` | Subscribers of a list | |
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
- [ ] Login in the new UI (TOTP, OIDC). For now the server-rendered `/admin/login` is used and returns to `/app`
- [ ] "Settings changed, restart needed" flow (`/api/config` `needs_restart`, `/api/admin/reload`)
- [ ] Global "about" / update notice
- [ ] Source-code link (AGPL §13). The classic UI has none in v6.2 and the fork has no public repo URL yet; add it to the user menu once `origin` exists

## OpenAPI spec gaps

`pnpm spec:coverage` lists routes missing from `docs/swagger/collections.yaml` (users, roles,
a few misc). Document each when its screen is ported.
