-- Migration: 005_project_vendors.sql
-- Adds project_vendors join table so a vendor can be linked to multiple projects
-- (one vendor can work multiple jobs). vendors itself stays global/unscoped.

CREATE TABLE IF NOT EXISTS project_vendors (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id),
  vendor_id INT NOT NULL REFERENCES vendors(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, vendor_id)
);
