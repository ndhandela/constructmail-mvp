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
