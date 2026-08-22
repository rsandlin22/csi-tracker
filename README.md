# Allowance Tracker

A simple allowance tracking app. Add money with quick buttons, subtract for
expenses in $0.25 increments (or a custom amount), and jot a note for every
transaction. Your most-used notes are saved as "quick notes" so you can tap
instead of retyping them. All data is stored server-side in PostgreSQL —
nothing is saved in the browser.

## Project Structure

```
csi-tracker/
├── server.js          — Express backend, API routes, PostgreSQL connection
├── package.json
├── .gitignore
├── README.md
└── public/
    ├── index.html      — App markup
    ├── style.css        — App styling
    └── app.js           — App logic (fetches /api/state, posts /api/transaction)
```

## How it works

- **Add Money** — five quick buttons: $0.25, $0.50, $1.00, $5.00, $10.00.
- **Subtract Money** — opens an expense panel with $0.25 step buttons or a
  custom amount field.
- Every add/subtract opens a note prompt. Your top used notes (per
  add/subtract type) appear as tappable "quick note" chips so you don't have
  to retype common entries like "Chores" or "Snack".
- The balance and recent transaction history are loaded from the server on
  every page load, so the account is consistent across devices/browsers.

## Setup & Deployment

### 1. Install dependencies locally (optional, for testing)
```bash
npm install
```

### 2. Test locally (optional)
If you have PostgreSQL installed locally, set a `DATABASE_URL` and run:
```bash
node server.js
```
Then open http://localhost:3000

Without a local database, the app still loads but transactions won't save
until a database is connected.

### 3. Push to GitHub
```bash
git add .
git commit -m "Allowance tracker"
git push -u origin <branch-name>
```

### 4. Deploy on Railway
1. Go to https://railway.app and sign in with GitHub
2. Click **New Project → Deploy from GitHub Repo** → select this repo
3. Railway detects Node.js automatically and runs `npm start`
4. Click **+ New → Database → Add PostgreSQL**
   - Railway automatically sets the `DATABASE_URL` environment variable
5. Click **Deploy** — your site goes live in a couple minutes
6. Go to **Settings → Networking → Generate Domain** for your public URL

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/state | Current balance, recent transactions, and quick notes |
| POST | /api/transaction | Record a transaction `{ type: 'credit'\|'debit', amount, note }` |
| GET | /api/health | Health check |

## Data Persistence

Every add or subtract is POSTed to `/api/transaction` and saved to
PostgreSQL immediately. The balance and history are always recomputed from
the database, so nothing lives only in the browser — clearing browser data
or switching devices won't lose your history.
