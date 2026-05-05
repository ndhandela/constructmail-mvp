// Force redeploy - May 5, 2026 7:10 PM
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

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'ConstructMail Intelligence API',
    status: 'running',
    version: '1.0.0',
    endpoints: [
      '/api/health',
      '/api/summarize',
      '/api/extract-actions',
      '/api/process-meeting',
      '/api/detect-signals',
      '/api/recent-summaries',
      '/api/open-actions',
      '/api/recent-signals'
    ]
  });
});

// Summarize email endpoint
app.post('/api/summarize', async (req, res) => {
  try {
    const { emailText, projectId } = req.body;
    const userId = parseInt(req.body.userId); // Convert to number!
    
    if (!emailText || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'emailText required and cannot be empty' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Call Claude
    const result = await summarizeEmailThread(emailText);

    // Get or create default project for this user
    let pId = projectId;
    if (!pId) {
      const projectRes = await pool.query(
        "SELECT id FROM projects WHERE user_id = $1 AND name = $2",
        [userId, 'Default Project']
      );
      
      if (projectRes.rows.length === 0) {
        const newProjectRes = await pool.query(
          "INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id",
          [userId, 'Default Project']
        );
        pId = newProjectRes.rows[0].id;
      } else {
        pId = projectRes.rows[0].id;
      }
    }

    // Save email thread
    const dbResult = await pool.query(
      'INSERT INTO email_threads (project_id, raw_text, summary, decisions) VALUES ($1, $2, $3, $4) RETURNING *',
      [pId, emailText, result.summary, JSON.stringify(result.decisions)]
    );

    res.json({
      id: dbResult.rows[0].id,
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
    const userId = parseInt(req.body.userId); // Convert to number!

    if (!emailText || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'emailText required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Call Claude
    const actions = await extractActionItems(emailText);

    // Get or create default project for this user
    let pId = projectId;
    if (!pId) {
      const projectRes = await pool.query(
        "SELECT id FROM projects WHERE user_id = $1 AND name = $2",
        [userId, 'Default Project']
      );
      
      if (projectRes.rows.length === 0) {
        const newProjectRes = await pool.query(
          "INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id",
          [userId, 'Default Project']
        );
        pId = newProjectRes.rows[0].id;
      } else {
        pId = projectRes.rows[0].id;
      }
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
        const { emailText, projectId } = req.body;
    const userId = parseInt(req.body.userId); // Convert to number!

    if (!notesText || notesText.trim().length === 0) {
      return res.status(400).json({ error: 'notesText required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await processMeetingNotes(notesText);

    // Get or create default project for this user
    let pId = projectId;
    if (!pId) {
      const projectRes = await pool.query(
        "SELECT id FROM projects WHERE user_id = $1 AND name = $2",
        [userId, 'Default Project']
      );
      
      if (projectRes.rows.length === 0) {
        const newProjectRes = await pool.query(
          "INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id",
          [userId, 'Default Project']
        );
        pId = newProjectRes.rows[0].id;
      } else {
        pId = projectRes.rows[0].id;
      }
    }

    // Save meeting notes
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
  console.log('=== DETECT SIGNALS ENDPOINT CALLED ===');
  console.log('Request body:', req.body);
  
  try {
    const { emailText, projectId } = req.body;
    const userId = parseInt(req.body.userId);
    
    console.log('Extracted userId:', userId);
    console.log('Extracted projectId:', projectId); // DEBUG - ADD THIS
    console.log('projectId is:', projectId, 'type:', typeof projectId); // DEBUG - ADD THIS
    console.log('!projectId evaluates to:', !projectId); // DEBUG - ADD THIS

    if (!emailText || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'emailText required' });
    }

    if (!userId) {
      console.log('NO USER ID - returning 401');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('Calling detectSignals...');
    const result = await detectSignals(emailText);
    console.log('detectSignals result:', result);

    // Get or create default project for this user
    let pId = projectId;
    if (!pId) {
      console.log('Entering project creation block...'); // DEBUG
      console.log('No projectId provided, checking for default project...'); // DEBUG
      const projectRes = await pool.query(
        "SELECT id FROM projects WHERE user_id = $1 AND name = $2",
        [userId, 'Default Project']
      );
      console.log('Existing projects:', projectRes.rows); // DEBUG
      
      if (projectRes.rows.length === 0) {
        console.log('No existing project, creating new one...'); // DEBUG
        try {
          const newProjectRes = await pool.query(
            "INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id",
            [userId, 'Default Project']
          );
          pId = newProjectRes.rows[0].id;
          console.log('✅ Created new project with id:', pId); // DEBUG
        } catch (projectErr) {
          console.error('❌ Error creating project:', projectErr); // DEBUG
          throw projectErr;
        }
      } else {
        pId = projectRes.rows[0].id;
        console.log('Found existing project:', pId); // DEBUG
      }
       } else {
      console.log('Using existing pId:', pId); // DEBUG
    }

    console.log('ProjectId:', pId);
    console.log('Signals to process:', result.signals);

    // Save signals to database
    const savedSignals = [];
    if (result.signals && result.signals.length > 0) {
      for (const signal of result.signals) {
        console.log('Processing signal:', signal);
        if (signal.confidence >= 0.5) {
          console.log('Saving signal to DB:', signal);
          const dbResult = await pool.query(
            'INSERT INTO signals (project_id, raw_text, signal_type, confidence) VALUES ($1, $2, $3, $4) RETURNING *',
            [pId, signal.excerpt, signal.type, signal.confidence]
          );
          savedSignals.push(dbResult.rows[0]);
        }
      }
    }

    console.log('Final savedSignals:', savedSignals);
    res.json(savedSignals);
  } catch (err) {
    console.error('Signal detection error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recent-summaries', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId); // Convert to number
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

        // First, get the projects for this user
    const projectsRes = await pool.query(
      'SELECT id FROM projects WHERE user_id = $1',
      [userId]
    );
    console.log('Projects found:', projectsRes.rows); // DEBUG

    const result = await pool.query(
      'SELECT * FROM email_threads WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1) ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/open-actions', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId); // Convert to number
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

        // First, get the projects for this user
    const projectsRes = await pool.query(
      'SELECT id FROM projects WHERE user_id = $1',
      [userId]
    );
    console.log('Projects found:', projectsRes.rows); // DEBUG

    const result = await pool.query(
      "SELECT * FROM action_items WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1) AND status = 'open' ORDER BY due_date ASC LIMIT 10",
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recent-signals', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId); // Convert to number
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // First, get the projects for this user
    const projectsRes = await pool.query(
      'SELECT id FROM projects WHERE user_id = $1',
      [userId]
    );
    console.log('Projects found:', projectsRes.rows); // DEBUG

    const result = await pool.query(
      'SELECT * FROM signals WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1) ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const crypto = require('crypto');

// Send magic link
app.post('/api/auth/send-magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Generate magic token
    const magicToken = crypto.randomBytes(32).toString('hex');
    
    // Save to database
    await pool.query(
      'INSERT INTO sessions (email, magic_token) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET magic_token = $2, expires_at = NOW() + INTERVAL \'24 hours\'',
      [email, magicToken]
    );

    // Create magic link
    const magicLink = `https://constructmail.pomar.ai/auth/verify?token=${magicToken}`;

    res.json({ 
      message: 'Magic link generated',
      magicLink: magicLink,
      email: email
    });
  } catch (err) {
    console.error('Magic link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verify magic link and create user session
app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // Check if token exists and hasn't expired
    const result = await pool.query(
      'SELECT * FROM sessions WHERE magic_token = $1 AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const session = result.rows[0];
    const email = session.email;

    // Get or create user
    let userRes = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let userId;
    if (userRes.rows.length === 0) {
      const newUserRes = await pool.query(
        "INSERT INTO users (email, name, company) VALUES ($1, $2, $3) RETURNING id",
        [email, email.split('@')[0], 'Construction Company']
      );
      userId = newUserRes.rows[0].id;
    } else {
      userId = userRes.rows[0].id;
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [userId]
    );

    // Mark session as verified
    await pool.query(
      'UPDATE sessions SET is_verified = TRUE WHERE magic_token = $1',
      [token]
    );

    res.json({ 
      success: true,
      userId: userId,
      email: email
    });
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await pool.query(
      'SELECT id, email, name, company FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/debug/user-data/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const users = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const projects = await pool.query('SELECT * FROM projects WHERE user_id = $1', [userId]);
    const signals = await pool.query('SELECT * FROM signals LIMIT 10');
    
    res.json({
      user: users.rows[0],
      projects: projects.rows,
      allSignals: signals.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});