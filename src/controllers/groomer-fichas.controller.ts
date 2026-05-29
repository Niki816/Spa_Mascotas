// src/controllers/groomer-fichas.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';
import path from 'path';

interface AuthRequest extends Request {
  user?: { id: number; email: string; rol: string };
  file?: Express.Multer.File;
}

/**
 * Middleware para obtener el groomer asociado al usuario logueado
 */
async function getGroomerOrThrow(userId: number) {
  const groomer = await prisma.groomers.findUnique({
    where: { usuario_id: userId },
    select: { id: true, nombre: true, apellido: true },
  });
  if (!groomer) throw new AppError('Perfil de groomer no encontrado', 403);
  return groomer;
}

/**
 * GET /api/groomers/fichas/activas
 * Lista las citas de hoy en estado "agendada", "confirmada" o "en_progreso"
 */
export const getFichasActivas = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const groomer = await getGroomerOrThrow(userId);

    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hoyFin = new Date(hoyInicio.getTime() + 24 * 60 * 60 * 1000);

    const citas = await prisma.citas.findMany({
      where: {
        groomer_id: groomer.id,
        fecha_hora_inicio: { gte: hoyInicio, lt: hoyFin },
        estado: { in: ['agendada', 'confirmada', 'en_progreso'] },
      },
      include: {
        mascotas: { select: { id: true, nombre: true, raza: true, foto_url: true, especie: true } },
        servicios: { select: { id: true, nombre: true, duracion_base_minutos: true } },
        fichas_grooming: { select: { id: true, fecha_cierre: true } },
      },
      orderBy: { fecha_hora_inicio: 'asc' },
    });

    const resultado = citas.map(c => ({
      cita_id: c.id,
      horaInicio: c.fecha_hora_inicio,
      horaFin: c.fecha_hora_fin,
      estado: c.estado,
      mascota: {
        id: c.mascotas.id,
        nombre: c.mascotas.nombre,
        raza: c.mascotas.raza,
        especie: c.mascotas.especie,
        foto: c.mascotas.foto_url,
      },
      servicio: {
        id: c.servicios.id,
        nombre: c.servicios.nombre,
        duracionEstimada: c.servicios.duracion_base_minutos,
      },
      ficha: c.fichas_grooming?.id ? {
        id: c.fichas_grooming.id,
        cerrada: !!c.fichas_grooming.fecha_cierre,
      } : null,
      notas: c.notas,
    }));

    res.json({ agenda: resultado });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/groomers/fichas/:citaId
 * Obtiene el detalle completo de la ficha
 */
