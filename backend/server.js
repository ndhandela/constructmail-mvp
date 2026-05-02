const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { pool, initDb } = require('./db');
const { summarizeEmailThread, extractActionItems, detectSignals, processMeetingNotes } = require('./ai-helpers');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize database
initDb();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Summarize email endpoint
app.post('/api/summarize', async (req, res) => {
  try {
    const { emailText, projectId } = req.body;
    
    if (!emailText || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'emailText required and cannot be empty' });
    }

    // Call Claude
    const result = await summarizeEmailThread(emailText);

    // Try to save to database, but don't fail if it doesn't work
    try {
      // Create or get default user
      let userId;
      const userRes = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        ['demo@constructmail.local']
      );
      
      if (userRes.rows.length === 0) {
        const newUserRes = await pool.query(
          "INSERT INTO users (email, name, company) VALUES ($1, $2, $3) RETURNING id",
          ['demo@constructmail.local', 'Demo User', 'Demo Company']
        );
        userId = newUserRes.rows[0].id;
      } else {
        userId = userRes.rows[0].id;
      }

      // Create or get default project
      let pId;
      const projectRes = await pool.query(
        "SELECT id FROM projects WHERE user_id = $1 AND name = $2",
        [userId, 'Demo Project']
      );
      
      if (projectRes.rows.length === 0) {
        const newProjectRes = await pool.query(
          "INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id",
          [userId, 'Demo Project']
        );
        pId = newProjectRes.rows[0].id;
      } else {
        pId = projectRes.rows[0].id;
      }

      // Save email thread
      await pool.query(
        'INSERT INTO email_threads (project_id, raw_text, summary, decisions) VALUES ($1, $2, $3, $4)',
        [pId, emailText, result.summary, JSON.stringify(result.decisions)]
      );
    } catch (dbErr) {
      console.log('Database save skipped:', dbErr.message);
    }

    res.json({
      summary: result.summary,
      decisions: result.decisions,
      open_items: result.open_items,
      key_people: result.key_people,
    });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Placeholder routes (we'll build these on Days 3-4)
app.post('/api/extract-actions', (req, res) => {
  res.json({ message: 'Action extractor coming Day 3' });
});

app.post('/api/process-meeting', (req, res) => {
  res.json({ message: 'Meeting processor coming Day 4' });
});

app.post('/api/detect-signals', (req, res) => {
  res.json({ message: 'Signal detector coming Day 4' });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});