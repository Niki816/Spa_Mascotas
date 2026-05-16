import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles } from '../middlewares/rbac.middleware';
import {
  getDashboard
} from '../controllers/recepcion.controller';

const router = Router();
router.use(authMiddleware);
router.use(allowRoles('recepcion'));

router.get('/dashboard', getDashboard);

export default router;