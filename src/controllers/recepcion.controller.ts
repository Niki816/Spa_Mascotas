import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const citasHoy = await prisma.citas.findMany({
      where: { fecha_hora_inicio: { gte: hoy, lt: manana } },
      include: { mascotas: { include: { clientes: true } }, servicios: true, groomers: true },
      orderBy: { fecha_hora_inicio: 'asc' },
    });
    const ultimosClientes = await prisma.clientes.findMany({
      take: 5, orderBy: { creado_en: 'desc' },
      include: { usuarios: true },
    });
    const totalClientes = await prisma.clientes.count();
    res.json({
      citasHoy: citasHoy.map(c => ({
        id: c.id,
        hora: c.fecha_hora_inicio.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        mascota: c.mascotas.nombre,
        servicio: c.servicios.nombre,
        groomer: `${c.groomers.nombre} ${c.groomers.apellido}`,
      })),
      totalClientes,
      ultimosClientes: ultimosClientes.map(c => ({
        nombre: c.nombre, apellido: c.apellido, email: c.usuarios.email, telefono: c.telefono,
      })),

    });
  } catch (e) { next(e); }
};

// Agrega los otros endpoints: getCitasHoy, getClientes, getMascotas, getServicios, getGroomers, crearCita, confirmarCita
// Es similar a los que ya usas en admin, pero con permisos de recepcionista.