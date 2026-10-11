# listmonk fork

Fork of listmonk adding a Vue 3 + shadcn-vue admin UI (`web/`) and marketing automation
(`internal/automation/`). Fork merge notes: FORK.md.

## Rules
- This repository is public. Everything committed (code, comments, docs, tests, fixtures, commit messages) stays generic, written for any listmonk user: no names, domains, data, list names, content or config of a particular deployment, and no secrets.
- Keep upstream merges cheap: new code goes in new files/dirs; edits to upstream files stay small and hook-like (list in FORK.md).
- Fork DB migrations go in `internal/migrations/fork/`, never in the upstream sequence.
- Reuse listmonk concepts (lists as topics, `blocklisted` as suppression, campaigns for email content/tracking) instead of adding parallel tables.
- `web/`: shadcn-vue components are generated with the CLI into `src/components/ui/` and not restyled in feature code; theme only via CSS variable tokens; loading states are per-component (Skeleton / button pending), never full-page.
- `web/` page structure follows `web/UX.md`: every page is a `Page`, list pages use `DataTableToolbar` + `useUrlTable`/`useRowSelection`, editors put Save in the header via `FormActions`, and the nav (`src/nav.ts`) holds destinations only.
- Keep AGPL notices; credit listmonk and libredesk in NOTICE.

## Dev
- Devcontainer: `make dev` (Go API :9000, admin UI :5173 with hot reload, Mailpit :8025). The UI is served by the backend at /admin (built into `web/dist`); /app redirects there.
- Go tests: `make test`.
