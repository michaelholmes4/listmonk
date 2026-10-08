#!/usr/bin/env bash
# Runs once after the dev container is created.
set -euo pipefail
cd /workspace

git config --global --add safe.directory /workspace

# The go-mod-cache named volume mounts root-owned; the vscode user must be able to write to it.
sudo chown -R "$(id -u):$(id -g)" /go/pkg/mod

go mod download

# Old UI (Vue 2). Needs yarn 1.x.
corepack enable
(cd frontend && yarn install --frozen-lockfile)

# New UI (shadcn-vue). Exists from Phase 2 onward.
if [ -f web/package.json ]; then
  (cd web && pnpm install --frozen-lockfile)
  # Browser + system libs for the Playwright smoke tests (`pnpm -C web test:e2e`).
  (cd web && pnpm exec playwright install --with-deps chromium)
fi

# Build everything once so the binary has the embedded assets, then install the schema.
make dist
./listmonk --install --idempotent --yes --config .devcontainer/config.toml

echo "Ready. Run 'make dev' (or 'make run' for the Go API only)."
