const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json());
app.use(cors());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

// Conectar MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/filesdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const fileSchema = new mongoose.Schema({
  token: { type: String, unique: true },
  original_name: String,
  filename: String,
  mime: String,
  size: Number,
  s3Key: String,
  created_at: { type: Date, default: Date.now },
});

const File = mongoose.model('File', fileSchema);

// Configurar S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET,
    key: function (req, file, cb) {
      const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-\_]/g, '_');
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const token = uuidv4().split('-')[0];
  try {
    const newFile = new File({
      token,
      original_name: req.file.originalname,
      filename: req.file.key,
      mime: req.file.mimetype,
      size: req.file.size,
      s3Key: req.file.key,
    });
    await newFile.save();
    const link = `/file/${token}`;
    res.json({ link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/file/:token', async (req, res) => {
  const token = req.params.token;
  try {
    const file = await File.findOne({ token });
    if (!file) return res.status(404).send('No encontrado');
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: file.s3Key,
    };
    const signedUrl = s3.getSignedUrl('getObject', {
      ...params,
      Expires: 3600, // 1 hour
    });
    res.redirect(signedUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.use('/', express.static('public'));

module.exports = app;