-- librelist marketing automation. Loaded by internal/automation (not by models.Queries).

-- name: automation-insert-automation
INSERT INTO automations (uuid, name, settings) VALUES ($1, $2, $3) RETURNING *;

-- name: automation-get-automation
SELECT * FROM automations WHERE id = $1;

-- name: automation-list-automations
-- $1 search text, $2 statuses (NULL = any), $3 offset, $4 limit, $5 only those whose published version
-- people can be added to by hand. %order% is substituted from a whitelist.
SELECT a.*,
    COUNT(*) OVER () AS total,
    COALESCE(c.active, 0) AS active, COALESCE(c.waiting, 0) AS waiting, COALESCE(c.completed, 0) AS completed,
    COALESCE(c.exited, 0) AS exited, COALESCE(c.failed, 0) AS failed
FROM automations a
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE status = 'active') AS active,
           COUNT(*) FILTER (WHERE status = 'waiting') AS waiting,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status = 'exited') AS exited,
           COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM enrollments e WHERE e.automation_id = a.id
) c ON TRUE
WHERE ($1 = '' OR a.name ILIKE '%' || $1 || '%')
  AND ($2::automation_status[] IS NULL OR a.status = ANY($2::automation_status[]))
  AND (NOT $5::BOOLEAN OR EXISTS (SELECT 1 FROM automation_triggers t WHERE t.automation_id = a.id AND t.type = 'manual'))
ORDER BY %order% OFFSET $3 LIMIT (CASE WHEN $4 < 1 THEN NULL ELSE $4 END);

-- name: automation-update-automation
UPDATE automations SET name = $2, settings = $3, updated_at = NOW() WHERE id = $1 RETURNING *;

-- name: automation-set-automation-status
UPDATE automations SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *;

-- name: automation-move-status
-- Changes the status only from $3, so that a pause or resume racing an archive can't undo it.
-- No row back: the automation is gone or no longer in that status.
UPDATE automations SET status = $2, updated_at = NOW() WHERE id = $1 AND status = $3 RETURNING *;

-- name: automation-lock-automation
SELECT * FROM automations WHERE id = $1 FOR UPDATE;

-- name: automation-delete-automation
DELETE FROM automations WHERE id = $1;

-- name: automation-insert-version
-- The next version number, with the given graph (a draft until published).
INSERT INTO automation_versions (automation_id, version, graph)
VALUES ($1, COALESCE((SELECT MAX(version) FROM automation_versions WHERE automation_id = $1), 0) + 1, $2)
RETURNING *;

-- name: automation-get-version
SELECT * FROM automation_versions WHERE id = $1;

-- name: automation-get-draft
SELECT * FROM automation_versions WHERE automation_id = $1 AND published_at IS NULL;

-- name: automation-list-versions
SELECT * FROM automation_versions WHERE automation_id = $1 ORDER BY version DESC;

-- name: automation-lock-draft
SELECT * FROM automation_versions WHERE id = $1 AND published_at IS NULL FOR UPDATE;

-- name: automation-update-draft
UPDATE automation_versions SET graph = $2 WHERE id = $1 AND published_at IS NULL RETURNING *;

-- name: automation-publish-version
UPDATE automation_versions SET published_at = NOW() WHERE id = $1 AND published_at IS NULL RETURNING *;

-- name: automation-set-current-version
UPDATE automations SET current_version_id = $2, updated_at = NOW() WHERE id = $1;

-- name: automation-delete-triggers
DELETE FROM automation_triggers WHERE automation_id = $1;

-- name: automation-insert-trigger
INSERT INTO automation_triggers (automation_id, version_id, type, config) VALUES ($1, $2, $3, $4);

-- name: automation-find-triggers
-- Who listens for this kind of trigger, only active automations, only their published version.
SELECT t.automation_id, t.version_id, t.type, t.config, a.settings
FROM automation_triggers t
JOIN automations a ON a.id = t.automation_id AND a.current_version_id = t.version_id
WHERE t.type = $1 AND a.status = 'active';

-- name: automation-has-trigger
-- Whether the published version has a trigger of this type.
SELECT EXISTS (SELECT 1 FROM automation_triggers WHERE automation_id = $1 AND type = $2);

