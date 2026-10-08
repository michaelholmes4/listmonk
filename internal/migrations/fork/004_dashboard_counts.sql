-- The dashboard's campaign counts should not include the hidden campaigns behind automation email
-- steps. This is upstream's mat_dashboard_counts with those left out (keep it in step with
-- schema.sql if upstream changes the view).
DROP MATERIALIZED VIEW IF EXISTS mat_dashboard_counts;
CREATE MATERIALIZED VIEW mat_dashboard_counts AS
    WITH subs AS (
        SELECT COUNT(*) AS num, status FROM subscribers GROUP BY status
    ),
    camps AS (
        SELECT * FROM campaigns WHERE type <> 'automation'
    )
    SELECT NOW() AS updated_at,
        JSON_BUILD_OBJECT(
            'subscribers', JSON_BUILD_OBJECT(
                'total', (SELECT SUM(num) FROM subs),
                'blocklisted', (SELECT num FROM subs WHERE status='blocklisted'),
                'orphans', (
                    SELECT COUNT(id) FROM subscribers
                    LEFT JOIN subscriber_lists ON (subscribers.id = subscriber_lists.subscriber_id)
                    WHERE subscriber_lists.subscriber_id IS NULL
                )
            ),
            'lists', JSON_BUILD_OBJECT(
                'total', (SELECT COUNT(*) FROM lists),
                'private', (SELECT COUNT(*) FROM lists WHERE type='private'),
                'public', (SELECT COUNT(*) FROM lists WHERE type='public'),
                'optin_single', (SELECT COUNT(*) FROM lists WHERE optin='single'),
                'optin_double', (SELECT COUNT(*) FROM lists WHERE optin='double')
            ),
            'campaigns', JSON_BUILD_OBJECT(
                'total', (SELECT COUNT(*) FROM camps),
                'by_status', (
                    SELECT JSON_OBJECT_AGG (status, num) FROM
                    (SELECT status, COUNT(*) AS num FROM camps GROUP BY status) r
                )
            ),
            'messages', (SELECT SUM(sent) AS messages FROM campaigns)
        ) AS data;
CREATE UNIQUE INDEX IF NOT EXISTS mat_dashboard_stats_idx ON mat_dashboard_counts (updated_at);
