const { pool } = require('./db');
const bcrypt = require('bcryptjs');

class UserService {
  // ── GET ALL GC USERS/CLIENTS ─────────────────────────────────────────

  static async getAllClients(limit = 50, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.name, u.company, u.created_at,
                COUNT(DISTINCT p.id) as project_count,
                cs.active_modules,
                cs.created_at as subscription_date
         FROM users u
         LEFT JOIN projects p ON u.id = p.user_id
         LEFT JOIN client_subscriptions cs ON u.id = cs.client_id
         GROUP BY u.id, cs.id
         ORDER BY u.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const totalResult = await pool.query('SELECT COUNT(*) as count FROM users');
      
      return {
        success: true,
        clients: result.rows,
        total: parseInt(totalResult.rows[0].count)
      };
    } catch (err) {
      console.error('Get clients error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── GET CLIENT BY ID ─────────────────────────────────────────────────

  static async getClient(clientId) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.name, u.company, u.created_at,
                COUNT(DISTINCT p.id) as project_count,
                cs.active_modules
         FROM users u
         LEFT JOIN projects p ON u.id = p.user_id
         LEFT JOIN client_subscriptions cs ON u.id = cs.client_id
         WHERE u.id = $1
         GROUP BY u.id, cs.id`,
        [clientId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Client not found' };
      }

      return { success: true, client: result.rows[0] };
    } catch (err) {
      console.error('Get client error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── GET ALL ADMIN USERS ──────────────────────────────────────────────

  static async getAllAdminUsers(limit = 50, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT a.id, a.email, a.admin_level, a.client_id, a.permissions,
                a.is_active, a.created_at, a.last_login,
                u.name as client_name, u.company as client_company
         FROM admin_users a
         LEFT JOIN users u ON a.client_id = u.id
         ORDER BY a.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const totalResult = await pool.query('SELECT COUNT(*) as count FROM admin_users');
      
      return {
        success: true,
        admins: result.rows,
        total: parseInt(totalResult.rows[0].count)
      };
    } catch (err) {
      console.error('Get admin users error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── CREATE ADMIN USER ────────────────────────────────────────────────

  static async createAdminUser(adminData) {
    try {
      const { email, password, admin_level, client_id, permissions } = adminData;

      if (!email || !password || !admin_level) {
        return { success: false, error: 'Email, password, and admin_level required' };
      }

      const validLevels = ['super_admin', 'client_admin'];
      if (!validLevels.includes(admin_level)) {
        return { success: false, error: 'Invalid admin_level' };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // If client_admin, require client_id
      if (admin_level === 'client_admin' && !client_id) {
        return { success: false, error: 'client_id required for client_admin' };
      }

      const result = await pool.query(
        `INSERT INTO admin_users (email, password_hash, admin_level, client_id, permissions, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, email, admin_level, client_id, permissions, is_active, created_at`,
        [email, passwordHash, admin_level, client_id || null, JSON.stringify(permissions || { pricing: true, features: true, users: true })]
      );

      console.log('✓ Admin user created:', result.rows[0].email);
      return { success: true, admin: result.rows[0] };
    } catch (err) {
      if (err.code === '23505') {
        return { success: false, error: 'Email already exists' };
      }
      console.error('Create admin user error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── UPDATE ADMIN USER ────────────────────────────────────────────────

  static async updateAdminUser(adminId, updates) {
    try {
      const allowedFields = ['is_active', 'permissions'];
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(key === 'permissions' ? JSON.stringify(value) : value);
          paramCount++;
        }
      }

      if (updateFields.length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }

      updateValues.push(adminId);
      const query = `UPDATE admin_users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

      const result = await pool.query(query, updateValues);

      if (result.rows.length === 0) {
        return { success: false, error: 'Admin user not found' };
      }

      console.log('✓ Admin user updated:', adminId);
      return { success: true, admin: result.rows[0] };
    } catch (err) {
      console.error('Update admin user error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── DELETE ADMIN USER ────────────────────────────────────────────────

  static async deleteAdminUser(adminId) {
    try {
      const result = await pool.query(
        'DELETE FROM admin_users WHERE id = $1 RETURNING id, email',
        [adminId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Admin user not found' };
      }

      console.log('✓ Admin user deleted:', result.rows[0].email);
      return { success: true, deleted: result.rows[0] };
    } catch (err) {
      console.error('Delete admin user error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── GET ACTIVITY LOG ─────────────────────────────────────────────────

  static async getActivityLog(limit = 100, offset = 0, filters = {}) {
    try {
      let query = `SELECT aal.*, au.email as admin_email
                   FROM admin_activity_log aal
                   LEFT JOIN admin_users au ON aal.admin_user_id = au.id
                   WHERE 1=1`;
      const params = [];
      let paramCount = 1;

      if (filters.admin_id) {
        query += ` AND aal.admin_user_id = $${paramCount}`;
        params.push(filters.admin_id);
        paramCount++;
      }

      if (filters.action) {
        query += ` AND aal.action = $${paramCount}`;
        params.push(filters.action);
        paramCount++;
      }

      if (filters.resource_type) {
        query += ` AND aal.resource_type = $${paramCount}`;
        params.push(filters.resource_type);
        paramCount++;
      }

      query += ` ORDER BY aal.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      const totalResult = await pool.query('SELECT COUNT(*) as count FROM admin_activity_log');
      
      return {
        success: true,
        logs: result.rows,
        total: parseInt(totalResult.rows[0].count)
      };
    } catch (err) {
      console.error('Get activity log error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── UPDATE ADMIN LAST LOGIN ──────────────────────────────────────────

  static async updateLastLogin(adminId) {
    try {
      await pool.query(
        'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
        [adminId]
      );
    } catch (err) {
      console.error('Update last login error:', err);
    }
  }
}

module.exports = UserService;