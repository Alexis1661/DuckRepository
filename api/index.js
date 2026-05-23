const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app = express();

const DATA_DIR   = '/tmp/data';
const UPL_DIR    = '/tmp/data/uploads';
const STATE_FILE = '/tmp/data/state.json';

[DATA_DIR, UPL_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use('/uploads', express.static(UPL_DIR));

app.get('/api/state', (req, res) => {
  try {
    if (!fs.existsSync(STATE_FILE)) return res.json(null);
    res.json(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/state', (req, res) => {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ ok: true, url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

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

module.exports = app;
