const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');

// Initialize MSAL client
const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`
  }
};

const msalClient = new ConfidentialClientApplication(msalConfig);

// Generate Microsoft auth URL
exports.getMicrosoftAuthUrl = () => {
  const authUrl = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/authorize`;
  
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://graph.microsoft.com/.default offline_access',
    state: 'constructmail_oauth'
  });

  return `${authUrl}?${params.toString()}`;
};

// Get access token from authorization code
exports.getAccessToken = async (code) => {
  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      scopes: ['https://graph.microsoft.com/.default'],
      redirectUri: process.env.MICROSOFT_REDIRECT_URI
    });

    return {
      access_token: tokenResponse.accessToken,
      refresh_token: tokenResponse.refreshToken,
      expires_at: tokenResponse.expiresOn
    };
  } catch (err) {
    console.error('Error getting access token:', err);
    throw err;
  }
};

// Fetch Outlook emails
exports.getOutlookEmails = async (accessToken, maxResults = 15) => {
  try {
    const response = await axios.get(
      'https://graph.microsoft.com/v1.0/me/messages',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          $top: maxResults,
          $orderby: 'receivedDateTime DESC',
          $select: 'id,conversationId,subject,from,toRecipients,body,receivedDateTime,bodyPreview'
        }
      }
    );

    const emails = response.data.value.map(msg => ({
      id: msg.id,
      conversationId: msg.conversationId,
      threadId: msg.conversationId, // Map conversationId to threadId for consistency
      from: msg.from.emailAddress.address,
      to: msg.toRecipients.map(r => r.emailAddress.address).join(', '),
      subject: msg.subject,
      date: msg.receivedDateTime,
      body: msg.body.content,
      bodyPreview: msg.bodyPreview
    }));

    return emails;
  } catch (err) {
    console.error('Error fetching Outlook emails:', err.response?.data || err.message);
    throw err;
  }
};

// Get full email conversation thread
exports.getOutlookThread = async (accessToken, conversationId) => {
  try {
    // Fetch all messages in the conversation
    const response = await axios.get(
      'https://graph.microsoft.com/v1.0/me/messages',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          $filter: `conversationId eq '${conversationId}'`,
          $orderby: 'receivedDateTime ASC',
          $select: 'id,subject,from,toRecipients,body,receivedDateTime'
        }
      }
    );

    const thread = response.data.value.map(msg => ({
      id: msg.id,
      from: msg.from.emailAddress.address,
      to: msg.toRecipients.map(r => r.emailAddress.address).join(', '),
      subject: msg.subject,
      date: msg.receivedDateTime,
      body: msg.body.content
    }));

    return thread;
  } catch (err) {
    console.error('Error fetching Outlook thread:', err.response?.data || err.message);
    throw err;
  }
};

// Refresh access token using refresh token
exports.refreshAccessToken = async (refreshToken) => {
  try {
    const tokenResponse = await msalClient.acquireTokenByRefreshToken({
      refreshToken,
      scopes: ['https://graph.microsoft.com/.default']
    });

    return {
      access_token: tokenResponse.accessToken,
      refresh_token: tokenResponse.refreshToken,
      expires_at: tokenResponse.expiresOn
    };
  } catch (err) {
    console.error('Error refreshing access token:', err);
    throw err;
  }
};