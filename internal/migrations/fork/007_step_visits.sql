-- A run can reach the same step more than once (the go_to step), so a step row now belongs to a visit.
-- Existing rows become visit 1, which is right: nothing could revisit before.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS current_visit INTEGER NOT NULL DEFAULT 1;
ALTER TABLE enrollment_steps ADD COLUMN IF NOT EXISTS visit INTEGER NOT NULL DEFAULT 1;
-- One row per (enrollment, node, visit); was (enrollment, node).
ALTER TABLE enrollment_steps DROP CONSTRAINT IF EXISTS enrollment_steps_enrollment_id_node_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_steps_visit ON enrollment_steps (enrollment_id, node_id, visit);
