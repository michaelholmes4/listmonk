#!/usr/bin/env bash
# Runs once after the dev container is created.
set -euo pipefail
cd /workspace

git config --global --add safe.directory /workspace

# The go-mod-cache named volume mounts root-owned; the vscode user must be able to write to it.
sudo chown -R "$(id -u):$(id -g)" /go/pkg/mod
# Go's checksum-database cache lives in /go/pkg/sumdb, which is not created or writable by default;
# without it `go get` of a new module fails verifying go.mod.
sudo mkdir -p /go/pkg/sumdb && sudo chown -R "$(id -u):$(id -g)" /go/pkg/sumdb

go mod download

# The visual email builder (React) is the one part still built with yarn 1.x.
corepack enable
(cd frontend/email-builder && yarn install --frozen-lockfile)
make build-email-builder

# The admin UI (shadcn-vue).
if [ -f web/package.json ]; then
  (cd web && pnpm install --frozen-lockfile)
  # Browser + system libs for the Playwright smoke tests (`pnpm -C web test:e2e`).
  (cd web && pnpm exec playwright install --with-deps chromium)
fi

# Media uploads go to ./uploads (the dev server runs from the repo root); it must exist.
mkdir -p uploads

# Build everything once so the binary has the embedded assets, then install the schema.
make dist
./listmonk --install --idempotent --yes --config .devcontainer/config.toml
# --install skips an existing database; this brings it up to date (upstream, then the fork's migrations).
./listmonk --upgrade --yes --config .devcontainer/config.toml

echo "Ready. Run 'make dev' (or 'make run' for the Go API only)."
