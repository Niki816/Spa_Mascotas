// ─── src/controllers/productos.controller.ts ───────────────────────────────
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';
import PDFDocument from 'pdfkit';

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════

export const getCategorias = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categorias = await prisma.categorias_producto.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        _count: { select: { productos: true } },
      },
    });

    const padreIds = [...new Set(categorias.map(c => c.padre_id).filter(Boolean))] as number[];
    const padres = padreIds.length
      ? await prisma.categorias_producto.findMany({
          where: { id: { in: padreIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const padreMap = Object.fromEntries(padres.map(p => [p.id, p.nombre]));

    res.json(categorias.map(c => ({
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      padre_id: c.padre_id,
      padre_nombre: c.padre_id ? (padreMap[c.padre_id] ?? null) : null,
      total_productos: c._count.productos,
    })));
  } catch (error) { next(error); }
};

export const createCategoria = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nombre, descripcion, padre_id } = req.body;
    if (!nombre?.trim()) throw new AppError('El nombre es obligatorio', 400);

    if (padre_id) {
      const padre = await prisma.categorias_producto.findUnique({ where: { id: Number(padre_id) } });
      if (!padre) throw new AppError('Categoría padre no encontrada', 404);
    }

    const categoria = await prisma.categorias_producto.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        padre_id: padre_id ? Number(padre_id) : null,
      },
    });
    res.status(201).json({ message: `Categoría "${nombre}" creada`, categoria });
  } catch (error) { next(error); }
};

export const updateCategoria = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const { nombre, descripcion, padre_id } = req.body;

    if (padre_id && Number(padre_id) === id) {
      throw new AppError('Una categoría no puede ser su propio padre', 400);
    }

    const updated = await prisma.categorias_producto.update({
      where: { id },
      data: {
        nombre: nombre?.trim() || undefined,
        descripcion: descripcion !== undefined ? (descripcion?.trim() || null) : undefined,
        padre_id: padre_id !== undefined ? (padre_id ? Number(padre_id) : null) : undefined,
      },
    });
    res.json({ message: 'Categoría actualizada', categoria: updated });
  } catch (error) { next(error); }
};

export const deleteCategoria = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const productosCount = await prisma.productos.count({ where: { categoria_id: id } });
    if (productosCount > 0) {
      throw new AppError(
        `No se puede eliminar: la categoría tiene ${productosCount} producto(s) asociado(s)`,
        400,
      );
    }

    await prisma.categorias_producto.updateMany({
      where: { padre_id: id },
      data: { padre_id: null },
    });

    await prisma.categorias_producto.delete({ where: { id } });
    res.status(204).send();
  } catch (error) { next(error); }
};

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════════

export const getProductos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoria_id, estado, bajo_stock, search } = req.query;

    const where: any = {};
    if (categoria_id) where.categoria_id = Number(categoria_id);
    if (estado === 'activo') where.estado_activo = true;
    if (estado === 'inactivo') where.estado_activo = false;
    if (search) {
      where.OR = [
        { nombre: { contains: String(search) } },
        { sku: { contains: String(search) } },
      ];
    }

    const productos = await prisma.productos.findMany({
      where,
      include: {
        categorias_producto: { select: { id: true, nombre: true } },
        variantes_producto: {
          where: { estado_activo: true },
          select: {
            id: true,
            atributo: true,
            valor: true,
            sku_variante: true,
            precio_extra: true,
            stock: true,
            cantidad: true,
            unidad_medida: true,
            cantidad_actual: true,
          },
        },
        _count: { select: { variantes_producto: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    let result = productos;
    if (bajo_stock === 'true') {
      result = productos.filter(p => p.stock <= p.stock_minimo);
    }

    res.json(result.map(p => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      sku: p.sku,
      precio_base: Number(p.precio_base),
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      imagen_url: p.imagen_url,
      estado_activo: p.estado_activo,
      bajo_stock: p.stock <= p.stock_minimo,
      agotado: p.stock === 0,
      categoria: p.categorias_producto,
      variantes: p.variantes_producto.map(v => ({
        ...v,
        precio_extra: Number(v.precio_extra),
        precio_final: Number(p.precio_base) + Number(v.precio_extra),
        cantidad: v.cantidad !== null ? Number(v.cantidad) : null,
        cantidad_actual: v.cantidad_actual !== null ? Number(v.cantidad_actual) : null,
      })),
      variantes_count: p._count.variantes_producto,
    })));
  } catch (error) { next(error); }
};

export const getProductoById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const producto = await prisma.productos.findUnique({
      where: { id },
      include: {
        categorias_producto: true,
        variantes_producto: true,
      },
    });

    if (!producto) throw new AppError('Producto no encontrado', 404);

    res.json({
      ...producto,
      precio_base: Number(producto.precio_base),
      variantes_producto: producto.variantes_producto.map(v => ({
        ...v,
        precio_extra: Number(v.precio_extra),
        precio_final: Number(producto.precio_base) + Number(v.precio_extra),
        cantidad: v.cantidad !== null ? Number(v.cantidad) : null,
        cantidad_actual: v.cantidad_actual !== null ? Number(v.cantidad_actual) : null,
      })),
      variantes_count: producto.variantes_producto.length,
    });
  } catch (error) { next(error); }
};

