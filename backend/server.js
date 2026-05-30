const crypto = require("crypto");
// Force redeploy - May 5, 2026 7:10 PM
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { pool, initDb } = require('./db');
const { summarizeEmailThread, extractActionItems, detectSignals, processMeetingNotes } = require("./ai-helpers");
const { analyzeClashReport, draftClashRFI } = require("./clash-helpers");
const gmailHelpers = require('./gmail-helpers');
const emailService = require('./email-service');
const outlookHelpers = require('./outlook-helpers');
const {
  adminLogin,
  createAdminUser,
  verifyAdminToken,
  requireSuperAdmin,
  requireClientAdmin,
  logAdminActivity
} = require('./admin-auth');

const app = express();



// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

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
    const { notesText, projectId } = req.body;
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
    const magicLink = `${req.headers.origin}/auth/verify?token=${magicToken}`;

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
      'SELECT id, email, name, full_name, company, role FROM users WHERE id = $1',
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

// 1. Get Google Auth URL
app.get('/api/auth/gmail-url', (req, res) => {
  try {
    const authUrl = gmailHelpers.getGoogleAuthUrl();
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// 2. Handle Gmail OAuth callback
app.post('/api/auth/gmail-callback', async (req, res) => {
  const { code, userId } = req.body;
  try {
    const tokens = await gmailHelpers.getAccessToken(code);
    await pool.query(
      'UPDATE users SET gmail_access_token = $1, gmail_refresh_token = $2 WHERE id = $3',
      [tokens.access_token, tokens.refresh_token || null, userId]
    );
    res.json({ success: true, message: 'Gmail connected successfully' });
  } catch (err) {
    console.error('Gmail callback error:', err);
    res.status(500).json({ error: 'Failed to connect Gmail' });
  }
});

// 3. Fetch user's Gmail emails
app.get('/api/gmail/emails', async (req, res) => {
  const { userId } = req.query;
  try {
    const userResult = await pool.query(
      'SELECT gmail_access_token FROM users WHERE id = $1',
      [userId]
    );
    if (!userResult.rows[0] || !userResult.rows[0].gmail_access_token) {
      return res.status(401).json({ error: 'Gmail not connected' });
    }
    const accessToken = userResult.rows[0].gmail_access_token;
    const emails = await gmailHelpers.getGmailEmails(accessToken, 15);
    res.json(emails);
  } catch (err) {
    console.error('Error fetching emails:', err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// 4. Get full email thread
app.get('/api/gmail/thread/:threadId', async (req, res) => {
  const { threadId } = req.params;
  const { userId } = req.query;
  try {
    const userResult = await pool.query(
      'SELECT gmail_access_token FROM users WHERE id = $1',
      [userId]
    );
    if (!userResult.rows[0] || !userResult.rows[0].gmail_access_token) {
      return res.status(401).json({ error: 'Gmail not connected' });
    }
    const accessToken = userResult.rows[0].gmail_access_token;
    const thread = await gmailHelpers.getGmailThread(accessToken, threadId);
    res.json(thread);
  } catch (err) {
    console.error('Error fetching thread:', err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});


// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  const { name, email, company, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required' });
  }

  try {
    await emailService.sendEmail({
      to: 'connect@techdensolutions.com',
      subject: `New Consultation Request - ${company || 'No Company'} - ${name}`,
      html: `
        <h2 style="color: #002e4a;">New Consultation Request</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; background: #f5f5f5;">Name</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; background: #f5f5f5;">Email</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; background: #f5f5f5;">Company</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${company || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; background: #f5f5f5;">Message</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${message}</td>
          </tr>
        </table>
        <p style="color: #999; margin-top: 20px; font-size: 12px;">Sent from pomar.ai contact form</p>
      `
    });

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// 1. Get Microsoft Auth URL
app.get('/api/auth/outlook-url', (req, res) => {
  try {
    const authUrl = outlookHelpers.getMicrosoftAuthUrl();
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// 2. Handle Outlook OAuth callback
app.post('/api/auth/outlook-callback', async (req, res) => {
  const { code, userId } = req.body;
  try {
    const tokens = await outlookHelpers.getAccessToken(code);
    await pool.query(
      'UPDATE users SET outlook_access_token = $1, outlook_refresh_token = $2, outlook_token_expires = $3 WHERE id = $4',
      [tokens.access_token, tokens.refresh_token || null, tokens.expires_at, userId]
    );
    res.json({ success: true, message: 'Outlook connected successfully' });
  } catch (err) {
    console.error('Outlook callback error:', err);
    res.status(500).json({ error: 'Failed to connect Outlook' });
  }
});

// 3. Fetch user's Outlook emails
app.get('/api/outlook/emails', async (req, res) => {
  const { userId } = req.query;
  try {
    const userResult = await pool.query(
      'SELECT outlook_access_token, outlook_refresh_token, outlook_token_expires FROM users WHERE id = $1',
      [userId]
    );
    
    if (!userResult.rows[0] || !userResult.rows[0].outlook_access_token) {
      return res.status(401).json({ error: 'Outlook not connected' });
    }

    let accessToken = userResult.rows[0].outlook_access_token;
    const refreshToken = userResult.rows[0].outlook_refresh_token;
    const expiresAt = userResult.rows[0].outlook_token_expires;

    // Check if token is expired and refresh if needed
    if (new Date(expiresAt) < new Date()) {
      try {
        const newTokens = await outlookHelpers.refreshAccessToken(refreshToken);
        accessToken = newTokens.access_token;
        
        await pool.query(
          'UPDATE users SET outlook_access_token = $1, outlook_refresh_token = $2, outlook_token_expires = $3 WHERE id = $4',
          [newTokens.access_token, newTokens.refresh_token, newTokens.expires_at, userId]
        );
      } catch (err) {
        console.error('Token refresh failed:', err);
        return res.status(401).json({ error: 'Failed to refresh Outlook token' });
      }
    }

    const emails = await outlookHelpers.getOutlookEmails(accessToken, 15);
    res.json(emails);
  } catch (err) {
    console.error('Error fetching Outlook emails:', err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// 4. Get full email conversation
app.get('/api/outlook/thread/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.query;
  try {
    const userResult = await pool.query(
      'SELECT outlook_access_token, outlook_refresh_token, outlook_token_expires FROM users WHERE id = $1',
      [userId]
    );
    
    if (!userResult.rows[0] || !userResult.rows[0].outlook_access_token) {
      return res.status(401).json({ error: 'Outlook not connected' });
    }

    let accessToken = userResult.rows[0].outlook_access_token;
    console.log('Access token retrieved:', accessToken ? 'EXISTS' : 'MISSING');
    console.log('Token length:', accessToken?.length || 0);
    const refreshToken = userResult.rows[0].outlook_refresh_token;
    const expiresAt = userResult.rows[0].outlook_token_expires;

    // Check if token is expired and refresh if needed
    if (new Date(expiresAt) < new Date()) {
      try {
        const newTokens = await outlookHelpers.refreshAccessToken(refreshToken);
        accessToken = newTokens.access_token;
        
        await pool.query(
          'UPDATE users SET outlook_access_token = $1, outlook_refresh_token = $2, outlook_token_expires = $3 WHERE id = $4',
          [newTokens.access_token, newTokens.refresh_token, newTokens.expires_at, userId]
        );
      } catch (err) {
        console.error('Token refresh failed:', err);
        return res.status(401).json({ error: 'Failed to refresh Outlook token' });
      }
    }

    const thread = await outlookHelpers.getOutlookThread(accessToken, conversationId);
    res.json(thread);
  } catch (err) {
    console.error('Error fetching Outlook thread:', err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Handle Outlook OAuth callback from Microsoft
app.get('/api/auth/outlook-callback', (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.send(`
      <html>
        <body>
          <p>Error: ${error_description}</p>
          <script>
            window.opener.postMessage({ type: 'OUTLOOK_CALLBACK', error: '${error_description}' }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  }

  if (code) {
    return res.send(`
      <html>
        <body>
          <p>Connecting to Outlook...</p>
          <script>
            window.opener.postMessage({ type: 'OUTLOOK_CALLBACK', code: '${code}' }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  }

  res.status(400).send('No authorization code received');
});

// ── ADMIN AUTHENTICATION ──────────────────────────────────────────────────

// Admin login
app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await adminLogin(email, password);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.json({ success: true, token: result.token, admin: result.admin });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Create admin user (super admin only)
app.post('/api/admin/users', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, admin_level, client_id } = req.body;

    if (!email || !password || !admin_level) {
      return res.status(400).json({ error: 'Email, password, and admin_level required' });
    }

    const result = await createAdminUser(email, password, admin_level, client_id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Log activity
    await logAdminActivity(
      req.admin.id,
      'admin_user_created',
      'admin_users',
      result.admin.id,
      { email: result.admin.email, admin_level: result.admin.admin_level }
    );

    res.json({ success: true, admin: result.admin });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// Get current admin (any authenticated admin)
app.get('/api/admin/me', verifyAdminToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, admin_level, client_id, is_active, created_at, last_login FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ success: true, admin: result.rows[0] });
  } catch (err) {
    console.error('Get admin error:', err);
    res.status(500).json({ error: 'Failed to fetch admin info' });
  }
});

// Admin logout (optional - just for logging activity)
app.post('/api/admin/auth/logout', verifyAdminToken, async (req, res) => {
  try {
    await logAdminActivity(req.admin.id, 'admin_logout', 'admin_users', req.admin.id, null);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});


// ── POMAR Clash endpoints ──────────────────────────────────────────────────

app.post('/api/clash/analyze', async (req, res) => {
  try {
    const { summary, topClashes, testName } = req.body;
    const analysis = await analyzeClashReport({ summary, topClashes, testName });
    res.json({ analysis });
  } catch (err) {
    console.error('Clash analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clash/draft-rfi', async (req, res) => {
  try {
    const { clashName, status, distance, item1, item2, clashPoint, discipline, priority } = req.body;
    const draft = await draftClashRFI({ clashName, status, distance, item1, item2, clashPoint, discipline, priority });
    res.json(draft);
  } catch (err) {
    console.error('Draft RFI error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Procore OAuth + RFI endpoints ─────────────────────────────────────────────

const procoreHelpers = require('./procore-helpers');

// Step 1 — Get Procore OAuth URL
app.get('/api/auth/procore-url', (req, res) => {
  try {
    const { userId } = req.query;
    const url = procoreHelpers.getAuthUrl(userId || '');
    res.json({ url });
  } catch (err) {
    console.error('Procore URL error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Step 2 — Handle Procore OAuth callback
app.get('/api/auth/procore/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code) return res.status(400).json({ error: 'No code received' });

    const tokens = await procoreHelpers.exchangeCodeForToken(code);

    // Store tokens in DB against userId
    await pool.query(
      `INSERT INTO procore_tokens (user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '2 hours')
       ON CONFLICT (user_id) DO UPDATE
       SET access_token = $2, refresh_token = $3, expires_at = NOW() + INTERVAL '2 hours'`,
      [userId, tokens.access_token, tokens.refresh_token]
    );

    // Close popup and notify parent window
    res.send(`
      <script>
        window.opener && window.opener.postMessage({ type: 'PROCORE_CONNECTED' }, '*');
        window.close();
      </script>
    `);
  } catch (err) {
    console.error('Procore callback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Step 3 — Check if user has Procore connected
app.get('/api/procore/status', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = await pool.query(
      'SELECT access_token FROM procore_tokens WHERE user_id = $1',
      [userId]
    );
    res.json({ connected: result.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 4 — Get user's Procore projects
app.get('/api/procore/projects', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = await pool.query(
      'SELECT access_token FROM procore_tokens WHERE user_id = $1',
      [userId]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Procore not connected' });

    const projects = await procoreHelpers.getProjects(result.rows[0].access_token);
    res.json({ projects });
  } catch (err) {
    console.error('Procore projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Step 5 — Push RFI to Procore
app.post('/api/procore/create-rfi', async (req, res) => {
  try {
    const { userId, projectId, rfiData } = req.body;
    const result = await pool.query(
      'SELECT access_token FROM procore_tokens WHERE user_id = $1',
      [userId]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Procore not connected' });

    const rfi = await procoreHelpers.createRFI(
      result.rows[0].access_token,
      projectId,
      rfiData
    );
    res.json({ success: true, rfi });
  } catch (err) {
    console.error('Procore create RFI error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Debug — verify Procore env vars on Render (remove after testing)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, company, role } = req.body;
    if (!fullName || !email || !company || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'An account with this email already exists. Please sign in instead.'
      });
    }

    // Create new user
    const result = await pool.query(
    `INSERT INTO users (email, name, full_name, company, role, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id`,
    [email.toLowerCase().trim(), fullName.trim(), fullName.trim(), company.trim(), role]
    );

    const userId = result.rows[0].id;
    res.json({ success: true, userId });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── Password Auth ─────────────────────────────────────────────────────────────

const bcrypt = require('bcryptjs');

// Register with password
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, company, role, password } = req.body;
    if (!fullName || !email || !company || !role || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, name, full_name, company, role, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
      [email.toLowerCase().trim(), fullName.trim(), fullName.trim(), company.trim(), role, passwordHash]
    );

    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login with password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await pool.query(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'No account found with this email.' });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses magic link login. Please use the sign in link option.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    res.json({ success: true, userId: user.id });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const result = await pool.query(
      'SELECT id, full_name, name FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, user.id]
    );

    const resetUrl = `${process.env.FRONTEND_URL || 'https://pomar.ai'}/reset-password?token=${token}`;
    const firstName = user.full_name?.split(' ')[0] || user.name?.split(' ')[0] || 'there';

    await emailService.sendEmail({
      to: email,
      subject: 'Reset your POMAR password',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #0E1B2C;">Reset your password</h2>
          <p>Hi ${firstName},</p>
          <p>You requested a password reset for your POMAR account. Click the button below to set a new password.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#D97706;color:white;border-radius:100px;text-decoration:none;font-weight:600;margin:20px 0;">
            Reset Password
          </a>
          <p style="color:#666;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
          <p style="color:#666;font-size:12px;">Or copy this link: ${resetUrl}</p>
        </div>
      `,
    });

    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset email.' });
  }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [passwordHash, result.rows[0].id]
    );

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Procore disconnect
app.delete('/api/procore/disconnect', async (req, res) => {
  try {
    const { userId } = req.query;
    await pool.query('DELETE FROM procore_tokens WHERE user_id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clash Assignments ─────────────────────────────────────────────────────────

// Get assignments for a project
app.get('/api/clash/assignments', async (req, res) => {
  try {
    const { userId, projectKey } = req.query;
    if (!userId || !projectKey) return res.status(400).json({ error: 'userId and projectKey required' });
    const result = await pool.query(
      'SELECT * FROM clash_assignments WHERE user_id = $1 AND project_key = $2',
      [userId, projectKey]
    );
    res.json({ assignments: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save/update a single assignment
app.post('/api/clash/assignments', async (req, res) => {
  try {
    const { userId, projectKey, clashName, assignedTo, discipline, notes, status } = req.body;
    if (!userId || !projectKey || !clashName) {
      return res.status(400).json({ error: 'userId, projectKey and clashName required' });
    }
    const result = await pool.query(
      `INSERT INTO clash_assignments (user_id, project_key, clash_name, assigned_to, discipline, notes, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, project_key, clash_name)
       DO UPDATE SET assigned_to = $4, discipline = $5, notes = $6, status = $7, updated_at = NOW()
       RETURNING *`,
      [userId, projectKey, clashName, assignedTo || null, discipline || null, notes || null, status || 'open']
    );
    res.json({ assignment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate coordination meeting agenda PDF
app.post('/api/clash/agenda-pdf', async (req, res) => {
  try {
    const { testName, fileName, clashes, assignments } = req.body;
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="POMAR-Clash-Agenda-${Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#0E1B2C');
    doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text('POMAR Clash', 50, 20);
    doc.fontSize(10).font('Helvetica').text('BIM Coordination Meeting Agenda', 50, 45);
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 50, 60);

    doc.moveDown(3);

    // Project info
    doc.fillColor('#0E1B2C').fontSize(14).font('Helvetica-Bold').text(testName || 'Clash Test', 50, 100);
    doc.fontSize(9).font('Helvetica').fillColor('#475569').text(fileName, 50, 118);

    // Summary stats
    const assignmentMap = {};
    (assignments || []).forEach(a => { assignmentMap[a.clash_name] = a; });

    const assigned   = (clashes || []).filter(c => assignmentMap[c.name]?.assigned_to);
    const unassigned = (clashes || []).filter(c => !assignmentMap[c.name]?.assigned_to);
    const critical   = (clashes || []).filter(c => Math.abs(c.distance) >= 0.5);
    const high       = (clashes || []).filter(c => { const d = Math.abs(c.distance); return d >= 0.2 && d < 0.5; });

    doc.moveDown(2);
    const statsY = doc.y + 10;
    doc.rect(50, doc.y, doc.page.width - 100, 50).fill('#FAF7F2');
    doc.fillColor('#0E1B2C').fontSize(9).font('Helvetica-Bold');
    doc.text(`Total: ${(clashes||[]).length}`, 70, statsY);
    doc.text(`Critical: ${critical.length}`, 160, statsY);
    doc.text(`High: ${high.length}`, 240, statsY);
    doc.text(`Assigned: ${assigned.length}`, 310, statsY);
    doc.text(`Unassigned: ${unassigned.length}`, 400, statsY);

    doc.moveDown(4);

    // Group by discipline/assignee - deduplicate by clash name
    const groups = {};
    const seenClashes = new Set();
    (clashes || []).forEach(clash => {
      if (seenClashes.has(clash.name)) return;
      seenClashes.add(clash.name);
      const a = assignmentMap[clash.name];
      const group = a?.discipline || a?.assigned_to || 'Unassigned';
      if (!groups[group]) groups[group] = [];
      groups[group].push({ clash, assignment: a });
    });

    const SEVERITY_COLORS = { Critical: '#DC2626', High: '#D97706', Medium: '#2563EB', Low: '#475569' };
    const getSeverityLabel = (distance) => {
      const d = Math.abs(distance);
      if (d >= 0.5) return 'Critical';
      if (d >= 0.2) return 'High';
      if (d >= 0.05) return 'Medium';
      return 'Low';
    };

    Object.entries(groups).forEach(([group, items]) => {
      if (doc.y > doc.page.height - 150) doc.addPage();

      doc.rect(50, doc.y, doc.page.width - 100, 24).fill('#0E1B2C');
      const groupY = doc.y - 18;
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold').text(group, 60, groupY);
      doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text(`${items.length} clash${items.length !== 1 ? 'es' : ''}`, 450, groupY);

      doc.moveDown(1.5);

      const tableTop = doc.y;
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#475569');
      doc.text('CLASH',      60,  tableTop);
      doc.text('SEVERITY',   130, tableTop);
      doc.text('ELEMENT 1',  200, tableTop);
      doc.text('ELEMENT 2',  320, tableTop);
      doc.text('PENETRATION',430, tableTop);
      doc.text('STATUS',     490, tableTop);

      doc.moveTo(50, doc.y + 8).lineTo(doc.page.width - 50, doc.y + 8).strokeColor('#E2E8F0').stroke();
      doc.moveDown(1);

      items.forEach(({ clash, assignment }, idx) => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        const rowY = doc.y;
        doc.rect(50, rowY - 2, doc.page.width - 100, 18).fill(idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC');

        const sevLabel = getSeverityLabel(clash.distance || 0);
        const sevColor = SEVERITY_COLORS[sevLabel];

        doc.fontSize(7).font('Helvetica').fillColor('#0E1B2C').text(clash.name, 60, rowY, { width: 60 });
        doc.fillColor(sevColor).font('Helvetica-Bold').text(sevLabel, 130, rowY, { width: 60 });
        doc.fillColor('#0E1B2C').font('Helvetica')
           .text(clash.item1?.itemName || '', 200, rowY, { width: 110 })
           .text(clash.item2?.itemName || '', 320, rowY, { width: 100 });
        doc.fillColor(sevColor).font('Helvetica-Bold').text(clash.distanceRaw || '', 430, rowY, { width: 50 });
        doc.fillColor('#475569').font('Helvetica').text(assignment?.status || 'open', 490, rowY, { width: 80 });

        doc.moveDown(1.2);
      });

      doc.moveDown(1.5);
    });

    // Footer on last page
    doc.fontSize(7).fillColor('#475569').font('Helvetica')
       .text('POMAR Clash · TechDen Solutions · pomar.ai',
             50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ── Clash Reports History ─────────────────────────────────────────────────────

// Save report metadata after upload
app.post('/api/clash/reports', async (req, res) => {
  try {
    const { userId, testName, fileName, summary, projectKey } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const critical = (summary?.total || 0) > 0
      ? Math.round((summary?.New || 0) * 0.1)
      : 0;

    const result = await pool.query(
      `INSERT INTO clash_reports (user_id, test_name, file_name, total_clashes, new_clashes, active_clashes, reviewed_clashes, critical_clashes, high_clashes, project_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        userId,
        testName || 'Clash Test',
        fileName || 'report.html',
        summary?.total || 0,
        summary?.New || 0,
        summary?.Active || 0,
        summary?.Reviewed || 0,
        summary?.Critical || 0,
        summary?.High || 0,
        projectKey || null,
      ]
    );
    res.json({ report: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recent reports for a user
app.get('/api/clash/reports', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const result = await pool.query(
      `SELECT * FROM clash_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN PRICING MANAGEMENT ──────────────────────────────────────────

// Save or update module pricing
app.post('/api/admin/pricing', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const { module_name, monthly_price, billing_cycle, is_global, client_id } = req.body;

    if (!module_name) {
      return res.status(400).json({ error: 'module_name required' });
    }

    const result = await pool.query(
      `INSERT INTO module_pricing (is_global, client_id, module_name, monthly_price, billing_cycle, is_active, updated_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       ON CONFLICT (module_name, is_global) DO UPDATE
       SET monthly_price = $4, billing_cycle = $5, updated_at = NOW(), updated_by_admin_id = $6
       RETURNING *`,
      [is_global || false, client_id || null, module_name, monthly_price || 0, billing_cycle || 'monthly', req.admin.id]
    );

    // Log activity
    await logAdminActivity(
      req.admin.id,
      'pricing_updated',
      'module_pricing',
      result.rows[0].id,
      { module_name, monthly_price, is_global }
    );

    res.json({ success: true, pricing: result.rows[0] });
  } catch (err) {
    console.error('Pricing save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all pricing
app.get('/api/admin/pricing', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM module_pricing WHERE is_global = true ORDER BY module_name ASC`
    );

    res.json({ success: true, pricing: result.rows });
  } catch (err) {
    console.error('Fetch pricing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get clients list
app.get('/api/clients', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, company FROM users ORDER BY created_at DESC LIMIT 50`
    );

    res.json({ success: true, clients: result.rows });
  } catch (err) {
    console.error('Fetch clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN FEATURE FLAGS ───────────────────────────────────────────────

// Save feature flags
app.post('/api/admin/feature-flags', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const { flags } = req.body;

    if (!flags || !Array.isArray(flags)) {
      return res.status(400).json({ error: 'flags array required' });
    }

    // Save each flag
    for (const flag of flags) {
      await pool.query(
        `INSERT INTO feature_flags (is_global, feature_key, feature_name, module, is_enabled, updated_by_admin_id)
         VALUES (true, $1, $2, $3, $4, $5)
         ON CONFLICT (feature_key, is_global) DO UPDATE
         SET is_enabled = $4, updated_by_admin_id = $5, updated_at = NOW()`,
        [flag.key, flag.name, flag.module, flag.enabled, req.admin.id]
      );
    }

    // Log activity
    await logAdminActivity(
      req.admin.id,
      'feature_flags_updated',
      'feature_flags',
      null,
      { count: flags.length }
    );

    res.json({ success: true, message: 'Feature flags updated' });
  } catch (err) {
    console.error('Save feature flags error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get feature flags
app.get('/api/admin/feature-flags', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT feature_key as key, feature_name as name, module, is_enabled as enabled 
       FROM feature_flags WHERE is_global = true ORDER BY module, feature_name ASC`
    );

    res.json({ success: true, flags: result.rows });
  } catch (err) {
    console.error('Fetch feature flags error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POMAR VENDORS ────────────────────────────────────────────────────────

const VendorService = require('./vendor-service');
const multer = require('multer');
const csv = require('csv-parser');

// Configure multer for CSV uploads
const upload = multer({ storage: multer.memoryStorage() });

// Create vendor
app.post('/api/vendors', async (req, res) => {
  try {
    const { name, trade, phone, email, address, city, state, zip, website } = req.body;

    if (!name || !trade) {
      return res.status(400).json({ error: 'Name and trade are required' });
    }

    const result = await VendorService.createVendor({
      name, trade, phone, email, address, city, state, zip, website
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, vendor: result.vendor });
  } catch (err) {
    console.error('Create vendor error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get vendor by ID
app.get('/api/vendors/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const result = await VendorService.getVendor(vendorId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ success: true, vendor: result.vendor });
  } catch (err) {
    console.error('Get vendor error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search vendors
app.get('/api/vendors', async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      trade: req.query.trade,
      city: req.query.city,
      insurance_status: req.query.insurance_status,
      min_rating: req.query.min_rating,
      sort: req.query.sort || 'newest',
      limit: req.query.limit || 50,
      offset: req.query.offset || 0
    };

    const result = await VendorService.searchVendors(filters);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, vendors: result.vendors, total: result.total });
  } catch (err) {
    console.error('Search vendors error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update vendor
app.put('/api/vendors/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const result = await VendorService.updateVendor(vendorId, req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, vendor: result.vendor });
  } catch (err) {
    console.error('Update vendor error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add review
app.post('/api/vendors/:vendorId/reviews', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await VendorService.addReview(vendorId, userId, req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, review: result.review });
  } catch (err) {
    console.error('Add review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get vendor reviews
app.get('/api/vendors/:vendorId/reviews', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const result = await VendorService.getVendorReviews(vendorId, limit, offset);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, reviews: result.reviews });
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk import vendors from CSV
app.post('/api/vendors/bulk-import', upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'CSV file required' });
    }

    const vendors = [];
    const stream = require('stream');

    // Parse CSV from memory buffer
    await new Promise((resolve, reject) => {
      stream.Readable.from([req.file.buffer.toString()])
        .pipe(csv())
        .on('data', (row) => vendors.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    const result = await VendorService.bulkImportVendors(vendors, userId);

    res.json({ success: true, imported: result.imported, failed: result.failed });
  } catch (err) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Claim vendor account
app.post('/api/vendors/:vendorId/claim', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await VendorService.claimVendorAccount(vendorId, email, password);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, account: result.account });
  } catch (err) {
    console.error('Claim account error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN USER MANAGEMENT ────────────────────────────────────────────────

const UserService = require('./user-service');

// Get all GC clients
app.get('/api/admin/clients', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await UserService.getAllClients(limit, offset);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('Get clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get client by ID
app.get('/api/admin/clients/:clientId', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await UserService.getClient(clientId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all admin users
app.get('/api/admin/users', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await UserService.getAllAdminUsers(limit, offset);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('Get admin users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create admin user
app.post('/api/admin/users', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, admin_level, client_id, permissions } = req.body;

    const result = await UserService.createAdminUser({
      email,
      password,
      admin_level,
      client_id,
      permissions
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Log activity
    await logAdminActivity(
      req.admin.id,
      'admin_user_created',
      'admin_users',
      result.admin.id,
      { email, admin_level }
    );

    res.json(result);
  } catch (err) {
    console.error('Create admin user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update admin user
app.put('/api/admin/users/:adminId', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const { is_active, permissions } = req.body;

    const result = await UserService.updateAdminUser(adminId, {
      is_active,
      permissions
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Log activity
    await logAdminActivity(
      req.admin.id,
      'admin_user_updated',
      'admin_users',
      adminId,
      { is_active, permissions }
    );

    res.json(result);
  } catch (err) {
    console.error('Update admin user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete admin user
app.delete('/api/admin/users/:adminId', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;

    const result = await UserService.deleteAdminUser(adminId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Log activity
    await logAdminActivity(
      req.admin.id,
      'admin_user_deleted',
      'admin_users',
      adminId,
      {}
    );

    res.json(result);
  } catch (err) {
    console.error('Delete admin user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get activity log
app.get('/api/admin/activity-log', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const filters = {
      admin_id: req.query.admin_id,
      action: req.query.action,
      resource_type: req.query.resource_type
    };

    const result = await UserService.getActivityLog(limit, offset, filters);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('Get activity log error:', err);
    res.status(500).json({ error: err.message });
  }
});;

// ── Admin Analytics ───────────────────────────────────────────────────────────
app.get('/api/admin/analytics', verifyAdminToken, requireSuperAdmin, async (req, res) => {
  try {
    const [
      usersTotal,
      usersLast30,
      usersSignupsByDay,
      vendorsTotal,
      vendorsInsurance,
      vendorsByTrade,
      reviewsTotal,
      reviewsAvgRating,
    ] = await Promise.all([
      // Total users
      pool.query('SELECT COUNT(*) FROM users'),
      // Users signed up in last 30 days
      pool.query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"),
      // Daily signups last 30 days
      pool.query(`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
      `),
      // Total vendors
      pool.query('SELECT COUNT(*) FROM vendors'),
      // Vendors by insurance status
      pool.query(`
        SELECT insurance_status, COUNT(*)::int AS count
        FROM vendors
        GROUP BY insurance_status
      `),
      // Vendors by trade (top 8)
      pool.query(`
        SELECT trade, COUNT(*)::int AS count
        FROM vendors
        WHERE trade IS NOT NULL AND trade != ''
        GROUP BY trade ORDER BY count DESC LIMIT 8
      `),
      // Total reviews
      pool.query('SELECT COUNT(*) FROM vendor_reviews'),
      // Average rating across all reviews
      pool.query('SELECT ROUND(AVG(overall_rating)::numeric, 1) AS avg FROM vendor_reviews'),
    ]);

    res.json({
      success: true,
      users: {
        total: parseInt(usersTotal.rows[0].count),
        last30Days: parseInt(usersLast30.rows[0].count),
        signupsByDay: usersSignupsByDay.rows,
      },
      vendors: {
        total: parseInt(vendorsTotal.rows[0].count),
        byInsurance: vendorsInsurance.rows,
        byTrade: vendorsByTrade.rows,
      },
      reviews: {
        total: parseInt(reviewsTotal.rows[0].count),
        avgRating: parseFloat(reviewsAvgRating.rows[0].avg) || 0,
      },
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});
