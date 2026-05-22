import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';

import {
  getDashboard,
  getCitasHoy,
  getCitasActivas,
  getCitaById,        // ← NUEVO
  crearCita,
  updateCita,         // ← NUEVO
  deleteCita,         // ← NUEVO
  getCitasTodas,
  confirmarCita,
  cancelarCita,
  getAvailableSlots,
  getClientes,
  crearCliente,
  getServicios,
  getGroomers,
  getGroomersList,
  getAllMascotas,
  crearMascota,
  getMascotaById,
  updateMascota,
  deleteMascota,
  getSpaConfig,
  updateSpaConfig,
  getBloqueos,
  createBloqueo,
  deleteBloqueo,
  getGroomerAvailability,
  setGroomerAvailability,
} from '../controllers/recepcion.controller';

import {
  getServicioById,
  createServicio,
  updateServicio,
  deleteServicio,
} from '../controllers/servicios.controller';

const router = Router();

router.use(authMiddleware);
router.use(allowRoles('recepcion'));

router.use((req, _res, next) => {
  console.log(`[Recepcion] ${req.method} ${req.originalUrl}`);
  next();
});

// ══════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════
router.get('/dashboard', getDashboard);

// ══════════════════════════════════════
// CITAS  — CRUD completo
// ══════════════════════════════════════
router.get   ('/citas/hoy',              getCitasHoy);
router.get   ('/citas/activas',          getCitasActivas);
router.get   ('/citas/todas',            getCitasTodas);
router.post  ('/citas',                  crearCita);
// ↓ rutas con :id SIEMPRE después de las rutas estáticas
router.get   ('/citas/:id',              getCitaById);      // ← NUEVO: leer para editar
router.patch ('/citas/:id',              updateCita);       // ← NUEVO: editar
router.delete('/citas/:id',              deleteCita);       // ← NUEVO: eliminar permanente
router.patch ('/citas/:id/confirmar',    confirmarCita);
router.patch ('/citas/:id/cancelar',     cancelarCita);

 
// ══════════════════════════════════════
// SLOTS DE DISPONIBILIDAD
// ══════════════════════════════════════
router.get('/slots', getAvailableSlots);

// ══════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════
router.get ('/clientes',  getClientes);
router.post('/clientes',  crearCliente);

// ══════════════════════════════════════
// MASCOTAS
// ══════════════════════════════════════
router.get   ('/mascotas',        getAllMascotas);
router.post  ('/mascotas',        crearMascota);
router.get   ('/mascotas/:id',    getMascotaById);
router.put   ('/mascotas/:id',    updateMascota);
router.delete('/mascotas/:id',    deleteMascota);

// ══════════════════════════════════════
// SERVICIOS (lectura + CRUD)
// ══════════════════════════════════════
router.get   ('/servicios',        getServicios);
router.get   ('/servicios/:id',    getServicioById);
router.post  ('/servicios',        createServicio);
router.put   ('/servicios/:id',    updateServicio);
router.delete('/servicios/:id',    deleteServicio);

// ══════════════════════════════════════
// GROOMERS
// ══════════════════════════════════════
router.get('/groomers', getGroomersList);

// ══════════════════════════════════════
// CONFIGURACIÓN GENERAL DEL SPA
// ══════════════════════════════════════
router.get('/config/spa', getSpaConfig);
router.put('/config/spa', updateSpaConfig);

// ══════════════════════════════════════
// BLOQUEOS
// ══════════════════════════════════════
router.get   ('/bloqueos',        getBloqueos);
router.post  ('/bloqueos',        createBloqueo);
router.delete('/bloqueos/:id',    deleteBloqueo);

// ══════════════════════════════════════
// DISPONIBILIDAD POR GROOMER
// ══════════════════════════════════════
router.get('/groomers/:id/disponibilidad', getGroomerAvailability);
router.put('/groomers/:id/disponibilidad', setGroomerAvailability);

export default router;