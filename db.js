
// Clash assignments table
async function initClashAssignments() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clash_assignments (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      clash_name TEXT NOT NULL,
      assigned_to TEXT,
      discipline TEXT,
      notes TEXT,
      status TEXT DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, project_key, clash_name)
    )
  `);
}
initClashAssignments().catch(console.error);