export const createProducto = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nombre, descripcion, categoria_id, sku, precio_base, stock, stock_minimo, imagen_url } = req.body;

    if (!nombre?.trim() || !categoria_id || !sku?.trim() || precio_base === undefined) {
      throw new AppError('Faltan campos obligatorios: nombre, categoria_id, sku, precio_base', 400);
    }

    const existeSKU = await prisma.productos.findUnique({ where: { sku: sku.trim() } });
    if (existeSKU) throw new AppError(`El SKU "${sku}" ya está registrado`, 409);

    const categoria = await prisma.categorias_producto.findUnique({ where: { id: Number(categoria_id) } });
    if (!categoria) throw new AppError('Categoría no encontrada', 404);

    if (parseFloat(precio_base) < 0) throw new AppError('El precio no puede ser negativo', 400);

    const producto = await prisma.productos.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        categoria_id: Number(categoria_id),
        sku: sku.trim(),
        precio_base: parseFloat(precio_base),
        stock: stock !== undefined ? parseInt(stock) : 0,
        stock_minimo: stock_minimo !== undefined ? parseInt(stock_minimo) : 5,
        imagen_url: imagen_url?.trim() || null,
        estado_activo: true,
      },
    });

    res.status(201).json({
      message: `Producto "${nombre}" creado exitosamente`,
      producto: { ...producto, precio_base: Number(producto.precio_base) },
    });
  } catch (error) { next(error); }
};

export const updateProducto = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const existe = await prisma.productos.findUnique({
      where: { id },
      include: {
        variantes_producto: { where: { estado_activo: true } },
        categorias_producto: { select: { nombre: true } },
      },
    });
    if (!existe) throw new AppError('Producto no encontrado', 404);

    // No permitir modificar stock directamente si tiene variantes
    if (existe.variantes_producto.length > 0 && req.body.stock !== undefined) {
      throw new AppError(
        'No se puede editar el stock directamente de un producto con variantes. ' +
        'Edita el stock desde las variantes individuales (se sumará automáticamente).',
        400,
      );
    }

    const { nombre, descripcion, categoria_id, sku, precio_base, stock, stock_minimo, imagen_url, estado_activo } = req.body;

    const dataUpdate: any = {};

    if (nombre?.trim()) dataUpdate.nombre = nombre.trim();
    if (descripcion !== undefined) dataUpdate.descripcion = descripcion?.trim() || null;
    if (categoria_id) dataUpdate.categoria_id = Number(categoria_id);
    if (sku?.trim()) dataUpdate.sku = sku.trim();
    if (precio_base !== undefined) dataUpdate.precio_base = parseFloat(precio_base);
    if (stock_minimo !== undefined) dataUpdate.stock_minimo = parseInt(stock_minimo);
    if (imagen_url !== undefined) dataUpdate.imagen_url = imagen_url?.trim() || null;
    if (estado_activo !== undefined) dataUpdate.estado_activo = Boolean(estado_activo);

    // Solo actualizar stock si no tiene variantes y fue enviado
    if (existe.variantes_producto.length === 0 && stock !== undefined && stock !== null && stock !== '') {
      const stockParsed = parseInt(stock);
      if (!isNaN(stockParsed) && stockParsed >= 0) {
        dataUpdate.stock = stockParsed;
      }
    }

    const updated = await prisma.productos.update({
      where: { id },
      data: dataUpdate,
    });

    res.json({
      message: 'Producto actualizado correctamente',
      producto: { ...updated, precio_base: Number(updated.precio_base) },
    });
  } catch (error) { next(error); }
};