export const getFichaDetalle = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const citaId = parseInt(req.params.citaId as string);
    if (isNaN(citaId)) throw new AppError('ID de cita inválido', 400);

    const groomer = await getGroomerOrThrow(userId);

    const cita = await prisma.citas.findFirst({
      where: { id: citaId, groomer_id: groomer.id },
      include: {
        mascotas: { select: { nombre: true, raza: true, peso_kg: true, temperamento: true, alergias: true } },
        servicios: { select: { id: true, nombre: true, duracion_base_minutos: true } },
        fichas_grooming: true,
      },
    });
    if (!cita) throw new AppError('Cita no encontrada o no te pertenece', 404);

    // Si no hay ficha, devolvemos template
    if (!cita.fichas_grooming) {
      const template = await prisma.template_checklist.findMany({
        where: { servicio_id: cita.servicio_id },
        include: { checklist_items: true },
        orderBy: { orden: 'asc' },
      });
      return res.json({
        cita: {
          id: cita.id,
          estado: cita.estado,
          mascota: cita.mascotas,
          servicio: cita.servicios,
        },
        ficha: null,
        template: template.map(t => ({
          item_id: t.item_id,
          nombre: t.checklist_items.nombre,
          requiere_observacion: t.checklist_items.requiere_observacion,
          obligatorio: t.obligatorio,
          orden: t.orden,
        })),
        fotos: [],
        consumo: [],
      });
    }

    const ficha = cita.fichas_grooming;

    // Checklist completado
    const checklist = await prisma.ficha_checklist.findMany({
      where: { ficha_id: ficha.id },
      include: { checklist_items: true },
      orderBy: { checklist_items: { orden: 'asc' } },
    });

    // Fotos
    const fotos = await prisma.fotos_ficha.findMany({
      where: { ficha_id: ficha.id },
      orderBy: { creado_en: 'asc' },
    });

    // Consumo de insumos con info de productos
    const consumo = await prisma.consumo_insumos_ficha.findMany({
      where: { ficha_id: ficha.id },
      include: {
        productos: { select: { id: true, nombre: true } },
        variantes_producto: { select: { id: true, atributo: true, valor: true } },
      },
    });

    res.json({
      cita: {
        id: cita.id,
        estado: cita.estado,
        mascota: cita.mascotas,
        servicio: cita.servicios,
      },
      ficha: {
        id: ficha.id,
        creado_en: ficha.creado_en,
        fecha_cierre: ficha.fecha_cierre,
        notas_internas: ficha.notas_internas,
      },
      checklist: checklist.map(cl => ({
        item_id: cl.item_id,
        nombre: cl.checklist_items.nombre,
        requiere_observacion: cl.checklist_items.requiere_observacion,
        completado: cl.completado,
        observacion: cl.observacion,
        completado_en: cl.completado_en,
      })),
      fotos: fotos.map(f => ({
        id: f.id,
        url: f.url,
        tipo: f.tipo,
        descripcion: f.descripcion,
      })),
      consumo: consumo.map(c => ({
        id: c.id,
        producto_id: c.producto_id,
        producto: c.productos.nombre,
        variante_id: c.variante_id,
        variante: c.variantes_producto ? `${c.variantes_producto.atributo}: ${c.variantes_producto.valor}` : null,
        cantidad: Number(c.cantidad),
        descontado: c.descontado,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/groomers/productos-consumo
 * Obtiene todos los productos de higiene y limpieza con sus variantes
 */
export const getProductosConsumibles = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Obtener categoría de "Higiene y Limpieza" (ajusta según tu BD)
    const productos = await prisma.productos.findMany({
      where: {
        estado_activo: true,
        // Aquí podrías filtrar por categoría si tienes una específica
        // categoria_id: { in: [/* ids de higiene */] }
      },
      include: {
        variantes_producto: {
          where: { estado_activo: true },
          orderBy: { creado_en: 'asc' },
        },
        categorias_producto: true,
      },
      orderBy: { nombre: 'asc' },
    });

    const resultado = productos.map(p => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      sku: p.sku,
      precio_base: Number(p.precio_base),
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      categoria: p.categorias_producto?.nombre,
      variantes: p.variantes_producto.map(v => ({
        id: v.id,
        atributo: v.atributo,
        valor: v.valor,
        sku: v.sku_variante,
        precio_extra: Number(v.precio_extra),
        stock: v.stock,
      })),
    }));

    res.json(resultado);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groomers/fichas/:citaId/iniciar
 * Crea la ficha de grooming y cambia cita a "en_progreso"
 */
export const iniciarServicio = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const citaId = parseInt(req.params.citaId as string);
    if (isNaN(citaId)) throw new AppError('ID de cita inválido', 400);

    const groomer = await getGroomerOrThrow(userId);

    const cita = await prisma.citas.findFirst({
      where: { id: citaId, groomer_id: groomer.id },
      include: { fichas_grooming: true },
    });
    if (!cita) throw new AppError('Cita no encontrada', 404);
    if (cita.estado !== 'agendada' && cita.estado !== 'confirmada') {
      throw new AppError('Solo puedes iniciar citas en estado agendada o confirmada', 400);
    }

    // Crear ficha si no existe
    let ficha = cita.fichas_grooming;
    if (!ficha) {
      ficha = await prisma.fichas_grooming.create({
        data: {
          cita_id: citaId,
          estado_inicial: '',
        },
      });
    }

    // Cambiar estado de cita
    await prisma.citas.update({
      where: { id: citaId },
      data: { estado: 'en_progreso' },
    });

    // Crear items del checklist desde template
    const template = await prisma.template_checklist.findMany({
      where: { servicio_id: cita.servicio_id },
    });
    await Promise.all(
      template.map(t =>
        prisma.ficha_checklist.create({
          data: {
            ficha_id: ficha.id,
            item_id: t.item_id,
          },
        }).catch(() => {}) // ignorar duplicados
      )
    );

    res.json({ message: 'Servicio iniciado', ficha_id: ficha.id });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/groomers/fichas/:citaId/checklist/:itemId
 * Marca/desmarca un ítem del checklist
 */
export const toggleChecklistItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const citaId = parseInt(req.params.citaId as string);
    const itemId = parseInt(req.params.itemId as string);
    if (isNaN(citaId) || isNaN(itemId)) throw new AppError('IDs inválidos', 400);

    const groomer = await getGroomerOrThrow(userId);

    const cita = await prisma.citas.findFirst({
      where: { id: citaId, groomer_id: groomer.id },
      include: { fichas_grooming: true },
    });
    if (!cita || !cita.fichas_grooming) throw new AppError('Ficha no encontrada', 404);

    const fichaId = cita.fichas_grooming.id;
    const { completado, observacion } = req.body;

    if (completado === undefined) throw new AppError('Debes enviar "completado"', 400);

    // Validar observación si es requerida
    const item = await prisma.checklist_items.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError('Ítem no existe', 404);
    if (completado && item.requiere_observacion && !observacion?.trim()) {
      throw new AppError('Este ítem requiere una observación', 400);
    }

    const registro = await prisma.ficha_checklist.findUnique({
      where: { ficha_id_item_id: { ficha_id: fichaId, item_id: itemId } },
    });
    if (!registro) throw new AppError('Ítem no en esta ficha', 404);

    await prisma.ficha_checklist.update({
      where: { id: registro.id },
      data: {
        completado,
        observacion: observacion || null,
        completado_en: completado ? new Date() : null,
      },
    });

    res.json({ message: completado ? 'Ítem completado ✓' : 'Ítem desmarcado' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groomers/fichas/:citaId/foto
 * Sube una foto desde el dispositivo
 */
export const subirFotoFicha = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const citaId = parseInt(req.params.citaId as string);
    if (isNaN(citaId)) throw new AppError('ID de cita inválido', 400);

    if (!req.file) throw new AppError('Debes seleccionar una imagen', 400);

    const { tipo, descripcion } = req.body;
    if (!tipo || !['antes', 'despues'].includes(tipo)) {
      throw new AppError('Tipo de foto inválido (antes/despues)', 400);
    }

    const groomer = await getGroomerOrThrow(userId);

    const cita = await prisma.citas.findFirst({
      where: { id: citaId, groomer_id: groomer.id },
      include: { fichas_grooming: true },
    });
    if (!cita || !cita.fichas_grooming) throw new AppError('Ficha no encontrada', 404);

    // Construir URL relativa de la foto
    const photoUrl = `/uploads/fichas/${req.file.filename}`;

    // Guardar en BD
    const foto = await prisma.fotos_ficha.create({
      data: {
        ficha_id: cita.fichas_grooming.id,
        url: photoUrl,
        tipo,
        descripcion: descripcion || null,
      },
    });

    res.status(201).json({
      message: 'Foto subida exitosamente',
      foto: {
        id: foto.id,
        url: foto.url,
        tipo: foto.tipo,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groomers/fichas/:citaId/consumo
 * Registra consumo de insumo (con decimales)
 * 
 * Body: { producto_id, variante_id?, cantidad (decimal) }
 * Ejemplo: { producto_id: 5, variante_id: 12, cantidad: 0.5 } (500ml de 1L)
 */
export const registrarConsumo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const citaId = parseInt(req.params.citaId as string);
    if (isNaN(citaId)) throw new AppError('ID de cita inválido', 400);

    const groomer = await getGroomerOrThrow(userId);
    const cita = await prisma.citas.findFirst({
      where: { id: citaId, groomer_id: groomer.id },
      include: { fichas_grooming: true },
    });
    if (!cita || !cita.fichas_grooming) throw new AppError('Ficha no encontrada', 404);

    const { producto_id, variante_id, cantidad } = req.body;
    if (!producto_id || !cantidad || Number(cantidad) <= 0) {
      throw new AppError('Producto y cantidad requeridos', 400);
    }

    // Validar producto
    const producto = await prisma.productos.findUnique({ where: { id: producto_id } });
    if (!producto) throw new AppError('Producto no existe', 404);

    // Validar variante si se proporciona
    if (variante_id) {
      const variante = await prisma.variantes_producto.findUnique({ where: { id: variante_id } });
      if (!variante) throw new AppError('Variante no existe', 404);
    }

    // Registrar consumo (SIN descontar stock aún)
    await prisma.consumo_insumos_ficha.create({
      data: {
        ficha_id: cita.fichas_grooming.id,
        producto_id,
        variante_id: variante_id || null,
        cantidad: parseFloat(cantidad as string),
        descontado: false, // Se descontará al cerrar la ficha
      },
    });

    res.status(201).json({ message: 'Consumo registrado (se descontará al cerrar ficha)' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/groomers/fichas/:citaId/consumo/:consumoId
 * Elimina un registro de consumo (si aún no está descontado)
 */
export const eliminarConsumo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const citaId = parseInt(req.params.citaId as string);
    const consumoId = parseInt(req.params.consumoId as string);
    if (isNaN(citaId) || isNaN(consumoId)) throw new AppError('IDs inválidos', 400);

    const groomer = await getGroomerOrThrow(userId);

    const cita = await prisma.citas.findFirst({
      where: { id: citaId, groomer_id: groomer.id },
      include: { fichas_grooming: true },
    });
    if (!cita?.fichas_grooming) throw new AppError('Ficha no encontrada', 404);

    const consumo = await prisma.consumo_insumos_ficha.findFirst({
      where: {
        id: consumoId,
        ficha_id: cita.fichas_grooming.id,
        descontado: false, // Solo puedo eliminar consumos no descontados
      },
    });
    if (!consumo) throw new AppError('Consumo no encontrado o ya fue descontado', 404);

    await prisma.consumo_insumos_ficha.delete({ where: { id: consumoId } });

    res.json({ message: 'Consumo eliminado' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groomers/fichas/:citaId/cerrar
 * Cierra ficha: valida checklist, fotos, descuenta inventario (DECIMAL)
 */
// ─── HELPER: Parsear cantidad y unidad desde un string ───────────────────────
// Ejemplos: "3kg Carne", "1.5 kg Lavanda", "500ml", "1 L Manzanilla"
// Retorna: { cantidad: number, unidad: string, descripcion: string }
function parsearValorVariante(valor: string): { cantidad: number; unidad: string; descripcion: string } | null {
  // Regex: número opcional-espacio-unidad-espacio-descripcion
  const match = valor.trim().match(/^([\d]+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|ltr)\s*(.*)?$/i);
  if (!match) return null;

  const cantidad = parseFloat(match[1].replace(',', '.'));
  const unidad = match[2].toLowerCase()
    .replace('lt', 'l')
    .replace('ltr', 'l')
    .replace('gr', 'g');
  const descripcion = (match[3] || '').trim();

  return { cantidad, unidad, descripcion };
}

// ─── HELPER: Convertir todo a gramos o mililitros (unidad base) ──────────────
function aUnidadBase(cantidad: number, unidad: string): { valor: number; base: 'g' | 'ml' } {
  switch (unidad) {
    case 'kg': return { valor: cantidad * 1000, base: 'g' };
    case 'g':  return { valor: cantidad,        base: 'g' };
    case 'l':  return { valor: cantidad * 1000, base: 'ml' };
    case 'ml': return { valor: cantidad,        base: 'ml' };
    default:   return { valor: cantidad,        base: 'g' };
  }
}

// ─── HELPER: Convertir de unidad base de vuelta a la unidad original ─────────
function deUnidadBase(valorBase: number, unidadOriginal: string): { cantidad: number; unidad: string } {
  const u = unidadOriginal.toLowerCase();
  if (u === 'kg')      return { cantidad: valorBase / 1000, unidad: 'kg' };
  if (u === 'g')       return { cantidad: valorBase,        unidad: 'g'  };
  if (u === 'l')       return { cantidad: valorBase / 1000, unidad: 'L'  };
  if (u === 'ml')      return { cantidad: valorBase,        unidad: 'ml' };
  return { cantidad: valorBase, unidad: unidadOriginal };
}

// ─── HELPER: Reconstruir el string de valor con la nueva cantidad ─────────────
function reconstruirValor(nuevaCantidad: number, unidad: string, descripcion: string): string {
  // Redondear a máximo 3 decimales y quitar ceros innecesarios
  const cantidadStr = parseFloat(nuevaCantidad.toFixed(3)).toString();
  return descripcion
    ? `${cantidadStr}${unidad} ${descripcion}`
    : `${cantidadStr}${unidad}`;
}

/**
 * POST /api/groomers/fichas/:citaId/cerrar
 * Cierra ficha: valida checklist, fotos, descuenta inventario inteligente
 */
export const cerrarFicha = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const citaId = parseInt(req.params.citaId as string);
    if (isNaN(citaId)) throw new AppError('ID de cita inválido', 400);

    const groomer = await getGroomerOrThrow(userId);
    const cita = await prisma.citas.findFirst({
      where: { id: citaId, groomer_id: groomer.id },
      include: { fichas_grooming: true },
    });
    if (!cita || !cita.fichas_grooming) throw new AppError('Ficha no encontrada', 404);

    const ficha = cita.fichas_grooming;
    if (ficha.fecha_cierre) throw new AppError('Ficha ya está cerrada', 400);

    // ✓ VALIDAR CHECKLIST
    const template = await prisma.template_checklist.findMany({
      where: { servicio_id: cita.servicio_id, obligatorio: true },
    });
    const checklist = await prisma.ficha_checklist.findMany({
      where: { ficha_id: ficha.id },
    });
    const pendientes = template.filter(
      t => !checklist.some(cl => cl.item_id === t.item_id && cl.completado)
    );
    if (pendientes.length > 0) {
      throw new AppError(`Faltan ${pendientes.length} ítems obligatorios del checklist`, 400);
    }

    // ✓ VALIDAR FOTOS
    const fotos = await prisma.fotos_ficha.findMany({ where: { ficha_id: ficha.id } });
    if (!fotos.some(f => f.tipo === 'antes') || !fotos.some(f => f.tipo === 'despues')) {
      throw new AppError('Debes subir fotos de "antes" y "después"', 400);
    }

    // =============================================================
    // DESCUENTO DE INVENTARIO (SIN MODIFICAR "valor" NI ESQUEMA)
    // =============================================================
    const consumos = await prisma.consumo_insumos_ficha.findMany({
      where: { ficha_id: ficha.id, descontado: false },
      include: { productos: true, variantes_producto: true },
    });

    // Agrupar consumos por variante para procesar acumulados
    const gruposPorVariante = new Map<number, typeof consumos>();
    for (const cons of consumos) {
      if (cons.variante_id && cons.variantes_producto) {
        const arr = gruposPorVariante.get(cons.variante_id) || [];
        arr.push(cons);
        gruposPorVariante.set(cons.variante_id, arr);
      }
    }

    // Procesar cada variante
    for (const [varianteId, lista] of gruposPorVariante) {
      // Obtener todos los consumos NO descontados de esta variante (de cualquier ficha)
      const todosPendientes = await prisma.consumo_insumos_ficha.findMany({
        where: { variante_id: varianteId, descontado: false },
        orderBy: { creado_en: 'asc' },
      });
      if (todosPendientes.length === 0) continue;

      const variante = lista[0].variantes_producto!;

      // Parsear la cantidad de una unidad del texto "valor"
      const parsed = parsearValorVariante(variante.valor);
      if (!parsed) {
        throw new AppError(`No se pudo interpretar la cantidad del valor "${variante.valor}"`, 400);
      }
      const unidadBase = aUnidadBase(parsed.cantidad, parsed.unidad).valor; // en gramos o ml

      // Sumar todas las cantidades (asumimos que el groomer ingresa en la misma unidad que el valor)
      let totalConsumido = 0;
      for (const c of todosPendientes) {
        const cantidad = Number(c.cantidad);
        // Si el número es muy grande comparado con el tamaño de la unidad, asumir que está en gramos/ml
        if (cantidad > parsed.cantidad * 5 && (parsed.unidad === 'kg' || parsed.unidad === 'l')) {
          totalConsumido += cantidad; // ya está en base
        } else {
          const enBase = aUnidadBase(cantidad, parsed.unidad).valor;
          totalConsumido += enBase;
        }
      }

      const unidadesCompletas = Math.floor(totalConsumido / unidadBase);
      if (unidadesCompletas > 0) {
        // Verificar stock suficiente
        if (variante.stock < unidadesCompletas) {
          throw new AppError(
            `Stock insuficiente para la variante "${variante.atributo}: ${variante.valor}". ` +
            `Necesario: ${unidadesCompletas}, disponible: ${variante.stock}`,
            400
          );
        }

        // Descontar stock de la variante (solo unidades enteras)
        await prisma.variantes_producto.update({
          where: { id: varianteId },
          data: { stock: { decrement: unidadesCompletas } },
        });

        let pendiente = unidadesCompletas * unidadBase;
        const idsADescontar: number[] = [];
        for (const c of todosPendientes) {
          if (pendiente <= 0) break;
          const cantidad = Number(c.cantidad);
          const enBase = (cantidad > parsed.cantidad * 5 && (parsed.unidad === 'kg' || parsed.unidad === 'l'))
            ? cantidad
            : aUnidadBase(cantidad, parsed.unidad).valor;
          if (enBase <= pendiente) {
            idsADescontar.push(c.id);
            pendiente -= enBase;
          } else {
            
            break;
          }
        }
        if (idsADescontar.length > 0) {
          await prisma.consumo_insumos_ficha.updateMany({
            where: { id: { in: idsADescontar } },
            data: { descontado: true },
          });
        }
      }
    }

    // Consumos sin variante: descuento directo del stock del producto (sin cambios)
    for (const cons of consumos) {
      if (!cons.variante_id) {
        const producto = cons.productos;
        const cantidad = Number(cons.cantidad);
        if (Number(producto.stock) < cantidad) {
          throw new AppError(
            `Stock insuficiente para "${producto.nombre}": disponible ${producto.stock}, necesitas ${cantidad}`,
            400
          );
        }
        await prisma.productos.update({
          where: { id: cons.producto_id },
          data: { stock: { decrement: Math.floor(cantidad) } }, // solo enteros
        });
        await prisma.consumo_insumos_ficha.update({
          where: { id: cons.id },
          data: { descontado: true },
        });
      }
    }

    // ✓ CERRAR FICHA Y CAMBIAR ESTADO
    await prisma.fichas_grooming.update({
      where: { id: ficha.id },
      data: {
        fecha_cierre: new Date(),
        estado_final: req.body.estado_final || '',
      },
    });

    await prisma.citas.update({
      where: { id: citaId },
      data: { estado: 'completada' },
    });

    res.json({ message: '✓ Ficha cerrada exitosamente', ficha_id: ficha.id });
  } catch (error) {
    next(error);
  }
};