-- name: automation-insert-enrollment
-- Fails quietly (no row) if the subscriber is already live in this automation.
INSERT INTO enrollments (automation_id, version_id, subscriber_id, status, current_node_id, next_run_at, entered_at, context)
VALUES ($1, $2, $3, 'active', NULL, $5, $5, $4)
ON CONFLICT (automation_id, subscriber_id) WHERE status IN ('active', 'waiting') DO NOTHING
RETURNING *;

-- name: automation-get-enrollment
SELECT * FROM enrollments WHERE id = $1;

-- name: automation-lock-enrollment
SELECT * FROM enrollments WHERE id = $1 FOR UPDATE;

-- name: automation-waiting-enrollments
-- A subscriber's runs that are paused on a step, in automations that can still run.
SELECT e.* FROM enrollments e JOIN automations a ON a.id = e.automation_id
WHERE e.subscriber_id = $1 AND e.status = 'waiting' AND a.status IN ('active', 'paused');

-- name: automation-update-enrollment
-- A run arriving at a different node starts a new visit of it. current_visit is then the number of
-- earlier visits plus one. That works because: in an UPDATE, current_node_id on the right-hand side
-- is the old value; every visit that ran leaves exactly one step row, so the rows already there
-- count the earlier visits; a go_to never targets itself and edges never point back to their own
-- node, so moving on always changes the node; and waiting, exiting and completing keep (or clear)
-- the node, so the visit stays as it was. A NULL node is the root on its first visit: its step row
-- may already be written, so it is not counted again.
UPDATE enrollments SET status = $2::enrollment_status, current_node_id = $3, next_run_at = $4, context = $5,
    current_visit = (CASE WHEN $3::TEXT IS NOT NULL AND current_node_id IS NOT NULL AND current_node_id <> $3::TEXT
        THEN (SELECT COUNT(*) + 1 FROM enrollment_steps WHERE enrollment_id = $1 AND node_id = $3::TEXT)
        ELSE current_visit END),
    exited_at = (CASE WHEN $2::enrollment_status IN ('completed', 'exited', 'failed') THEN NOW() ELSE NULL END),
    exit_reason = $6
WHERE id = $1;

-- name: automation-enrollment-history
-- When the subscriber last entered this automation, and how many times.
SELECT COALESCE(MAX(entered_at), 'epoch') AS last_entered, COUNT(*) AS entries
FROM enrollments WHERE automation_id = $1 AND subscriber_id = $2;

-- name: automation-live-enrollment-ids
SELECT id FROM enrollments WHERE automation_id = $1 AND status IN ('active', 'waiting');

-- name: automation-list-enrollments
-- $1 automation, $2 statuses (NULL = any), $3 search (email/name), $4 offset, $5 limit.
SELECT e.*, s.email, s.name AS subscriber_name, COUNT(*) OVER () AS total
FROM enrollments e
JOIN subscribers s ON s.id = e.subscriber_id
WHERE e.automation_id = $1
  AND ($2::enrollment_status[] IS NULL OR e.status = ANY($2::enrollment_status[]))
  AND ($3 = '' OR s.email ILIKE '%' || $3 || '%' OR s.name ILIKE '%' || $3 || '%')
ORDER BY e.entered_at DESC, e.id DESC OFFSET $4 LIMIT (CASE WHEN $5 < 1 THEN NULL ELSE $5 END);

-- name: automation-list-subscriber-enrollments
SELECT e.*, a.name AS automation_name
FROM enrollments e JOIN automations a ON a.id = e.automation_id
WHERE e.subscriber_id = $1 ORDER BY e.entered_at DESC;

-- name: automation-insert-step
-- The unique (enrollment, node, visit) row is what stops a retried job from running a step twice
-- within one visit. No row back means it had already started. The visit is the run's current one.
INSERT INTO enrollment_steps (enrollment_id, node_id, status, visit)
VALUES ($1, $2, $3, (SELECT current_visit FROM enrollments WHERE id = $1))
ON CONFLICT (enrollment_id, node_id, visit) DO NOTHING RETURNING *;

-- name: automation-get-step
SELECT * FROM enrollment_steps WHERE enrollment_id = $1 AND node_id = $2
AND visit = (SELECT current_visit FROM enrollments WHERE id = $1);

-- name: automation-update-step
UPDATE enrollment_steps SET status = $3::TEXT,
    finished_at = (CASE WHEN $3::TEXT IN ('done', 'skipped', 'failed') THEN NOW() ELSE NULL END),
    result = $4, error = $5
