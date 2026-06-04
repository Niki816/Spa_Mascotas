// src/routes/admin.routes.ts
import { Router, Request, Response, NextFunction } from 'express';

// ── Middlewares ──────────────────────────────────────────────────────────
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';

// ── Controllers ──────────────────────────────────────────────────────────
import {
  crearGroomer,
  crearCliente,
  crearRecepcion,
  getAuthLogs,
  getStats,
  getUsuarios,
  desactivarUsuario,
  getUsersList,
  getUserById,
  updateUser,
  reactivateUser,
  permanentDeleteUser,
  getSucursales,
  getWhatsAppQR,
} from '../controllers/admin.controller';

import {
  getServicios,
  getServicioById,
  createServicio,
  updateServicio,
  deleteServicio,
} from '../controllers/servicios.controller';

// ── Servicios ────────────────────────────────────────────────────────────
import { AvailabilityService } from '../services/availability.service';
import { AppError }            from '../utils/errors';

const router             = Router();
const availabilityService = new AvailabilityService();

// ─── Middlewares globales del router ──────────────────────────────────────
// 1. Logger (PRIMERO para capturar también las peticiones rechazadas)
router.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[Admin] ${req.method} ${req.originalUrl}`);
  next();
});

// 2. Autenticación y autorización (aplicados UNA SOLA VEZ aquí)
router.use(authMiddleware);
router.use(allowRoles('admin'));

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Parsea una fecha string y lanza AppError si no es válida. */
function parseFechaQuery(valor: string, nombre: string): Date {
  const d = new Date(valor);
  if (isNaN(d.getTime())) {
    throw new AppError(`Parámetro "${nombre}" tiene formato de fecha inválido. Use YYYY-MM-DD o ISO 8601.`, 400);
  }
  return d;
}

/** Parsea un entero desde query string y lanza AppError si no es válido. */
function parseIntQuery(valor: string, nombre: string): number {
  const n = parseInt(valor, 10);
  if (isNaN(n)) {
    throw new AppError(`Parámetro "${nombre}" debe ser un número entero.`, 400);
  }
  return n;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN GENERAL DEL SPA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/config/spa
 * Devuelve la configuración general del spa (horarios, capacidad, días laborales).
 */
router.get('/config/spa', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await availabilityService.getGeneralConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/config/spa
 * Actualiza la configuración general del spa.
 * Body: { horario_inicio, horario_fin, dias_laborales, capacidad_diaria_max }
 */
router.put('/config/spa', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await availabilityService.updateGeneralConfig(req.body);
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  BLOQUEOS DE CALENDARIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/bloqueos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&groomerId=N
 * Lista los bloqueos de calendario con filtros opcionales.
 */
router.get('/bloqueos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { desde, hasta, groomerId } = req.query;

    const desdeDate = desde ? parseFechaQuery(String(desde), 'desde') : undefined;
    const hastaDate = hasta ? parseFechaQuery(String(hasta), 'hasta') : undefined;
    const groomerIdNum = groomerId ? parseIntQuery(String(groomerId), 'groomerId') : undefined;

    if (desdeDate && hastaDate && desdeDate > hastaDate) {
      throw new AppError('"desde" no puede ser posterior a "hasta"', 400);
    }

    const bloqueos = await availabilityService.getBloqueos(desdeDate, hastaDate, groomerIdNum);
    res.json(bloqueos);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/bloqueos
 * Crea un bloqueo de calendario (feriado, mantenimiento, vacaciones, ausencia).
 * Body: { tipo_bloqueo, fecha_inicio, fecha_fin, descripcion?, groomer_id? }
 */
router.post('/bloqueos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const creado_por = (req as any).user?.id;
    if (!creado_por) throw new AppError('No se pudo determinar el usuario autenticado', 401);

    const { tipo_bloqueo, fecha_inicio, fecha_fin } = req.body;

    if (!tipo_bloqueo || !fecha_inicio || !fecha_fin) {
      throw new AppError('tipo_bloqueo, fecha_inicio y fecha_fin son obligatorios', 400);
    }

    const tiposValidos = ['feriado', 'mantenimiento', 'vacaciones', 'ausencia'];
    if (!tiposValidos.includes(tipo_bloqueo)) {
      throw new AppError(`tipo_bloqueo inválido. Opciones: ${tiposValidos.join(', ')}`, 400);
    }

    const inicio = parseFechaQuery(String(fecha_inicio), 'fecha_inicio');
    const fin    = parseFechaQuery(String(fecha_fin),    'fecha_fin');

    if (inicio > fin) {
      throw new AppError('fecha_inicio no puede ser posterior a fecha_fin', 400);
    }

    const bloqueo = await availabilityService.createBloqueo({
      ...req.body,
      fecha_inicio: inicio,
      fecha_fin:    fin,
      creado_por,
    });

    res.status(201).json(bloqueo);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/bloqueos/:id
 * Elimina un bloqueo de calendario.
 */
router.delete('/bloqueos/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntQuery(req.params.id as string, 'id');
    await availabilityService.deleteBloqueo(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  DISPONIBILIDAD DE GROOMERS
// ══════════════════════╛


/**
 * GET /api/admin/groomers/:id/disponibilidad
 * Obtiene la disponibilidad semanal de un groomer.
 */
router.get('/groomers/:id/disponibilidad', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntQuery(req.params.id as string, 'id');
    const disponibilidad = await availabilityService.getGroomerAvailability(id);
    res.json(disponibilidad);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/groomers/:id/disponibilidad
 * Establece (reemplaza) la disponibilidad semanal de un groomer.
 * Body: array de { dia_semana, hora_inicio, hora_fin, buffer_minutos? }
 */
router.put('/groomers/:id/disponibilidad', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntQuery(req.params.id as string, 'id');

    if (!Array.isArray(req.body)) {
      throw new AppError('El body debe ser un array de disponibilidades', 400);
    }

    await availabilityService.setGroomerAvailability(id, req.body);
    res.json({ message: 'Disponibilidad actualizada correctamente' });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  WHATSAPP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/whatsapp/qr
 * Devuelve el QR actual de WhatsApp (solo disponible si no hay sesión activa).
 * No requiere doble middleware: el router ya aplica authMiddleware + allowRoles.
 */
router.get('/whatsapp/qr', getWhatsAppQR);

// ═══════════════════════════════════════════════════════════════════════════
//  USUARIOS
// ═══════════════════════════════════════════════════════════════════════════

// IMPORTANTE: las rutas con segmentos fijos (/list) deben ir ANTES de /:id
// para que Express no interprete "list" como un parámetro dinámico.

router.get ('/users/list',              getUsersList);       // ← ANTES de /:id
router.get ('/users',                   getUsuarios);
router.get ('/users/:id',               getUserById);
router.put ('/users/:id',               updateUser);
router.patch('/users/:id/deactivate',   desactivarUsuario);
router.patch('/users/:id/reactivate',   reactivateUser);
router.delete('/users/:id/permanent',   permanentDeleteUser);

// ═══════════════════════════════════════════════════════════════════════════
//  CREACIÓN DE USUARIOS POR ROL
// ═══════════════════════════════════════════════════════════════════════════

router.post('/groomer',   crearGroomer);
router.post('/cliente',   crearCliente);
router.post('/recepcion', crearRecepcion);

// ═══════════════════════════════════════════════════════════════════════════
//  LOGS Y ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/auth-logs', getAuthLogs);
router.get('/stats',     getStats);

// ═══════════════════════════════════════════════════════════════════════════
//  SUCURSALES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/sucursales', getSucursales);

// ═══════════════════════════════════════════════════════════════════════════
//  SERVICIOS (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

// IMPORTANTE: /servicios/list o cualquier ruta fija iría ANTES de /:id
router.get   ('/servicios',     getServicios);
router.get   ('/servicios/:id', getServicioById);
router.post  ('/servicios',     createServicio);
router.put   ('/servicios/:id', updateServicio);
router.delete('/servicios/:id', deleteServicio);

export default router;