const express = require('express')
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // Deshabilitar CSP para probar
}));
app.use(express.json());
app.use(cors());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-\_]/g, '_');
    cb(null, safeName);
  }
});

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const dbFile = path.join(__dirname, 'files.db');
const db = new sqlite3.Database(dbFile);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    token TEXT UNIQUE,
    original_name TEXT,
    filename TEXT,
    mime TEXT,
    size INTEGER,
    path TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  )`);
});

// Manejar subida y errores de multer devolviendo JSON
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      // multer error (file too large, invalid multipart, etc.)
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message || 'Upload error' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file' });
    // Generar token corto
    const token = uuidv4().split('-')[0];
    const stmt = db.prepare('INSERT INTO files (token, original_name, filename, mime, size, path) VALUES (?,?,?,?,?,?)');
    stmt.run(token, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.file.path, function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB error' });
      }
      const link = `/file/${token}`;
      res.json({ link });
    });
  });
});

app.get('/file/:token', (req, res) => {
  const token = req.params.token;
  db.get('SELECT * FROM files WHERE token = ?', [token], (err, row) => {
    if (err) return res.status(500).send('Server error');
    if (!row) return res.status(404).send('No encontrado');
    const absPath = path.resolve(row.path);
    if (!fs.existsSync(absPath)) return res.status(410).send('Archivo no disponible');
    res.type(row.mime || 'application/octet-stream');
    res.sendFile(absPath);
  });
});

app.use('/', express.static(path.join(__dirname)));

app.listen(PORT, () => console.log(`Servidor escuchando en http://localhost:${PORT}`));

// Error handler genérico para devolver JSON en caso de errores no capturados
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err && err.message ? err.message : 'Server error' });
});
