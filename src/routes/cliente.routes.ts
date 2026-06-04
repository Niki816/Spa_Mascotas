// src/routes/cliente.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';
import {
  // ── Perfil ──
  getPerfil,

  // ── Mascotas ──
  getMisMascotas,
  crearMascotaCliente,
  subirCarnetVacunas,
  getHistorialMascota,
  getReporteMascota,

  // ── Catálogo / disponibilidad ──
  getServiciosCliente,
  getGroomersCliente,
  getAvailableSlotsCliente,

  // ── Citas ──
  getMisCitas,
  crearCitaCliente,
  cancelarCitaCliente,

  // ── Tienda ──
  getProductosCatalogo,
  getCarritoCliente,
  agregarAlCarritoCliente,
  actualizarItemCarritoCliente,
  eliminarItemCarritoCliente,
  crearPedido,
  getMisPedidos,

  // ── Facturas ──
  getMisFacturas,
  descargarFacturaPDF,
  getFacturaById,
} from '../controllers/cliente.controller';

const router = Router();

// Todos los endpoints de cliente requieren autenticación y rol "cliente"
router.use(authMiddleware);
router.use(allowRoles('cliente'));

// ─── Perfil ──────────────────────────────────────────────────────────────
router.get('/perfil', getPerfil);

// ─── Mascotas ─────────────────────────────────────────────────────────────
// IMPORTANTE: las rutas específicas (/mis-mascotas) deben ir ANTES de /:id
router.get ('/mis-mascotas',             getMisMascotas);
router.post('/mascotas',                 crearMascotaCliente);

// Subrutas de mascota por ID — orden importa: /historial y /reporte antes
// de que Express intente resolver ":id" como un recurso genérico
router.post('/mascotas/:id/carnet',      subirCarnetVacunas as any);
router.get ('/mascotas/:id/historial',   getHistorialMascota);
router.get ('/mascotas/:id/reporte',     getReporteMascota);

// ─── Catálogo / disponibilidad ────────────────────────────────────────────
router.get('/servicios', getServiciosCliente);
router.get('/groomers',  getGroomersCliente);
router.get('/slots',     getAvailableSlotsCliente);

// ─── Citas ────────────────────────────────────────────────────────────────
router.get  ('/mis-citas',            getMisCitas);
router.post ('/citas',                crearCitaCliente);
router.patch('/citas/:id/cancelar',   cancelarCitaCliente);

// ─── Tienda — productos ───────────────────────────────────────────────────
router.get('/productos', getProductosCatalogo);

// ─── Tienda — carrito ─────────────────────────────────────────────────────
// El param se llama :itemId para que el controller pueda leer req.params.itemId
router.get   ('/carrito',             getCarritoCliente);
router.post  ('/carrito',             agregarAlCarritoCliente);
router.patch ('/carrito/:itemId',     actualizarItemCarritoCliente);
router.delete('/carrito/:itemId',     eliminarItemCarritoCliente);

// ─── Tienda — pedidos ─────────────────────────────────────────────────────
router.post('/pedidos', crearPedido);       // única versión (la completa)
router.get ('/pedidos', getMisPedidos);

// ─── Facturas ─────────────────────────────────────────────────────────────
router.get('/facturas',          getMisFacturas);
router.get('/facturas/:id/pdf',  descargarFacturaPDF);
router.get('/facturas/:id', getFacturaById);

export default router;