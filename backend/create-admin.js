// One-time script to create the super admin user
// Usage: node create-admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function createAdmin() {
  const email = 'techden19@gmail.com';
  const password = 'Pomar@2024!';   // ← change this to your preferred password
  const adminLevel = 'super_admin';

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, admin_level, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = true
       RETURNING id, email, admin_level`,
      [email, hash, adminLevel]
    );
    console.log('✅ Admin user created/updated:', result.rows[0]);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

createAdmin();
