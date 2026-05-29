// src/config/multer.config.ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Crear directorio si no existe
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'fichas');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Nombre único: timestamp-random
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `ficha-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// Filtro para permitir solo imágenes
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, WebP)'));
  }
};

export const uploadFichaFoto = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
});