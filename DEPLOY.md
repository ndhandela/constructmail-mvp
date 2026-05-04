# Deployment Guide - ConstructMail Intelligence

Complete guide to deploy ConstructMail Intelligence to production (pomar.ai).

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] GitHub account and repository access
- [ ] Heroku account (for backend)
- [ ] Vercel account (for frontend)
- [ ] Neon PostgreSQL account with production database
- [ ] Anthropic API key with production credits
- [ ] Domain: pomar.ai (or subdomain like constructmail.pomar.ai)
- [ ] All environment variables ready
- [ ] All tests passing locally
- [ ] Latest code committed to GitHub

---

## 🔧 Step 1: Set Up Production Database (Neon)

### 1a. Create Production Database

1. Go to https://console.neon.tech
2. Click **Create new project**
3. Name it: `constructmail-prod`
4. Select region closest to your users
5. Click **Create**
6. Copy the **Connection String** (looks like: `postgresql://user:pass@...neon.tech/...`)

### 1b. Initialize Database Schema

1. Connect to your production database:

```bash
psql postgresql://your-prod-connection-string
```

2. Run the schema initialization (same as development):

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  company VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email threads table
CREATE TABLE email_threads (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  raw_text TEXT,
  summary TEXT,
  decisions TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Action items table
CREATE TABLE action_items (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  description TEXT,
  assigned_to VARCHAR(255),
  due_date DATE,
  source_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meeting notes table
CREATE TABLE meeting_notes (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  raw_text TEXT,
  attendees TEXT,
  decisions TEXT,
  action_items TEXT,
  open_issues TEXT,
  summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Signals table
CREATE TABLE signals (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  raw_text TEXT,
  signal_type VARCHAR(50),
  confidence DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

3. Type `\q` to exit psql

---

## 🚀 Step 2: Deploy Backend to Heroku

### 2a. Create Heroku App

```bash
# Install Heroku CLI if you haven't already
brew tap heroku/brew && brew install heroku

# Login to Heroku
heroku login

# Create app
cd constructmail-mvp/backend
heroku create constructmail-api
```

### 2b. Add Environment Variables

```bash
heroku config:set -a constructmail-api \
  DATABASE_URL="postgresql://your-prod-connection-string" \
  ANTHROPIC_API_KEY="sk-ant-your-actual-key" \
  PORT=3001 \
  NODE_ENV=production \
  FRONTEND_URL=https://constructmail.pomar.ai
```

### 2c. Deploy

```bash
# Ensure you're in backend folder
cd backend

# Add Heroku remote
heroku git:remote -a constructmail-api

# Deploy
git push heroku main
```

### 2d. Verify Deployment

```bash
# Check logs
heroku logs -a constructmail-api --tail

# Test the API
curl https://constructmail-api.herokuapp.com/api/health
```

You should see:
```json
{"status":"ok"}
```

**Backend URL:** `https://constructmail-api.herokuapp.com`

---

## 🌐 Step 3: Deploy Frontend to Vercel

### 3a. Connect Vercel to GitHub

1. Go to https://vercel.com
2. Click **Import Project**
3. Select **Import Git Repository**
4. Authorize GitHub and select `constructmail-mvp`
5. Configure:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `build`

### 3b. Add Environment Variables

1. In Vercel project settings, go to **Environment Variables**
2. Add:
   ```
   REACT_APP_API_URL=https://constructmail-api.herokuapp.com
   ```
3. Save

### 3c. Deploy

1. Click **Deploy**
2. Wait for build to complete (2-3 minutes)
3. Copy the **Production URL** (e.g., `https://constructmail-pomar.vercel.app`)

---

## 🔗 Step 4: Connect Custom Domain (pomar.ai)

### 4a. Update Vercel Domain Settings

1. In Vercel project, go to **Settings** → **Domains**
2. Add domain: `constructmail.pomar.ai`
3. Copy the **Nameserver Records** from Vercel

### 4b. Update DNS on Domain Registrar

1. Go to your domain registrar (IONOS, GoDaddy, etc.)
2. Go to DNS settings for `pomar.ai`
3. Add the nameserver records from Vercel
4. Wait for DNS propagation (5-30 minutes)

### 4c. Verify

```bash
# Test DNS
nslookup constructmail.pomar.ai

# Should resolve to Vercel's servers
```

---

## 🔐 Step 5: Security & Polish

### 5a. Update CORS on Backend

In `backend/server.js`, update CORS configuration:

```javascript
const cors = require('cors');

const corsOptions = {
  origin: [
    'https://constructmail.pomar.ai',
    'https://pomar.ai',
    'http://localhost:3000' // Keep for local development
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
};

app.use(cors(corsOptions));
```

Deploy this change:

```bash
cd backend
git add -A
git commit -m "Update CORS for production domains"
git push heroku main
```

### 5b. Enable HTTPS

Vercel automatically provides HTTPS on all domains. ✅

Heroku also provides HTTPS. ✅

### 5c. Set Up Monitoring

**Heroku:**
```bash
heroku addons:create papertrail -a constructmail-api
heroku addons:open papertrail -a constructmail-api
```

This gives you log aggregation and alerts.

---

## 📊 Step 6: Monitor & Maintain

### Health Checks

Set up monitoring to check if services are running:

```bash
# Test backend daily
curl https://constructmail-api.herokuapp.com/api/health

# Test frontend
curl https://constructmail.pomar.ai
```

### View Logs

```bash
# Backend logs
heroku logs -a constructmail-api --tail

# Frontend logs (in Vercel dashboard)
# https://vercel.com/constructmail-mvp/analytics
```

### Scale if Needed

```bash
# Upgrade Heroku dyno (if hitting rate limits)
heroku dyno:type Standard-1X -a constructmail-api

# Vercel automatically scales (no action needed)
```

---

## 🔄 Step 7: Continuous Deployment

Every time you push to GitHub, it automatically deploys:

- **Backend:** `git push heroku main` (manual) or set up GitHub Actions
- **Frontend:** Vercel automatically deploys on GitHub push

### Optional: Set Up GitHub Actions for Backend Auto-Deploy

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "constructmail-api"
          heroku_email: "your-email@techden.com"
          appdir: "backend"
```

Then add `HEROKU_API_KEY` to GitHub Secrets.

---

## 🆘 Troubleshooting

### Backend won't start

```bash
# Check logs
heroku logs -a constructmail-api

# Check environment variables
heroku config -a constructmail-api

# Restart dyno
heroku restart -a constructmail-api
```

### Database connection errors

```bash
# Test connection
psql postgresql://your-prod-connection-string

# Check DATABASE_URL is correct
heroku config:get DATABASE_URL -a constructmail-api
```

### Frontend showing "Network Error"

1. Check browser console (F12)
2. Verify `REACT_APP_API_URL` in Vercel env vars
3. Ensure backend is running: `https://constructmail-api.herokuapp.com/api/health`
4. Check CORS is configured correctly

### DNS not resolving

```bash
# Flush DNS cache
# On Mac:
sudo dscacheutil -flushcache

# Wait 24 hours for full propagation
# Check status: https://www.whatsmydns.net/
```

---

## 📋 Production Checklist

Before going live:

- [ ] Database is initialized and has test data
- [ ] Backend API responds to health check
- [ ] Frontend loads without errors
- [ ] All 5 tabs work (Summarizer, Actions, Meeting Notes, Signals, Dashboard)
- [ ] Emails are being processed correctly
- [ ] TechDen branding is visible (#002e4a, #ff6600 colors)
- [ ] Custom domain resolves correctly
- [ ] HTTPS works on all pages
- [ ] No console errors in browser
- [ ] API errors are logged properly
- [ ] Monitoring is set up

---

## 📈 Post-Launch

### Week 1
- Monitor logs for errors
- Test with real GC users
- Collect feedback

### Week 2-4
- Fix bugs reported
- Optimize performance
- Plan Phase 2 features

### Month 2+
- Add Procore/Oracle integrations
- Set up Slack bot for alerts
- Scale to 50+ GC users (your goal!)

---

## 🎯 URLs

Once deployed:

- **Frontend:** https://constructmail.pomar.ai
- **Backend API:** https://constructmail-api.herokuapp.com
- **GitHub:** https://github.com/ndhandela/constructmail-mvp
- **Heroku Dashboard:** https://dashboard.heroku.com/apps/constructmail-api
- **Vercel Dashboard:** https://vercel.com/constructmail-mvp

---

## 📞 Rollback Plan

If something goes wrong in production:

```bash
# Revert to previous version
git revert HEAD
git push heroku main

# Or restore from specific commit
git reset --hard <commit-hash>
git push -f heroku main
```

---

## 📝 Deployment Completed

Once you've successfully deployed:

1. Update `README.md` with production URLs
2. Share access with team members
3. Get feedback from early GC users
4. Document any issues discovered

---

**Ready to deploy?** Follow the steps above in order. Estimated time: 30-45 minutes.

Good luck! 🚀