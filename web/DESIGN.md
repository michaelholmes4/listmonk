# web/ design and composition rules

The new admin UI: Vue 3.5 + TypeScript + Tailwind v4 + shadcn-vue (reka-ui). Served by the Go
backend at `/app/*`; the classic UI stays at `/admin/*` until `PARITY.md` is fully checked.

Token values and composition patterns are adapted from libredesk (AGPL-3.0, see `NOTICE`).

## Components

- `src/components/ui/` is **generated** by the shadcn-vue CLI (`pnpm dlx shadcn-vue@latest add <name>`)
  and is excluded from lint/format. Update by re-`add`ing and reviewing the diff. Style: `reka-nova`
  (the CLI no longer ships `new-york`).
- Feature code **composes** `ui/` components. It never restyles their internals with ad-hoc classes.
  Layout classes on an instance (`class="ml-auto"`, `self-center`) are fine.
- An app-specific variant goes into the generated component's `cva` so it lives in one place
  (e.g. `Badge` has `success` and `warning`).
- Need something shadcn-vue doesn't ship? Build it in `src/components/<area>/` from `ui/` parts.

## Theme

- Colours are CSS variables in `src/assets/main.css` (`:root` and `.dark`). **That file is the only
  place a colour is defined.** Use token classes: `bg-success`, `text-muted-foreground`,
  `bg-canvas`. Never `bg-green-600`.
- Surfaces: `canvas` (gutter) → `background` (content, sidebar) → `card`/`popover` (raised).
- Semantic colour only: `success` / `warning` / `destructive` mean something; numbers are neutral
  unless the colour carries meaning. `warning-600` for warning-coloured *text*.
- Radius comes from `--radius`; use `rounded-lg` / `rounded-md`, never bare `rounded`. Shadows:
  `shadow-sm` cards, `shadow-md` popovers, `shadow-lg` dialogs; never bare `shadow`.
- Utilities: `box` (card surface), `sidebar-section-label`, `link-style`.
- Dark mode is the `.dark` class on `<html>` (`useTheme()`, a thin `useColorMode`). `index.html`
  applies it before first paint.
- Font: Geist, self-hosted via `@fontsource-variable/geist` (no Google Fonts request).
- Verify both themes for every screen.

## Loading and errors (fixes the classic UI's full-page spinner)

- **No route-level spinners.** A component that waits shows `Skeleton` *in its own space*
  (see `DashboardView`, `NavUser`, `DataTable`).
- Server state is `@tanstack/vue-query`; each query/mutation has its own `isPending`. Background
  refetches don't blank anything; paginated tables use `placeholderData: keepPreviousData`.
- Buttons show their own pending state (`:disabled="mutation.isPending.value"`).
- Destructive actions use `AlertDialog`.
- Every mutation reports through a `sonner` toast. `src/lib/query-client.ts` toasts all failures
  and a `meta: { success: '…' }` on a mutation toasts its success. Opt out with `meta.silent`.
- The only blocking load is `main.ts` bootstrap (config + profile + language pack): without
  them nothing can render truthfully. A 401 anywhere redirects to the server-rendered login.

## Data and API

- `src/api/client.ts` is the one axios instance. One module per resource (`config.ts`,
  `profile.ts`, …), never one giant file. Modules return unwrapped payloads (`{data}` removed).
- **Types are generated, not hand-written:** `pnpm gen:api` turns `docs/swagger/collections.yaml`
  into `src/api/schema.d.ts`; `src/api/types.ts` only aliases them. A wrong type means the *spec* is
  wrong: fix `docs/swagger/`. `pnpm spec:coverage` lists routes the spec doesn't document.
- Query hooks live in `src/composables/queries/`; keys in `keys.ts`.
- Pinia is for client-only UI state (`stores/`), never server data.

## i18n

- Strings come from the server's pack (`/api/lang/:lang`, the same `i18n/*.json` as the classic UI),
  so existing translations carry over. New-UI-only strings go in `src/locales/en.json` under the
  `web.` namespace (English fallback for other languages).
- Server messages are escaped on load (`escapeMessage`): they contain Go-template text that
  vue-i18n would otherwise parse as syntax. Lookup is flat (`messageResolver`), not `flatJson`,
  because upstream has keys that are both a leaf and a prefix. `i18n.test.ts` checks every key in
  every shipped language renders as written.

## Permissions

`usePermission()` (`can('campaigns:manage')`, `can('lists:*')`, `canList(id, 'list:manage')`)
mirrors the classic `$can`. Role id 1 is Super Admin. Routes can declare `meta.perms`. While the
profile loads everything is denied, so gated UI never flashes in and out.

## Folder convention

```
src/
  api/                  axios client, one module per resource, generated schema.d.ts
  components/ui/        generated shadcn-vue (do not edit)
  components/layout/    AppShell, sidebar, PageHeader, CommandPalette, AdminSplitLayout
  components/datatable/ DataTable (TanStack Table v9, server pagination) + pagination
  composables/          useTheme, usePermission; queries/ = vue-query hooks
  features/<x>/         Form.vue, schema.ts (zod factory taking `t`), columns.ts, RowActions.vue
  views/<x>/            XList.vue, XCreate.vue, XEdit.vue (thin: compose features)
  lib/                  utils (cn), permissions, commands registry, query-client
  locales/              web.* strings
  nav.ts                the sidebar tree (mirrors the classic menu, same permission gates)
```

## Adding a screen

1. Add the route in `router/index.ts` with `meta.title` (+ `parents`, `perms`).
2. In `nav.ts`, replace that item's `legacy` path with `to: { name }`.
3. Write the API module, query hooks, then `features/` + `views/`.
4. Add a command provider if the screen has global actions
   (`registerCommandProvider` in `lib/commands.ts`).
5. Tick it in `PARITY.md` only when **every** action of the classic view works.
6. Add a Playwright smoke test in `e2e/`.

## Commands

```
pnpm dev            Vite on :5173 (proxies /api etc. to :9000)
pnpm build          typecheck + production build → dist/
pnpm typecheck | lint | test | test:e2e
pnpm gen:api        regenerate src/api/schema.d.ts from docs/swagger
pnpm spec:coverage  routes missing from the OpenAPI spec
```

`test:e2e` needs a running backend serving the *built* UI (the Go server reads `web/dist` at
startup: rebuild, then restart it). Credentials come from `LISTMONK_ADMIN_USER` / `_PASSWORD`.
