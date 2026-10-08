-- Marketing automation: events, automations (versioned), their triggers, and enrollments.

-- What happened to a subscriber, from the track API or from the app itself.
CREATE TABLE IF NOT EXISTS subscriber_events (
    id              BIGSERIAL PRIMARY KEY,
    subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name            TEXT NOT NULL,
    properties      JSONB NOT NULL DEFAULT '{}',
    -- Retrying a request with the same key records (and triggers) once.
    idempotency_key TEXT NULL,
    occurred_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_events_idem ON subscriber_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sub_events_sub ON subscriber_events (subscriber_id, name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_events_name ON subscriber_events (name, occurred_at DESC);

DO $$ BEGIN
    CREATE TYPE automation_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE enrollment_status AS ENUM ('active', 'waiting', 'completed', 'exited', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS automations (
    id                  SERIAL PRIMARY KEY,
    uuid                UUID NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    status              automation_status NOT NULL DEFAULT 'draft',
    -- The published version new enrollments use. NULL until first published.
    current_version_id  INTEGER NULL,
    -- Re-entry rule, send window, fallback timezone, goal.
    settings            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automations_status ON automations (status);

-- A graph is edited as a draft version and frozen when published.
CREATE TABLE IF NOT EXISTS automation_versions (
    id              SERIAL PRIMARY KEY,
    automation_id   INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version         INTEGER NOT NULL,
    graph           JSONB NOT NULL DEFAULT '{}',
    published_at    TIMESTAMP WITH TIME ZONE NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (automation_id, version)
);
-- At most one draft per automation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_versions_draft ON automation_versions (automation_id) WHERE published_at IS NULL;

DO $$ BEGIN
    ALTER TABLE automations ADD CONSTRAINT fk_automations_current_version
        FOREIGN KEY (current_version_id) REFERENCES automation_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The triggers of the published version, kept in their own table so "who listens for this?" is an index lookup.
CREATE TABLE IF NOT EXISTS automation_triggers (
    id              SERIAL PRIMARY KEY,
    automation_id   INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version_id      INTEGER NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    type            TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_type ON automation_triggers (type);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_automation ON automation_triggers (automation_id);

CREATE TABLE IF NOT EXISTS enrollments (
    id              BIGSERIAL PRIMARY KEY,
    automation_id   INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version_id      INTEGER NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    status          enrollment_status NOT NULL DEFAULT 'active',
    current_node_id TEXT NULL,
    next_run_at     TIMESTAMP WITH TIME ZONE NULL,
    -- What started it (the event, the list) and anything steps want to remember.
    context         JSONB NOT NULL DEFAULT '{}',
    entered_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    exited_at       TIMESTAMP WITH TIME ZONE NULL,
    exit_reason     TEXT NULL
);
-- A subscriber is in an automation at most once at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_live ON enrollments (automation_id, subscriber_id) WHERE status IN ('active', 'waiting');
CREATE INDEX IF NOT EXISTS idx_enrollments_sub ON enrollments (subscriber_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_automation ON enrollments (automation_id, status);

-- One row per node an enrollment has run; (enrollment, node) is unique, which is what makes a retried send harmless.
CREATE TABLE IF NOT EXISTS enrollment_steps (
    id              BIGSERIAL PRIMARY KEY,
    enrollment_id   BIGINT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    node_id         TEXT NOT NULL,
    status          TEXT NOT NULL,
    started_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMP WITH TIME ZONE NULL,
    result          JSONB NOT NULL DEFAULT '{}',
    error           TEXT NULL,
    UNIQUE (enrollment_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollment_steps_node ON enrollment_steps (node_id, status);
