import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import { AppError } from '../utils/errors';
import prisma from '../config/database';
import { AvailabilityService } from '../services/availability.service';
const adminService = new AdminService();
const availabilityService = new AvailabilityService();
interface RequestWithUser extends Request {
  user?: { id: number; email: string; rol: string; jti: string };
}

// ──────────────────────────────────────────────
// LISTAR USUARIOS CON PAGINACIÓN Y FILTROS
// ──────────────────────────────────────────────
export const getUsersList = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const estado = req.query.estado as 'activo' | 'inactivo' | undefined;
    const search = req.query.search as string | undefined;
    const result = await adminService.listUsersPaginated(page, limit, estado, search);
    res.json(result);
  } catch (error) { next(error); }
};

// ──────────────────────────────────────────────
// OBTENER UN USUARIO POR ID
// ──────────────────────────────────────────────
export const getUserById = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id as string);
    if (isNaN(userId)) throw new AppError('ID inválido', 400);
    const user = await adminService.getUserById(userId);
    res.json(user);
  } catch (error) { next(error); }
};

// ──────────────────────────────────────────────
// ACTUALIZAR USUARIO
// ──────────────────────────────────────────────
export const updateUser = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id as string);
    if (isNaN(userId)) throw new AppError('ID inválido', 400);
    const adminId = req.user!.id;
    const adminEmail = req.user!.email;
    const result = await adminService.updateUser(userId, req.body, adminId, adminEmail);
    res.json(result);
  } catch (error) { next(error); }
};

// ──────────────────────────────────────────────
// REACTIVAR USUARIO
// ──────────────────────────────────────────────
export const reactivateUser = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id as string);
    if (isNaN(userId)) throw new AppError('ID inválido', 400);
    const adminId = req.user!.id;
    const adminEmail = req.user!.email;
    const result = await adminService.reactivateUser(userId, adminId, adminEmail);
    res.json(result);
  } catch (error) { next(error); }
};

// ──────────────────────────────────────────────
// ELIMINAR USUARIO PERMANENTEMENTE
// ──────────────────────────────────────────────
export const permanentDeleteUser = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id as string);
    if (isNaN(userId)) throw new AppError('ID inválido', 400);
    const adminId = req.user!.id;
    const adminEmail = req.user!.email;
    const result = await adminService.permanentDeleteUser(userId, adminId, adminEmail);
    res.json(result);
  } catch (error) { next(error); }
};

// ──────────────────────────────────────────────
// CREAR GROOMER
// ──────────────────────────────────────────────
export const crearGroomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.crearGroomer(req.body);
    res.status(201).json(result);
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────
// CREAR CLIENTE
// ──────────────────────────────────────────────
export const crearCliente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.crearCliente(req.body);
    res.status(201).json(result);
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────
// OBTENER LOGS DE AUTENTICACIÓN
// ──────────────────────────────────────────────
export const getAuthLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const accion = req.query.accion as string | undefined;
    const result = await adminService.getAuthLogs(limit, offset, accion);
    res.json(result);
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────
// ESTADÍSTICAS
// ──────────────────────────────────────────────
export const getStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.getStats();
    res.json(result);
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────
// LISTADO SIMPLE DE USUARIOS (para compatibilidad)
// ──────────────────────────────────────────────
export const getUsuarios = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.getUsuarios();
    res.json(result);
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────
// DESACTIVAR USUARIO (cambiar estado_activo = false)
// ──────────────────────────────────────────────
export const desactivarUsuario = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);
    const result = await adminService.desactivarUsuario(id);
    res.json(result);
  } catch (e) { next(e); }
};

export const crearRecepcion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.crearRecepcion(req.body);
    res.status(201).json(result);
  } catch (e) { next(e); }
};

export const getSucursales = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sucursales = await prisma.sucursales.findMany({
      where: { estado_activo: true },
      select: { id: true, nombre: true },
    });
    res.json(sucursales);
  } catch (error) { next(error); }
};