import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

// Helper seguro para extraer string de req.query (acepta cualquier tipo)
function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string')
    return value[0];
  return undefined;
}

// Helper seguro para extraer número de req.params
function getNumericId(param: unknown): number {
  if (typeof param !== 'string') throw new AppError('ID inválido', 400);
  const id = parseInt(param, 10);
  if (isNaN(id)) throw new AppError('ID inválido', 400);
  return id;
}

// Obtener todos los servicios (activos + inactivos) – solo admin
export const getServicios = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incluirInactivos = getQueryString(req.query.incluirInactivos) === 'true';
    const servicios = await prisma.servicios.findMany({
      where: incluirInactivos ? {} : { estado_activo: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(servicios);
  } catch (err) { next(err); }
};

// Obtener un servicio por ID
export const getServicioById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getNumericId(req.params.id);
    const servicio = await prisma.servicios.findUnique({ where: { id } });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);
    res.json(servicio);
  } catch (err) { next(err); }
};

// Crear nuevo servicio
export const createServicio = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nombre, descripcion, precio_base, duracion_base_minutos, permite_doble_booking, requiere_bloqueo_consecutivo, estado_activo } = req.body;
    if (!nombre || precio_base === undefined || !duracion_base_minutos) {
      throw new AppError('Faltan campos obligatorios (nombre, precio_base, duracion_base_minutos)', 400);
    }
    const nuevo = await prisma.servicios.create({
      data: {
        nombre,
        descripcion: descripcion || null,
        precio_base,
        duracion_base_minutos,
        permite_doble_booking: permite_doble_booking ?? false,
        requiere_bloqueo_consecutivo: requiere_bloqueo_consecutivo ?? false,
        estado_activo: estado_activo ?? true,
      },
    });
    res.status(201).json(nuevo);
  } catch (err) { next(err); }
};

// Actualizar servicio
export const updateServicio = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getNumericId(req.params.id);
    const { nombre, descripcion, precio_base, duracion_base_minutos, permite_doble_booking, requiere_bloqueo_consecutivo, estado_activo } = req.body;
    const actualizado = await prisma.servicios.update({
      where: { id },
      data: {
        nombre,
        descripcion: descripcion ?? undefined,
        precio_base,
        duracion_base_minutos,
        permite_doble_booking,
        requiere_bloqueo_consecutivo,
        estado_activo,
      },
    });
    res.json(actualizado);
  } catch (err) { next(err); }
};

// Eliminar servicio (borrado lógico)
export const deleteServicio = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getNumericId(req.params.id);
    await prisma.servicios.update({
      where: { id },
      data: { estado_activo: false },
    });
    res.status(204).send();
  } catch (err) { next(err); }
};