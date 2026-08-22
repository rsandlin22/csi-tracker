const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL connection — Railway injects DATABASE_URL automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const QUICK_NOTE_LIMIT = 6;
const RECENT_TRANSACTION_LIMIT = 50;

// ─── Create tables on startup ─────────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id          SERIAL PRIMARY KEY,
      type        TEXT        NOT NULL CHECK (type IN ('credit', 'debit')),
      amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      note        TEXT        NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log('Database ready.');
}

initDb().catch(err => {
  console.error('DB init error (continuing anyway):', err.message);
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function getBalance() {
  const result = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0) AS balance
    FROM transactions
  `);
  return Number(result.rows[0].balance);
}

async function getRecentTransactions() {
  const result = await pool.query(
    `SELECT id, type, amount, note, created_at
     FROM transactions
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    [RECENT_TRANSACTION_LIMIT]
  );
  return result.rows;
}

async function getQuickNotes(type) {
  const result = await pool.query(
    `SELECT note, COUNT(*) AS uses
     FROM transactions
     WHERE type = $1
     GROUP BY note
     ORDER BY uses DESC, MAX(created_at) DESC
     LIMIT $2`,
    [type, QUICK_NOTE_LIMIT]
  );
  return result.rows.map(r => r.note);
}

async function getState() {
  const [balance, transactions, creditNotes, debitNotes] = await Promise.all([
    getBalance(),
    getRecentTransactions(),
    getQuickNotes('credit'),
    getQuickNotes('debit')
  ]);
  return {
    balance,
    transactions,
    quickNotes: { credit: creditNotes, debit: debitNotes }
  };
}

// ─── API: Get current balance, recent transactions, and quick notes ──────────
app.get('/api/state', async (req, res) => {
  try {
    res.json(await getState());
  } catch (err) {
    console.error('GET /api/state error:', err.message);
    res.status(500).json({ error: 'Failed to load account state.' });
  }
});

// ─── API: Record a transaction (credit or debit) ──────────────────────────────
app.post('/api/transaction', async (req, res) => {
  const { type, amount, note } = req.body;

  const parsedAmount = Number(amount);
  const trimmedNote = typeof note === 'string' ? note.trim() : '';

  if (type !== 'credit' && type !== 'debit') {
    return res.status(400).json({ error: 'type must be "credit" or "debit".' });
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number.' });
  }
  if (!trimmedNote) {
    return res.status(400).json({ error: 'note is required.' });
  }

  try {
    await pool.query(
      `INSERT INTO transactions (type, amount, note) VALUES ($1, $2, $3)`,
      [type, parsedAmount.toFixed(2), trimmedNote]
    );
    res.json(await getState());
  } catch (err) {
    console.error('POST /api/transaction error:', err.message);
    res.status(500).json({ error: 'Failed to save transaction.' });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Serve index.html for all other routes ────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Allowance Tracker running on port ${PORT}`);
});