export const deleteProducto = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);
    await prisma.productos.update({ where: { id }, data: { estado_activo: false } });
    res.status(204).send();
  } catch (error) { next(error); }
};

export const deleteProductoPermanent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const producto = await prisma.productos.findUnique({ where: { id }, include: { variantes_producto: true } });
    if (!producto) throw new AppError('Producto no encontrado', 404);
    if (producto.estado_activo) throw new AppError('No se puede eliminar un producto activo. Desactívalo primero.', 400);

    if (producto.variantes_producto.length > 0) {
      await prisma.variantes_producto.deleteMany({ where: { producto_id: id } });
    }
    await prisma.productos.delete({ where: { id } });
    res.status(204).send();
  } catch (error) { next(error); }
};

export const updateStock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const { cantidad, operacion, motivo } = req.body;
    if (cantidad === undefined) throw new AppError('La cantidad es requerida', 400);

    const producto = await prisma.productos.findUnique({ where: { id } });
    if (!producto) throw new AppError('Producto no encontrado', 404);

    const cant = parseInt(cantidad);
    if (isNaN(cant) || cant < 0) throw new AppError('Cantidad inválida', 400);

    let nuevoStock = producto.stock;
    if (operacion === 'agregar') nuevoStock += cant;
    else if (operacion === 'restar') nuevoStock -= cant;
    else if (operacion === 'ajustar') nuevoStock = cant;
    else throw new AppError('Operación inválida. Use: agregar, restar, ajustar', 400);

    if (nuevoStock < 0) throw new AppError(`Stock insuficiente. Stock actual: ${producto.stock}`, 400);

    const updated = await prisma.productos.update({
      where: { id },
      data: { stock: nuevoStock },
    });

    res.json({
      message: `Stock actualizado a ${nuevoStock} unidades`,
      stock_anterior: producto.stock,
      stock_nuevo: nuevoStock,
      diferencia: nuevoStock - producto.stock,
      alerta_bajo: nuevoStock <= producto.stock_minimo,
      agotado: nuevoStock === 0,
      motivo: motivo || null,
    });
  } catch (error) { next(error); }
};

// ══════════════════════════════════════════════════════════════════════════════
// IMAGEN – Subida desde PC
// ══════════════════════════════════════════════════════════════════════════════

export const subirImagenProducto = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('No se ha subido ningún archivo', 400);
    const url = `/fotos/productos/${req.file.filename}`;
    res.json({ url });
  } catch (error) { next(error); }
};

// ══════════════════════════════════════════════════════════════════════════════
// VARIANTES
// ══════════════════════════════════════════════════════════════════════════════

/** Sincroniza el stock del producto sumando el stock de sus variantes activas */
async function syncProductStock(productoId: number) {
  const variantes = await prisma.variantes_producto.findMany({
    where: { producto_id: productoId, estado_activo: true },
    select: { stock: true },
  });
  const total = variantes.reduce((sum, v) => sum + v.stock, 0);
  await prisma.productos.update({
    where: { id: productoId },
    data: { stock: total },
  });
}

