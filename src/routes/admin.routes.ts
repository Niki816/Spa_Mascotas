import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';
import {
  crearGroomer, crearCliente,
  getAuthLogs, getStats,
  getUsuarios, desactivarUsuario,
  getUsersList,
  getUserById,
  updateUser,
  reactivateUser,
  permanentDeleteUser,
  crearRecepcion,
  getSucursales,
} from '../controllers/admin.controller';
import { AvailabilityService } from '../services/availability.service';

const router = Router();
const availabilityService = new AvailabilityService();

// Todas las rutas de admin requieren autenticación y rol admin
router.use(authMiddleware);
router.use(allowRoles('admin'));

// Logger para todas las peticiones admin (ubicado ANTES de las rutas)
router.use((req, res, next) => {
  console.log(`[Admin Route] ${req.method} ${req.originalUrl}`);
  next();
});

// RUTAS DE ADMINISTRACIÓN

// Configuración general del spa (única vez)
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

// CRUD de usuarios y creación
router.post('/groomer', crearGroomer);
router.post('/cliente', crearCliente);
router.post('/recepcion', crearRecepcion);
router.get('/auth-logs', getAuthLogs);
router.get('/stats', getStats);
router.get('/users', getUsuarios);
router.patch('/users/:id/deactivate', desactivarUsuario);
router.get('/users/list', getUsersList);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.patch('/users/:id/reactivate', reactivateUser);
router.delete('/users/:id/permanent', permanentDeleteUser);
router.get('/sucursales', getSucursales);
// =====================
// CRUD de Servicios
// =====================
import {
  getServicios,
  getServicioById,
  createServicio,
  updateServicio,
  deleteServicio,
} from '../controllers/servicios.controller';
////////////////////////////
///// CRUD de servicios
////////////////////////////
router.get('/servicios', getServicios);
router.get('/servicios/:id', getServicioById);
router.post('/servicios', createServicio);
router.put('/servicios/:id', updateServicio);
router.delete('/servicios/:id', deleteServicio);
export default router;