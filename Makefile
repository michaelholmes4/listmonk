# Try to get the commit hash from 1) git 2) the VERSION file 3) fallback.
LAST_COMMIT := $(or $(shell git rev-parse --short HEAD 2> /dev/null),$(shell head -n 1 VERSION | grep -oP -m 1 "^[a-z0-9]+$$"),"")

# Try to get the semver from 1) git 2) the VERSION file 3) fallback.
VERSION := $(or $(LISTMONK_VERSION),$(shell git describe --tags --abbrev=0 2> /dev/null),$(shell grep -oP 'tag: \Kv\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?' VERSION),"v0.0.0")

BUILDDATE := $(if $(SOURCE_DATE_EPOCH),$(shell date -u -d @$(SOURCE_DATE_EPOCH) +"%Y-%m-%dT%H:%M:%S%z"),$(shell date -u +"%Y-%m-%dT%H:%M:%S%z"))
BUILDSTR := ${VERSION} (\#${LAST_COMMIT} $(BUILDDATE))

YARN ?= yarn
GOPATH ?= $(HOME)/go
STUFFBIN ?= $(GOPATH)/bin/stuffbin
# fork: the admin UI is web/ (pnpm). Only the visual email builder (a React app, used inside
# the campaign editor) is still built with yarn, from frontend/email-builder, and its output is
# copied into web/public so the UI serves it at /admin/static/email-builder.
FRONTEND_EMAIL_BUILDER = frontend/email-builder
FRONTEND_EMAIL_BUILDER_YARN_MODULES = $(FRONTEND_EMAIL_BUILDER)/node_modules
FRONTEND_EMAIL_BUILDER_DIST = $(FRONTEND_EMAIL_BUILDER)/dist
FRONTEND_EMAIL_BUILDER_DIST_FINAL = web/public/static/email-builder
FRONTEND_EMAIL_BUILDER_DEPS = \
	$(FRONTEND_EMAIL_BUILDER_YARN_MODULES) \
	$(FRONTEND_EMAIL_BUILDER)/package.json \
	$(FRONTEND_EMAIL_BUILDER)/tsconfig.json \
	$(FRONTEND_EMAIL_BUILDER)/vite.config.ts \
	$(shell find $(FRONTEND_EMAIL_BUILDER)/src -type f)

BIN := listmonk
STATIC := config.toml.sample \
	schema.sql queries:/queries permissions.json \
	static/public:/public \
	static/email-templates \
	web/dist:/admin \
	i18n:/i18n

SQL := $(shell find . -type f -name "*.sql") $(shell find queries -type f -name "*.sql")
SRC := $(shell find . -type f -name "*.go")

.PHONY: build
build: $(BIN)

$(STUFFBIN):
	go install github.com/knadh/stuffbin/...

$(FRONTEND_EMAIL_BUILDER_YARN_MODULES): $(FRONTEND_EMAIL_BUILDER)/package.json $(FRONTEND_EMAIL_BUILDER)/yarn.lock
	cd $(FRONTEND_EMAIL_BUILDER) && $(YARN) install
	touch -c $(FRONTEND_EMAIL_BUILDER_YARN_MODULES)

# Build the JS email-builder dist.
$(FRONTEND_EMAIL_BUILDER_DIST): $(FRONTEND_EMAIL_BUILDER_DEPS)
	export VUE_APP_VERSION="${VERSION}" && cd $(FRONTEND_EMAIL_BUILDER) && $(YARN) build
	touch -c $(FRONTEND_EMAIL_BUILDER_DIST)

# Copy the built email-builder into the UI.
$(FRONTEND_EMAIL_BUILDER_DIST_FINAL): $(FRONTEND_EMAIL_BUILDER_DIST)
	mkdir -p $(FRONTEND_EMAIL_BUILDER_DIST_FINAL)
	cp -r $(FRONTEND_EMAIL_BUILDER_DIST)/* $(FRONTEND_EMAIL_BUILDER_DIST_FINAL)
	touch -c $(FRONTEND_EMAIL_BUILDER_DIST_FINAL)

# Build everything the binary serves: the email builder, then the UI. (Name kept: upstream's
# goreleaser configs call it.)
.PHONY: build-frontend
build-frontend: build-web

.PHONY: build-email-builder
build-email-builder: $(FRONTEND_EMAIL_BUILDER_DIST_FINAL)

# Run the UI's dev server (the same as run-web).
.PHONY: run-frontend
run-frontend: run-web

# Run Go tests.
.PHONY: test
test:
	go test ./...

# Bundle all static assets including the JS frontend into the ./listmonk binary
# using stuffbin (installed with make deps).
.PHONY: dist
dist: $(STUFFBIN) build build-web pack-bin

# pack-releases runns stuffbin packing on the given binary. This is used
# in the .goreleaser post-build hook.
.PHONY: pack-bin
pack-bin: build-web $(BIN) $(STUFFBIN)
	$(STUFFBIN) -a stuff -in ${BIN} -out ${BIN} ${STATIC}

# Use goreleaser to do a dry run producing local builds.
.PHONY: release-dry
release-dry:
	goreleaser release --parallelism 1 --clean --snapshot --skip=publish

# Use goreleaser to build production releases and publish them.
.PHONY: release
release:
	goreleaser release --parallelism 1 --clean

# Build local docker images for development.
.PHONY: build-dev-docker
build-dev-docker: build ## Build docker containers for the entire suite (Front/Core/PG).
	cd dev; \
	docker compose build ; \

# Spin a local docker suite for local development.
.PHONY: dev-docker
dev-docker: build-dev-docker ## Build and spawns docker containers for the entire suite (Front/Core/PG).
	cd dev; \
	docker compose up

# Run the backend in docker-dev mode. The frontend assets in dev mode are loaded from disk from frontend/dist.
.PHONY: run-backend-docker
run-backend-docker:
	CGO_ENABLED=0 go run -ldflags="-s -w -X 'main.buildString=${BUILDSTR}' -X 'main.versionString=${VERSION}'" ./cmd --config=dev/config.toml

# Tear down the complete local development docker suite.
.PHONY: rm-dev-docker
rm-dev-docker: build ## Delete the docker containers including DB volumes.
	cd dev; \
	docker compose down -v ; \

# Setup the db for local dev docker suite.
.PHONY: init-dev-docker
init-dev-docker: build-dev-docker ## Delete the docker containers including DB volumes.
	cd dev; \
	docker compose run --rm backend sh -c "make dist && ./listmonk --install --idempotent --yes --config dev/config.toml"

# ---- fork additions ---------------------------------------------------------
DEV_CONFIG ?= .devcontainer/config.toml

# Run the Go backend against the devcontainer config.
.PHONY: run-dev-backend
run-dev-backend:
	CGO_ENABLED=0 go run -ldflags="-s -w -X 'main.buildString=${BUILDSTR}' -X 'main.versionString=${VERSION}'" ./cmd --config=$(DEV_CONFIG)

# Run the UI (web/) Vite dev server.
.PHONY: run-web
run-web: $(FRONTEND_EMAIL_BUILDER_DIST_FINAL)
	cd web && pnpm dev

# Build the UI (with the email builder) into web/dist.
.PHONY: build-web
build-web: $(FRONTEND_EMAIL_BUILDER_DIST_FINAL)
	cd web && pnpm install --frozen-lockfile && pnpm build

# Run backend and new UI together.
.PHONY: dev
dev:
	$(MAKE) run-dev-backend & $(MAKE) run-web & wait

# Pack the already-built frontends into BIN. The goreleaser hook uses this so the UIs are built
# once (in `before`) instead of once per target.
.PHONY: pack-bin-only
pack-bin-only: $(STUFFBIN)
	$(STUFFBIN) -a stuff -in ${BIN} -out ${BIN} ${STATIC}
