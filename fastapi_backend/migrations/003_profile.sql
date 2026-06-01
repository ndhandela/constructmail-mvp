-- Migration: 003_profile.sql
-- Adds personal profile columns to users and creates clients company table

-- 1. Personal profile columns on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name  VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name   VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone       VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title   VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url  VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- 2. Company info table (one row per client/user account)
CREATE TABLE IF NOT EXISTS clients (
    id               SERIAL PRIMARY KEY,
    user_id          INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name     VARCHAR(255),
    company_phone    VARCHAR(50),
    company_address  VARCHAR(500),
    company_city     VARCHAR(100),
    company_state    VARCHAR(50),
    company_zip      VARCHAR(20),
    company_website  VARCHAR(255),
    company_size     VARCHAR(50),   -- e.g. '1-10', '11-50', '51-200', '200+'
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
