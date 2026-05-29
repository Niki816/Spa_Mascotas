// src/routes/groomer.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getAgendaHoy, getAgendaSemana } from '../controllers/groomer.controller';
import fichasRoutes from './groomer-fichas.routes';
import { getProductosConsumibles } from '../controllers/groomer-fichas.controller';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// ─── AGENDA ───
router.get('/agenda/hoy', getAgendaHoy);
router.get('/agenda/semana', getAgendaSemana);

// ─── FICHAS (subrouter sin prefijo duplicado) ───
router.use('/fichas', fichasRoutes);

// ─── PRODUCTOS ───
router.get('/productos-consumo', getProductosConsumibles);

export default router;