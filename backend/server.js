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
app.post('/api/extract-actions', async (req, res) => {
  try {
    const { emailText, projectId } = req.body;

    if (!emailText || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'emailText required' });
    }

    // Call Claude
    const actions = await extractActionItems(emailText);

    // Get or create default project
    let pId = projectId;
    if (!pId) {
      const projectRes = await pool.query(
        "SELECT id FROM projects LIMIT 1"
      );
      pId = projectRes.rows[0].id;
    }

    // Save each action to database
    const savedActions = [];
    for (const action of actions) {
      const result = await pool.query(
        'INSERT INTO action_items (project_id, description, assigned_to, due_date, source_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [pId, action.action, action.assigned_to, action.due_date, 'email']
      );
      savedActions.push(result.rows[0]);
    }

    res.json(savedActions);
  } catch (err) {
    console.error('Action extraction error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/process-meeting', async (req, res) => {
  try {
    const { notesText, projectId } = req.body;

    if (!notesText || notesText.trim().length === 0) {
      return res.status(400).json({ error: 'notesText required' });
    }

    const result = await processMeetingNotes(notesText);

    // Get or create default project
    let pId = projectId;
    if (!pId) {
      const projectRes = await pool.query("SELECT id FROM projects LIMIT 1");
      pId = projectRes.rows[0].id;
    }

    // Save meeting notes (store arrays as JSON text)
    const notesRes = await pool.query(
      'INSERT INTO meeting_notes (project_id, raw_text, attendees, decisions, action_items, open_issues, summary) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [
        pId, 
        notesText, 
        JSON.stringify(result.attendees || []), 
        JSON.stringify(result.decisions || []),
        JSON.stringify(result.action_items || []),
        JSON.stringify(result.open_issues || []),
        result.summary
      ]
    );

    // Save action items from meeting
    const savedActions = [];
    if (result.action_items && result.action_items.length > 0) {
      for (const action of result.action_items) {
        const dbResult = await pool.query(
          'INSERT INTO action_items (project_id, description, assigned_to, due_date, source_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [pId, action.action, action.owner, action.due_date, 'meeting']
        );
        savedActions.push(dbResult.rows[0]);
      }
    }

    res.json({
      id: notesRes.rows[0].id,
      attendees: result.attendees,
      decisions: result.decisions,
      action_items: savedActions,
      open_issues: result.open_issues,
      summary: result.summary,
    });
  } catch (err) {
    console.error('Meeting processing error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/detect-signals', async (req, res) => {
  try {
    const { emailText, projectId } = req.body;

    if (!emailText || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'emailText required' });
    }

    const result = await detectSignals(emailText);

    // Get or create default project
    let pId = projectId;
    if (!pId) {
      const projectRes = await pool.query("SELECT id FROM projects LIMIT 1");
      pId = projectRes.rows[0].id;
    }

    // Save signals to database
    const savedSignals = [];
    if (result.signals && result.signals.length > 0) {
      for (const signal of result.signals) {
        if (signal.confidence >= 0.5) { // Lower threshold for MVP
          const dbResult = await pool.query(
            'INSERT INTO signals (project_id, raw_text, signal_type, confidence) VALUES ($1, $2, $3, $4) RETURNING *',
            [pId, signal.excerpt, signal.type, signal.confidence]
          );
          savedSignals.push(dbResult.rows[0]);
        }
      }
    }

    res.json(savedSignals);
  } catch (err) {
    console.error('Signal detection error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});