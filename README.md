# ConstructMail Intelligence

**AI-powered email intelligence for General Contractors**

Automatically summarize email threads, extract action items, detect RFIs and change orders, and process meeting notes using Claude AI.

---

## 🎯 Features

### Email Summarizer
- Automatically summarize email threads
- Extract key decisions and open items
- Identify key people involved
- AI-powered analysis using Claude

### Action Item Extractor
- Extract tasks and responsibilities from emails
- Track assignments and due dates
- Export to CSV for integration with project management tools
- Automatic database storage

### Meeting Notes Processor
- Parse meeting notes into structured format
- Extract attendees, decisions, and action items
- Identify open issues
- Auto-create action items from meetings

### RFI/Change Order Detection
- Automatically detect Request for Information (RFI) signals
- Identify change order requests with cost/schedule impact
- Flag schedule delays and risks
- Detect safety and submittal issues

### Dashboard
- View recent email summaries
- Track open action items
- Monitor detected signals
- Real-time statistics

---

## 🛠️ Tech Stack

### Backend
- **Framework:** Express.js (Node.js)
- **Database:** PostgreSQL (Neon)
- **AI:** Anthropic Claude API
- **Deployment:** Heroku

### Frontend
- **Framework:** React
- **HTTP Client:** Axios
- **Deployment:** Vercel
- **Domain:** pomar.ai

---

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL database (Neon recommended)
- Anthropic API key with credits
- GitHub account

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/ndhandela/constructmail-mvp.git
cd constructmail-mvp
```

### 2. Set Up Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your values:
# - DATABASE_URL (from Neon)
# - ANTHROPIC_API_KEY (from Anthropic Console)
# - PORT (default: 3001)

npm install
npm run dev
```

Backend runs on: `http://localhost:3001`

### 3. Set Up Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env with:
# - REACT_APP_API_URL=http://localhost:3001

npm install
npm start
```

Frontend runs on: `http://localhost:3000`

---

## 📝 Environment Variables

### Backend (`.env`)

```
DATABASE_URL=postgresql://user:password@host:5432/constructmail
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Frontend (`.env`)

```
REACT_APP_API_URL=http://localhost:3001
```

---

## 🎨 TechDen Brand Colors

All UI components use TechDen's brand colors:

- **Primary Color:** `#002e4a` (Dark Blue)
- **Secondary Color:** `#ff6600` (Orange)
- **Background:** `#ffffff` (White)
- **Text:** `#333333` (Dark Gray)

Colors are defined in `frontend/src/theme.css` as CSS variables for easy maintenance across pomar.ai.

---

## 📂 Project Structure

```
constructmail-mvp/
├── backend/
│   ├── server.js              # Express app + API endpoints
│   ├── db.js                  # PostgreSQL connection & schema
│   ├── ai-helpers.js          # Claude AI integration
│   ├── package.json
│   └── .env                   # Secrets (don't commit!)
│
├── frontend/
│   ├── src/
│   │   ├── App.js             # Main app with tabs
│   │   ├── App.css            # Global styles
│   │   ├── theme.css          # TechDen brand colors
│   │   ├── components/
│   │   │   ├── Dashboard.js
│   │   │   ├── Summarizer.js
│   │   │   ├── ActionExtractor.js
│   │   │   ├── MeetingNotes.js
│   │   │   └── SignalDetector.js
│   │   └── styles/
│   │       ├── components.css # Unified component styles
│   │       ├── Dashboard.css
│   │       ├── Summarizer.css
│   │       ├── ActionExtractor.css
│   │       ├── MeetingNotes.css
│   │       └── SignalDetector.css
│   ├── package.json
│   └── .env                   # API URL config
│
└── README.md                  # This file
```

---

## 🔌 API Endpoints

### Health Check
- **GET** `/api/health` — Check if backend is running

### Email Features
- **POST** `/api/summarize` — Summarize email thread
- **POST** `/api/extract-actions` — Extract action items from email
- **POST** `/api/detect-signals` — Detect RFI/change order signals

### Meeting Features
- **POST** `/api/process-meeting` — Process meeting notes

### Dashboard
- **GET** `/api/recent-summaries` — Last 5 email summaries
- **GET** `/api/open-actions` — Open action items sorted by due date
- **GET** `/api/recent-signals` — Last 5 detected signals

---

## 💾 Database Schema

### Tables

**users**
- id, email, name, company, created_at

**projects**
- id, user_id, name, created_at

**email_threads**
- id, project_id, raw_text, summary, decisions, created_at

