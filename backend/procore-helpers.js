const axios = require('axios');

const COMPANY_ID = 4284114;

function getConfig() {
  const clientId     = process.env.PROCORE_SANDBOX_CLIENT_ID     || process.env.PROCORE_CLIENT_ID;
  const clientSecret = process.env.PROCORE_SANDBOX_CLIENT_SECRET || process.env.PROCORE_CLIENT_SECRET;
  const redirectUri  = process.env.PROCORE_SANDBOX_REDIRECT_URI  || process.env.PROCORE_REDIRECT_URI;
  const baseUrl      = process.env.PROCORE_BASE_URL               || 'https://sandbox.procore.com';
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
      Authorization:        `Bearer ${accessToken}`,
      'Content-Type':       'application/json',
      'Procore-Company-Id': String(COMPANY_ID),
    },
  });
}

async function getProjects(accessToken) {
  const client = procoreClient(accessToken);
  const response = await client.get('/projects', {
    params: { company_id: COMPANY_ID, per_page: 100 },
  });
  return response.data;
}

async function getProjectUsers(accessToken, projectId) {
  const client = procoreClient(accessToken);
  const response = await client.get(`/projects/${projectId}/users`, {
    params: { per_page: 100 },
  });
  return response.data;
}

async function createRFI(accessToken, projectId, rfiData) {
  const client = procoreClient(accessToken);

  // Get project users to find a valid rfi_manager_id
  let managerId = rfiData.assigneeId || null;
  if (!managerId) {
    try {
      const users = await getProjectUsers(accessToken, projectId);
      if (users && users.length > 0) managerId = users[0].id;
    } catch (e) {
      console.error('Could not get project users:', e.message);
    }
  }

  const rfi = {
    subject:        rfiData.title       || 'Clash RFI',
    question:       rfiData.description || rfiData.title || 'See clash details',
    priority:       mapPriority(rfiData.priority),
    reference:      `POMAR Clash — ${rfiData.clashName}`,
    rfi_manager_id: managerId,
  };

  if (rfiData.dueDate) rfi.due_date = rfiData.dueDate;

  const response = await client.post(`/projects/${projectId}/rfis`, { rfi });
  return response.data;
}

function mapPriority(priority) {
  const map = { Critical: 'high', High: 'high', Medium: 'medium', Low: 'low' };
  return map[priority] || 'medium';
}

module.exports = { getAuthUrl, exchangeCodeForToken, refreshAccessToken, getProjects, getProjectUsers, createRFI };
