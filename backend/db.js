const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize database schema
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        company VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        project_number VARCHAR(100),
        client_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS email_threads (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL,
        raw_text TEXT NOT NULL,
        summary TEXT,
        decisions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS action_items (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL,
        description TEXT NOT NULL,
        assigned_to VARCHAR(255),
        due_date VARCHAR(50),
        status VARCHAR(50) DEFAULT 'open',
        source_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS signals (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL,
        raw_text TEXT,
        signal_type VARCHAR(100),
        confidence FLOAT,
        status VARCHAR(50) DEFAULT 'flagged',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
    `);
    console.log('✓ Database initialized');
  } catch (err) {
    console.error('Database init error:', err);
  }
};

module.exports = { pool, initDb };

// Procore tokens table
async function initProcoreTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS procore_tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Procore tokens table ready');
}

initProcoreTable().catch(console.error);

// Add registration columns if missing
async function migrateUserColumns() {
  await pool.query(`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT
  `);
}

migrateUserColumns().catch(console.error);

// Add password and reset token columns
async function migrateAuthColumns() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS reset_token TEXT,
    ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP,
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT
  `);
}
migrateAuthColumns().catch(console.error);

// Clash reports history table
async function initClashReports() {
  await pool.query(`
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
    )
  `);
}
initClashReports().catch(console.error);

// ── ADMIN PORTAL TABLES ──────────────────────────────────────────────────────

// Admin users table
async function initAdminUsers() {
  await pool.query(`
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
    )
  `);
  console.log('✓ Admin users table ready');
}

// Module pricing table
async function initModulePricing() {
  await pool.query(`
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
    )
  `);
  console.log('✓ Module pricing table ready');
}

// Feature flags table
async function initFeatureFlags() {
  await pool.query(`
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
    )
  `);
  console.log('✓ Feature flags table ready');
}

// Admin activity log table
async function initAdminActivityLog() {
  await pool.query(`
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
    )
  `);
  console.log('✓ Admin activity log table ready');
}

// Client subscriptions table
async function initClientSubscriptions() {
  await pool.query(`
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
    )
  `);
  console.log('✓ Client subscriptions table ready');
}

// Analytics snapshots table
async function initAnalyticsSnapshots() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id SERIAL PRIMARY KEY,
      is_global BOOLEAN DEFAULT FALSE,
      client_id INT REFERENCES users(id) ON DELETE CASCADE,
      total_gcs INT DEFAULT 0,
      total_vendors INT DEFAULT 0,
      total_reviews INT DEFAULT 0,
      total_rfis_created INT DEFAULT 0,
      total_clashes_detected INT DEFAULT 0,
      mail_active_users INT DEFAULT 0,
      clash_active_users INT DEFAULT 0,
      vendors_active_users INT DEFAULT 0,
      daily_active_users INT DEFAULT 0,
      new_signups INT DEFAULT 0,
      dfw_gcs INT DEFAULT 0,
      houston_gcs INT DEFAULT 0,
      austin_gcs INT DEFAULT 0,
      vendor_accounts_claimed INT DEFAULT 0,
      vendors_with_3plus_reviews INT DEFAULT 0,
      signup_to_first_import_rate DECIMAL(5,2),
      first_import_to_first_use_rate DECIMAL(5,2),
      snapshot_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, snapshot_date),
      UNIQUE(snapshot_date, is_global)
    )
  `);
  console.log('✓ Analytics snapshots table ready');
}

// Call all init functions IN SEQUENCE (to avoid foreign key issues)
async function initAllAdminTables() {
  try {
    console.log('Initializing admin tables...');
    await initAdminUsers();
    await initModulePricing();
    await initFeatureFlags();
    await initAdminActivityLog();
    await initClientSubscriptions();
    await initAnalyticsSnapshots();
    await seedAdminDefaults();
    
    // Vendor tables
    await initVendorTables();
    await initVendorReviews();
    await initVendorAccounts();
    await initVendorImports();
    await initVendorProfileViews();
    await initVendorUsageTracking();

    // POMAR Connect tables
    await initConnectQueue();
    await initConnectLog();
    await migrateConnectStatus();

    console.log('✓ All tables initialized successfully');
  } catch (err) {
    console.error('Tables initialization error:', err);
  }
}

// Seed initial feature flags and pricing for all modules
async function seedAdminDefaults() {
  try {
    // Seed global feature flags
    const flags = [
      { feature_key: 'email_auto_discovery', feature_name: 'Email Auto-Discovery', module: 'vendors', is_enabled: true },
      { feature_key: 'vendor_claiming_enabled', feature_name: 'Vendor Profile Claiming', module: 'vendors', is_enabled: true },
      { feature_key: 'vendor_reviews_anonymous', feature_name: 'Anonymous Vendor Reviews', module: 'vendors', is_enabled: true },
      { feature_key: 'csv_import_enabled', feature_name: 'CSV Bulk Import', module: 'vendors', is_enabled: true },
      { feature_key: 'procore_oauth_enabled', feature_name: 'Procore OAuth Integration', module: 'platform', is_enabled: false },
    ];

    for (const flag of flags) {
      await pool.query(
        `INSERT INTO feature_flags (is_global, feature_key, feature_name, module, is_enabled)
         VALUES (true, $1, $2, $3, $4)
         ON CONFLICT (feature_key, is_global) DO NOTHING`,
        [flag.feature_key, flag.feature_name, flag.module, flag.is_enabled]
      );
    }

    // Seed global module pricing
    const modules = ['mail', 'clash', 'vendors'];
    for (const module of modules) {
      await pool.query(
        `INSERT INTO module_pricing (is_global, module_name, monthly_price, billing_cycle, is_active)
         VALUES (true, $1, 0, 'monthly', true)
         ON CONFLICT (module_name, is_global) DO NOTHING`,
        [module]
      );
    }

    console.log('✓ Admin defaults seeded');
  } catch (err) {
    console.error('Seed defaults error:', err);
  }
}

// ── POMAR VENDORS TABLES ──────────────────────────────────────────────────

async function initVendorTables() {
  await pool.query(`
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
    )
  `);
  console.log('✓ Vendors table ready');
}

async function initVendorReviews() {
  await pool.query(`
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
    )
  `);
  console.log('✓ Vendor reviews table ready');
}

async function initVendorAccounts() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_accounts (
      id SERIAL PRIMARY KEY,
      vendor_id INT NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_verified BOOLEAN DEFAULT FALSE,
      verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Vendor accounts table ready');
}

async function initVendorImports() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_imports (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Vendor imports table ready');
}

async function initVendorProfileViews() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_profile_views (
      id SERIAL PRIMARY KEY,
      vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Vendor profile views table ready');
}

async function initVendorUsageTracking() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_usage_tracking (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      action_type VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Vendor usage tracking table ready');
}


// ── POMAR CONNECT TABLES ─────────────────────────────────────────────────────

async function initConnectQueue() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS connect_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      module TEXT NOT NULL CHECK (module IN ('mail', 'clash', 'vendor')),
      type TEXT NOT NULL CHECK (type IN ('rfi', 'change_order', 'clash', 'compliance')),
      title TEXT NOT NULL,
      detail TEXT,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'pushed', 'dismissed')),
      source_id TEXT,
      pmis_target TEXT CHECK (pmis_target IN ('procore', 'kahua')),
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ connect_queue table ready');
}

async function initConnectLog() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS connect_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      queue_item_id UUID REFERENCES connect_queue(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      error_message TEXT,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ connect_log table ready');
}

async function migrateConnectStatus() {
  await pool.query(`
    ALTER TABLE vendors ADD COLUMN IF NOT EXISTS connect_status TEXT DEFAULT NULL;
  `);
  // signals table acts as mail's source; we add connect_status to signals
  await pool.query(`
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS connect_status TEXT DEFAULT NULL;
  `);
  // clash_reports for clash module
  await pool.query(`
    ALTER TABLE clash_reports ADD COLUMN IF NOT EXISTS connect_status TEXT DEFAULT NULL;
  `);
  console.log('✓ connect_status columns migrated');
}

// Run on startup
initAllAdminTables();