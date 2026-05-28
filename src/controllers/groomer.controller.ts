import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

interface AuthenticatedRequest extends Request {
  user?: { id: number; email: string; rol: string };
}

/**
 * GET /api/groomers/agenda/hoy
 * Obtiene las citas del día para el groomer autenticado
 */
export const getAgendaHoy = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('No autorizado', 401);

    // Buscar el groomer asociado al usuario
    const groomer = await prisma.groomers.findUnique({
      where: { usuario_id: userId },
      select: { id: true, nombre: true, apellido: true },
    });
    if (!groomer) throw new AppError('Groomer no encontrado', 404);

    // Obtener citas del día actual (de 00:00 a 23:59)
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);

    const citas = await prisma.citas.findMany({
      where: {
        groomer_id: groomer.id,
        fecha_hora_inicio: { gte: inicioDia, lt: finDia },
        estado: { notIn: ['cancelada', 'no_asistio'] },
      },
      include: {
        mascotas: { select: { nombre: true, foto_url: true, raza: true } },
        servicios: { select: { nombre: true, duracion_base_minutos: true } },
      },
      orderBy: { fecha_hora_inicio: 'asc' },
    });

    // Formatear respuesta
    const agenda = citas.map((cita) => ({
      id: cita.id,
      horaInicio: cita.fecha_hora_inicio,
      horaFin: cita.fecha_hora_fin,
      duracionEstimada: cita.duracion_estimada_min,
      estado: cita.estado,
      mascota: {
        nombre: cita.mascotas.nombre,
        raza: cita.mascotas.raza,
        foto: cita.mascotas.foto_url,
      },
      servicio: {
        nombre: cita.servicios.nombre,
        duracionBase: cita.servicios.duracion_base_minutos,
      },
      notas: cita.notas,
    }));

    res.json({
      groomer: {
        id: groomer.id,
        nombre: `${groomer.nombre} ${groomer.apellido}`,
      },
      agenda,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/groomers/agenda/semana
 * Obtiene las citas de la semana actual (lunes a domingo) para el groomer
 * (Opcional: podemos implementarlo más adelante)
 */
export const getAgendaSemana = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Similar a getAgendaHoy pero con rango de fechas
  // Lo dejamos preparado para el futuro
  res.json({ message: 'Próximamente' });
};