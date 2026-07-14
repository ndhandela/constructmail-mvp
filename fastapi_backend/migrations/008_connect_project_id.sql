-- Migration: 008_connect_project_id.sql
-- Adds nullable project_id to connect_queue/connect_log. Populated automatically
-- when an item originates from Mail (signals.project_id) or Clash
-- (clash_reports.project_id) — see enqueue_mail_signal/enqueue_clash_report in
-- routers/connect.py. Vendor-compliance items stay project_id=NULL since
-- vendors are org-wide, not scoped to a single job.

ALTER TABLE connect_queue ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);
ALTER TABLE connect_log   ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);
