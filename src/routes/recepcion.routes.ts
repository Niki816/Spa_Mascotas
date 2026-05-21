import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles } from '../middlewares/rbac.middleware';
import {
  getDashboard,
  getCitasHoy,
  getClientes,
  getServicios,
  getGroomersList,
  getAllMascotas,
  crearCita,
  confirmarCita,
  getSpaConfig,
  updateSpaConfig,
  getBloqueos,
  createBloqueo,
  deleteBloqueo,
  getGroomerAvailability,
  setGroomerAvailability,
  getAvailableSlots
} from '../controllers/recepcion.controller';

const router = Router();

// Todas las rutas requieren autenticación y rol 'recepcion'
router.use(authMiddleware);
router.use(allowRoles('recepcion'));

// Dashboard y vistas principales
router.get('/dashboard', getDashboard);
router.get('/citas/hoy', getCitasHoy);
router.get('/clientes', getClientes);
router.get('/servicios', getServicios);

// Mascotas (única ruta)
router.get('/mascotas', getAllMascotas);

// Groomers (única ruta, usamos getGroomersList)
router.get('/groomers', getGroomersList);

// Creación de citas (única ruta POST)
router.post('/citas', crearCita);

// Confirmación de cita
router.patch('/citas/:id/confirmar', confirmarCita);

// Slots disponibles
router.get('/slots', getAvailableSlots);

// Configuración general del spa
router.get('/config/spa', getSpaConfig);
router.put('/config/spa', updateSpaConfig);

// Bloqueos de horarios
router.get('/bloqueos', getBloqueos);
router.post('/bloqueos', createBloqueo);
router.delete('/bloqueos/:id', deleteBloqueo);

// Disponibilidad por groomer
router.get('/groomers/:id/disponibilidad', getGroomerAvailability);
router.put('/groomers/:id/disponibilidad', setGroomerAvailability);

export default router;