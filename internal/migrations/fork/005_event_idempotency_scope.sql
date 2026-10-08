-- An idempotency key identifies a request from one client about one subscriber. Scoping it to the
-- subscriber means a key that is only unique per subscriber (an order number, say) can't make an
-- event for someone else vanish.
DROP INDEX IF EXISTS idx_sub_events_idem;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_events_idem ON subscriber_events (subscriber_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
