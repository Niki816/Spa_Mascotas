// src/controllers/groomer-galeria.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

interface AuthRequest extends Request {
  user?: { id: number; email: string; rol: string };
}

export const getGaleriaFotos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const groomer = await prisma.groomers.findUnique({
      where: { usuario_id: userId },
      select: { id: true },
    });
    if (!groomer) throw new AppError('Perfil de groomer no encontrado', 403);

    // Consulta corregida: usar fichas_grooming.citas (no ficha.cita)
    const fotos = await prisma.fotos_ficha.findMany({
      where: {
        fichas_grooming: {
          citas: {                 // <- relación de fichas_grooming a citas
            groomer_id: groomer.id,
          },
        },
      },
      include: {
        fichas_grooming: {
          include: {
            citas: {              // <- relación de fichas_grooming a citas
              select: {
                id: true,
                fecha_hora_inicio: true,
                mascotas: { select: { nombre: true, raza: true, especie: true } },
                servicios: { select: { nombre: true } },
              },
            },
          },
        },
      },
      orderBy: { creado_en: 'desc' },
    });

    // Agrupar por ficha
    const agrupado: Record<number, {
      fichaId: number;
      citaId: number;
      mascota: { nombre: string; raza: string; especie: string };
      servicio: string;
      fecha: Date;
      fotos: { id: number; url: string; tipo: string; descripcion?: string }[];
    }> = {};

    fotos.forEach(foto => {
      const ficha = foto.fichas_grooming;
      const cita = ficha.citas;   // <-- ahora es .citas, no .cita
      const fichaId = ficha.id;
      if (!agrupado[fichaId]) {
        agrupado[fichaId] = {
          fichaId,
          citaId: cita.id,
          mascota: cita.mascotas,
          servicio: cita.servicios.nombre,
          fecha: cita.fecha_hora_inicio,
          fotos: [],
        };
      }
      agrupado[fichaId].fotos.push({
        id: foto.id,
        url: foto.url,
        tipo: foto.tipo,
        descripcion: foto.descripcion,
      });
    });

    const galeria = Object.values(agrupado).sort(
      (a, b) => b.fecha.getTime() - a.fecha.getTime()
    );

    res.json({ galeria });
  } catch (error) {
    next(error);
  }
};