-- Migration: 006_project_marketplace_saves.sql
-- Marketplace browsing stays org-wide. This join table lets a GC pull a listing
-- into a specific job without mutating the shared listing (one listing can be
-- saved to several projects).

CREATE TABLE IF NOT EXISTS project_marketplace_saves (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
  saved_by_user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, listing_id)
);
