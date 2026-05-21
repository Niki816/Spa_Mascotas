import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles } from '../middlewares/rbac.middleware';
import {
  getDashboard,
  getCitasHoy,
  getClientes,
  getMascotas,
  getServicios,
  getGroomers,
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

} from '../controllers/recepcion.controller';
import { getAvailableSlots, createAppointment } from '../controllers/recepcion.controller';

const router = Router();

// Todas las rutas requieren autenticación y rol 'recepcion'
router.use(authMiddleware);
router.use(allowRoles('recepcion'));

router.get('/dashboard', getDashboard);
router.get('/citas/hoy', getCitasHoy);
router.get('/clientes', getClientes);
router.get('/mascotas', getMascotas);
router.get('/mascotas', getAllMascotas);
router.get('/servicios', getServicios);
router.get('/groomers', getGroomers);
router.get('/groomers', getGroomersList);
router.post('/citas', crearCita);
router.patch('/citas/:id/confirmar', confirmarCita);
router.get('/slots', getAvailableSlots);
router.post('/citas', createAppointment);


// Slots y citas
router.get('/slots', getAvailableSlots);
router.post('/citas', createAppointment);

// Configuración general
router.get('/config/spa', getSpaConfig);
router.put('/config/spa', updateSpaConfig);

// Bloqueos
router.get('/bloqueos', getBloqueos);
router.post('/bloqueos', createBloqueo);
router.delete('/bloqueos/:id', deleteBloqueo);

// Disponibilidad por groomer
router.get('/groomers/:id/disponibilidad', getGroomerAvailability);
router.put('/groomers/:id/disponibilidad', setGroomerAvailability);
router.get('/groomers', getGroomersList);

export default router;