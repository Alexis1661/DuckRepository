/**
 * Patico Editor — Mini Backend
 * Express + WebSocket + Multer
 *
 * Usage:
 *   npm install
 *   node server.js      (or: npm start)
 *   Open http://localhost:3000
 */

const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT       = 3000;
const ROOT_DIR   = __dirname;
const DATA_DIR   = path.join(ROOT_DIR, 'data');
const UPL_DIR    = path.join(DATA_DIR, 'uploads');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Create data directories if missing
[DATA_DIR, UPL_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── Express app ──────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Serve the editor and all static assets from project root
app.use(express.static(ROOT_DIR));
// Serve uploaded files
app.use('/uploads', express.static(UPL_DIR));

// ─── WebSocket (real-time push to all tabs) ───────────────────────────────────
const wss = new WebSocket.Server({ server });

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

wss.on('connection', ws => {
  console.log('[WS] client connected');
  // Send current state immediately on connect
  try {
    const state = fs.existsSync(STATE_FILE)
      ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
      : null;
    ws.send(JSON.stringify({ type: 'init', state }));
  } catch (e) { /* ignore */ }

  ws.on('close', () => console.log('[WS] client disconnected'));
});

// ─── REST API ─────────────────────────────────────────────────────────────────

// GET /api/state  → load saved editor state
app.get('/api/state', (req, res) => {
  try {
    if (!fs.existsSync(STATE_FILE)) return res.json(null);
    res.json(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/state  → save editor state (called on every meaningful change)
app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    // Push to all OTHER connected clients so multiple tabs stay in sync
    broadcast({ type: 'state_update', state: req.body });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/state  → reset saved state
app.delete('/api/state', (req, res) => {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    broadcast({ type: 'state_reset' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/upload  → upload a PNG accessory, returns its URL
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPL_DIR),
  filename:    (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'image/png' || file.mimetype === 'image/jpeg'),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const url = `/uploads/${req.file.filename}`;
  console.log(`[upload] ${req.file.filename}`);
  res.json({ ok: true, url, filename: req.file.filename });
});

// GET /api/uploads  → list uploaded files
app.get('/api/uploads', (req, res) => {
  try {
    const files = fs.readdirSync(UPL_DIR).map(f => ({
      filename: f,
      url: `/uploads/${f}`,
      size: fs.statSync(path.join(UPL_DIR, f)).size
    }));
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🦆  Patico Editor running at  http://localhost:${PORT}\n`);
});
