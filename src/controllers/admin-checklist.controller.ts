import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

interface RequestWithUser extends Request {
  user?: { id: number; email: string; rol: string; jti: string };
}

// ══════════════════════════════════════════════════════════════
// CHECKLIST ITEMS (catálogo)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/checklist/items
 * Lista todos los items del checklist, con opción de filtrar por estado
 */
export const getChecklistItems = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { estado, search } = req.query;

    const where: any = {};
    if (estado === 'activo') where.estado_activo = true;
    else if (estado === 'inactivo') where.estado_activo = false;
    
    if (search) {
      where.OR = [
        { nombre: { contains: search as string } },
        { descripcion: { contains: search as string } },
      ];
    }

    const items = await prisma.checklist_items.findMany({
      where,
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      include: {
        _count: {
          select: {
            template_checklist: true,
            ficha_checklist: true,
          },
        },
      },
    });

    const resultado = items.map(item => ({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      requiere_observacion: item.requiere_observacion,
      orden: item.orden,
      estado_activo: item.estado_activo,
      creado_en: item.creado_en,
      veces_asignado: item._count.template_checklist,
      veces_usado: item._count.ficha_checklist,
    }));

    res.json(resultado);
  } catch (error) {
    console.error('[Checklist Items] Error listando:', error);
    next(error);
  }
};

/**
 * GET /api/admin/checklist/items/:id
 */