WHERE enrollment_id = $1 AND node_id = $2
AND visit = (SELECT current_visit FROM enrollments WHERE id = $1);

-- name: automation-list-steps
-- An email step also carries the outcome of the message it handed to listmonk, from the message log: the
-- first message of this run logged at or after the step started (steps run one after another).
SELECT st.*, m.status AS delivery_status, NULLIF(m.error, '') AS delivery_error, m.id AS message_log_id
FROM enrollment_steps st
LEFT JOIN LATERAL (
    SELECT id, status, error FROM librelist_messages
    WHERE enrollment_id = st.enrollment_id AND created_at >= st.started_at
        AND st.result ? 'message_type'
    ORDER BY created_at, id LIMIT 1
) m ON TRUE
WHERE st.enrollment_id = $1 ORDER BY st.started_at, st.id;

-- name: automation-node-stats
-- Per step of an automation, how many people reached it, finished it, or are waiting on it.
-- People, not visits: someone who went round a loop three times counts once.
SELECT st.node_id,
    COUNT(DISTINCT st.enrollment_id) AS entered,
    COUNT(DISTINCT st.enrollment_id) FILTER (WHERE st.status = 'done') AS done,
    COUNT(DISTINCT st.enrollment_id) FILTER (WHERE st.status = 'skipped') AS skipped,
    COUNT(DISTINCT st.enrollment_id) FILTER (WHERE st.status = 'failed') AS failed,
    COUNT(DISTINCT st.enrollment_id) FILTER (WHERE st.status IN ('waiting', 'sending')) AS waiting
FROM enrollment_steps st JOIN enrollments e ON e.id = st.enrollment_id
WHERE e.automation_id = $1 GROUP BY st.node_id;