**action_items**
- id, project_id, description, assigned_to, due_date, source_type, status, created_at

**meeting_notes**
- id, project_id, raw_text, attendees, decisions, action_items, open_issues, summary, created_at

**signals**
- id, project_id, raw_text, signal_type, confidence, created_at

---

## 🧪 Testing the App

### Test Email for All Features

```
Subject: Project Status Update - Schedule Delay & Submittal Issues

Hi Team,

Following up on yesterday's site meeting. We have a few critical items that need immediate attention:

MEETING RECAP:
Attendees: John (GC), Sarah (Structural Eng), Mike (MEP Sub), Lisa (Owner Rep)
Date: May 2, 2025

DECISIONS MADE:
1. We agreed to accelerate concrete pour to next Monday instead of Wednesday to make up 2 days
2. Owner approved $15K for expedited steel delivery
3. MEP scope change approved - adding 2 additional circuits in Zone B

ISSUES:
1. The structural submittals are still missing. Sarah, we need these by EOD Friday or we cannot proceed with foundation work. This is a critical path item.

2. There's a discrepancy in the MEP drawings. The HVAC ductwork shown doesn't match what we discussed. Mike, can you resubmit with corrected sizing? This may impact the schedule.

3. Owner is requesting a change to the electrical panel location (moving from east wall to west wall). This will require rework of conduit runs. We need a formal change order for this - estimated cost is $8,500 and adds 3 days.

ACTION ITEMS:
- Sarah: Submit structural calcs and steel detailing by Friday 5pm (Due: May 9, 2025)
- Mike: Resubmit MEP drawings with corrected ductwork by Thursday EOD (Due: May 8, 2025)
- John (me): Prepare change order for electrical panel relocation - need cost and schedule impact by Wednesday (Due: May 7, 2025)

Thanks,
John Smith
ABC Construction
```

Paste this into each tab to see:
- **Summarizer:** Key summary, decisions, open items, people
- **Actions:** Extracted tasks with assignments and due dates
- **Meeting Notes:** Parsed attendees, decisions, and action items
- **Signals:** Detected change orders, RFIs, and schedule impacts

---

## 🚢 Deployment

### Deploy Backend to Heroku

```bash
cd backend
heroku create your-app-name
heroku config:set DATABASE_URL=your_neon_url
heroku config:set ANTHROPIC_API_KEY=your_api_key
git push heroku main
```

### Deploy Frontend to Vercel

```bash
cd frontend
vercel
# Follow prompts, set REACT_APP_API_URL to your Heroku backend URL
```

---

## 📊 Performance & Costs

### Claude API Usage
- ~1000 tokens per email summary
- ~500 tokens per action extraction
- ~1500 tokens for meeting processing
- ~1000 tokens for signal detection

**Estimate:** ~$0.01-0.05 per email processed

### Database
Neon free tier includes 3 databases and 1 million free queries/month. Sufficient for MVP testing.

---

## 🔐 Security

- ✅ Environment variables for all secrets
- ✅ CORS configured for localhost only (update for production)
- ✅ No credentials in git (use `.env.example`)
- ✅ Database queries use parameterized statements

**Before production:**
- Update CORS to allow specific domains
- Enable HTTPS
- Add authentication/authorization
- Rate limit API endpoints

---

## 🤝 Contributing

For TechDen team members:

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally
3. Use TechDen colors (#002e4a, #ff6600) for any UI changes
4. Commit with clear messages: `git commit -m "Add feature description"`
5. Push and create Pull Request

---

## 📞 Support

For issues or questions:
1. Check the GitHub Issues tab
2. Review the build guide: `ConstructMail_Complete_Build_Guide_v2.md`
3. Contact: Narendra (ndhandela@gmail.com)

---

## 📄 License

Internal TechDen Solutions project. All rights reserved.

---

## 🎯 Roadmap

### Phase 1 (Complete ✅)
- ✅ Email summarization
- ✅ Action item extraction
- ✅ Meeting notes processing
- ✅ Signal detection
- ✅ Dashboard

### Phase 2 (Future)
- Integrate with Procore API
- Slack/Teams bot for alerts
- Mobile app
- Advanced analytics
- Integration with other construction tools

### Phase 3 (Scaling pomar.ai)
- Add other AI tools to pomar.ai platform
- Multi-tenant support
- Custom branding per client
- Advanced permission/role system

---

## 🏗️ Built by TechDen Solutions

**ConstructMail Intelligence** is part of the pomar.ai platform for construction technology innovation.

**Visit:** https://pomar.ai