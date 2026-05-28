import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles } from '../middlewares/rbac.middleware';

import {
  // Items
  getChecklistItems,
  getChecklistItemById,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
  // Templates
  getTemplates,
  assignItemsToServicio,
  removeItemFromServicio,
  clearServicioTemplate,
  // Fichas (lectura)
  getFichasChecklist,
  // Consumo (lectura)
  getConsumoInsumos,
  // Resumen
  getChecklistResumen,
} from '../controllers/admin-checklist.controller';

const router = Router();

router.use(authMiddleware);
router.use(allowRoles('admin'));

router.use((req, _res, next) => {
  console.log(`[Admin Checklist] ${req.method} ${req.originalUrl}`);
  next();
});

// ══════════════════════════════════════
// RESUMEN
// ══════════════════════════════════════
router.get('/resumen', getChecklistResumen);

// ══════════════════════════════════════
// CHECKLIST ITEMS (catálogo)
// ══════════════════════════════════════
router.get   ('/items',         getChecklistItems);
router.post  ('/items',         createChecklistItem);
router.get   ('/items/:id',     getChecklistItemById);
router.put   ('/items/:id',     updateChecklistItem);
router.delete('/items/:id',     deleteChecklistItem);
router.patch ('/items/:id/toggle', toggleChecklistItem);

// ══════════════════════════════════════
// TEMPLATES (asignación items → servicios)
// ══════════════════════════════════════
router.get   ('/templates',                        getTemplates);
router.post  ('/templates',                        assignItemsToServicio);
router.delete('/templates/:servicio_id',           clearServicioTemplate);
router.delete('/templates/:servicio_id/:item_id',  removeItemFromServicio);

// ══════════════════════════════════════
// FICHAS CHECKLIST (lectura supervisión)
// ══════════════════════════════════════
router.get('/fichas', getFichasChecklist);

// ══════════════════════════════════════
// CONSUMO INSUMOS (lectura supervisión)
// ══════════════════════════════════════
router.get('/consumo', getConsumoInsumos);

export default router;