export const getChecklistItemById = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const item = await prisma.checklist_items.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            template_checklist: true,
            ficha_checklist: true,
          },
        },
      },
    });

    if (!item) throw new AppError('Ítem de checklist no encontrado', 404);

    res.json({
      ...item,
      veces_asignado: item._count.template_checklist,
      veces_usado: item._count.ficha_checklist,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/checklist/items
 * Crea un nuevo item de checklist
 */
export const createChecklistItem = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { nombre, descripcion, requiere_observacion, orden } = req.body;

    if (!nombre || !nombre.trim()) {
      throw new AppError('El nombre del ítem es requerido', 400);
    }

    // Verificar duplicados por nombre
    const existe = await prisma.checklist_items.findFirst({
      where: { nombre: nombre.trim() },
    });
    if (existe) {
      throw new AppError(`Ya existe un ítem con el nombre "${nombre.trim()}"`, 409);
    }

    // Si no se especifica orden, ponerlo al final
    let ordenFinal = orden ?? 0;
    if (!orden) {
      const maxOrden = await prisma.checklist_items.findFirst({
        orderBy: { orden: 'desc' },
        select: { orden: true },
      });
      ordenFinal = (maxOrden?.orden ?? 0) + 1;
    }

    const item = await prisma.checklist_items.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        requiere_observacion: requiere_observacion === true,
        orden: ordenFinal,
        estado_activo: true,
      },
    });

    res.status(201).json({
      message: `✅ Ítem "${item.nombre}" creado correctamente`,
      item,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/checklist/items/:id
 * Actualiza un item de checklist
 */
export const updateChecklistItem = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const { nombre, descripcion, requiere_observacion, orden, estado_activo } = req.body;

    const item = await prisma.checklist_items.findUnique({ where: { id } });
    if (!item) throw new AppError('Ítem no encontrado', 404);

    // Verificar duplicados de nombre
    if (nombre && nombre.trim() !== item.nombre) {
      const duplicado = await prisma.checklist_items.findFirst({
        where: { nombre: nombre.trim(), NOT: { id } },
      });
      if (duplicado) throw new AppError(`Ya existe un ítem con el nombre "${nombre.trim()}"`, 409);
    }

    const updated = await prisma.checklist_items.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre: nombre.trim() }),
        ...(descripcion !== undefined && { descripcion: descripcion?.trim() || null }),
        ...(requiere_observacion !== undefined && { requiere_observacion: requiere_observacion === true }),
        ...(orden !== undefined && { orden: Number(orden) }),
        ...(estado_activo !== undefined && { estado_activo: estado_activo === true || estado_activo === 'true' }),
      },
    });

    res.json({
      message: `✅ Ítem "${updated.nombre}" actualizado correctamente`,
      item: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/checklist/items/:id
 * Soft delete: desactiva el item en lugar de borrarlo
 */
export const deleteChecklistItem = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const item = await prisma.checklist_items.findUnique({ where: { id } });
    if (!item) throw new AppError('Ítem no encontrado', 404);

    // Verificar si está asignado a templates activos
    const templatesActivos = await prisma.template_checklist.count({
      where: {
        item_id: id,
        servicios: { estado_activo: true },
      },
    });

    if (templatesActivos > 0) {
      throw new AppError(
        `No se puede desactivar: el ítem está asignado a ${templatesActivos} servicio(s) activo(s). Desasígnalo primero.`,
        409,
      );
    }

    // Soft delete: desactivar
    await prisma.checklist_items.update({
      where: { id },
      data: { estado_activo: false },
    });

    res.json({ message: `✅ Ítem "${item.nombre}" desactivado correctamente` });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/checklist/items/:id/toggle
 * Activa/desactiva rápidamente un item
 */
export const toggleChecklistItem = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const item = await prisma.checklist_items.findUnique({ where: { id } });
    if (!item) throw new AppError('Ítem no encontrado', 404);

    const nuevoEstado = !item.estado_activo;

    // Si se intenta activar, validar que no haya conflicto
    if (nuevoEstado === false) {
      const templatesActivos = await prisma.template_checklist.count({
        where: {
          item_id: id,
          servicios: { estado_activo: true },
        },
      });
      if (templatesActivos > 0) {
        throw new AppError(
          `No se puede desactivar: el ítem está asignado a ${templatesActivos} servicio(s) activo(s).`,
          409,
        );
      }
    }

    await prisma.checklist_items.update({
      where: { id },
      data: { estado_activo: nuevoEstado },
    });

    res.json({
      message: `✅ Ítem "${item.nombre}" ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`,
      estado_activo: nuevoEstado,
    });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// TEMPLATE CHECKLIST (asignación de items a servicios)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/checklist/templates?servicio_id=X
 * Lista los templates de checklist, opcionalmente filtrados por servicio
 */
export const getTemplates = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { servicio_id } = req.query;

    const where: any = {};
    if (servicio_id) where.servicio_id = parseInt(servicio_id as string);

    const templates = await prisma.template_checklist.findMany({
      where,
      include: {
        servicios: {
          select: { id: true, nombre: true, estado_activo: true },
        },
        checklist_items: {
          select: { id: true, nombre: true, descripcion: true, requiere_observacion: true, estado_activo: true },
        },
      },
      orderBy: [
        { servicio_id: 'asc' },
        { orden: 'asc' },
      ],
    });

    // Agrupar por servicio para mejor visualización
    const agrupado: Record<number, {
      servicio_id: number;
      servicio_nombre: string;
      servicio_activo: boolean;
      items: any[];
      total_items: number;
      obligatorios: number;
    }> = {};

    for (const t of templates) {
      const sid = t.servicio_id;
      if (!agrupado[sid]) {
        agrupado[sid] = {
          servicio_id: sid,
          servicio_nombre: t.servicios.nombre,
          servicio_activo: t.servicios.estado_activo,
          items: [],
          total_items: 0,
          obligatorios: 0,
        };
      }
      agrupado[sid].items.push({
        item_id: t.item_id,
        nombre: t.checklist_items.nombre,
        descripcion: t.checklist_items.descripcion,
        requiere_observacion: t.checklist_items.requiere_observacion,
        item_activo: t.checklist_items.estado_activo,
        obligatorio: t.obligatorio,
        orden: t.orden,
      });
      agrupado[sid].total_items++;
      if (t.obligatorio) agrupado[sid].obligatorios++;
    }

    res.json(Object.values(agrupado));
  } catch (error) {
    console.error('[Templates] Error listando:', error);
    next(error);
  }
};

