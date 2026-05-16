# POMAR Platform — constructmail-mvp

AI-powered construction intelligence tools for General Contractors, built by TechDen Solutions.

**Live at:** https://pomar.ai

---

## 🏗️ Platform Modules

### POMAR Mail — ConstructMail Intelligence
AI-powered email intelligence for General Contractors.
- Summarize email threads
- Extract action items
- Process meeting notes
- Detect RFI and change order signals

**Route:** `/constructmail` (login required)

### POMAR Clash — BIM Clash Analyzer
Upload Navisworks HTML clash reports and get instant actionable insights.
- Real HTML parser — reads your actual Navisworks export
- Severity scoring (Critical / High / Medium / Low)
- Top clashing element pairs
- AI-generated RFI drafts with discipline detection
- Copy-ready output for Procore and Kahua

**Route:** `/clash` (login required)

---

## 🛠️ Tech Stack

### Backend
- **Framework:** Express.js (Node.js)
- **Database:** PostgreSQL (Neon)
- **AI:** Anthropic Claude API (claude-sonnet-4-5)
- **Deployment:** Render

### Frontend
- **Framework:** React (Create React App)
- **Deployment:** Vercel
- **Domain:** pomar.ai

---

## 📂 Project Structure
constructmail-mvp/
├── backend/
│   ├── server.js              # Express app + all API endpoints
│   ├── db.js                  # PostgreSQL connection & schema
│   ├── ai-helpers.js          # Claude AI — email intelligence
│   ├── clash-helpers.js       # Claude AI — clash analysis + RFI drafting
│   ├── gmail-helpers.js       # Gmail OAuth integration
│   ├── outlook-helpers.js     # Outlook OAuth integration
│   ├── email-service.js       # Magic link email service
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.js             # Main router
│   │   ├── modules/
│   │   │   ├── constructmail/ # POMAR Mail module
│   │   │   │   ├── components/
│   │   │   │   ├── pages/
│   │   │   │   └── styles/
│   │   │   └── clash/         # POMAR Clash module
│   │   │       ├── components/
│   │   │       │   ├── ClashParser.js    # Navisworks HTML parser
│   │   │       │   ├── ClashUploader.js  # Drag & drop uploader
│   │   │       │   ├── ClashDashboard.js # Interactive report UI
│   │   │       │   └── RFIModal.js       # AI RFI draft modal
│   │   │       ├── pages/
│   │   │       │   └── ClashAnalyzer.js  # Main page
│   │   │       └── styles/
│   │   │           └── ClashAnalyzer.css
│   │   ├── components/        # Shared: Header, Footer, Login, PomarLogo
│   │   ├── pages/             # Shared: LandingPage, AboutUs, Contact, Privacy
│   │   ├── config/
│   │   │   └── products.js    # Platform product registry
│   │   └── styles/            # Shared: theme.css, components.css
│   └── package.json
│
└── README.md

---

## 🚀 Local Development

### Backend
```bash
cd backend
cp .env.example .env
# Add: DATABASE_URL, ANTHROPIC_API_KEY, PORT=3001
npm install
npm run dev
```

### Frontend
```bash
cd frontend
cp .env.example .env
# Add: REACT_APP_API_URL=http://localhost:3001
npm install
npm start
```

---

## 🔌 API Endpoints

### Health
- `GET /api/health`

### Auth
- `POST /api/auth/send-magic-link`
- `POST /api/auth/verify-token`
- `GET /api/auth/me`

### ConstructMail
- `POST /api/summarize`
- `POST /api/extract-actions`
- `POST /api/process-meeting`
- `POST /api/detect-signals`
- `GET /api/recent-summaries`
- `GET /api/open-actions`
- `GET /api/recent-signals`

### POMAR Clash
- `POST /api/clash/analyze` — AI summary of full clash report
- `POST /api/clash/draft-rfi` — AI RFI draft for a single clash

### Gmail / Outlook
- `GET /api/auth/gmail-url`
- `POST /api/auth/gmail-callback`
- `GET /api/gmail/emails`
- `GET /api/auth/outlook-url`
- `POST /api/auth/outlook-callback`
- `GET /api/outlook/emails`

---

## 🌐 Deployment

### Frontend → Vercel
Auto-deploys on push to `main` branch.
```bash
git push origin main
```

### Backend → Render
Auto-deploys on push to `main` branch.
Service URL: `https://constructmail-mvp.onrender.com`

---

## 🎨 Brand Colors
- **Inkwell:** `#0E1B2C` (primary dark)
- **Saffron:** `#D97706` (accent)
- **Parchment:** `#FAF7F2` (background)

Defined in `frontend/src/styles/theme.css`

---

## 🗺️ Roadmap

### Live ✅
- POMAR Mail — ConstructMail Intelligence
- POMAR Clash — BIM Clash Analyzer with AI RFI drafting

### Next
- Procore API integration — push RFIs directly from POMAR Clash
- Kahua API integration — asset data sync
- Clash delta detection — compare reports week over week
- COBie auto-populator — BIM handover tool

### Future Modules
- POMAR Handover — BIM-to-FM asset handover automation
- POMAR Analytics — project performance dashboards

---

## 📞 Contact
**TechDen Solutions** — Narendra Dhandela
- Email: ndhandela@techdensolutions.com
- Web: https://pomar.ai
