import os
import asyncpg
from dotenv import load_dotenv

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
                active_modules JSONB DEFAULT '{"mail": false, "clash": false, "vendors": false}',
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
        """)

    print("✓ Database initialized")
