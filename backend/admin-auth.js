const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// ── LOGIN ────────────────────────────────────────────────────────────────

async function adminLogin(email, password) {
  try {
    console.log('🔐 Login attempt:', email);
    
    // Find admin user
    const result = await pool.query(
      'SELECT id, email, password_hash, admin_level, client_id, is_active FROM admin_users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    console.log('📋 Query result rows:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('❌ Admin user not found');
      return { success: false, error: 'Admin user not found' };
    }

    const admin = result.rows[0];
    console.log('✅ Admin found:', admin.email, 'Active:', admin.is_active);

    // Check if active
    if (!admin.is_active) {
      console.log('❌ Admin account is deactivated');
      return { success: false, error: 'Admin account is deactivated' };
    }

    // Verify password
    console.log('🔑 Comparing passwords...');
    console.log('   Input password length:', password.length);
    console.log('   Hash length:', admin.password_hash.length);
    
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    console.log('🔑 Password valid:', validPassword);
    
    if (!validPassword) {
      console.log('❌ Invalid password');
      return { success: false, error: 'Invalid password' };
    }

    console.log('✅ Password verified');

    // Generate JWT token
    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        admin_level: admin.admin_level,
        client_id: admin.client_id
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log('✅ Token generated');

    // Update last_login
    await pool.query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
      [admin.id]
    );

    // Log activity
    await logAdminActivity(admin.id, 'admin_login', 'admin_users', admin.id, null);

    console.log('✅ Login successful for', email);

    return {
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        admin_level: admin.admin_level,
        client_id: admin.client_id
      }
    };
  } catch (err) {
    console.error('❌ Login error:', err);
    return { success: false, error: err.message };
  }
}

// ── CREATE ADMIN USER ────────────────────────────────────────────────────

async function createAdminUser(email, password, adminLevel, clientId = null) {
  try {
    // Check if admin already exists
    const existing = await pool.query(
      'SELECT id FROM admin_users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return { success: false, error: 'Admin user already exists' };
    }

    // Validate admin level
    if (!['super_admin', 'client_admin'].includes(adminLevel)) {
      return { success: false, error: 'Invalid admin level' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin user
    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, admin_level, client_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, admin_level, client_id`,
      [email.toLowerCase().trim(), passwordHash, adminLevel, clientId]
    );

    return { success: true, admin: result.rows[0] };
  } catch (err) {
    console.error('Create admin error:', err);
    return { success: false, error: err.message };
  }
}

// ── VERIFY TOKEN ─────────────────────────────────────────────────────────

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, admin: decoded };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ── LOG ACTIVITY ─────────────────────────────────────────────────────────

async function logAdminActivity(adminUserId, action, resourceType, resourceId, changes, ipAddress = null, userAgent = null) {
  try {
    await pool.query(
      `INSERT INTO admin_activity_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminUserId, action, resourceType, resourceId, changes ? JSON.stringify(changes) : null, ipAddress, userAgent]
    );
  } catch (err) {
    console.error('Log activity error:', err);
  }
}

// ── MIDDLEWARE: Verify Admin Token ───────────────────────────────────────

function verifyAdminToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const verification = verifyToken(token);
  if (!verification.valid) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.admin = verification.admin;
  next();
}

// ── MIDDLEWARE: Check Admin Level ────────────────────────────────────────

function requireSuperAdmin(req, res, next) {
  if (req.admin.admin_level !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

function requireClientAdmin(req, res, next) {
  if (req.admin.admin_level !== 'client_admin' && req.admin.admin_level !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  adminLogin,
  createAdminUser,
  verifyToken,
  logAdminActivity,
  verifyAdminToken,
  requireSuperAdmin,
  requireClientAdmin,
  JWT_SECRET,
  JWT_EXPIRY
};