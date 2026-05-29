// src/controllers/groomer-insumos.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

interface AuthRequest extends Request {
  user?: { id: number; email: string; rol: string };
}

export const getHistorialConsumo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const groomer = await prisma.groomers.findUnique({
      where: { usuario_id: userId },
      select: { id: true },
    });
    if (!groomer) throw new AppError('Perfil de groomer no encontrado', 403);

    // Obtener todos los consumos de las fichas de este groomer
    const consumos = await prisma.consumo_insumos_ficha.findMany({
      where: {
        fichas_grooming: {
          citas: {
            groomer_id: groomer.id,
          },
        },
      },
      include: {
        productos: {
          select: { id: true, nombre: true, sku: true, imagen_url: true },
        },
        variantes_producto: {
          select: { id: true, atributo: true, valor: true },
        },
        fichas_grooming: {
          include: {
            citas: {
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

    // Mapear para respuesta más limpia
    const historial = consumos.map(c => ({
      id: c.id,
      cantidad: Number(c.cantidad),
      descontado: c.descontado,
      fecha: c.creado_en,
      producto: {
        id: c.productos.id,
        nombre: c.productos.nombre,
        sku: c.productos.sku,
        imagen: c.productos.imagen_url,
      },
      variante: c.variantes_producto
        ? {
            id: c.variantes_producto.id,
            atributo: c.variantes_producto.atributo,
            valor: c.variantes_producto.valor,
          }
        : null,
      servicio: {
        nombre: c.fichas_grooming.citas.servicios.nombre,
        fecha: c.fichas_grooming.citas.fecha_hora_inicio,
      },
      mascota: {
        nombre: c.fichas_grooming.citas.mascotas.nombre,
        raza: c.fichas_grooming.citas.mascotas.raza,
        especie: c.fichas_grooming.citas.mascotas.especie,
      },
    }));

    // Estadísticas rápidas
    const totalProductosDistintos = new Set(consumos.map(c => c.productos.id)).size;
    const totalConsumos = consumos.length;
    const totalCantidad = consumos.reduce((acc, c) => acc + Number(c.cantidad), 0);

    res.json({
      historial,
      estadisticas: {
        totalConsumos,
        totalProductosDistintos,
        totalCantidad: Math.round(totalCantidad * 1000) / 1000, // redondear a 3 decimales
      },
    });
  } catch (error) {
    next(error);
  }
};