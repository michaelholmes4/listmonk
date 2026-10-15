-- Date rules compare attributes and event properties that come from outside. A value that looks like
-- a date but isn't one ('2026-02-30') made the whole rule fail with an error; this reads it as no
-- date instead, so the rule simply doesn't match. STABLE: the result depends on the session time zone.
CREATE OR REPLACE FUNCTION automation_try_timestamptz(v TEXT) RETURNS TIMESTAMPTZ AS $$
BEGIN
    IF v IS NULL OR v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
        RETURN NULL;
    END IF;
    RETURN v::TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