export const getVariantesByProducto = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productoId = parseInt(req.params.id as string);
    if (isNaN(productoId)) throw new AppError('ID inválido', 400);

    const producto = await prisma.productos.findUnique({ where: { id: productoId }, select: { precio_base: true } });
    if (!producto) throw new AppError('Producto no encontrado', 404);

    const variantes = await prisma.variantes_producto.findMany({
      where: { producto_id: productoId },
      orderBy: [{ atributo: 'asc' }, { valor: 'asc' }],
    });

    res.json(variantes.map(v => ({
      ...v,
      precio_extra: Number(v.precio_extra),
      precio_final: Number(producto.precio_base) + Number(v.precio_extra),
      cantidad: v.cantidad !== null ? Number(v.cantidad) : null,
      cantidad_actual: v.cantidad_actual !== null ? Number(v.cantidad_actual) : null,
    })));
  } catch (error) { next(error); }
};

export const createVariante = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productoId = parseInt(req.params.id as string);
    if (isNaN(productoId)) throw new AppError('ID inválido', 400);

    const { atributo, valor, sku_variante, precio_extra, stock, estado_activo, cantidad, unidad_medida } = req.body;

    if (!atributo?.trim() || !valor?.trim() || !sku_variante?.trim()) {
      throw new AppError('Faltan campos obligatorios: atributo, valor, sku_variante', 400);
    }

    const existeSKU = await prisma.variantes_producto.findUnique({ where: { sku_variante: sku_variante.trim() } });
    if (existeSKU) throw new AppError(`El SKU de variante "${sku_variante}" ya existe`, 409);

    const producto = await prisma.productos.findUnique({ where: { id: productoId } });
    if (!producto) throw new AppError('Producto no encontrado', 404);

    // Validar cantidad si se envía
    if (cantidad !== undefined && cantidad !== null && cantidad !== '') {
      if (isNaN(Number(cantidad)) || Number(cantidad) <= 0)
        throw new AppError('La cantidad debe ser un número positivo', 400);
    }

    const variante = await prisma.variantes_producto.create({
      data: {
        producto_id: productoId,
        atributo: atributo.trim(),
        valor: valor.trim(),
        sku_variante: sku_variante.trim(),
        precio_extra: precio_extra !== undefined ? parseFloat(precio_extra) : 0,
        stock: stock !== undefined ? parseInt(stock) : 0,
        estado_activo: estado_activo ?? true,
        cantidad: cantidad ? Number(cantidad) : null,
        unidad_medida: unidad_medida?.trim() || null,
        cantidad_actual: 0,
      },
    });

    await syncProductStock(productoId);

    res.status(201).json({
      message: 'Variante creada correctamente',
      variante: {
        ...variante,
        precio_extra: Number(variante.precio_extra),
        precio_final: Number(producto.precio_base) + Number(variante.precio_extra),
        cantidad: variante.cantidad !== null ? Number(variante.cantidad) : null,
        cantidad_actual: 0,
      },
    });
  } catch (error) { next(error); }
};

export const createVariantesBatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productoId = parseInt(req.params.id as string);
    if (isNaN(productoId)) throw new AppError('ID inválido', 400);

    const producto = await prisma.productos.findUnique({
      where: { id: productoId },
      select: { id: true, precio_base: true },
    });
    if (!producto) throw new AppError('Producto no encontrado', 404);

    const { variantes } = req.body;
    if (!Array.isArray(variantes) || !variantes.length) {
      throw new AppError('Se requiere un array de variantes', 400);
    }

    for (const v of variantes) {
      if (!v.atributo?.trim() || !v.valor?.trim() || !v.sku_variante?.trim()) {
        throw new AppError(`Cada variante debe tener atributo, valor y sku_variante. Error en: ${JSON.stringify(v)}`, 400);
      }
    }

    const skus = variantes.map(v => v.sku_variante.trim());
    const existentes = await prisma.variantes_producto.findMany({
      where: { sku_variante: { in: skus } },
      select: { sku_variante: true },
    });
    if (existentes.length > 0) {
      throw new AppError(`Los siguientes SKU ya existen: ${existentes.map(e => e.sku_variante).join(', ')}`, 409);
    }

    const created = await prisma.$transaction(
      variantes.map(v =>
        prisma.variantes_producto.create({
          data: {
            producto_id: productoId,
            atributo: v.atributo.trim(),
            valor: v.valor.trim(),
            sku_variante: v.sku_variante.trim(),
            precio_extra: v.precio_extra !== undefined ? parseFloat(v.precio_extra) : 0,
            stock: v.stock !== undefined ? parseInt(v.stock) : 0,
            estado_activo: true,
            cantidad: v.cantidad ? Number(v.cantidad) : null,
            unidad_medida: v.unidad_medida?.trim() || null,
            cantidad_actual: 0,
          },
        })
      )
    );

    await syncProductStock(productoId);

    res.status(201).json({
      message: `${created.length} variante(s) creada(s) exitosamente`,
      variantes: created.map(v => ({
        ...v,
        precio_extra: Number(v.precio_extra),
        precio_final: Number(producto.precio_base) + Number(v.precio_extra),
      })),
    });
  } catch (error) { next(error); }
};

