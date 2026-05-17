// procore-helpers.js
// Procore OAuth + RFI API integration for POMAR Clash
// TechDen Solutions

const axios = require('axios');

const {
  PROCORE_CLIENT_ID,
  PROCORE_CLIENT_SECRET,
  PROCORE_REDIRECT_URI,
  PROCORE_SANDBOX_CLIENT_ID,
  PROCORE_SANDBOX_CLIENT_SECRET,
  PROCORE_SANDBOX_REDIRECT_URI,
  PROCORE_BASE_URL = 'https://sandbox.procore.com',
} = process.env;

const isSandbox = process.env.NODE_ENV !== 'production';
const CLIENT_ID     = isSandbox ? PROCORE_SANDBOX_CLIENT_ID     : PROCORE_CLIENT_ID;
const CLIENT_SECRET = isSandbox ? PROCORE_SANDBOX_CLIENT_SECRET : PROCORE_CLIENT_SECRET;
const REDIRECT_URI  = isSandbox ? PROCORE_SANDBOX_REDIRECT_URI  : PROCORE_REDIRECT_URI;
const BASE_URL      = PROCORE_BASE_URL;

function getAuthUrl(state = '') {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    state,
  });
  return `${BASE_URL}/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const response = await axios.post(`${BASE_URL}/oauth/token`, {
    grant_type:    'authorization_code',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    code,
  });
  return response.data;
}

async function refreshAccessToken(refreshToken) {
  const response = await axios.post(`${BASE_URL}/oauth/token`, {
    grant_type:    'refresh_token',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    refresh_token: refreshToken,
  });
  return response.data;
}

function procoreClient(accessToken) {
  return axios.create({
    baseURL: `${BASE_URL}/rest/v1.0`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

async function getProjects(accessToken) {
  const client = procoreClient(accessToken);
  const response = await client.get('/projects', {
    params: { per_page: 100 },
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

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getProjects,
  getProjectUsers,
  createRFI,
};
