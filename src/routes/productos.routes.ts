// ─── src/routes/productos.routes.ts ──────────────────────────────────────────
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';

import {
  getCategorias, createCategoria, updateCategoria, deleteCategoria,
  getProductos, getProductoById, createProducto, updateProducto,
  deleteProducto, updateStock,
  getVariantesByProducto, createVariante, createVariantesBatch,
  updateVariante, deleteVariante,
  getAlertasStock, getReporteInventario, getReportePDF,
  subirImagenProducto,
  getMasVendidos, getMasUsados,
  deleteProductoPermanent,
} from '../controllers/productos.controller';

const router = Router();

// ── Configuración de multer para subida de imágenes ────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), 'public', 'fotos', 'productos');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, webp)'));
  },
});

// ── Middleware global para este router ────────────────────────────────
router.use(authMiddleware);
router.use(allowRoles('admin'));

// Log básico de peticiones
router.use((req, _res, next) => {
  console.log(`[Productos] ${req.method} ${req.originalUrl}`);
  next();
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ═══════════════════════════════════════════════════════════════════
router.get   ('/categorias',     getCategorias);
router.post  ('/categorias',     createCategoria);
router.put   ('/categorias/:id', updateCategoria);
router.delete('/categorias/:id', deleteCategoria);

// ═══════════════════════════════════════════════════════════════════
// IMAGEN – Subida de archivo (debe ir ANTES de /productos/:id)
// ═══════════════════════════════════════════════════════════════════
router.post('/productos/imagen', upload.single('imagen'), subirImagenProducto);

// ═══════════════════════════════════════════════════════════════════
// ALERTAS, ESTADÍSTICAS Y REPORTES (ANTES de /productos/:id)
// ═══════════════════════════════════════════════════════════════════
router.get('/productos/alertas',      getAlertasStock);
router.get('/productos/reporte',      getReporteInventario);
router.get('/productos/reporte/pdf',  getReportePDF);
router.get('/productos/mas-vendidos', getMasVendidos);
router.get('/productos/mas-usados',   getMasUsados);

// ═══════════════════════════════════════════════════════════════════
// PRODUCTOS (CRUD + stock)
// ═══════════════════════════════════════════════════════════════════
router.get   ('/productos',              getProductos);
router.get   ('/productos/:id',          getProductoById);
router.post  ('/productos',              createProducto);
router.put   ('/productos/:id',          updateProducto);
router.delete('/productos/:id',          deleteProducto);
router.patch ('/productos/:id/stock',    updateStock);
// Dentro del router, en la sección de PRODUCTOS
router.delete('/productos/:id/permanent', deleteProductoPermanent);

// Asegúrate que esté ANTES de esta línea:
router.delete('/productos/:id',          deleteProducto);

// ═══════════════════════════════════════════════════════════════════
// VARIANTES (individuales y por lote)
// ═══════════════════════════════════════════════════════════════════
router.get   ('/productos/:id/variantes',       getVariantesByProducto);
router.post  ('/productos/:id/variantes',       createVariante);
router.post  ('/productos/:id/variantes/batch', createVariantesBatch);
router.put   ('/variantes/:id',                 updateVariante);
router.delete('/variantes/:id',                 deleteVariante);

export default router;