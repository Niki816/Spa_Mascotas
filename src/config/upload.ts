import multer from 'multer';
import path from 'path';
import fs from 'fs';

const carnetDir = path.join(process.cwd(), 'public', 'carnets');

if (!fs.existsSync(carnetDir)) {
  fs.mkdirSync(carnetDir, { recursive: true });
}

const carnetStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, carnetDir);
  },

  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);

    cb(null, `carnet-${uniqueSuffix}${ext}`);
  },
});

export const uploadCarnet = multer({
  storage: carnetStorage,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes o PDF'));
    }
  },
});