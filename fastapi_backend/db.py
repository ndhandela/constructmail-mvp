import os
import asyncpg
from dotenv import load_dotenv
from services.project_helpers import get_or_create_default_project

load_dotenv()

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=os.getenv("DATABASE_URL"))
    return _pool


async def init_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE EXTENSION IF NOT EXISTS pgcrypto;

            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                company VARCHAR(255),
                full_name TEXT,
                role TEXT,
                password_hash TEXT,
                reset_token TEXT,
                reset_token_expires TIMESTAMP,
                gmail_access_token TEXT,
                gmail_refresh_token TEXT,
                outlook_access_token TEXT,
                outlook_refresh_token TEXT,
                outlook_token_expires TIMESTAMP,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id),
                name VARCHAR(255) NOT NULL,
                project_number VARCHAR(100),
                client_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS email_threads (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id),
                raw_text TEXT NOT NULL,
                summary TEXT,
                decisions TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS action_items (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id),
                description TEXT NOT NULL,
                assigned_to VARCHAR(255),
                due_date VARCHAR(50),
                status VARCHAR(50) DEFAULT 'open',
                source_id INT,
                source_type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS signals (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id),
                raw_text TEXT,
                signal_type VARCHAR(100),
                confidence FLOAT,
                status VARCHAR(50) DEFAULT 'flagged',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS meeting_notes (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id),
                raw_text TEXT,
                attendees TEXT,
                decisions TEXT,
                action_items TEXT,
                open_issues TEXT,
                summary TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                magic_token TEXT,
                is_verified BOOLEAN DEFAULT FALSE,
                expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours'
            );

            CREATE TABLE IF NOT EXISTS procore_tokens (
                user_id TEXT PRIMARY KEY,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS clash_reports (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                test_name TEXT,
                file_name TEXT,
                total_clashes INTEGER DEFAULT 0,
                new_clashes INTEGER DEFAULT 0,
                active_clashes INTEGER DEFAULT 0,
                reviewed_clashes INTEGER DEFAULT 0,
                critical_clashes INTEGER DEFAULT 0,
                high_clashes INTEGER DEFAULT 0,
                project_key TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS clash_assignments (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                project_key TEXT NOT NULL,
                clash_name TEXT NOT NULL,
                assigned_to TEXT,
                discipline TEXT,
                notes TEXT,
                status TEXT DEFAULT 'open',
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, project_key, clash_name)
            );

            CREATE TABLE IF NOT EXISTS admin_users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                admin_level VARCHAR(50) NOT NULL CHECK (admin_level IN ('super_admin', 'client_admin')),
                client_id INT REFERENCES users(id) ON DELETE CASCADE,
                permissions JSONB DEFAULT '{"pricing": true, "features": true, "users": true}',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS module_pricing (
                id SERIAL PRIMARY KEY,
                is_global BOOLEAN DEFAULT FALSE,
                client_id INT REFERENCES users(id) ON DELETE CASCADE,
                module_name VARCHAR(50) NOT NULL,
                monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
                billing_cycle VARCHAR(50) DEFAULT 'monthly',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by_admin_id INT REFERENCES admin_users(id),
                UNIQUE(client_id, module_name),
                UNIQUE(module_name, is_global)
            );

            CREATE TABLE IF NOT EXISTS feature_flags (
                id SERIAL PRIMARY KEY,
                is_global BOOLEAN DEFAULT FALSE,
                client_id INT REFERENCES users(id) ON DELETE CASCADE,
                feature_key VARCHAR(255) NOT NULL,
                feature_name VARCHAR(255),
                module VARCHAR(50),
                is_enabled BOOLEAN DEFAULT FALSE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by_admin_id INT REFERENCES admin_users(id),
                UNIQUE(client_id, feature_key),
                UNIQUE(feature_key, is_global)
            );

            CREATE TABLE IF NOT EXISTS admin_activity_log (
                id SERIAL PRIMARY KEY,
                admin_user_id INT NOT NULL REFERENCES admin_users(id),
                action VARCHAR(100),
                resource_type VARCHAR(50),
                resource_id INT,
                changes JSONB,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS client_subscriptions (
                id SERIAL PRIMARY KEY,
                client_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                active_modules JSONB DEFAULT '{"mail": false, "clash": false, "vendors": false, "marketplace": false}',
                monthly_spend DECIMAL(10,2) DEFAULT 0,
                total_spend DECIMAL(12,2) DEFAULT 0,
                status VARCHAR(50) DEFAULT 'active',
                trial_ends_at TIMESTAMP,
                cancelled_at TIMESTAMP,
                next_billing_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS vendors (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                trade VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                email VARCHAR(255),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(50),
                zip VARCHAR(20),
                website VARCHAR(255),
                insurance_status VARCHAR(50) DEFAULT 'not_verified',
                insurance_expiry DATE,
                avg_rating DECIMAL(3,2) DEFAULT 0,
                review_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, city)
            );

            CREATE TABLE IF NOT EXISTS vendor_reviews (
                id SERIAL PRIMARY KEY,
                vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                rating_reliability INT CHECK (rating_reliability BETWEEN 1 AND 5),
                rating_cost INT CHECK (rating_cost BETWEEN 1 AND 5),
                rating_quality INT CHECK (rating_quality BETWEEN 1 AND 5),
                rating_communication INT CHECK (rating_communication BETWEEN 1 AND 5),
                rating_insurance INT CHECK (rating_insurance BETWEEN 1 AND 5),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(vendor_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS vendor_accounts (
                id SERIAL PRIMARY KEY,
                vendor_id INT NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_verified BOOLEAN DEFAULT FALSE,
                verified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS vendor_imports (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
                import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS vendor_profile_views (
                id SERIAL PRIMARY KEY,
                vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
                user_id INT REFERENCES users(id) ON DELETE SET NULL,
                viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS vendor_usage_tracking (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
                action_type VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS connect_queue (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                module TEXT NOT NULL CHECK (module IN ('mail','clash','vendor')),
                type TEXT NOT NULL CHECK (type IN ('rfi','change_order','clash','compliance')),
                title TEXT NOT NULL,
                detail TEXT,
                priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','pushed','dismissed')),
                source_id TEXT,
                pmis_target TEXT CHECK (pmis_target IN ('procore','kahua')),
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS connect_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                queue_item_id UUID REFERENCES connect_queue(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                module TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('success','failed')),
                error_message TEXT,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW()
            );

            ALTER TABLE vendors ADD COLUMN IF NOT EXISTS connect_status TEXT DEFAULT NULL;
            ALTER TABLE signals ADD COLUMN IF NOT EXISTS connect_status TEXT DEFAULT NULL;
            ALTER TABLE clash_reports ADD COLUMN IF NOT EXISTS connect_status TEXT DEFAULT NULL;

            -- Marketplace tables (migration 002)
            CREATE TABLE IF NOT EXISTS marketplace_listing_types (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug       VARCHAR(50)  UNIQUE NOT NULL,
                label      VARCHAR(100) NOT NULL,
                is_active  BOOLEAN      NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS marketplace_listings (
                id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                listing_type_id        UUID NOT NULL REFERENCES marketplace_listing_types(id),
                submitted_by_client_id INT  REFERENCES users(id),
                submitted_by_user_id   INT  REFERENCES users(id),
                status                 VARCHAR(20) NOT NULL DEFAULT 'active'
                                           CHECK (status IN ('active', 'flagged', 'removed')),
                created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS marketplace_vendor_details (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                listing_id    UUID UNIQUE NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
                name          VARCHAR(255) NOT NULL,
                trade         VARCHAR(100),
                location      VARCHAR(255),
                contact_email VARCHAR(255),
                contact_phone VARCHAR(50),
                website       VARCHAR(255),
                description   TEXT
            );

            CREATE TABLE IF NOT EXISTS marketplace_reviews (
                id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                listing_id         UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
                reviewer_client_id INT  REFERENCES users(id),
                reviewer_user_id   INT  REFERENCES users(id),
                rating             INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                comment            TEXT,
                created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE vendors ADD COLUMN IF NOT EXISTS shared_to_marketplace  BOOLEAN DEFAULT false;
            ALTER TABLE vendors ADD COLUMN IF NOT EXISTS marketplace_listing_id UUID    REFERENCES marketplace_listings(id);

            -- Ensure existing client_subscriptions rows have marketplace key
            UPDATE client_subscriptions
            SET active_modules = active_modules || '{"marketplace": false}'::jsonb
            WHERE active_modules -> 'marketplace' IS NULL;

            -- Seed vendor listing type
            INSERT INTO marketplace_listing_types (slug, label)
            VALUES ('vendor', 'Vendors')
            ON CONFLICT (slug) DO NOTHING;

            -- Profile columns (migration 003)
            ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name  VARCHAR(100);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name   VARCHAR(100);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone       VARCHAR(50);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title   VARCHAR(100);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url  VARCHAR(500);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

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
                company_size     VARCHAR(50),
                updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- Draft replies (migration 004)
            CREATE TABLE IF NOT EXISTS draft_replies (
                id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id            INT NOT NULL REFERENCES users(id),
                source_email_id    VARCHAR NOT NULL,
                provider           VARCHAR NOT NULL CHECK (provider IN ('gmail', 'outlook')),
                thread_id          VARCHAR NOT NULL,
                ai_generated_body  TEXT NOT NULL,
                edited_body        TEXT,
                status             VARCHAR NOT NULL DEFAULT 'pending_review'
                                       CHECK (status IN ('pending_review', 'approved', 'sent', 'discarded')),
                created_at         TIMESTAMPTZ DEFAULT now(),
                sent_at            TIMESTAMPTZ,
                sent_message_id    VARCHAR
            );

            CREATE INDEX IF NOT EXISTS idx_draft_replies_user_status ON draft_replies(user_id, status);

            ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_send_scope_granted   BOOLEAN DEFAULT false;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_send_scope_granted BOOLEAN DEFAULT false;

            -- Project-vendor linking (migration 005)
            CREATE TABLE IF NOT EXISTS project_vendors (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id),
                vendor_id INT NOT NULL REFERENCES vendors(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, vendor_id)
            );

            -- Project marketplace saves (migration 006)
            CREATE TABLE IF NOT EXISTS project_marketplace_saves (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id),
                listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
                saved_by_user_id INT REFERENCES users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(project_id, listing_id)
            );

            -- Clash project scoping (migration 007)
            ALTER TABLE clash_reports     ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);
            ALTER TABLE clash_assignments ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);

            -- Connect project scoping (migration 008)
            ALTER TABLE connect_queue ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);
            ALTER TABLE connect_log   ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);

            -- Project membership (migration 009)
            CREATE TABLE IF NOT EXISTS project_members (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL DEFAULT 'contributor' CHECK (role IN ('owner', 'contributor', 'viewer')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(project_id, user_id)
            );

            -- Project invites for emails without an account yet (migration 010)
            CREATE TABLE IF NOT EXISTS project_invites (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'contributor' CHECK (role IN ('contributor', 'viewer')),
                accepted BOOLEAN NOT NULL DEFAULT false,
                invited_by INT REFERENCES users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(project_id, email)
            );

            -- migration 011: project_invites.status -> accepted boolean.
            -- CREATE TABLE IF NOT EXISTS above is a no-op on a pre-existing
            -- table, so the new column has to be added explicitly before the
            -- backfill/drop below (which is itself guarded to be a no-op once
            -- `status` has already been dropped).
            ALTER TABLE project_invites ADD COLUMN IF NOT EXISTS accepted BOOLEAN NOT NULL DEFAULT false;

            DO $mig011$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'project_invites' AND column_name = 'status'
                ) THEN
                    UPDATE project_invites SET accepted = true WHERE status = 'accepted';
                    ALTER TABLE project_invites DROP COLUMN status;
                END IF;
            END
            $mig011$;

            -- Links a POMAR project to a Procore project, so Clash's Procore
            -- project picker doesn't ask again once one is chosen (migration 012)
            CREATE TABLE IF NOT EXISTS project_procore_links (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
                procore_project_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        await _backfill_clash_project_ids(conn)
        await _backfill_vendor_and_connect_project_ids(conn)
        await _backfill_project_members(conn)

    print("✓ Database initialized")


async def _backfill_clash_project_ids(conn):
    """
    One-time (idempotent) backfill for migration 007. clash_reports/clash_assignments
    predate project scoping and only carry a TEXT user_id plus a project_key that's an
    opaque per-report hash (see ClashAnalyzer.js:getProjectKey) — not a real project
    name. There's nothing meaningful to match project_key against, so every existing
    row is assigned to its user's Default Project instead. Rows whose user_id isn't a
    valid users.id (legacy/test data) are left untouched rather than guessed at.
    """
    user_ids = await conn.fetch(
        """SELECT DISTINCT user_id FROM (
             SELECT user_id FROM clash_reports WHERE project_id IS NULL
             UNION
             SELECT user_id FROM clash_assignments WHERE project_id IS NULL
           ) t"""
    )
    for row in user_ids:
        raw_user_id = row["user_id"]
        if not raw_user_id or not str(raw_user_id).isdigit():
            continue
        uid = int(raw_user_id)
        user_exists = await conn.fetchval("SELECT id FROM users WHERE id = $1", uid)
        if not user_exists:
            continue
        project_id = await get_or_create_default_project(conn, uid)
        await conn.execute(
            "UPDATE clash_reports SET project_id = $1 WHERE user_id = $2 AND project_id IS NULL",
            project_id, raw_user_id,
        )
        await conn.execute(
            "UPDATE clash_assignments SET project_id = $1 WHERE user_id = $2 AND project_id IS NULL",
            project_id, raw_user_id,
        )


async def _backfill_vendor_and_connect_project_ids(conn):
    """
    One-time (idempotent) backfill for migration 009. Assigns pre-existing
    vendor_imports links and connect_queue/connect_log rows to each user's
    Default Project, so nothing disappears from the UI once project scoping
    ships. vendor_imports is the only user<->vendor relationship that predates
    project_vendors, so each imported vendor is linked to the importing user's
    Default Project.
    """
    imports = await conn.fetch(
        """SELECT DISTINCT vi.user_id, vi.vendor_id
           FROM vendor_imports vi
           LEFT JOIN project_vendors pv ON pv.vendor_id = vi.vendor_id
           WHERE pv.id IS NULL"""
    )
    for row in imports:
        project_id = await get_or_create_default_project(conn, row["user_id"])
        await conn.execute(
            "INSERT INTO project_vendors (project_id, vendor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            project_id, row["vendor_id"],
        )

    connect_user_ids = await conn.fetch(
        """SELECT DISTINCT user_id FROM (
             SELECT user_id FROM connect_queue WHERE user_id IS NOT NULL AND project_id IS NULL
             UNION
             SELECT user_id FROM connect_log WHERE user_id IS NOT NULL AND project_id IS NULL
           ) t"""
    )
    for row in connect_user_ids:
        uid = row["user_id"]
        project_id = await get_or_create_default_project(conn, uid)
        await conn.execute(
            "UPDATE connect_queue SET project_id = $1 WHERE user_id = $2 AND project_id IS NULL",
            project_id, uid,
        )
        await conn.execute(
            "UPDATE connect_log SET project_id = $1 WHERE user_id = $2 AND project_id IS NULL",
            project_id, uid,
        )


async def _backfill_project_members(conn):
    """
    One-time (idempotent) backfill for migration 009. project_members didn't exist
    before this migration, so every project's current owning user_id (projects.user_id)
    is inserted as that project's 'owner' — otherwise every pre-existing project would
    vanish from GET /api/projects once it switches to a project_members-based query.
    """
    await conn.execute(
        """INSERT INTO project_members (project_id, user_id, role)
           SELECT id, user_id, 'owner' FROM projects
           ON CONFLICT (project_id, user_id) DO NOTHING"""
    )
