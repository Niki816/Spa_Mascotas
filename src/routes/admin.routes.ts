import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';
import {
  crearGroomer, crearCliente,
  getAuthLogs, getStats,
  getUsuarios, desactivarUsuario,
  getUsersList,          // ← nueva
  getUserById,          // ← nueva
  updateUser,           // ← nueva
  reactivateUser,       // ← nueva
  permanentDeleteUser,
  crearRecepcion,
  getSucursales,
} from '../controllers/admin.controller';

const router = Router();

// Todas las rutas de admin requieren estar autenticado y ser admin
router.use(authMiddleware);
router.use(allowRoles('admin'));

router.post('/groomer',              crearGroomer);
router.post('/cliente',              crearCliente);
router.get('/auth-logs',             getAuthLogs);
router.get('/stats',                 getStats);
router.get('/users',                 getUsuarios);
router.patch('/users/:id/deactivate', desactivarUsuario);

// ⭐ NUEVAS RUTAS CRUD (el orden importa: /list antes de /:id)
router.get('/users/list', getUsersList);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.patch('/users/:id/reactivate', reactivateUser);
router.delete('/users/:id/permanent', permanentDeleteUser);
router.post('/recepcion', crearRecepcion);
router.get('/sucursales', getSucursales);

router.use((req, res, next) => {
  console.log(`[Admin Route] ${req.method} ${req.originalUrl}`);
  next();
});
export default router;