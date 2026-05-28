import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getAgendaHoy, getAgendaSemana } from '../controllers/groomer.controller';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

router.get('/agenda/hoy', getAgendaHoy);
router.get('/agenda/semana', getAgendaSemana); // Futuro

export default router;