/**
 * POST /api/admin/checklist/templates
 * Asigna uno o varios items a un servicio (batch)
 */
export const assignItemsToServicio = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { servicio_id, items } = req.body;
    // items: [{ item_id: number, obligatorio: boolean, orden: number }]

    if (!servicio_id) throw new AppError('servicio_id es requerido', 400);
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Debes enviar al menos un item para asignar', 400);
    }

    // Validar y filtrar item_id numéricos
    const itemIds = items
      .map((i: any) => Number(i.item_id))
      .filter((id: number) => !isNaN(id) && id > 0);

    if (itemIds.length === 0) {
      throw new AppError('Ningún item_id válido (debe ser número entero positivo)', 400);
    }

    // Validar que el servicio existe
    const servicio = await prisma.servicios.findUnique({ where: { id: servicio_id } });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);

    // Validar que todos los items existen y están activos
    const itemsExistentes = await prisma.checklist_items.findMany({
      where: {
        id: { in: itemIds },
        estado_activo: true,
      },
      select: { id: true },
    });

    const idsValidos = new Set(itemsExistentes.map(i => i.id));
    const invalidos = itemIds.filter((id: number) => !idsValidos.has(id));
    if (invalidos.length > 0) {
      throw new AppError(
        `Los siguientes items no existen o están inactivos: ${invalidos.join(', ')}`,
        400,
      );
    }

    // Transacción: borrar asignaciones previas y crear nuevas
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.template_checklist.deleteMany({
        where: { servicio_id },
      });

      const creados = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const idNumerico = Number(it.item_id);
        if (isNaN(idNumerico) || idNumerico <= 0) continue; // saltear inválidos

        const orden = it.orden ?? i + 1;
        const asignacion = await tx.template_checklist.create({
          data: {
            servicio_id,
            item_id: idNumerico,
            obligatorio: it.obligatorio !== false, // true por defecto
            orden: orden,
          },
          include: {
            checklist_items: { select: { nombre: true } },
          },
        });
        creados.push(asignacion);
      }

      return creados;
    });

    res.status(201).json({
      message: `✅ ${resultado.length} ítems asignados al servicio "${servicio.nombre}"`,
      asignaciones: resultado.map(a => ({
        item_id: a.item_id,
        nombre: a.checklist_items.nombre,
        obligatorio: a.obligatorio,
        orden: a.orden,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/checklist/templates/:servicio_id/:item_id
 * Elimina una asignación específica
 */
export const removeItemFromServicio = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const servicio_id = parseInt(req.params.servicio_id as string);
    const item_id = parseInt(req.params.item_id as string);

    if (isNaN(servicio_id) || isNaN(item_id)) {
      throw new AppError('IDs inválidos', 400);
    }

    const asignacion = await prisma.template_checklist.findUnique({
      where: {
        servicio_id_item_id: { servicio_id, item_id },
      },
      include: {
        checklist_items: { select: { nombre: true } },
        servicios: { select: { nombre: true } },
      },
    });

    if (!asignacion) throw new AppError('Asignación no encontrada', 404);

    await prisma.template_checklist.delete({
      where: { servicio_id_item_id: { servicio_id, item_id } },
    });

    res.json({
      message: `✅ Ítem "${asignacion.checklist_items.nombre}" eliminado del servicio "${asignacion.servicios.nombre}"`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/checklist/templates/:servicio_id
 * Elimina TODAS las asignaciones de un servicio
 */
export const clearServicioTemplate = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const servicio_id = parseInt(req.params.servicio_id as string);
    if (isNaN(servicio_id)) throw new AppError('ID inválido', 400);

    const servicio = await prisma.servicios.findUnique({ where: { id: servicio_id } });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);

    const { count } = await prisma.template_checklist.deleteMany({
      where: { servicio_id },
    });

    res.json({
      message: `✅ Se eliminaron ${count} ítems del servicio "${servicio.nombre}"`,
      eliminados: count,
    });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// FICHA CHECKLIST (vista de supervisión - solo lectura)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/checklist/fichas?ficha_id=X&groomer_id=X&fecha=YYYY-MM-DD
 * Lista las fichas de checklist completadas por los groomers
 */
export const getFichasChecklist = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { ficha_id, fecha, servicio_id, completado } = req.query;

    const where: any = {};
    if (ficha_id) where.ficha_id = parseInt(ficha_id as string);
    if (completado === 'true') where.completado = true;
    else if (completado === 'false') where.completado = false;

    if (fecha) {
      const inicio = new Date(`${fecha}T00:00:00`);
      const fin = new Date(`${fecha}T23:59:59`);
      where.completado_en = { gte: inicio, lte: fin };
    }

    // 🔧 CORREGIDO: servicio_id está en citas, no en fichas_grooming
    if (servicio_id) {
      where.fichas_grooming = {
        citas: {
          servicio_id: parseInt(servicio_id as string),
        },
      };
    }

    const fichas = await prisma.ficha_checklist.findMany({
      where,
      include: {
        checklist_items: {
          select: { id: true, nombre: true, descripcion: true, requiere_observacion: true },
        },
        // 🔧 CORREGIDO: pasar por citas para llegar a mascotas, servicios, groomers
        fichas_grooming: {
          select: {
            id: true,
            citas: {
              select: {
                estado: true,
                mascotas:  { select: { nombre: true } },
                servicios: { select: { nombre: true } },
                groomers:  { select: { nombre: true, apellido: true } },
              },
            },
          },
        },
      },
      orderBy: { completado_en: 'desc' },
      take: 500,
    });

    // Agrupar por ficha
    const agrupado: Record<number, {
      ficha_id: number;
      mascota: string;
      servicio: string;
      groomer: string;
      estado_ficha: string;
      items: any[];
      total_items: number;
      completados: number;
      pendientes: number;
    }> = {};

    for (const f of fichas) {
      const fid = f.ficha_id;
      if (!agrupado[fid]) {
        // 🔧 CORREGIDO: acceder a través de citas
        const cita = f.fichas_grooming.citas;
        agrupado[fid] = {
          ficha_id: fid,
          mascota: cita.mascotas.nombre,
          servicio: cita.servicios.nombre,
          groomer: `${cita.groomers.nombre} ${cita.groomers.apellido}`,
          estado_ficha: cita.estado,
          items: [],
          total_items: 0,
          completados: 0,
          pendientes: 0,
        };
      }
      agrupado[fid].items.push({
        item_id: f.item_id,
        nombre: f.checklist_items.nombre,
        requiere_observacion: f.checklist_items.requiere_observacion,
        completado: f.completado,
        observacion: f.observacion,
        completado_en: f.completado_en,
      });
      agrupado[fid].total_items++;
      if (f.completado) agrupado[fid].completados++;
      else agrupado[fid].pendientes++;
    }

    res.json(Object.values(agrupado));
  } catch (error) {
    console.error('[Fichas Checklist] Error listando:', error);
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// CONSUMO INSUMOS (vista de supervisión - solo lectura)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/checklist/consumo?ficha_id=X&producto_id=X&fecha=YYYY-MM-DD
 * Lista el consumo de insumos registrado por los groomers
 */
export const getConsumoInsumos = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { ficha_id, producto_id, fecha, descontado } = req.query;

    const where: any = {};
    if (ficha_id) where.ficha_id = parseInt(ficha_id as string);
    if (producto_id) where.producto_id = parseInt(producto_id as string);
    if (descontado === 'true') where.descontado = true;
    else if (descontado === 'false') where.descontado = false;

    if (fecha) {
      const inicio = new Date(`${fecha}T00:00:00`);
      const fin = new Date(`${fecha}T23:59:59`);
      where.creado_en = { gte: inicio, lte: fin };
    }

    const consumos = await prisma.consumo_insumos_ficha.findMany({
      where,
      include: {
        productos: {
          select: { id: true, nombre: true, sku: true, precio_base: true },
        },
        // 🔧 CORREGIDO: la relación se llama 'variantes_producto' (nombre del modelo)
        variantes_producto: {
          select: { id: true, atributo: true, valor: true, sku_variante: true, precio_extra: true },
        },
        fichas_grooming: {
          select: {
            id: true,
            citas: {
              select: {
                estado: true,
                mascotas:  { select: { nombre: true } },
                servicios: { select: { nombre: true } },
                groomers:  { select: { nombre: true, apellido: true } },
              },
            },
          },
        },
      },
      orderBy: { creado_en: 'desc' },
      take: 500,
    });

    const resultado = consumos.map(c => {
      const cita = c.fichas_grooming.citas;
      // 🔧 Ahora accedemos correctamente a c.variantes_producto
      const variante = c.variantes_producto;
      return {
        id: c.id,
        ficha_id: c.ficha_id,
        mascota: cita.mascotas.nombre,
        servicio: cita.servicios.nombre,
        groomer: `${cita.groomers.nombre} ${cita.groomers.apellido}`,
        producto_id: c.producto_id,
        producto: c.productos?.nombre ?? 'Desconocido',
        sku_producto: c.productos?.sku ?? '',
        variante_id: c.variante_id,
        variante: variante ? `${variante.atributo}: ${variante.valor}` : null,
        sku_variante: variante?.sku_variante ?? null,
        cantidad: Number(c.cantidad),
        descontado: c.descontado,
        precio_unitario: Number(c.productos?.precio_base ?? 0) + Number(variante?.precio_extra ?? 0),
        costo_total: Number(c.cantidad) * (Number(c.productos?.precio_base ?? 0) + Number(variante?.precio_extra ?? 0)),
        creado_en: c.creado_en,
      };
    });

    const totalConsumo = resultado.reduce((sum, r) => sum + r.costo_total, 0);
    const totalItems = resultado.length;

    res.json({
      items: resultado,
      resumen: {
        total_items: totalItems,
        costo_total: Number(totalConsumo.toFixed(2)),
        descontados: resultado.filter(r => r.descontado).length,
        pendientes_descuento: resultado.filter(r => !r.descontado).length,
      },
    });
  } catch (error) {
    console.error('[Consumo Insumos] Error listando:', error);
    next(error);
  }
};


// ══════════════════════════════════════════════════════════════
// RESUMEN COMBINADO (dashboard de checklist)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/checklist/resumen
 * Resumen general del módulo de checklist
 */
export const getChecklistResumen = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const [
      totalItems,
      itemsActivos,
      totalTemplates,
      serviciosConTemplate,
      totalFichasHoy,
      consumoHoy,
    ] = await Promise.all([
      prisma.checklist_items.count(),
      prisma.checklist_items.count({ where: { estado_activo: true } }),
      prisma.template_checklist.count(),
      prisma.template_checklist.groupBy({
        by: ['servicio_id'],
      }).then(g => g.length),
      prisma.ficha_checklist.count({
        where: {
          completado_en: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.consumo_insumos_ficha.aggregate({
        where: {
          creado_en: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        _sum: { cantidad: true },
        _count: true,
      }),
    ]);

    res.json({
      items: {
        total: totalItems,
        activos: itemsActivos,
        inactivos: totalItems - itemsActivos,
      },
      templates: {
        total_asignaciones: totalTemplates,
        servicios_configurados: serviciosConTemplate,
      },
      hoy: {
        fichas_completadas: totalFichasHoy,
        insumos_consumidos: consumoHoy._count,
        cantidad_total: Number(consumoHoy._sum?.cantidad ?? 0),
      },
    });
  } catch (error) {
    console.error('[Checklist Resumen] Error:', error);
    next(error);
  }
};