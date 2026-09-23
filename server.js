const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' })); // archive/BOY/EOY payloads carry the full school roster
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL connection — Railway injects DATABASE_URL (or DATABASE_PUBLIC_URL
// when only the public connection string was linked) automatically
const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false
});

if (!connectionString) {
  console.error('No DATABASE_URL or DATABASE_PUBLIC_URL set — DB connection will fail.');
}

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS boy_reports (
      id           SERIAL PRIMARY KEY,
      specialist   TEXT        NOT NULL,
      school_year  TEXT        NOT NULL,
      schools      JSONB       DEFAULT '{}',
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS eoy_reports (
      id           SERIAL PRIMARY KEY,
      specialist   TEXT        NOT NULL,
      school_year  TEXT        NOT NULL,
      schools      JSONB       DEFAULT '{}',
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS priority_flags (
      school_name  TEXT        NOT NULL,
      lever_id     TEXT        NOT NULL,
      prioritized  BOOLEAN     NOT NULL,
      updated_at   TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (school_name, lever_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS archive_snapshots (
      id           SERIAL PRIMARY KEY,
      label        TEXT        NOT NULL,
      schools      JSONB       NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Single current roster — replaced wholesale each time a portfolio CSV is
  // uploaded, so every device starts from the same set of schools instead of
  // each one falling back to the hardcoded default list.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roster_snapshot (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      schools    JSONB   NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    )
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

// ─── API: BOY (Beginning-of-Year) reports ─────────────────────────────────────
app.post('/api/boy-report', async (req, res) => {
  const { specialist, school_year, schools } = req.body;
  if (!specialist || !school_year) {
    return res.status(400).json({ error: 'specialist and school_year are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO boy_reports (specialist, school_year, schools)
       VALUES ($1, $2, $3)
       RETURNING id, submitted_at`,
      [specialist, school_year, JSON.stringify(schools || {})]
    );
    res.json({ success: true, id: result.rows[0].id, submitted_at: result.rows[0].submitted_at });
  } catch (err) {
    console.error('POST /api/boy-report error:', err.message);
    res.status(500).json({ error: 'Failed to save BOY report.' });
  }
});

app.get('/api/boy-reports', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM boy_reports ORDER BY submitted_at ASC`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/boy-reports error:', err.message);
    res.status(500).json({ error: 'Failed to fetch BOY reports.' });
  }
});

// ─── API: EOY (End-of-Year) reports ───────────────────────────────────────────
app.post('/api/eoy-report', async (req, res) => {
  const { specialist, school_year, schools } = req.body;
  if (!specialist || !school_year) {
    return res.status(400).json({ error: 'specialist and school_year are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO eoy_reports (specialist, school_year, schools)
       VALUES ($1, $2, $3)
       RETURNING id, submitted_at`,
      [specialist, school_year, JSON.stringify(schools || {})]
    );
    res.json({ success: true, id: result.rows[0].id, submitted_at: result.rows[0].submitted_at });
  } catch (err) {
    console.error('POST /api/eoy-report error:', err.message);
    res.status(500).json({ error: 'Failed to save EOY report.' });
  }
});

app.get('/api/eoy-reports', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM eoy_reports ORDER BY submitted_at ASC`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/eoy-reports error:', err.message);
    res.status(500).json({ error: 'Failed to fetch EOY reports.' });
  }
});

// ─── API: Current school roster (set by portfolio CSV upload) ────────────────
app.post('/api/roster', async (req, res) => {
  const { schools } = req.body;
  if (!Array.isArray(schools)) {
    return res.status(400).json({ error: 'schools (array) is required.' });
  }
  try {
    await pool.query(
      `INSERT INTO roster_snapshot (id, schools, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET schools = $1, updated_at = NOW()`,
      [JSON.stringify(schools)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/roster error:', err.message);
    res.status(500).json({ error: 'Failed to save roster.' });
  }
});

app.get('/api/roster', async (req, res) => {
  try {
    const result = await pool.query(`SELECT schools FROM roster_snapshot WHERE id = 1`);
    res.json(result.rows[0] ? result.rows[0].schools : null);
  } catch (err) {
    console.error('GET /api/roster error:', err.message);
    res.status(500).json({ error: 'Failed to fetch roster.' });
  }
});

// ─── API: Priority-focus-strand toggles ───────────────────────────────────────
app.post('/api/priority', async (req, res) => {
  const { school_name, lever_id, prioritized } = req.body;
  if (!school_name || !lever_id || typeof prioritized !== 'boolean') {
    return res.status(400).json({ error: 'school_name, lever_id, and prioritized (boolean) are required.' });
  }
  try {
    await pool.query(
      `INSERT INTO priority_flags (school_name, lever_id, prioritized, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (school_name, lever_id) DO UPDATE SET prioritized = $3, updated_at = NOW()`,
      [school_name, lever_id, prioritized]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/priority error:', err.message);
    res.status(500).json({ error: 'Failed to save priority flag.' });
  }
});

app.get('/api/priorities', async (req, res) => {
  try {
    const result = await pool.query(`SELECT school_name, lever_id, prioritized FROM priority_flags`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/priorities error:', err.message);
    res.status(500).json({ error: 'Failed to fetch priority flags.' });
  }
});

// ─── API: Portfolio archive snapshots (CSV import / restore history) ─────────
app.post('/api/archive', async (req, res) => {
  const { label, schools } = req.body;
  if (!schools) {
    return res.status(400).json({ error: 'schools is required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO archive_snapshots (label, schools)
       VALUES ($1, $2)
       RETURNING id, created_at`,
      [label || 'Snapshot', JSON.stringify(schools)]
    );
    // Keep only the 10 most recent snapshots
    await pool.query(`
      DELETE FROM archive_snapshots
      WHERE id NOT IN (SELECT id FROM archive_snapshots ORDER BY created_at DESC LIMIT 10)
    `);
    res.json({ success: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (err) {
    console.error('POST /api/archive error:', err.message);
    res.status(500).json({ error: 'Failed to save archive snapshot.' });
  }
});

app.get('/api/archive', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM archive_snapshots ORDER BY created_at DESC LIMIT 10`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/archive error:', err.message);
    res.status(500).json({ error: 'Failed to fetch archive snapshots.' });
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
