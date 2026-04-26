const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { pool, initDb } = require('./db');

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

// Placeholder routes (we'll build these on Days 2-4)
app.post('/api/summarize', (req, res) => {
  res.json({ message: 'Summarizer coming Day 2' });
});

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
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});