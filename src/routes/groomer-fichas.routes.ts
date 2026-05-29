// src/routes/groomer-fichas.routes.ts
import { Router } from 'express';
import { uploadFichaFoto } from '../config/multer.config';
import {
  getFichasActivas,
  getFichaDetalle,
  iniciarServicio,
  toggleChecklistItem,
  subirFotoFicha,
  registrarConsumo,
  eliminarConsumo,
  cerrarFicha,
  getProductosConsumibles,
} from '../controllers/groomer-fichas.controller';

const router = Router();

// ─── FICHAS ───
router.get('/activas', getFichasActivas);

// ─── PRODUCTOS ───
router.get('/productos-consumo', getProductosConsumibles);



router.get('/:citaId', getFichaDetalle);
router.post('/:citaId/iniciar', iniciarServicio);
router.put('/:citaId/checklist/:itemId', toggleChecklistItem);

// ─── FOTOS (con multer) ───
router.post(
  '/:citaId/foto',
  uploadFichaFoto.single('foto'),
  subirFotoFicha
);

// ─── CONSUMO DE INSUMOS ───
router.post('/:citaId/consumo', registrarConsumo);
router.delete('/:citaId/consumo/:consumoId', eliminarConsumo);

// ─── CIERRE DE FICHA ───
router.post('/:citaId/cerrar', cerrarFicha);


export default router;