-- name: automation-insert-event
-- No row back means this idempotency key was seen before.
INSERT INTO subscriber_events (subscriber_id, name, properties, idempotency_key, occurred_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (subscriber_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
RETURNING *;

-- name: automation-get-event
SELECT * FROM subscriber_events WHERE id = $1;

-- name: automation-enrolled-by-event
-- Whether this event already started a run of this automation (its job may run more than once).
-- `trigger_event_id` never changes; `event` is replaced when a wait_for_event restarts, so it only
-- identifies the starting event for runs from before `trigger_event_id` was recorded.
SELECT EXISTS (SELECT 1 FROM enrollments WHERE automation_id = $1 AND subscriber_id = $2
    AND (context->>'trigger_event_id' = $3::TEXT OR (context->>'trigger_event_id' IS NULL AND context->'event'->>'id' = $3::TEXT)));

-- name: automation-list-events
SELECT *, COUNT(*) OVER () AS total FROM subscriber_events
WHERE subscriber_id = $1 ORDER BY occurred_at DESC, id DESC OFFSET $2 LIMIT (CASE WHEN $3 < 1 THEN NULL ELSE $3 END);

-- name: automation-delete-old-events
DELETE FROM subscriber_events WHERE occurred_at < $1;

-- name: automation-get-subscriber
SELECT id, uuid, email, name, attribs, status FROM subscribers WHERE id = $1;

-- name: automation-lock-subscriber-attribs
SELECT attribs FROM subscribers WHERE id = $1 FOR UPDATE;

-- name: automation-set-subscriber-attribs
UPDATE subscribers SET attribs = $2, updated_at = NOW() WHERE id = $1;

-- name: automation-consent
-- What the engine needs to decide whether a message may go, the subscriber's status, and their
-- subscription to the topic list (if any) with the list's opt-in mode.
SELECT s.status::TEXT AS subscriber_status,
       sl.status::TEXT AS subscription_status,
       l.optin::TEXT AS list_optin
FROM subscribers s
LEFT JOIN lists l ON l.id = $2
LEFT JOIN subscriber_lists sl ON sl.subscriber_id = s.id AND sl.list_id = $2
WHERE s.id = $1;

-- name: automation-subscribe
-- Add a subscription. Returns the previous status so callers can tell a new join.
-- An existing subscription only ever goes from unconfirmed to confirmed: an opt-out
-- ('unsubscribed') is never undone, and a confirmed subscription is never downgraded.
WITH prev AS (
    SELECT status::TEXT AS status FROM subscriber_lists WHERE subscriber_id = $1 AND list_id = $2
), up AS (
    INSERT INTO subscriber_lists (subscriber_id, list_id, status) VALUES ($1, $2, $3::subscription_status)
    ON CONFLICT (subscriber_id, list_id) DO UPDATE SET
        status = (CASE WHEN subscriber_lists.status = 'unconfirmed' AND EXCLUDED.status = 'confirmed'
            THEN 'confirmed' ELSE subscriber_lists.status END),
        updated_at = NOW()
    RETURNING status::TEXT
)
SELECT COALESCE((SELECT status FROM prev), '') AS previous, (SELECT status FROM up) AS current;

-- name: automation-unsubscribe
UPDATE subscriber_lists SET status = 'unsubscribed', updated_at = NOW() WHERE subscriber_id = $1 AND list_id = $2;

-- name: automation-remove-subscription
DELETE FROM subscriber_lists WHERE subscriber_id = $1 AND list_id = $2;

-- name: automation-get-list-optin
SELECT optin::TEXT FROM lists WHERE id = $1;

-- name: automation-insert-step-campaign
-- The hidden campaign behind an email step. Never picked up by the campaign manager. It is
-- 'cancelled' so that stock listmonk (after a rollback) can't start or schedule it at its topic list.
INSERT INTO campaigns (uuid, name, subject, from_email, body, content_type, messenger, template_id, type, headers, status)
VALUES ($1, $2, $3, $4, $5, $6::content_type, $7, $8, 'automation', '[]', 'cancelled')
RETURNING id;

-- name: automation-step-campaigns
-- Which of these IDs are hidden automation campaigns (an email step may only point at one).
SELECT id FROM campaigns WHERE id = ANY($1::INT[]) AND type = 'automation';

-- name: automation-campaign-lists
SELECT list_id FROM campaign_lists WHERE campaign_id = $1 AND list_id IS NOT NULL ORDER BY list_id;

-- name: automation-step-campaign-in-use
-- Whether a step campaign still sends for a version other than $2 (the one being published): a version
-- that is some automation's live one, or that people are still going through.
SELECT EXISTS (
    SELECT 1 FROM automation_versions v
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(COALESCE(v.graph->'nodes', '[]'::JSONB)) n
    WHERE v.id <> $2 AND v.published_at IS NOT NULL
      AND n->>'type' = 'send_email' AND n->'config'->>'campaign_id' = $1::TEXT
      AND (EXISTS (SELECT 1 FROM automations a WHERE a.current_version_id = v.id)
           OR EXISTS (SELECT 1 FROM enrollments e WHERE e.version_id = v.id AND e.status IN ('active', 'waiting')))
);

-- name: automation-copy-step-campaign
-- A copy of a step campaign's content, for a version whose step changed its topic. Lists are set by the caller.
INSERT INTO campaigns (uuid, name, subject, from_email, body, body_source, altbody, content_type, headers, attribs,
    tags, type, messenger, template_id, status, archive_meta)
SELECT $2, name, subject, from_email, body, body_source, altbody, content_type, headers, attribs,
    tags, type, messenger, template_id, status, archive_meta
FROM campaigns WHERE id = $1 AND type = 'automation'
RETURNING id;

-- name: automation-copy-campaign-media
INSERT INTO campaign_media (campaign_id, media_id, filename) SELECT $2, media_id, filename FROM campaign_media WHERE campaign_id = $1;

-- name: automation-clear-campaign-lists
DELETE FROM campaign_lists WHERE campaign_id = $1;

-- name: automation-set-campaign-list
-- Links a step campaign to its topic list, so the unsubscribe link records the opt-out there.
INSERT INTO campaign_lists (campaign_id, list_id, list_name) SELECT $1, id, name FROM lists WHERE id = $2;

-- name: automation-default-template
SELECT id FROM templates WHERE is_default = true AND type = 'campaign' LIMIT 1;

-- name: automation-subscriber-ids-by-list
-- Confirmed members of a list who can be enrolled (for "also enroll current matches").
SELECT s.id FROM subscribers s
JOIN subscriber_lists sl ON sl.subscriber_id = s.id AND sl.list_id = $1 AND sl.status = 'confirmed'
WHERE s.status = 'enabled' AND s.id > $2 ORDER BY s.id LIMIT $3;
