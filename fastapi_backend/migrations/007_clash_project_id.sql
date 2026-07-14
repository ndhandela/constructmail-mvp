-- Migration: 007_clash_project_id.sql
-- Adds project_id to clash_reports/clash_assignments alongside the existing
-- project_key TEXT field. project_key is an opaque per-report grouping hash
-- (see frontend ClashAnalyzer.js:getProjectKey), not a real project name, so it
-- is kept as-is for display/grouping and NOT used to derive project_id.
--
-- Existing rows are backfilled to each user's Default Project by the Python
-- backfill routine in fastapi_backend/db.py (_backfill_clash_project_ids),
-- since matching a real project from the opaque project_key isn't possible.

ALTER TABLE clash_reports     ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);
ALTER TABLE clash_assignments ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);