export const updateVariante = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const existe = await prisma.variantes_producto.findUnique({ where: { id } });
    if (!existe) throw new AppError('Variante no encontrada', 404);

    const { atributo, valor, sku_variante, precio_extra, stock, estado_activo, cantidad, unidad_medida } = req.body;

    if (sku_variante && sku_variante.trim() !== existe.sku_variante) {
      const skuExiste = await prisma.variantes_producto.findUnique({ where: { sku_variante: sku_variante.trim() } });
      if (skuExiste) throw new AppError(`El SKU "${sku_variante}" ya está registrado`, 409);
    }

    const data: any = {};

    if (atributo?.trim()) data.atributo = atributo.trim();
    if (valor?.trim()) data.valor = valor.trim();
    if (sku_variante?.trim()) data.sku_variante = sku_variante.trim();
    if (precio_extra !== undefined) data.precio_extra = parseFloat(precio_extra);
    if (stock !== undefined) data.stock = parseInt(stock);
    if (estado_activo !== undefined) data.estado_activo = Boolean(estado_activo);
    if (cantidad !== undefined) {
      const cantidadNum = Number(cantidad);
      if (!isNaN(cantidadNum) && cantidadNum > 0) {
        data.cantidad = cantidadNum;
      } else {
        data.cantidad = null;
      }
    }
    if (unidad_medida !== undefined) data.unidad_medida = unidad_medida?.trim() || null;
    // cantidad_actual no se modifica manualmente

    const updated = await prisma.variantes_producto.update({
      where: { id },
      data,
    });

    await syncProductStock(existe.producto_id);

    res.json({
      message: 'Variante actualizada',
      variante: {
        ...updated,
        precio_extra: Number(updated.precio_extra),
        cantidad: updated.cantidad !== null ? Number(updated.cantidad) : null,
        cantidad_actual: updated.cantidad_actual !== null ? Number(updated.cantidad_actual) : null,
      },
    });
  } catch (error) { next(error); }
};

