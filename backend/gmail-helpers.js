const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

exports.getGoogleAuthUrl = () => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
};

exports.getAccessToken = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
  } catch (err) {
    console.error('Error getting access token:', err);
    throw err;
  }
};

exports.getGmailEmails = async (accessToken, maxResults = 10) => {
  try {
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
      q: 'is:unread OR label:INBOX'
    });

    if (!response.data.messages) return [];

    const emails = [];
    for (const msg of response.data.messages) {
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });

      const headers = fullMessage.data.payload.headers;
      const body = getEmailBody(fullMessage.data.payload);

      emails.push({
        id: msg.id,
        threadId: fullMessage.data.threadId,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        body: body,
        labels: fullMessage.data.labelIds || []
      });
    }

    return emails;
  } catch (err) {
    console.error('Error fetching Gmail emails:', err);
    throw err;
  }
};

exports.getGmailThread = async (accessToken, threadId) => {
  try {
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full'
    });

    return thread.data.messages.map(msg => {
      const headers = msg.payload.headers;
      return {
        id: msg.id,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        body: getEmailBody(msg.payload)
      };
    });
  } catch (err) {
    console.error('Error fetching Gmail thread:', err);
    throw err;
  }
};

function getEmailBody(payload) {
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain') {
        return Buffer.from(part.body.data, 'base64').toString();
      }
    }
  }
  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString();
  }
  return '';
}

function getHeader(headers, name) {
  const header = headers.find(h => h.name === name);
  return header ? header.value : '';
}