# Indiana CSI Portfolio Tracker

## Project Structure

```
csi-tracker/
├── server.js          — Express backend, API routes, PostgreSQL connection
├── package.json
├── .gitignore
├── README.md
└── public/
    └── index.html     — The full CSI tracker app (copy your HTML file here)
```

## Setup & Deployment

### 1. Copy your HTML file
Place `csi_portfolio_tracker.html` into the `public/` folder and rename it `index.html`.

### 2. Install dependencies locally (optional, for testing)
```bash
npm install
```

### 3. Test locally (optional)
If you have PostgreSQL installed locally, set a DATABASE_URL and run:
```bash
node server.js
```
Then open http://localhost:3000

Without a local database, the app still works — form submissions just won't persist until deployed.

### 4. Push to GitHub
```bash
git init
git add .
git commit -m "Initial CSI tracker deployment"
# Create a new repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/csi-tracker.git
git push -u origin main
```

### 5. Deploy on Railway
1. Go to https://railway.app and sign in with GitHub
2. Click **New Project → Deploy from GitHub Repo** → select `csi-tracker`
3. Railway detects Node.js automatically and runs `npm start`
4. Click **+ New** → **Database** → **Add PostgreSQL**
   - Railway automatically sets the `DATABASE_URL` environment variable
5. Click **Deploy** — your site goes live in ~2 minutes
6. Go to **Settings → Networking → Generate Domain** for your public URL

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/visits | All visit reports (used by app on load) |
| POST | /api/visit | Save a new visit report |
| GET | /api/visits/:school | All visits for a specific school |
| GET | /api/specialist/:name | All visits by a specific specialist |
| GET | /api/health | Health check |

## Data Persistence

Every time a specialist submits a visit report, it is:
1. POSTed to `/api/visit` and saved to PostgreSQL
2. Immediately reflected in the local UI
3. Loaded back from the database the next time any user opens the site

Visit history per school and per lever strand is preserved across all sessions.
