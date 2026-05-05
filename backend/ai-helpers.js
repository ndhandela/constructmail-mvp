const axios = require('axios');
require('dotenv').config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Utility function to parse JSON safely
const parseJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('JSON parse error:', err);
    return null;
  }
};

// Summarize an email thread
const summarizeEmailThread = async (emailText) => {
  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `You are a construction project communication specialist. Analyze the email thread and extract key information. You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no preamble). 

Return this exact structure:
{
  "summary": "A concise 2-3 sentence summary of the main topic and outcome",
  "decisions": ["Decision 1", "Decision 2"],
  "open_items": ["Unresolved item 1", "Unresolved item 2"],
  "key_people": ["Person 1", "Person 2"]
}`,
        messages: [
          {
            role: 'user',
            content: `Analyze this email thread and extract the summary, decisions, open items, and key people mentioned:\n\n${emailText}`,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    const content = response.data.content[0].text;
    const parsed = parseJSON(content);
    
    if (!parsed) {
      throw new Error('Invalid JSON response from Claude');
    }

    return parsed;
  } catch (err) {
    console.error('Claude API error:', err.response?.data || err.message);
    throw new Error(`Summarization failed: ${err.message}`);
  }
};

// Extract action items from email
const extractActionItems = async (emailText) => {
  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `You are a construction project manager. Extract all action items from the email or text. You MUST respond with ONLY a valid JSON array (no markdown, no code blocks, no preamble).

Return this exact structure:
[
  { "action": "Clear description of the task", "assigned_to": "Person name or null", "due_date": "Date in YYYY-MM-DD format or null" },
  { "action": "Another task", "assigned_to": null, "due_date": null }
]`,
        messages: [
          {
            role: 'user',
            content: `Extract ALL action items (tasks, responsibilities, deliverables) from this text:\n\n${emailText}`,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    const content = response.data.content[0].text;
    const parsed = parseJSON(content);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Expected array response from Claude');
    }

    return parsed;
  } catch (err) {
    console.error('Claude API error:', err.response?.data || err.message);
    throw new Error(`Action extraction failed: ${err.message}`);
  }
};

// Detect RFI/change order signals
const detectSignals = async (emailText) => {
  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: `You are a construction document analyzer. Scan the text for critical signals in construction projects. You MUST respond with ONLY valid JSON (no markdown, no code blocks, no preamble).

Return this structure:
{
  "signals": [
    { "type": "RFI", "confidence": 0.95, "excerpt": "Exact phrase from text" },
    { "type": "ChangeOrder", "confidence": 0.8, "excerpt": "Exact phrase" }
  ]
}

Signal types: RFI, ChangeOrder, Submittal, ScheduleImpact, Claim, Delay, SafetyIssue`,
        messages: [
          {
            role: 'user',
            content: `Detect construction signals in this email:\n\n${emailText}`,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    const content = response.data.content[0].text;
    console.log('Claude response for signals:', content); // DEBUG LOG
    const parsed = parseJSON(content);
    
    console.log('Parsed signals:', parsed); // DEBUG LOG
    
    if (!parsed || !Array.isArray(parsed.signals)) {
      console.log('No signals found or invalid format');
      return { signals: [] };
    }

    console.log('Final signals to return:', parsed.signals); // DEBUG LOG

    return parsed;
  } catch (err) {
    console.error('Claude API error:', err.response?.data || err.message);
    return { signals: [] }; // Return empty signals on error
  }
};

// Process meeting notes
const processMeetingNotes = async (notesText) => {
  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `You are a construction meeting transcriber. Parse meeting notes into structured format. You MUST respond with ONLY valid JSON (no markdown, no code blocks, no preamble).

Return this structure:
{
  "attendees": ["Name1", "Name2"],
  "decisions": ["Decision made 1", "Decision made 2"],
  "action_items": [
    { "action": "Task description", "owner": "Person name or null", "due_date": "Date or null" }
  ],
  "open_issues": ["Issue 1", "Issue 2"],
  "summary": "Brief summary of meeting"
}`,
        messages: [
          {
            role: 'user',
            content: `Parse these meeting notes:\n\n${notesText}`,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    const content = response.data.content[0].text;
    const parsed = parseJSON(content);
    
    if (!parsed) {
      throw new Error('Invalid JSON response from Claude');
    }

    return parsed;
  } catch (err) {
    console.error('Claude API error:', err.response?.data || err.message);
    throw new Error(`Meeting processing failed: ${err.message}`);
  }
};

module.exports = {
  summarizeEmailThread,
  extractActionItems,
  detectSignals,
  processMeetingNotes,
};