const { pool } = require('./db');

class VendorService {
  // ── CREATE VENDOR ────────────────────────────────────────────────────

  static async createVendor(vendorData) {
    try {
      const {
        name,
        trade,
        phone,
        email,
        address,
        city,
        state,
        zip,
        website,
        insurance_status,
        insurance_expiry
      } = vendorData;

      const result = await pool.query(
        `INSERT INTO vendors (name, trade, phone, email, address, city, state, zip, website, insurance_status, insurance_expiry)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [name, trade, phone, email, address, city, state, zip, website, insurance_status, insurance_expiry]
      );

      console.log('✓ Vendor created:', result.rows[0].id);
      return { success: true, vendor: result.rows[0] };
    } catch (err) {
      console.error('Create vendor error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── GET VENDOR BY ID ─────────────────────────────────────────────────

  static async getVendor(vendorId) {
    try {
      const result = await pool.query(
        'SELECT * FROM vendors WHERE id = $1',
        [vendorId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Vendor not found' };
      }

      return { success: true, vendor: result.rows[0] };
    } catch (err) {
      console.error('Get vendor error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── SEARCH VENDORS ───────────────────────────────────────────────────

  static async searchVendors(filters) {
    try {
      let query = 'SELECT * FROM vendors WHERE 1=1';
      const params = [];
      let paramCount = 1;

      // Name or trade search
      if (filters.search && filters.search.trim()) {
        query += ` AND (LOWER(name) LIKE LOWER($${paramCount}) OR LOWER(trade) LIKE LOWER($${paramCount}))`;
        params.push(`%${filters.search}%`);
        paramCount++;
      }

      // Trade filter
      if (filters.trade && filters.trade.trim()) {
        query += ` AND LOWER(trade) = LOWER($${paramCount})`;
        params.push(filters.trade);
        paramCount++;
      }

      // City filter - only if explicitly set and not empty
      if (filters.city && filters.city.trim()) {
        query += ` AND LOWER(city) = LOWER($${paramCount})`;
        params.push(filters.city);
        paramCount++;
      }

      // Insurance status filter
      if (filters.insurance_status && filters.insurance_status.trim()) {
        query += ` AND insurance_status = $${paramCount}`;
        params.push(filters.insurance_status);
        paramCount++;
      }

      // Minimum rating filter
      if (filters.min_rating) {
        query += ` AND avg_rating >= $${paramCount}`;
        params.push(parseFloat(filters.min_rating));
        paramCount++;
      }

      // Sorting
      const sortMap = {
        'rating': 'avg_rating DESC',
        'name': 'name ASC',
        'newest': 'created_at DESC',
        'reviews': 'review_count DESC'
      };
      const sortBy = sortMap[filters.sort] || 'created_at DESC';
      query += ` ORDER BY ${sortBy}`;

      // Pagination
      const limit = parseInt(filters.limit) || 50;
      const offset = parseInt(filters.offset) || 0;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      console.log('Search query:', query);
      console.log('Params:', params);

      const result = await pool.query(query, params);
      return { success: true, vendors: result.rows, total: result.rows.length };
    } catch (err) {
      console.error('Search vendors error:', err);
      return { success: false, error: err.message };
    }
  }
  
  // ── UPDATE VENDOR ────────────────────────────────────────────────────

  static async updateVendor(vendorId, updates) {
    try {
      const allowedFields = [
        'name', 'trade', 'phone', 'email', 'address', 'city', 'state', 'zip',
        'website', 'insurance_status', 'insurance_expiry'
      ];

      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(value);
          paramCount++;
        }
      }

      if (updateFields.length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }

      updateValues.push(vendorId);
      const query = `UPDATE vendors SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

      const result = await pool.query(query, updateValues);

      if (result.rows.length === 0) {
        return { success: false, error: 'Vendor not found' };
      }

      console.log('✓ Vendor updated:', vendorId);
      return { success: true, vendor: result.rows[0] };
    } catch (err) {
      console.error('Update vendor error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── ADD REVIEW ───────────────────────────────────────────────────────

  static async addReview(vendorId, userId, reviewData) {
    try {
      const { rating_reliability, rating_cost, rating_quality, rating_communication, rating_insurance, comment } = reviewData;

      // Check if user already reviewed this vendor
      const existingReview = await pool.query(
        'SELECT id FROM vendor_reviews WHERE vendor_id = $1 AND user_id = $2',
        [vendorId, userId]
      );

      if (existingReview.rows.length > 0) {
        return { success: false, error: 'User has already reviewed this vendor' };
      }

      const result = await pool.query(
        `INSERT INTO vendor_reviews (vendor_id, user_id, rating_reliability, rating_cost, rating_quality, rating_communication, rating_insurance, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [vendorId, userId, rating_reliability, rating_cost, rating_quality, rating_communication, rating_insurance, comment]
      );

      // Update vendor average rating
      await this.updateVendorRating(vendorId);

      console.log('✓ Review added for vendor:', vendorId);
      return { success: true, review: result.rows[0] };
    } catch (err) {
      console.error('Add review error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── UPDATE VENDOR RATING ─────────────────────────────────────────────

  static async updateVendorRating(vendorId) {
    try {
      const result = await pool.query(
        `UPDATE vendors 
         SET avg_rating = (
           SELECT AVG((rating_reliability + rating_cost + rating_quality + rating_communication + rating_insurance) / 5)
           FROM vendor_reviews WHERE vendor_id = $1
         ),
         review_count = (SELECT COUNT(*) FROM vendor_reviews WHERE vendor_id = $1)
         WHERE id = $1
         RETURNING avg_rating, review_count`,
        [vendorId]
      );

      if (result.rows.length > 0) {
        console.log(`✓ Vendor ${vendorId} rating updated:`, result.rows[0]);
      }
    } catch (err) {
      console.error('Update rating error:', err);
    }
  }

  // ── GET VENDOR REVIEWS ───────────────────────────────────────────────

  static async getVendorReviews(vendorId, limit = 10, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT vr.*, u.name as reviewer_name 
         FROM vendor_reviews vr
         LEFT JOIN users u ON vr.user_id = u.id
         WHERE vr.vendor_id = $1
         ORDER BY vr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [vendorId, limit, offset]
      );

      return { success: true, reviews: result.rows };
    } catch (err) {
      console.error('Get reviews error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── BULK IMPORT FROM CSV ─────────────────────────────────────────────

  static async bulkImportVendors(vendorsArray, userId) {
    try {
      const imported = [];
      const failed = [];

      for (let i = 0; i < vendorsArray.length; i++) {
        const vendor = vendorsArray[i];

        // Validate required fields
        if (!vendor.name || !vendor.trade) {
          failed.push({ row: i + 1, error: 'Missing name or trade' });
          continue;
        }

        try {
          const result = await pool.query(
            `INSERT INTO vendors (name, trade, phone, email, address, city, state, zip, website, insurance_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (name, city) DO NOTHING
             RETURNING id`,
            [
              vendor.name,
              vendor.trade,
              vendor.phone || null,
              vendor.email || null,
              vendor.address || null,
              vendor.city || null,
              vendor.state || null,
              vendor.zip || null,
              vendor.website || null,
              vendor.insurance_status || 'not_verified'
            ]
          );

          if (result.rows.length > 0) {
            imported.push({ id: result.rows[0].id, name: vendor.name });

            // Log import
            await pool.query(
              `INSERT INTO vendor_imports (user_id, vendor_id, import_date, source)
               VALUES ($1, $2, NOW(), 'csv')`,
              [userId, result.rows[0].id]
            );
          }
        } catch (rowErr) {
          failed.push({ row: i + 1, error: rowErr.message });
        }
      }

      console.log(`✓ Bulk import complete: ${imported.length} imported, ${failed.length} failed`);
      return { success: true, imported, failed };
    } catch (err) {
      console.error('Bulk import error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── CLAIM VENDOR ACCOUNT ─────────────────────────────────────────────

  static async claimVendorAccount(vendorId, vendorEmail, vendorPassword) {
    try {
      // Check if already claimed
      const existing = await pool.query(
        'SELECT id FROM vendor_accounts WHERE vendor_id = $1',
        [vendorId]
      );

      if (existing.rows.length > 0) {
        return { success: false, error: 'Vendor account already claimed' };
      }

      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(vendorPassword, 12);

      const result = await pool.query(
        `INSERT INTO vendor_accounts (vendor_id, email, password_hash, is_verified)
         VALUES ($1, $2, $3, false)
         RETURNING id`,
        [vendorId, vendorEmail, passwordHash]
      );

      console.log('✓ Vendor account created:', vendorId);
      return { success: true, account: result.rows[0] };
    } catch (err) {
      console.error('Claim account error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── TRACK VENDOR USAGE ───────────────────────────────────────────────

  static async trackVendorUsage(userId, vendorId, action) {
    try {
      await pool.query(
        `INSERT INTO vendor_usage_tracking (user_id, vendor_id, action_type)
         VALUES ($1, $2, $3)`,
        [userId, vendorId, action]
      );
    } catch (err) {
      console.error('Track usage error:', err);
    }
  }
}

module.exports = VendorService;