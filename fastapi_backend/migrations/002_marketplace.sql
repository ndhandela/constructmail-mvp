-- Migration: 002_marketplace.sql
-- Adds Marketplace module tables and alters vendors table

-- 1. Listing types (e.g. vendor, material, equipment)
CREATE TABLE IF NOT EXISTS marketplace_listing_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        VARCHAR(50)  UNIQUE NOT NULL,
    label       VARCHAR(100) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Core listing record (type-agnostic)
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_type_id         UUID NOT NULL REFERENCES marketplace_listing_types(id),
    submitted_by_client_id  INT  REFERENCES users(id),
    submitted_by_user_id    INT  REFERENCES users(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'flagged', 'removed')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Vendor-specific detail record (one-to-one with a listing)
CREATE TABLE IF NOT EXISTS marketplace_vendor_details (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID UNIQUE NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    trade           VARCHAR(100),
    location        VARCHAR(255),
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    website         VARCHAR(255),
    description     TEXT
);

-- 4. Reviews for any listing
CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id          UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    reviewer_client_id  INT  REFERENCES users(id),
    reviewer_user_id    INT  REFERENCES users(id),
    rating              INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Alter vendors table to track sharing status
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS shared_to_marketplace    BOOLEAN DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS marketplace_listing_id   UUID    REFERENCES marketplace_listings(id);

-- 6. Seed the vendor listing type
INSERT INTO marketplace_listing_types (slug, label)
VALUES ('vendor', 'Vendors')
ON CONFLICT (slug) DO NOTHING;
