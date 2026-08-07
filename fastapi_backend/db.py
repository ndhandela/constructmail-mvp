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

            -- Invite-only accounts: companies become the unit of module access,
            -- replacing per-user client_subscriptions (migration 013). Created
            -- here, before admin_users/module_pricing/feature_flags, so those
            -- tables can reference companies(id) from the start (migration 014).
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                active_modules JSONB DEFAULT '{"mail": false, "clash": false, "vendors": false, "marketplace": false}',
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                company_id INT REFERENCES companies(id) ON DELETE CASCADE,
                permissions JSONB DEFAULT '{"pricing": true, "features": true, "users": true}',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS module_pricing (
                id SERIAL PRIMARY KEY,
                is_global BOOLEAN DEFAULT FALSE,
                company_id INT REFERENCES companies(id) ON DELETE CASCADE,
                module_name VARCHAR(50) NOT NULL,
                monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
                billing_cycle VARCHAR(50) DEFAULT 'monthly',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by_admin_id INT REFERENCES admin_users(id),
                UNIQUE(company_id, module_name),
                UNIQUE(module_name, is_global)
            );

            CREATE TABLE IF NOT EXISTS feature_flags (
                id SERIAL PRIMARY KEY,
                is_global BOOLEAN DEFAULT FALSE,
                company_id INT REFERENCES companies(id) ON DELETE CASCADE,
                feature_key VARCHAR(255) NOT NULL,
                feature_name VARCHAR(255),
                module VARCHAR(50),
                is_enabled BOOLEAN DEFAULT FALSE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by_admin_id INT REFERENCES admin_users(id),
                UNIQUE(company_id, feature_key),
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

            ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_level VARCHAR(20) DEFAULT 'member';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_expires TIMESTAMP;
            ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

            -- admin_users/module_pricing/feature_flags previously scoped to a
            -- single users.id under the old 1:1 user-as-client model. Companies
            -- are now the unit of tenancy, so these move to company_id
            -- referencing companies(id) instead (migration 014). Existing
            -- client_id values were users.id and aren't valid companies.id, so
            -- they're cleared rather than carried over.
            DO $mig014$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'admin_users' AND column_name = 'client_id'
                ) THEN
                    ALTER TABLE admin_users RENAME COLUMN client_id TO company_id;
                    UPDATE admin_users SET company_id = NULL;
                    ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_client_id_fkey;
                    ALTER TABLE admin_users ADD CONSTRAINT admin_users_company_id_fkey
                        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'module_pricing' AND column_name = 'client_id'
                ) THEN
                    ALTER TABLE module_pricing RENAME COLUMN client_id TO company_id;
                    UPDATE module_pricing SET company_id = NULL;
                    ALTER TABLE module_pricing DROP CONSTRAINT IF EXISTS module_pricing_client_id_fkey;
                    ALTER TABLE module_pricing ADD CONSTRAINT module_pricing_company_id_fkey
                        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'feature_flags' AND column_name = 'client_id'
                ) THEN
                    ALTER TABLE feature_flags RENAME COLUMN client_id TO company_id;
                    UPDATE feature_flags SET company_id = NULL;
                    ALTER TABLE feature_flags DROP CONSTRAINT IF EXISTS feature_flags_client_id_fkey;
                    ALTER TABLE feature_flags ADD CONSTRAINT feature_flags_company_id_fkey
                        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
                END IF;
            END
            $mig014$;

            ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id);

            -- UNIQUE(module_name, is_global) / UNIQUE(feature_key, is_global) let
            -- any two non-global rows for the same module/feature collide with
            -- each other regardless of company, since is_global is false for
            -- both - blocking a second company from saving pricing/flags on a
            -- module/feature a different company already has (migration 015).
            -- Per-company uniqueness is already covered by
            -- UNIQUE(company_id, module_name) / UNIQUE(company_id, feature_key),
            -- so these are replaced with partial indexes that only dedupe among
            -- global rows.
            ALTER TABLE module_pricing DROP CONSTRAINT IF EXISTS module_pricing_module_name_is_global_key;
            ALTER TABLE feature_flags DROP CONSTRAINT IF EXISTS feature_flags_feature_key_is_global_key;

            CREATE UNIQUE INDEX IF NOT EXISTS module_pricing_global_unique
                ON module_pricing (module_name) WHERE is_global = true;
            CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_global_unique
                ON feature_flags (feature_key) WHERE is_global = true;

            -- The client_admin tier was built for a company-scoped admin concept
            -- that's now redundant with the GC owner/company model
            -- (users.permission_level). Renamed to 'admin': a POMAR team member
            -- with reduced (non-super) admin permissions, not scoped to a
            -- company (migration 016).
            ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_admin_level_check;
            UPDATE admin_users SET admin_level = 'admin' WHERE admin_level = 'client_admin';
            ALTER TABLE admin_users ADD CONSTRAINT admin_users_admin_level_check
                CHECK (admin_level IN ('super_admin', 'admin'));

            -- System logs: server exceptions, frontend error reports, and email
            -- delivery attempts, surfaced together in the admin Logs page
            -- (migration 017).
            CREATE TABLE IF NOT EXISTS system_logs (
                id SERIAL PRIMARY KEY,
                source VARCHAR(20) NOT NULL CHECK (source IN ('server', 'frontend', 'email')),
                level VARCHAR(10) NOT NULL CHECK (level IN ('error', 'warning', 'info')),
                message TEXT NOT NULL,
                detail TEXT,
                company_id INT REFERENCES companies(id) ON DELETE SET NULL,
                user_email VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Module access (Mail/Clash/Vendors) and feature flags are now
            -- actually enforced (migration 018) instead of being cosmetic, and
            -- fail closed by design. Companies created before this change only
            -- have the untouched all-false column default and no feature_flags
            -- rows, so without a backfill they'd suddenly lose access to
            -- everything they were already using. Mail/Clash/Vendors are free
            -- tools this migration turns on unconditionally for every company
            -- (an equality match against the untouched all-false default would
            -- silently skip any company with even one unrelated field already
            -- toggled); marketplace is intentionally left untouched.
            UPDATE companies SET active_modules = active_modules || '{"mail": true, "clash": true, "vendors": true}'::jsonb;

            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            SELECT id, 'mail_intelligence', 'Mail Intelligence', 'mail', true, false FROM companies
            ON CONFLICT (company_id, feature_key) DO NOTHING;
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            SELECT id, 'clash_detection', 'Clash Detection', 'clash', true, false FROM companies
            ON CONFLICT (company_id, feature_key) DO NOTHING;
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            SELECT id, 'vendor_search', 'Vendor Search', 'vendors', true, false FROM companies
            ON CONFLICT (company_id, feature_key) DO NOTHING;

            -- Feature flags become the single source of truth for module
            -- access (Mail/Clash/Vendors/Marketplace), replacing
            -- companies.active_modules and the narrower mail_intelligence/
            -- clash_detection/vendor_search keys, which are now fully
            -- superseded by module-level keys (migration 019). Seeds from
            -- each company's CURRENT active_modules so access doesn't
            -- silently change during cutover; ON CONFLICT DO NOTHING so
            -- anything already set (e.g. by a prior save) is left alone.
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            SELECT id, 'mail', 'Mail Access', 'mail', COALESCE((active_modules->>'mail')::boolean, true), false FROM companies
            ON CONFLICT (company_id, feature_key) DO NOTHING;
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            SELECT id, 'clash', 'Clash Access', 'clash', COALESCE((active_modules->>'clash')::boolean, true), false FROM companies
            ON CONFLICT (company_id, feature_key) DO NOTHING;
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            SELECT id, 'vendors', 'Vendors Access', 'vendors', COALESCE((active_modules->>'vendors')::boolean, true), false FROM companies
            ON CONFLICT (company_id, feature_key) DO NOTHING;
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            SELECT id, 'marketplace', 'Marketplace Access', 'marketplace', COALESCE((active_modules->>'marketplace')::boolean, false), false FROM companies
            ON CONFLICT (company_id, feature_key) DO NOTHING;

            DELETE FROM feature_flags WHERE feature_key IN ('mail_intelligence', 'clash_detection', 'vendor_search');

            -- POMAR Trust: RERA compliance module for India-region companies only
            -- (migration 020). region/entity_name gate a company into the module;
            -- 'trust' itself is just another feature_flags feature_key, reusing the
            -- existing module-access machinery rather than a parallel org_modules table.
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS region VARCHAR(2) NOT NULL DEFAULT 'US' CHECK (region IN ('US','IN'));
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS entity_name VARCHAR(255);

            -- Only meaningful once a company has Trust enabled; NULL for every
            -- other user. 'owner' is never actually required in practice — a
            -- company owner (users.permission_level = 'owner') always resolves to
            -- full Trust access regardless of this column (see
            -- services/trust_access.py) — but the value is still allowed here so
            -- an owner row can be set explicitly from the admin/team UI.
            ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_role VARCHAR(20) CHECK (trust_role IN ('owner','site_data','compliance_reviewer'));

            -- admin_activity_log previously only recorded admin_users actions.
            -- Trust events are performed by regular users (site engineers, GC
            -- owners), so the actor FK is widened rather than standing up a
            -- second, parallel activity log the spec explicitly asked to avoid.
            ALTER TABLE admin_activity_log ADD COLUMN IF NOT EXISTS module_key VARCHAR(50);
            ALTER TABLE admin_activity_log ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE admin_activity_log ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
            ALTER TABLE admin_activity_log ALTER COLUMN admin_user_id DROP NOT NULL;
            -- actor_check itself is declared once, in its final/widest form,
            -- down in the marketplace migration (026) below — NOT here.
            -- init_db() re-runs this whole script on every startup, so
            -- re-declaring an intermediate narrower version of the same
            -- constraint at this point would transiently reject rows (e.g.
            -- system-generated ones) that only satisfy the later, wider
            -- definition, breaking every subsequent restart once such a row
            -- exists.

            CREATE TABLE IF NOT EXISTS trust_projects (
                id SERIAL PRIMARY KEY,
                company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                project_name VARCHAR(255) NOT NULL,
                rera_registration_number VARCHAR(100),
                rera_state VARCHAR(10) NOT NULL DEFAULT 'TG',
                unit_count INT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- Raw bytes never land here — storage_path is an R2 object key
            -- (pomar-trust-uploads bucket), Public Access disabled, backend-only
            -- reads. TODO: lifecycle policy to auto-delete the raw object once
            -- parse_status = 'parsed' is confirmed is not built in v1.
            CREATE TABLE IF NOT EXISTS trust_uploads (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES trust_projects(id) ON DELETE CASCADE,
                upload_type VARCHAR(20) NOT NULL CHECK (upload_type IN ('whatsapp','email')),
                storage_path VARCHAR(500) NOT NULL,
                uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
                uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                parse_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending','parsed','failed')),
                contains_pii BOOLEAN NOT NULL DEFAULT true
            );

            CREATE TABLE IF NOT EXISTS trust_extractions (
                id SERIAL PRIMARY KEY,
                upload_id INT NOT NULL REFERENCES trust_uploads(id) ON DELETE CASCADE,
                extraction_type VARCHAR(30) NOT NULL CHECK (extraction_type IN ('progress_update','milestone','photo_reference','change_trigger')),
                content_summary TEXT,
                source_excerpt VARCHAR(500),
                confidence FLOAT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS trust_qpr_drafts (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES trust_projects(id) ON DELETE CASCADE,
                quarter VARCHAR(20) NOT NULL,
                due_date DATE,
                physical_progress_pct NUMERIC(5,2),
                financial_progress_pct NUMERIC(5,2),
                escrow_status TEXT,
                draft_json JSONB,
                status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','filed')),
                generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                filed_at TIMESTAMPTZ,
                UNIQUE(project_id, quarter)
            );

            CREATE TABLE IF NOT EXISTS trust_change_alerts (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES trust_projects(id) ON DELETE CASCADE,
                extraction_id INT REFERENCES trust_extractions(id) ON DELETE SET NULL,
                alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('timeline_shift','layout_change','amenity_change')),
                severity VARCHAR(10) NOT NULL CHECK (severity IN ('high','low')),
                description TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','notice_drafted','resolved','dismissed')),
                detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS trust_buyer_notices (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES trust_projects(id) ON DELETE CASCADE,
                alert_id INT REFERENCES trust_change_alerts(id) ON DELETE SET NULL,
                unit_reference VARCHAR(100),
                notice_type VARCHAR(30) NOT NULL CHECK (notice_type IN ('qpr_summary','change_disclosure')),
                content TEXT NOT NULL,
                sent_by INT REFERENCES users(id) ON DELETE SET NULL,
                sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','confirmed','failed')),
                proof_reference VARCHAR(255)
            );

            -- UNIQUE(qpr_draft_id, reminder_type) is what makes the daily cron
            -- idempotent: re-running the scan never inserts a second 'due_3d' etc.
            CREATE TABLE IF NOT EXISTS trust_reminders (
                id SERIAL PRIMARY KEY,
                qpr_draft_id INT NOT NULL REFERENCES trust_qpr_drafts(id) ON DELETE CASCADE,
                reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('due_7d','due_3d','due_1d','overdue')),
                sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                channel VARCHAR(20) NOT NULL CHECK (channel IN ('in_app','email')),
                UNIQUE(qpr_draft_id, reminder_type)
            );

            -- Widen rera_state from TG-only to every state stubbed in
            -- services/state_rera_profiles.py's STATE_RERA_PROFILES (migration
            -- 021) — a project can be created for any recognized state even
            -- before QPR generation is implemented for it (Change Alerts/Audit
            -- Trail are state-agnostic); this list must be kept in sync with
            -- that registry's keys since Postgres can't reference it directly.
            ALTER TABLE trust_projects DROP CONSTRAINT IF EXISTS trust_projects_rera_state_check;
            ALTER TABLE trust_projects ADD CONSTRAINT trust_projects_rera_state_check
                CHECK (rera_state IN ('TG','TN','KA','MH','AP','GJ','UP','DL'));

            -- Optional link from a Trust RERA project to the generic
            -- cross-module projects table Mail/Clash/Vendors already use
            -- (migration 022) — nullable, no backfill: existing rows keep
            -- linked_project_id = NULL and work exactly as before. The two
            -- tables are deliberately not merged; this is just a pointer so
            -- an org using both doesn't have to model the same physical
            -- project twice. ON DELETE SET NULL rather than CASCADE — a
            -- generic project being removed shouldn't take the RERA project
            -- and its compliance history down with it.
            ALTER TABLE trust_projects ADD COLUMN IF NOT EXISTS linked_project_id INT REFERENCES projects(id) ON DELETE SET NULL;

            -- Project info fields for the Projects edit page (migration 023).
            -- No `owner` column on purpose: project_members.role='owner' is
            -- already the permission-bearing owner (it's what gates
            -- POST /{project_id}/invite), so a second freeform owner label
            -- here would just be a second, driftable source of truth. The
            -- edit page keeps deriving "Owner" from project_members, same as
            -- before, and doesn't let it be edited as plain text.
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS location VARCHAR(255);
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('planning', 'active', 'on_hold', 'completed'));

            -- UNIQUE(company_id, name) (migration 024). Follow-up to 023:
            -- company_id=11 had 4 rows all named exactly "MyHome Project 1"
            -- (ids 36-39, zero rows referencing any of them anywhere per a
            -- full scan of every table with a project_id column) — owner
            -- confirmed ids 37-39 as safe-to-delete duplicates of 36, deleted
            -- outside this migration (a one-time data cleanup keyed to those
            -- specific row ids has no business living in code that runs
            -- against every environment). A plain unique index (not a named
            -- UNIQUE constraint) to match this file's existing idempotency
            -- idiom — see module_pricing_global_unique/feature_flags_global_unique
            -- above — since `ADD CONSTRAINT` has no IF NOT EXISTS guard and
            -- would error on every restart after the first. NULLs (rows with
            -- no company_id, e.g. each user's own "Default Project") are
            -- unaffected — Postgres unique indexes never collide two NULLs.
            CREATE UNIQUE INDEX IF NOT EXISTS projects_company_id_name_key ON projects (company_id, name);

            -- POMAR Capital Tracker (migration 025, restructured in
            -- migration 013 so work_items is the root entity). Unlike
            -- Trust, this is not India/RERA-specific and has no separate
            -- project concept of its own — everything FKs straight into
            -- the generic `projects` table every company already has
            -- (mail/clash/vendors/marketplace all key off it). Access is
            -- gated only by the 'capital' feature flag (see
            -- services/access_control.py), with no region restriction.
            --
            -- Model: a project has work_items (the actual named tasks —
            -- "Pour footings", "Rough-in electrical"). Each work item can
            -- have milestones (schedule) and budget_items (cost) hanging
            -- off it directly. categories are project-scoped and shared
            -- across every work item in the project (e.g. "Electrical"
            -- tags budget_items under several different work items), which
            -- is what lets spend roll up by category across the whole
            -- project instead of staying siloed inside one work item — see
            -- services/capital_helpers.get_spend_by_category.
            --
            -- migration 013 assumes these tables are empty when it first
            -- runs (a prod truncation, not a backfill — the old schema had
            -- budget_items/milestones as project-level with no work_item_id
            -- at all, so there is nothing sane to backfill). The ALTER ...
            -- SET NOT NULL calls below will fail if run against rows that
            -- predate work_item_id/category_id.
            CREATE TABLE IF NOT EXISTS work_items (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started','in_progress','complete')),
                percent_complete NUMERIC(5,2) NOT NULL DEFAULT 0,
                sequence INT,
                due_date DATE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS work_items_project_id_idx ON work_items (project_id);
            -- Pre-migration-013 columns from when work_items pointed at
            -- budget_items/milestones instead of the other way around.
            ALTER TABLE work_items DROP COLUMN IF EXISTS budget_item_id;
            ALTER TABLE work_items DROP COLUMN IF EXISTS milestone_id;

            -- Seeds a global 'capital' flag row so it exists (defaulting OFF)
            -- for every company immediately, the same way Mail/Clash/Vendors/
            -- Marketplace/Trust are all just feature_flags rows — without
            -- this, an admin would have to know to create the row from
            -- scratch before they could ever turn Capital Tracker on.
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            VALUES (NULL, 'capital', 'Capital Tracker', 'capital', false, true)
            ON CONFLICT (feature_key) WHERE is_global = true DO NOTHING;

            -- Placeholder global pricing row so Capital Tracker shows up in
            -- the admin pricing page without further code changes, same as
            -- the other modules — monthly_price is 0 until an admin sets a
            -- real number.
            INSERT INTO module_pricing (is_global, company_id, module_name, monthly_price, billing_cycle, is_active)
            VALUES (true, NULL, 'capital', 0, 'monthly', true)
            ON CONFLICT (module_name) WHERE is_global = true DO NOTHING;

            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS categories_project_id_idx ON categories (project_id);
            CREATE UNIQUE INDEX IF NOT EXISTS categories_project_id_name_key ON categories (project_id, name);

            -- Milestones + work items extend Capital Tracker (not a new
            -- module — no new feature flag) with schedule/progress tracking
            -- alongside its existing budget_items, so a category can show
            -- "60% done but 85% spent" instead of dollars alone.
            CREATE TABLE IF NOT EXISTS milestones (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                target_date DATE,
                actual_date DATE,
                status VARCHAR(20) NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started','in_progress','at_risk','complete')),
                risk_flag BOOLEAN NOT NULL DEFAULT FALSE,
                risk_source VARCHAR(20) CHECK (risk_source IN ('manual','mail_signal','clash_signal','connect_signal')),
                notes TEXT,
                metadata JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS milestones_project_id_idx ON milestones (project_id);
            -- A milestone now belongs to exactly one work item instead of
            -- sitting directly on the project.
            ALTER TABLE milestones ADD COLUMN IF NOT EXISTS work_item_id INT REFERENCES work_items(id) ON DELETE CASCADE;
            ALTER TABLE milestones ALTER COLUMN work_item_id SET NOT NULL;
            CREATE INDEX IF NOT EXISTS milestones_work_item_id_idx ON milestones (work_item_id);

            -- Budget-vs-actual tracking, one row per work item per category.
            -- `metadata` JSONB exists so a future field — e.g. a linked
            -- draw reference for the planned capital_events table — can be
            -- added without a schema migration.
            CREATE TABLE IF NOT EXISTS budget_items (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                budgeted_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                committed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                actual_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
                notes TEXT,
                metadata JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS budget_items_project_id_idx ON budget_items (project_id);
            -- category is now a shared FK into the project-scoped
            -- `categories` table instead of a free-text column on this row,
            -- and every budget item belongs to exactly one work item.
            ALTER TABLE budget_items DROP COLUMN IF EXISTS category;
            ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS work_item_id INT REFERENCES work_items(id) ON DELETE CASCADE;
            ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS category_id INT REFERENCES categories(id) ON DELETE RESTRICT;
            ALTER TABLE budget_items ALTER COLUMN work_item_id SET NOT NULL;
            ALTER TABLE budget_items ALTER COLUMN category_id SET NOT NULL;
            CREATE INDEX IF NOT EXISTS budget_items_work_item_id_idx ON budget_items (work_item_id);
            CREATE INDEX IF NOT EXISTS budget_items_category_id_idx ON budget_items (category_id);

            -- Connect push (routers/connect.py push_queue_item) now makes a
            -- real Procore call instead of a stub, so it needs honest
            -- non-'pushed' outcomes: 'failed' for a real API error, and
            -- 'needs_manual' for change_order items Procore can't create
            -- freeform (see push_queue_item for why). Same idempotent
            -- drop/re-add style as admin_users_admin_level_check above.
            ALTER TABLE connect_queue DROP CONSTRAINT IF EXISTS connect_queue_status_check;
            ALTER TABLE connect_queue ADD CONSTRAINT connect_queue_status_check
                CHECK (status IN ('pending','reviewed','pushed','dismissed','failed','needs_manual'));

            -- Marketplace: public access + lead accounts (migration 026).
            -- Public/unauthenticated signup ("lead" accounts) is a new front
            -- door into `users` that bypasses the existing invite-only flow —
            -- account_status distinguishes these from invited/'active' accounts
            -- so require_feature_flag (services/access_control.py) can shut
            -- them out of every other module while Marketplace's own routes
            -- opt them in narrowly. account_type/account_source are separate
            -- columns (not reused from `role`/`permission_level`) since they
            -- describe the marketplace relationship (gc buyer vs sub vendor),
            -- not the company-hierarchy role those existing columns capture.
            ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) CHECK (account_type IN ('gc','sub'));
            ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (account_status IN ('lead','active'));
            ALTER TABLE users ADD COLUMN IF NOT EXISTS account_source VARCHAR(50);
            -- Every existing account on this platform came through the
            -- invite-only GC-side flow (admin.py company bootstrap /
            -- team.py teammate invite) — POMAR has no 'sub' accounts until
            -- marketplace claim-listing introduces them. Backfilling these
            -- as 'gc'/'invite' (rather than leaving NULL) keeps every
            -- already-invited user working against the new type='gc' gate
            -- on GET .../full. Safe to leave as a standing statement: new
            -- marketplace-lead accounts always get account_type set
            -- explicitly at creation, so they never match this WHERE clause.
            UPDATE users SET account_type = 'gc', account_source = COALESCE(account_source, 'invite')
            WHERE account_type IS NULL;

            ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS claimed_by INT REFERENCES users(id);
            -- verified is computed only (services/marketplace_verification.py) —
            -- never admin-settable — so the badge always reflects a real
            -- project_vendors relationship. See that file for why.
            ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
            ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS attestation_note TEXT;

            ALTER TABLE marketplace_vendor_details ADD COLUMN IF NOT EXISTS city  VARCHAR(100);
            ALTER TABLE marketplace_vendor_details ADD COLUMN IF NOT EXISTS state VARCHAR(2);

            ALTER TABLE marketplace_reviews ADD COLUMN IF NOT EXISTS is_hidden          BOOLEAN NOT NULL DEFAULT false;
            ALTER TABLE marketplace_reviews ADD COLUMN IF NOT EXISTS hidden_by_admin_id INT REFERENCES admin_users(id);
            ALTER TABLE marketplace_reviews ADD COLUMN IF NOT EXISTS hidden_reason      TEXT;
            ALTER TABLE marketplace_reviews ADD COLUMN IF NOT EXISTS hidden_at          TIMESTAMPTZ;
            ALTER TABLE marketplace_reviews ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

            -- Bearer-token layer for the new public-facing marketplace routes
            -- only (GET .../full, POST .../dispute) — every other route in
            -- this app still authenticates via a bare userId param, but those
            -- two are reachable by the open internet (not just invited
            -- teammates) and gate personal contact info / messaging, so a
            -- client-supplied userId alone isn't enough proof of identity.
            CREATE TABLE IF NOT EXISTS marketplace_session_tokens (
                id SERIAL PRIMARY KEY,
                token VARCHAR(64) UNIQUE NOT NULL,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
            );
            CREATE INDEX IF NOT EXISTS marketplace_session_tokens_token_idx ON marketplace_session_tokens (token);

            CREATE TABLE IF NOT EXISTS marketplace_dispute_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                review_id UUID NOT NULL REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
                sub_account_id INT NOT NULL REFERENCES users(id),
                message TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS marketplace_removal_requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
                requester_name  VARCHAR(255) NOT NULL,
                requester_email VARCHAR(255) NOT NULL,
                business_name   VARCHAR(255) NOT NULL,
                reason TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
                resolved_by_admin_id INT REFERENCES admin_users(id),
                resolved_at TIMESTAMPTZ,
                resolution_note TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- admin_activity_log's actor check (see migration 020 above) requires
            -- a human admin_user_id or user_id. The verified-badge recompute job
            -- (services/marketplace_verification.py) and anonymous public
            -- removal-request submissions have no human actor at all, so the
            -- check is widened once more with an explicit system-action escape
            -- hatch rather than a fabricated actor id.
            ALTER TABLE admin_activity_log ADD COLUMN IF NOT EXISTS is_system_action BOOLEAN NOT NULL DEFAULT false;
            -- resource_id predates any UUID-keyed resource (marketplace_listings/
            -- marketplace_reviews use UUID ids) — widened to text so
            -- log_marketplace_activity can log against them the same way
            -- log_admin_activity/log_trust_activity already log against INT ids.
            ALTER TABLE admin_activity_log ALTER COLUMN resource_id TYPE VARCHAR(64) USING resource_id::VARCHAR(64);
            ALTER TABLE admin_activity_log DROP CONSTRAINT IF EXISTS admin_activity_log_actor_check;
            ALTER TABLE admin_activity_log ADD CONSTRAINT admin_activity_log_actor_check
                CHECK (admin_user_id IS NOT NULL OR user_id IS NOT NULL OR is_system_action);

            -- POMAR Daily Logs (migration 012): a per-project field logbook —
            -- crew, weather, delays, materials, safety notes for a given day,
            -- with optional site photos. Same shape as Capital Tracker: FKs
            -- straight into the generic `projects` table (no region
            -- restriction, no separate project concept of its own), gated
            -- only by the 'daily_logs' feature flag. `metadata` JSONB exists
            -- so a future field can be added without a schema migration.
            CREATE TABLE IF NOT EXISTS daily_logs (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                logged_by_user_id INT NOT NULL REFERENCES users(id),
                log_date DATE NOT NULL,
                weather VARCHAR(100),
                crew_count INT,
                work_performed TEXT,
                delays_notes TEXT,
                delay_category VARCHAR(50) CHECK (delay_category IN ('weather','material','labor','other')),
                materials_notes TEXT,
                safety_notes TEXT,
                metadata JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS daily_logs_project_id_idx ON daily_logs (project_id);
            CREATE INDEX IF NOT EXISTS daily_logs_log_date_idx ON daily_logs (project_id, log_date DESC);

            -- Photos are never inlined into daily_logs itself: storage_path is
            -- an object key in the R2 'daily-log-photos' bucket (see
            -- services/r2_storage.py) — unlike Trust's private bucket, this
            -- one supports presigned GET urls since photos render in a
            -- frontend gallery.
            CREATE TABLE IF NOT EXISTS daily_log_photos (
                id SERIAL PRIMARY KEY,
                daily_log_id INT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
                storage_path TEXT NOT NULL,
                caption VARCHAR(255),
                uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS daily_log_photos_daily_log_id_idx ON daily_log_photos (daily_log_id);

            -- Seeds a global 'daily_logs' flag row so it exists (defaulting
            -- OFF) the same way Capital/Trust/Marketplace do — see the
            -- 'capital' seed above for why.
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            VALUES (NULL, 'daily_logs', 'Daily Logs', 'daily_logs', false, true)
            ON CONFLICT (feature_key) WHERE is_global = true DO NOTHING;

            -- Placeholder global pricing row so Daily Logs shows up in the
            -- admin pricing page without further code changes, same as the
            -- other modules — monthly_price is 0 until an admin sets a real
            -- number.
            INSERT INTO module_pricing (is_global, company_id, module_name, monthly_price, billing_cycle, is_active)
            VALUES (true, NULL, 'daily_logs', 0, 'monthly', true)
            ON CONFLICT (module_name) WHERE is_global = true DO NOTHING;

            -- Vendor Management (migration 027): lets a GC invite an outside
            -- company's user ("sub") onto one project, scoped to Daily Logs
            -- only for now. Deliberately NOT project_members — that table's
            -- roles (owner/contributor/viewer) are broad, all-module grants
            -- meant for the project-owning company's own staff, and this
            -- feature explicitly does not want that for a stranger's account.
            -- One row per (project_id, vendor_user_id) — invite/accept/
            -- remove/reinvite all flip this same row's status rather than
            -- inserting a new one, so the full history lives on one id.
            -- `role` is a freeform trade/specialty label the inviting GC
            -- types in (e.g. "Electrical") since vendor_user_id is very
            -- often a brand-new lead account, not a `vendors` directory row.
            -- Access is enforced by services/vendor_access.require_module_access,
            -- not services/access_control.require_feature_flag — that
            -- function unconditionally 403s any account_status='lead' user,
            -- and invited subs are exactly that, so a separate path is
            -- required, not redundant.
            CREATE TABLE IF NOT EXISTS project_vendor_access (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                vendor_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                invited_by_user_id INT NOT NULL REFERENCES users(id),
                role VARCHAR(100),
                status VARCHAR(20) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','removed')),
                invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                accepted_at TIMESTAMPTZ,
                removed_at TIMESTAMPTZ,
                UNIQUE(project_id, vendor_user_id)
            );
            CREATE INDEX IF NOT EXISTS project_vendor_access_vendor_user_id_idx ON project_vendor_access (vendor_user_id);
            CREATE INDEX IF NOT EXISTS project_vendor_access_project_id_idx ON project_vendor_access (project_id);

            -- Per-individual, per-module trial/license tracking for users who
            -- reach a module through a vendor-access grant, not through a
            -- company's feature_flags row. A sub invited onto three different
            -- GCs' projects has ONE 'daily_logs' row here, not three, and
            -- it's independent of company_id (a lead account has none). NOT
            -- redundant with feature_flags: feature_flags is per-company
            -- licensing for the inviting GC's own org; this is per-individual
            -- trial state for the outside sub. Both get checked, on the
            -- "member" vs "vendor" branch respectively, inside
            -- services/vendor_access.require_module_access.
            CREATE TABLE IF NOT EXISTS module_subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                module VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','canceled')),
                tier VARCHAR(50),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(user_id, module)
            );

            -- Optional work-item tag on a daily log. FKs into work_items, not
            -- budget_items: budget_items has no name field suited to a
            -- dropdown; work_items is the actual named-task concept and
            -- already links its own budget_item_id/milestone_id, so this
            -- reuses that instead of duplicating a name field onto daily_logs.
            ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS work_item_id INT REFERENCES work_items(id) ON DELETE SET NULL;

            -- POMAR Invoice Tracker (migration 028): upload and track vendor
            -- invoice PDFs against a project. Deliberately does NOT require
            -- the 'capital' feature flag — work_item_id/budget_item_id are
            -- both nullable so a company can run Invoice Tracker with
            -- Capital Tracker off, filing invoices at the project level
            -- only (see routers/invoices.py's own work-items/budget-items
            -- picker endpoints, which are gated by 'invoice_tracker' rather
            -- than reusing routers/capital.py's 'capital'-gated ones).
            -- Gated by its own 'invoice_tracker' feature flag.
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                work_item_id INT REFERENCES work_items(id) ON DELETE SET NULL,
                budget_item_id INT REFERENCES budget_items(id) ON DELETE SET NULL,
                uploaded_by INT NOT NULL REFERENCES users(id),
                vendor_name VARCHAR(255) NOT NULL,
                invoice_number VARCHAR(100),
                amount NUMERIC(12,2) NOT NULL,
                invoice_date DATE,
                due_date DATE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
                pdf_storage_path TEXT NOT NULL,
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS invoices_company_id_idx ON invoices (company_id);
            CREATE INDEX IF NOT EXISTS invoices_project_id_idx ON invoices (project_id);
            CREATE INDEX IF NOT EXISTS invoices_work_item_id_idx ON invoices (work_item_id);
            CREATE INDEX IF NOT EXISTS invoices_budget_item_id_idx ON invoices (budget_item_id);
            CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);

            -- Seeds a global 'invoice_tracker' flag row so it exists
            -- (defaulting OFF), same as every other module — see the
            -- 'capital' seed above for why.
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            VALUES (NULL, 'invoice_tracker', 'Invoice Tracker', 'invoice_tracker', false, true)
            ON CONFLICT (feature_key) WHERE is_global = true DO NOTHING;

            INSERT INTO module_pricing (is_global, company_id, module_name, monthly_price, billing_cycle, is_active)
            VALUES (true, NULL, 'invoice_tracker', 0, 'monthly', true)
            ON CONFLICT (module_name) WHERE is_global = true DO NOTHING;

            -- Internal team-member restriction: when set, require_feature_flag
            -- (services/access_control.py) 403s any feature_key other than
            -- this one — lets a GC owner scope a teammate to Invoice Tracker
            -- only, the same spirit as project_members already scoping them
            -- to specific projects. NULL (the default) means "no restriction
            -- beyond the company's own flags", matching every existing team
            -- member's behavior today.
            ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_module VARCHAR(50);

            -- External accountant accounts: a third users.account_type
            -- alongside the marketplace 'gc'/'sub' pair (migration 026). An
            -- accountant is read-only and company-scoped (not project-scoped
            -- like project_vendor_access) — see services/invoice_helpers.py.
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
            ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('gc','sub','accountant'));

            -- Company-scoped accountant invite/access, deliberately separate
            -- from project_vendor_access (project-scoped) and project_members
            -- (broad, all-module grants for the owning company's own staff) —
            -- mirrors project_vendor_access's status machine but keyed on
            -- company_id since an accountant's job is "see every invoice this
            -- GC has", not one project. invited_by_user_id is the GC owner
            -- who triggered an in-app invite (routers/invoice_accountant_access.py);
            -- invited_by_admin_id is set instead when POMAR staff trigger it
            -- from the admin portal (routers/admin.py) — exactly one of the
            -- two is ever set, the same either-actor idiom as
            -- admin_activity_log's actor check above.
            CREATE TABLE IF NOT EXISTS company_accountant_access (
                id SERIAL PRIMARY KEY,
                company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                accountant_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                invited_by_user_id INT REFERENCES users(id),
                invited_by_admin_id INT REFERENCES admin_users(id),
                status VARCHAR(20) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','removed')),
                invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                accepted_at TIMESTAMPTZ,
                removed_at TIMESTAMPTZ,
                UNIQUE(company_id, accountant_user_id),
                CHECK (invited_by_user_id IS NOT NULL OR invited_by_admin_id IS NOT NULL)
            );
            CREATE INDEX IF NOT EXISTS company_accountant_access_accountant_user_id_idx ON company_accountant_access (accountant_user_id);
            CREATE INDEX IF NOT EXISTS company_accountant_access_company_id_idx ON company_accountant_access (company_id);

            -- POMAR Documents (migration 015): project-scoped document
            -- storage shared between a GC and its Subs. company_id is the
            -- project's owning company (denormalized from projects.company_id,
            -- same idiom as invoices.company_id) — uploader_company_id is
            -- whichever company's user actually uploaded it, which may be a
            -- Sub, not the owner. Access is resolved per-request from these
            -- two, never cached (see services/document_helpers.py): a GC
            -- sees every document on its project; a Sub sees only its own
            -- uploader_company_id and documents explicitly granted to its
            -- company via document_access_grants below. Gated by its own
            -- 'documents' feature flag.
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                r2_key TEXT NOT NULL,
                content_type VARCHAR(100),
                size_bytes BIGINT,
                uploaded_by_user_id INT NOT NULL REFERENCES users(id),
                uploader_company_id INT NOT NULL REFERENCES companies(id),
                category VARCHAR(100),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS documents_project_id_idx ON documents (project_id);
            CREATE INDEX IF NOT EXISTS documents_company_id_idx ON documents (company_id);
            CREATE INDEX IF NOT EXISTS documents_uploader_company_id_idx ON documents (uploader_company_id);

            -- A GC's explicit grant of one document to one Sub company.
            -- revoked_at nullable + the unique constraint below let a grant
            -- be re-issued after revocation via ON CONFLICT ... SET
            -- revoked_at = NULL rather than accumulating duplicate rows
            -- (routers/documents.py's grant endpoint).
            CREATE TABLE IF NOT EXISTS document_access_grants (
                id SERIAL PRIMARY KEY,
                document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                granted_to_company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                granted_by_user_id INT NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                revoked_at TIMESTAMPTZ,
                UNIQUE(document_id, granted_to_company_id)
            );
            CREATE INDEX IF NOT EXISTS document_access_grants_document_id_idx ON document_access_grants (document_id);
            CREATE INDEX IF NOT EXISTS document_access_grants_company_id_idx ON document_access_grants (granted_to_company_id);

            -- Seeds a global 'documents' flag row so it exists (defaulting
            -- OFF), same pattern as every other module.
            INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
            VALUES (NULL, 'documents', 'Documents', 'documents', false, true)
            ON CONFLICT (feature_key) WHERE is_global = true DO NOTHING;

            INSERT INTO module_pricing (is_global, company_id, module_name, monthly_price, billing_cycle, is_active)
            VALUES (true, NULL, 'documents', 0, 'monthly', true)
            ON CONFLICT (module_name) WHERE is_global = true DO NOTHING;

            -- Single-level Documents folders (migration 016): no parent_id —
            -- folders never nest. created_by must be a GC team member at
            -- creation time (enforced in services/document_helpers.py, not
            -- here); there's no separate "Sub converts to GC" flag anywhere
            -- because GC-ness was never stored in the first place — it's
            -- already resolved per-project from projects.company_id
            -- (require_project_document_access), so a Sub company that
            -- later owns its own project can create folders there for free.
            CREATE TABLE IF NOT EXISTS folders (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                created_by INT NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS folders_project_id_idx ON folders (project_id);

            -- Folder-level access grant. Unlike document_access_grants,
            -- there's no revoked_at — DELETE /api/documents/folders/{id}/access/{company_id}
            -- hard-deletes the row (a folder's grant list is meant to be
            -- read as "who currently has access", not an audit trail).
            CREATE TABLE IF NOT EXISTS folder_access (
                id SERIAL PRIMARY KEY,
                folder_id INT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                granted_by INT NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(folder_id, company_id)
            );
            CREATE INDEX IF NOT EXISTS folder_access_folder_id_idx ON folder_access (folder_id);
            CREATE INDEX IF NOT EXISTS folder_access_company_id_idx ON folder_access (company_id);

            -- Nullable: NULL means project root, same meaning as "no folder"
            -- had implicitly before this column existed. When set, the
            -- document's visibility is governed entirely by folder_access
            -- instead of document_access_grants (services/document_helpers.py) —
            -- there's no per-document override for documents inside a folder.
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id INT REFERENCES folders(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS documents_folder_id_idx ON documents (folder_id);

            -- Left-nav pinned favorites (migration 017): per-user, not
            -- per-project — a GC's pin choices follow them across whichever
            -- project is currently selected. app_key is one of the Project
            -- Detail category-card keys (budget/schedule/invoices/daily_logs/
            -- project_subs/documents), not enforced by a DB check so new
            -- cards can be added without a migration. pinned_apps_seeded on
            -- users lets GET /api/user-preferences/pinned-apps lazy-seed the
            -- Budget+Schedule defaults exactly once per user, so a user who
            -- later unpins everything gets a genuinely empty list instead of
            -- the defaults reappearing.
            CREATE TABLE IF NOT EXISTS user_pinned_apps (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                app_key VARCHAR(50) NOT NULL,
                pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(user_id, app_key)
            );
            CREATE INDEX IF NOT EXISTS user_pinned_apps_user_id_idx ON user_pinned_apps (user_id);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_apps_seeded BOOLEAN NOT NULL DEFAULT false;
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
