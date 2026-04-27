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

// ─── Create tables on startup ─────────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_reports (
      id              SERIAL PRIMARY KEY,
      school_name     TEXT        NOT NULL,
      specialist      TEXT        NOT NULL,
      visit_date      DATE        NOT NULL,
      visit_type      TEXT,
      notes           TEXT,
      ratings         JSONB       DEFAULT '{}',
      prioritized_levers JSONB   DEFAULT '[]',
      plan_status     TEXT,
      priority_notes  TEXT,
      submitted_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Index for fast school lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_visit_school
    ON visit_reports (school_name)
  `);

  console.log('Database ready.');
}

initDb().catch(err => {
  console.error('DB init error (continuing anyway):', err.message);
});

// ─── API: Save a visit report ─────────────────────────────────────────────────
app.post('/api/visit', async (req, res) => {
  const {
    school_name, specialist, visit_date, visit_type,
    notes, ratings, prioritized_levers, plan_status, priority_notes
  } = req.body;

  if (!school_name || !specialist || !visit_date) {
    return res.status(400).json({ error: 'school_name, specialist, and visit_date are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO visit_reports
        (school_name, specialist, visit_date, visit_type, notes,
         ratings, prioritized_levers, plan_status, priority_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, submitted_at`,
      [
        school_name, specialist, visit_date, visit_type || null,
        notes || null,
        JSON.stringify(ratings || {}),
        JSON.stringify(prioritized_levers || []),
        plan_status || null,
        priority_notes || null
      ]
    );
    res.json({ success: true, id: result.rows[0].id, submitted_at: result.rows[0].submitted_at });
  } catch (err) {
    console.error('POST /api/visit error:', err.message);
    res.status(500).json({ error: 'Failed to save visit report.' });
  }
});

// ─── API: Get all visit reports (most recent first) ───────────────────────────
app.get('/api/visits', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM visit_reports ORDER BY submitted_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/visits error:', err.message);
    res.status(500).json({ error: 'Failed to fetch visits.' });
  }
});

// ─── API: Get visits for one school ──────────────────────────────────────────
app.get('/api/visits/:school', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM visit_reports
       WHERE school_name = $1
       ORDER BY visit_date DESC`,
      [decodeURIComponent(req.params.school)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/visits/:school error:', err.message);
    res.status(500).json({ error: 'Failed to fetch school visits.' });
  }
});

// ─── API: Get visits for one specialist ──────────────────────────────────────
app.get('/api/specialist/:name', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM visit_reports
       WHERE specialist = $1
       ORDER BY visit_date DESC`,
      [decodeURIComponent(req.params.name)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/specialist/:name error:', err.message);
    res.status(500).json({ error: 'Failed to fetch specialist visits.' });
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
  console.log(`CSI Tracker running on port ${PORT}`);
});
