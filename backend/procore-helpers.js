const axios = require('axios');

function getConfig() {
  // Use sandbox credentials if available, fall back to production
  const clientId     = process.env.PROCORE_SANDBOX_CLIENT_ID     || process.env.PROCORE_CLIENT_ID;
  const clientSecret = process.env.PROCORE_SANDBOX_CLIENT_SECRET || process.env.PROCORE_CLIENT_SECRET;
  const redirectUri  = process.env.PROCORE_SANDBOX_REDIRECT_URI  || process.env.PROCORE_REDIRECT_URI;
  const baseUrl      = process.env.PROCORE_BASE_URL               || 'https://sandbox.procore.com';

  console.log('Procore config:', { clientId: clientId ? clientId.substring(0,8)+'...' : 'MISSING', baseUrl });

  return { clientId, clientSecret, redirectUri, baseUrl };
}

function getAuthUrl(state = '') {
  const { clientId, redirectUri, baseUrl } = getConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  redirectUri,
    state,
  });
  return `${baseUrl}/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const { clientId, clientSecret, redirectUri, baseUrl } = getConfig();
  const response = await axios.post(`${baseUrl}/oauth/token`, {
    grant_type:    'authorization_code',
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
    code,
  });
  return response.data;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret, redirectUri, baseUrl } = getConfig();
  const response = await axios.post(`${baseUrl}/oauth/token`, {
    grant_type:    'refresh_token',
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
    refresh_token: refreshToken,
  });
  return response.data;
}

function procoreClient(accessToken) {
  const { baseUrl } = getConfig();
  return axios.create({
    baseURL: `${baseUrl}/rest/v1.0`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

async function getProjects(accessToken) {
  const client = procoreClient(accessToken);
  const response = await client.get('/projects', { params: { per_page: 100 } });
  return response.data;
}

async function getProjectUsers(accessToken, projectId) {
  const client = procoreClient(accessToken);
  const response = await client.get(`/projects/${projectId}/users`, { params: { per_page: 100 } });
  return response.data;
}

async function createRFI(accessToken, projectId, rfiData) {
  const client = procoreClient(accessToken);
  const payload = {
    rfi: {
      subject:        rfiData.title,
      description:    rfiData.description,
      rfi_manager_id: rfiData.assigneeId || null,
      due_date:       rfiData.dueDate    || null,
      priority:       mapPriority(rfiData.priority),
      question:       rfiData.description,
      reference:      `POMAR Clash — ${rfiData.clashName}`,
    },
  };
  const response = await client.post(`/projects/${projectId}/rfis`, payload);
  return response.data;
}

function mapPriority(priority) {
  const map = { Critical: 'high', High: 'high', Medium: 'medium', Low: 'low' };
  return map[priority] || 'medium';
}

module.exports = { getAuthUrl, exchangeCodeForToken, refreshAccessToken, getProjects, getProjectUsers, createRFI };