export const deleteVariante = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const variante = await prisma.variantes_producto.findUnique({ where: { id } });
    if (!variante) throw new AppError('Variante no encontrada', 404);

    const enCarrito = await prisma.detalle_carrito.count({ where: { variante_id: id } });
    if (enCarrito > 0) throw new AppError('No se puede eliminar: la variante está en carritos activos', 400);

    await prisma.variantes_producto.delete({ where: { id } });
    await syncProductStock(variante.producto_id);

    res.status(204).send();
  } catch (error) { next(error); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ALERTAS DE INVENTARIO
// ══════════════════════════════════════════════════════════════════════════════

export const getAlertasStock = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const productos = await prisma.productos.findMany({
      where: { estado_activo: true },
      include: { categorias_producto: { select: { nombre: true } } },
      orderBy: { stock: 'asc' },
    });

    const agotados = productos.filter(p => p.stock === 0);
    const bajoStock = productos.filter(p => p.stock > 0 && p.stock <= p.stock_minimo);
    const enRiesgo = productos.filter(p => p.stock > p.stock_minimo && p.stock <= p.stock_minimo * 1.5);

    const variantesBajas = await prisma.variantes_producto.findMany({
      where: { estado_activo: true, stock: { lte: 3 } },
      include: { productos: { select: { id: true, nombre: true, sku: true } } },
      orderBy: { stock: 'asc' },
    });

    const treintaDias = new Date();
    treintaDias.setDate(treintaDias.getDate() - 30);

    const altoConsumoRaw = await prisma.consumo_insumos_ficha.groupBy({
      by: ['producto_id'],
      where: { creado_en: { gte: treintaDias } },
      _sum: { cantidad: true },
    });
    altoConsumoRaw.sort((a, b) => Number(b._sum.cantidad ?? 0) - Number(a._sum.cantidad ?? 0));
    const top5 = altoConsumoRaw.slice(0, 5);

    const altoConsumo = await Promise.all(
      top5.map(async item => {
        const prod = await prisma.productos.findUnique({
          where: { id: item.producto_id },
          select: { id: true, nombre: true, sku: true, stock: true, stock_minimo: true },
        });
        return {
          ...prod,
          consumido_30d: Number(item._sum.cantidad ?? 0),
          riesgo_agotamiento: prod ? prod.stock <= prod.stock_minimo : false,
        };
      }),
    );

    const formatProd = (p: any) => ({
      id: p.id,
      nombre: p.nombre,
      sku: p.sku,
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      categoria: p.categorias_producto?.nombre ?? '—',
      recomendacion_compra: Math.max(p.stock_minimo * 3 - p.stock, 0),
    });

    res.json({
      resumen: {
        agotados: agotados.length,
        bajo_stock: bajoStock.length,
        en_riesgo: enRiesgo.length,
        variantes_bajas: variantesBajas.length,
      },
      agotados: agotados.map(formatProd),
      bajo_stock: bajoStock.map(formatProd),
      en_riesgo: enRiesgo.map(formatProd),
      variantes_bajas: variantesBajas.map(v => ({
        id: v.id,
        sku: v.sku_variante,
        atributo: v.atributo,
        valor: v.valor,
        stock: v.stock,
        producto: v.productos.nombre,
        producto_id: v.productos.id,
      })),
      alto_consumo: altoConsumo,
    });
  } catch (error) { next(error); }
};

// ══════════════════════════════════════════════════════════════════════════════
// REPORTE DE INVENTARIO
// ══════════════════════════════════════════════════════════════════════════════

export const getReporteInventario = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const productos = await prisma.productos.findMany({
      include: {
        categorias_producto: { select: { nombre: true } },
        variantes_producto: { where: { estado_activo: true }, select: { id: true, stock: true, precio_extra: true } },
      },
      orderBy: [{ categorias_producto: { nombre: 'asc' } }, { nombre: 'asc' }],
    });

    const valorTotal = productos
      .filter(p => p.estado_activo)
      .reduce((sum, p) => sum + Number(p.precio_base) * p.stock, 0);

    const porCategoria: Record<string, { productos: number; valor: number; bajo_stock: number; agotados: number }> = {};
    for (const p of productos) {
      const cat = p.categorias_producto.nombre;
      if (!porCategoria[cat]) porCategoria[cat] = { productos: 0, valor: 0, bajo_stock: 0, agotados: 0 };
      porCategoria[cat].productos++;
      porCategoria[cat].valor += Number(p.precio_base) * p.stock;
      if (p.stock === 0) porCategoria[cat].agotados++;
      else if (p.stock <= p.stock_minimo) porCategoria[cat].bajo_stock++;
    }

    const treintaDias = new Date();
    treintaDias.setDate(treintaDias.getDate() - 30);
    const consumoRaw = await prisma.consumo_insumos_ficha.groupBy({
      by: ['producto_id'],
      where: { creado_en: { gte: treintaDias } },
      _sum: { cantidad: true },
    });
    consumoRaw.sort((a, b) => Number(b._sum.cantidad ?? 0) - Number(a._sum.cantidad ?? 0));
    const consumo = await Promise.all(
      consumoRaw.slice(0, 10).map(async item => {
        const prod = await prisma.productos.findUnique({
          where: { id: item.producto_id },
          select: { nombre: true, sku: true, stock: true, stock_minimo: true },
        });
        return {
          producto: prod?.nombre ?? 'N/A',
          sku: prod?.sku ?? 'N/A',
          stock_actual: prod?.stock ?? 0,
          stock_minimo: prod?.stock_minimo ?? 0,
          consumido_30d: Number(item._sum.cantidad ?? 0),
          alerta: prod ? prod.stock <= prod.stock_minimo : false,
        };
      }),
    );

    res.json({
      generado_en: new Date().toISOString(),
      total_productos: productos.length,
      productos_activos: productos.filter(p => p.estado_activo).length,
      valor_inventario: Number(valorTotal.toFixed(2)),
      por_categoria: Object.entries(porCategoria).map(([categoria, data]) => ({
        categoria,
        ...data,
        valor: Number(data.valor.toFixed(2)),
      })).sort((a, b) => b.valor - a.valor),
      consumo_30_dias: consumo,
      productos_lista: productos.map(p => ({
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        categoria: p.categorias_producto.nombre,
        precio_base: Number(p.precio_base),
        stock: p.stock,
        stock_minimo: p.stock_minimo,
        estado: p.estado_activo ? 'Activo' : 'Inactivo',
        bajo_stock: p.stock <= p.stock_minimo,
        agotado: p.stock === 0,
        valor_total: Number((Number(p.precio_base) * p.stock).toFixed(2)),
        variantes: p.variantes_producto.length,
      })),
    });
  } catch (error) { next(error); }
};

