import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';

import {
  getDashboard,
  getCitasHoy,
  getCitasActivas,
  getCitaById,
  crearCita,
  updateCita,
  deleteCita,
  getCitasTodas,
  getCitasCalendario,
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

// ── PAGOS ──────────────────────────────────────────────────────
import {
  getCitasPendientesPago,
  getClientesConCitasPendientes,
  getClienteNivel,
  getClientesFrecuentes,
  getFacturas,
  getReciboFactura,
  crearFactura,
  getCierreCaja,
} from '../controllers/pagos.controller';

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
// CITAS — rutas estáticas ANTES que :id
// ══════════════════════════════════════
router.get ('/citas/hoy',             getCitasHoy);
router.get ('/citas/activas',         getCitasActivas);
router.get ('/citas/todas',           getCitasTodas);
router.get ('/citas/calendario',      getCitasCalendario);
router.get ('/citas/pendientes-pago', getCitasPendientesPago);   // ← pagos
router.post('/citas',                 crearCita);

router.get   ('/citas/:id',           getCitaById);
router.patch ('/citas/:id',           updateCita);
router.delete('/citas/:id',           deleteCita);
router.patch ('/citas/:id/confirmar', confirmarCita);
router.patch ('/citas/:id/cancelar',  cancelarCita);

// ══════════════════════════════════════
// SLOTS
// ══════════════════════════════════════
router.get('/slots', getAvailableSlots);

// ══════════════════════════════════════
// CLIENTES — estáticas ANTES que :id
// ══════════════════════════════════════
router.get ('/clientes/pendientes-pago', getClientesConCitasPendientes);  // ← pagos
router.get ('/clientes/frecuentes',      getClientesFrecuentes);           // ← pagos
router.get ('/clientes',                 getClientes);
router.post('/clientes',                 crearCliente);
router.get ('/clientes/:id/nivel',       getClienteNivel);                 // ← pagos

// ══════════════════════════════════════
// MASCOTAS
// ══════════════════════════════════════
router.get   ('/mascotas',     getAllMascotas);
router.post  ('/mascotas',     crearMascota);
router.get   ('/mascotas/:id', getMascotaById);
router.put   ('/mascotas/:id', updateMascota);
router.delete('/mascotas/:id', deleteMascota);

// ══════════════════════════════════════
// SERVICIOS
// ══════════════════════════════════════
router.get   ('/servicios',     getServicios);
router.get   ('/servicios/:id', getServicioById);
router.post  ('/servicios',     createServicio);
router.put   ('/servicios/:id', updateServicio);
router.delete('/servicios/:id', deleteServicio);

// ══════════════════════════════════════
// GROOMERS
// ══════════════════════════════════════
router.get('/groomers', getGroomersList);
router.get('/groomers/:id/disponibilidad', getGroomerAvailability);
router.put('/groomers/:id/disponibilidad', setGroomerAvailability);

// ══════════════════════════════════════
// CONFIGURACIÓN SPA
// ══════════════════════════════════════
router.get('/config/spa', getSpaConfig);
router.put('/config/spa', updateSpaConfig);

// ══════════════════════════════════════
// BLOQUEOS
// ══════════════════════════════════════
router.get   ('/bloqueos',     getBloqueos);
router.post  ('/bloqueos',     createBloqueo);
router.delete('/bloqueos/:id', deleteBloqueo);

// ══════════════════════════════════════
// PAGOS & FACTURACIÓN
// ══════════════════════════════════════
router.get ('/facturas',           getFacturas);
router.post('/facturas',           crearFactura);
router.get ('/facturas/:id/recibo',getReciboFactura);
router.get ('/caja/resumen',       getCierreCaja);

export default router;