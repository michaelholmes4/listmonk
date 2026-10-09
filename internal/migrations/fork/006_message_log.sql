-- The message log: one row per email handed to a messenger, with whether it was accepted.
-- Expand-only: a new table, referencing upstream tables by primary key and altering none of them.
-- Campaign and system rows carry no body (campaign copies are re-rendered on demand; system mails
-- hold credentials such as password-reset links).
CREATE TABLE IF NOT EXISTS librelist_messages (
    id             BIGSERIAL PRIMARY KEY,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    source         TEXT NOT NULL,
    messenger      TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL,
    error          TEXT NOT NULL DEFAULT '',

    subscriber_id  INTEGER NULL REFERENCES subscribers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    campaign_id    INTEGER NULL REFERENCES campaigns(id) ON DELETE SET NULL ON UPDATE CASCADE,
    -- Not foreign keys: the log should outlive the automation; these are plain ids to link back.
    automation_id  INTEGER NULL,
    enrollment_id  BIGINT NULL,

    from_email     TEXT NOT NULL DEFAULT '',
    to_email       TEXT[] NOT NULL DEFAULT '{}',
    subject        TEXT NOT NULL DEFAULT '',
    message_id     TEXT NOT NULL DEFAULT '',
    content_type   TEXT NOT NULL DEFAULT '',
    body           TEXT NULL,
    alt_body       TEXT NULL,
    headers        JSONB NOT NULL DEFAULT '{}',
    attachments    JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_librelist_messages_created ON librelist_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_librelist_messages_sub ON librelist_messages (subscriber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_librelist_messages_camp ON librelist_messages (campaign_id);
CREATE INDEX IF NOT EXISTS idx_librelist_messages_auto ON librelist_messages (automation_id);
CREATE INDEX IF NOT EXISTS idx_librelist_messages_failed ON librelist_messages (created_at DESC) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_librelist_messages_to ON librelist_messages (LOWER(to_email[1]));