export const getReportePDF = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const productos = await prisma.productos.findMany({
      include: { categorias_producto: { select: { nombre: true } } },
      orderBy: [{ categorias_producto: { nombre: 'asc' } }, { nombre: 'asc' }],
    });

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const filename = `inventario_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', _req.query.download ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`);
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Inventario', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Fecha: ${new Date().toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.moveDown(1.5);

    const totalActivos = productos.filter(p => p.estado_activo).length;
    const valorTotal = productos.filter(p => p.estado_activo).reduce((s, p) => s + Number(p.precio_base) * p.stock, 0);
    const agotados = productos.filter(p => p.estado_activo && p.stock === 0).length;
    const bajoStock = productos.filter(p => p.estado_activo && p.stock > 0 && p.stock <= p.stock_minimo).length;

    doc.fontSize(14).font('Helvetica-Bold').text('Resumen General');
    doc.moveDown(0.5);
    const resumenItems = [
      `Total productos: ${productos.length}`,
      `Activos: ${totalActivos}`,
      `Valor del inventario: Bs ${valorTotal.toFixed(2)}`,
      `Agotados: ${agotados}`,
      `Bajo stock mínimo: ${bajoStock}`,
    ];
    resumenItems.forEach(item => doc.fontSize(11).font('Helvetica').text(item));
    doc.moveDown(1);

    doc.fontSize(14).font('Helvetica-Bold').text('Listado de Productos');
    doc.moveDown(0.5);

    const tableTop = doc.y + 5;
    const col1X = 30;
    const col2X = 55;
    const col3X = 220;
    const col4X = 315;
    const col5X = 395;
    const col6X = 465;
    const colWidths = { id: 25, nombre: 165, categoria: 95, precio: 80, stock: 70, valor: 50 };

    const headerY = tableTop;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('ID', col1X, headerY, { width: colWidths.id, align: 'left' });
    doc.text('Producto', col2X, headerY, { width: colWidths.nombre, align: 'left' });
    doc.text('Categoría', col3X, headerY, { width: colWidths.categoria, align: 'left' });
    doc.text('Precio', col4X, headerY, { width: colWidths.precio, align: 'right' });
    doc.text('Stock', col5X, headerY, { width: colWidths.stock, align: 'center' });
    doc.text('Valor Total', col6X, headerY, { width: colWidths.valor, align: 'right' });

    doc.moveTo(30, headerY + 12).lineTo(575, headerY + 12).strokeColor('#cccccc').stroke();

    let y = headerY + 18;
    const pageHeight = doc.page.height - 60;
    doc.font('Helvetica').fontSize(9);

    for (const p of productos) {
      if (y + 16 > pageHeight) {
        doc.addPage();
        y = 30;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('ID', col1X, y, { width: colWidths.id, align: 'left' });
        doc.text('Producto', col2X, y, { width: colWidths.nombre, align: 'left' });
        doc.text('Categoría', col3X, y, { width: colWidths.categoria, align: 'left' });
        doc.text('Precio', col4X, y, { width: colWidths.precio, align: 'right' });
        doc.text('Stock', col5X, y, { width: colWidths.stock, align: 'center' });
        doc.text('Valor Total', col6X, y, { width: colWidths.valor, align: 'right' });
        doc.moveTo(30, y + 12).lineTo(575, y + 12).strokeColor('#cccccc').stroke();
        y += 18;
        doc.font('Helvetica').fontSize(9);
      }

      const nombre = p.nombre.length > 25 ? p.nombre.substring(0, 25) + '...' : p.nombre;
      const categoria = p.categorias_producto?.nombre ?? '—';
      const precio = `Bs ${Number(p.precio_base).toFixed(2)}`;
      const stock = p.stock.toString();
      const valorTotalItem = `Bs ${(Number(p.precio_base) * p.stock).toFixed(2)}`;

      doc.text(p.id.toString(), col1X, y, { width: colWidths.id, align: 'left' });
      doc.text(nombre, col2X, y, { width: colWidths.nombre, align: 'left' });
      doc.text(categoria, col3X, y, { width: colWidths.categoria, align: 'left' });
      doc.text(precio, col4X, y, { width: colWidths.precio, align: 'right' });
      doc.text(stock, col5X, y, { width: colWidths.stock, align: 'center' });
      doc.text(valorTotalItem, col6X, y, { width: colWidths.valor, align: 'right' });
      y += 16;
    }

    doc.end();
  } catch (error) { next(error); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ESTADÍSTICAS – Más vendidos / Más usados
// ══════════════════════════════════════════════════════════════════════════════

export const getMasVendidos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const treintaDias = new Date();
    treintaDias.setDate(treintaDias.getDate() - 30);

    const pedidosValidos = await prisma.pedidos.findMany({
      where: { creado_en: { gte: treintaDias }, estado: { not: 'cancelado' } },
      select: { id: true },
    });
    const idsPedidos = pedidosValidos.map(p => p.id);

    const ventas = await prisma.detalle_pedido.groupBy({
      by: ['producto_id'],
      where: { pedido_id: { in: idsPedidos } },
      _sum: { cantidad: true },
    });

    const productosIds = ventas.map(v => v.producto_id);
    const productos = await prisma.productos.findMany({
      where: { id: { in: productosIds } },
      select: { id: true, nombre: true, precio_base: true },
    });

    const result = ventas
      .map(v => {
        const p = productos.find(p => p.id === v.producto_id);
        return {
          id: v.producto_id,
          nombre: p?.nombre ?? 'Producto eliminado',
          total_vendido: Number(v._sum.cantidad ?? 0),
          ingreso: Number(p?.precio_base ?? 0) * Number(v._sum.cantidad ?? 0),
        };
      })
      .sort((a, b) => b.total_vendido - a.total_vendido)
      .slice(0, 5);

    res.json(result);
  } catch (error) { next(error); }
};

export const getMasUsados = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const treintaDias = new Date();
    treintaDias.setDate(treintaDias.getDate() - 30);

    const consumo = await prisma.consumo_insumos_ficha.groupBy({
      by: ['producto_id'],
      where: { creado_en: { gte: treintaDias } },
      _sum: { cantidad: true },
    });

    const productosIds = consumo.map(c => c.producto_id);
    const productos = await prisma.productos.findMany({
      where: { id: { in: productosIds } },
      select: { id: true, nombre: true, stock: true, stock_minimo: true },
    });

    const result = consumo
      .map(c => {
        const p = productos.find(p => p.id === c.producto_id);
        return {
          id: c.producto_id,
          nombre: p?.nombre ?? 'Producto eliminado',
          total_consumido: Number(c._sum.cantidad ?? 0),
          stock_actual: p?.stock ?? 0,
          riesgo: p ? p.stock <= p.stock_minimo : false,
        };
      })
      .sort((a, b) => b.total_consumido - a.total_consumido)
      .slice(0, 5);

    res.json(result);
  } catch (error) { next(error); }
};