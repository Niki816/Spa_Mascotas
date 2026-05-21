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

// RUTAS DE ADMINISTRACIÓN 
// PARA LA DISPONIBILIDAD
import { AvailabilityService } from '../services/availability.service';
const availabilityService = new AvailabilityService();

// Configuración general (solo lectura)
router.get('/config/spa', async (req, res, next) => {
  try {
    const config = await availabilityService.getGeneralConfig();
    res.json(config);
  } catch (err) { next(err); }
});

// Bloqueos
router.get('/bloqueos', async (req, res, next) => {
  try {
    const { desde, hasta, groomerId } = req.query;
    const bloqueos = await availabilityService.getBloqueos(
      desde ? new Date(desde as string) : undefined,
      hasta ? new Date(hasta as string) : undefined,
      groomerId ? Number(groomerId) : undefined
    );
    res.json(bloqueos);
  } catch (err) { next(err); }
});

router.post('/bloqueos', async (req, res, next) => {
  try {
    const creado_por = (req as any).user.id;
    const bloqueo = await availabilityService.createBloqueo({ ...req.body, creado_por });
    res.status(201).json(bloqueo);
  } catch (err) { next(err); }
});

router.delete('/bloqueos/:id', async (req, res, next) => {
  try {
    await availabilityService.deleteBloqueo(Number(req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

// Disponibilidad por groomer
router.get('/groomers/:id/disponibilidad', async (req, res, next) => {
  try {
    const disponibilidad = await availabilityService.getGroomerAvailability(Number(req.params.id));
    res.json(disponibilidad);
  } catch (err) { next(err); }
});

router.put('/groomers/:id/disponibilidad', async (req, res, next) => {
  try {
    await availabilityService.setGroomerAvailability(Number(req.params.id), req.body);
    res.json({ message: 'Disponibilidad actualizada' });
  } catch (err) { next(err); }
});
// FIN RUTAS DE DISPONIBILIDAD

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

// Configuración global del spa
router.get('/config/spa', async (req, res, next) => {
  try {
    const config = await availabilityService.getGeneralConfig();
    res.json(config);
  } catch (err) { next(err); }
});

router.put('/config/spa', async (req, res, next) => {
  try {
    const config = await availabilityService.updateGeneralConfig(req.body);
    res.json(config);
  } catch (err) { next(err); }
});
export default router;