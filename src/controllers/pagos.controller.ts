import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

interface RequestWithUser extends Request {
  user?: { id: number; email: string; rol: string; jti: string };
}

// ══════════════════════════════════════════════════════════════
// SISTEMA DE NIVELES — pura lógica, sin tabla extra
// ══════════════════════════════════════════════════════════════
function calcularNivel(total: number) {
  if (total >= 15) return { nivel: 3, label: 'VIP',       badge: '👑',  descuento_pct: 15, color: '#7c3aed', descripcion: `${total} servicios — 15% de descuento` };
  if (total >= 10) return { nivel: 2, label: 'Frecuente', badge: '⭐⭐', descuento_pct: 10, color: '#d97706', descripcion: `${total} servicios — 10% de descuento` };
  if (total >= 5)  return { nivel: 1, label: 'Regular',   badge: '⭐',  descuento_pct:  5, color: '#2d5a45', descripcion: `${total} servicios — 5% de descuento`  };
  return             { nivel: 0, label: 'Nuevo',     badge: '🐣',  descuento_pct:  0, color: '#64748b', descripcion: `${total} servicios — Sin descuento (necesita 5 para nivel Regular)` };
}

/** Citas completadas del cliente sumando TODAS sus mascotas */
async function contarCitasCompletadas(clienteId: number): Promise<number> {
  const count = await prisma.citas.count({
    where: {
      estado:   'completada',
      mascotas: { dueno_principal_id: clienteId },
    },
  });
  console.log(`  [DEBUG] Cliente ${clienteId}: ${count} citas completadas`);
  return count;
}

/** Correlativo FAC-YYYY-NNNNN */
async function generarNumeroFactura(): Promise<string> {
  const year   = new Date().getFullYear();
  const prefix = `FAC-${year}-`;
  const ultima = await prisma.facturas.findFirst({
    where:   { numero_factura: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select:  { numero_factura: true },
  });
  const siguiente = ultima
    ? parseInt(ultima.numero_factura.split('-').pop()!, 10) + 1
    : 1;
  const numeroFactura = `${prefix}${String(siguiente).padStart(5, '0')}`;
  console.log(`  [DEBUG] Número de factura generado: ${numeroFactura}`);
  return numeroFactura;
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════════════════
// GET /recepcion/clientes/pendientes-pago
// Agrupa citas pendientes POR CLIENTE — para cobrar varias a la vez
// ══════════════════════════════════════════════════════════════
export const getClientesConCitasPendientes = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    console.log(`[GET] /recepcion/clientes/pendientes-pago`);
    console.log(`  Usuario: ${req.user?.email}`);

    // Traer todas las citas pendientes con sus clientes
    const citas = await prisma.citas.findMany({
      where: {
        estado:   'completada',
        facturas: { none: {} }, // Solo las que NO tienen factura
      },
      include: {
        mascotas: {
          include: {
            clientes: {
              select: { id: true, nombre: true, apellido: true, ci: true, telefono: true },
            },
          },
        },
        servicios: { select: { id: true, nombre: true } },
        groomers:  { select: { nombre: true, apellido: true } },
      },
      orderBy: { fecha_hora_inicio: 'desc' },
    });

    console.log(`  [DEBUG] Citas completadas sin factura: ${citas.length}`);

    // Agrupar por cliente
    const porCliente: Record<number, {
      cliente_id:     number;
      cliente_nombre: string;
      cliente_ci:     string | null;
      cliente_tel:    string | null;
      cliente_nivel:  ReturnType<typeof calcularNivel>;
      citas:          any[];
      total_citas:    number;
      subtotal:       number;
    }> = {};

    // Calcular niveles únicos
    const clienteIds = [...new Set(citas.map(c => c.mascotas.clientes.id))];
    console.log(`  [DEBUG] Clientes únicos: ${clienteIds.length}`);

    const niveles: Record<number, ReturnType<typeof calcularNivel>> = {};
    await Promise.all(
      clienteIds.map(async id => {
        const total = await contarCitasCompletadas(id);
        niveles[id] = calcularNivel(total);
      }),
    );

    for (const c of citas) {
      const cl  = c.mascotas.clientes;
      const cid = cl.id;

      if (!porCliente[cid]) {
        porCliente[cid] = {
          cliente_id:     cid,
          cliente_nombre: `${cl.nombre} ${cl.apellido}`,
          cliente_ci:     cl.ci ?? null,
          cliente_tel:    cl.telefono ?? null,
          cliente_nivel:  niveles[cid],
          citas:          [],
          total_citas:    0,
          subtotal:       0,
        };
      }

      porCliente[cid].citas.push({
        id:               c.id,
        fecha:            toLocalDate(c.fecha_hora_inicio),
        hora:             c.fecha_hora_inicio.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
        mascota:          c.mascotas.nombre,
        servicio:         c.servicios.nombre,
        groomer:          `${c.groomers.nombre} ${c.groomers.apellido}`,
        precio_calculado: Number(c.precio_calculado),
        seleccionada:     true,
      });

      porCliente[cid].total_citas++;
      porCliente[cid].subtotal += Number(c.precio_calculado);
    }

    const resultado = Object.values(porCliente)
      .sort((a, b) => b.total_citas - a.total_citas);

    console.log(`  ✓ Retornando ${resultado.length} clientes con citas pendientes`);
    res.json(resultado);
  } catch (error) {
    console.error(`  ✗ Error en getClientesConCitasPendientes:`, error);
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GET /recepcion/clientes/:id/nivel
// ══════════════════════════════════════════════════════════════
export const getClienteNivel = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = parseInt(req.params.id as string);
    if (isNaN(clienteId)) throw new AppError('ID inválido', 400);

    console.log(`[GET] /recepcion/clientes/${clienteId}/nivel`);

    const total = await contarCitasCompletadas(clienteId);
    const nivel = calcularNivel(total);

    res.json({
      cliente_id:              clienteId,
      total_citas_completadas: total,
      ...nivel,
      proximos_niveles: [
        { nivel: 1, label: 'Regular',   badge: '⭐',  descuento_pct: 5,  desde: 5  },
        { nivel: 2, label: 'Frecuente', badge: '⭐⭐', descuento_pct: 10, desde: 10 },
        { nivel: 3, label: 'VIP',       badge: '👑',  descuento_pct: 15, desde: 15 },
      ],
    });
  } catch (error) {
    console.error(`  ✗ Error en getClienteNivel:`, error);
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GET /recepcion/facturas
// ══════════════════════════════════════════════════════════════
export const getFacturas = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { estado, desde, hasta, cliente_id } = req.query;
    
    console.log(`[GET] /recepcion/facturas`);
    console.log(`  Filtros:`, { estado, desde, hasta, cliente_id });
    console.log(`  Usuario: ${req.user?.email} (Rol: ${req.user?.rol})`);

    const where: any = {};

    if (estado)     where.estado     = estado;
    if (cliente_id) where.cliente_id = parseInt(cliente_id as string);
    if (desde || hasta) {
      where.fecha_emision = {};
      if (desde) where.fecha_emision.gte = new Date(`${desde}T00:00:00`);
      if (hasta) where.fecha_emision.lte = new Date(`${hasta}T23:59:59`);
    }

    console.log(`  [DEBUG] Donde clause:`, JSON.stringify(where, null, 2));

    const facturas = await prisma.facturas.findMany({
      where,
      include: {
        clientes:        { select: { nombre: true, apellido: true, ci: true } },
        detalle_factura: true,
        pagos:           { select: { monto: true, estado: true, metodo_pago: true } },
        citas: {
          include: {
            mascotas:  { select: { nombre: true } },
            servicios: { select: { nombre: true } },
          },
        },
      },
      orderBy: { fecha_emision: 'desc' },
      take: 300,
    });

    console.log(`  [DEBUG] Facturas encontradas: ${facturas.length}`);

    const resultado = facturas.map(f => ({
      id:             f.id,
      numero_factura: f.numero_factura,
      cliente:        `${f.clientes.nombre} ${f.clientes.apellido}`,
      ci:             f.clientes.ci,
      fecha:          f.fecha_emision,
      subtotal:       Number(f.subtotal),
      descuento:      Number(f.descuento),
      impuesto:       Number(f.impuesto),
      total:          Number(f.total),
      estado:         f.estado,
      metodo_pago:    f.metodo_pago,
      cita_desc:      f.citas ? `${f.citas.mascotas.nombre} — ${f.citas.servicios.nombre}` : null,
      pagado:         f.pagos.filter(p => p.estado === 'completado').reduce((s, p) => s + Number(p.monto), 0),
      items:          f.detalle_factura.map(d => ({
        descripcion:     d.descripcion,
        cantidad:        d.cantidad,
        precio_unitario: Number(d.precio_unitario),
        subtotal:        Number(d.subtotal),
      })),
    }));

    console.log(`  ✓ Retornando ${resultado.length} facturas`);
    res.json(resultado);
  } catch (error) {
    console.error(`  ✗ Error en getFacturas:`, error);
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GET /recepcion/facturas/:id/recibo
// ══════════════════════════════════════════════════════════════
export const getReciboFactura = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    console.log(`[GET] /recepcion/facturas/${id}/recibo`);

    const f = await prisma.facturas.findUnique({
      where: { id },
      include: {
        clientes:        { select: { nombre: true, apellido: true, ci: true } },
        detalle_factura: true,
        pagos: {
          select:  { metodo_pago: true, referencia_transaccion: true },
          orderBy: { creado_en: 'desc' },
          take: 1,
        },
      },
    });

    if (!f) {
      console.log(`  ✗ Factura ${id} no encontrada`);
      throw new AppError('Factura no encontrada', 404);
    }

    console.log(`  ✓ Factura encontrada: ${f.numero_factura}`);

    res.json({
      numero_factura: f.numero_factura,
      fecha:          f.fecha_emision.toLocaleString('es-BO'),
      cliente:        `${f.clientes.nombre} ${f.clientes.apellido}`,
      ci:             f.clientes.ci ?? '',
      estado:         f.estado,
      items:          f.detalle_factura.map(d => ({
        descripcion:     d.descripcion,
        cantidad:        d.cantidad,
        precio_unitario: Number(d.precio_unitario),
        subtotal:        Number(d.subtotal),
      })),
      subtotal:    Number(f.subtotal),
      descuento:   Number(f.descuento),
      impuesto:    Number(f.impuesto),
      total:       Number(f.total),
      metodo_pago: f.pagos[0]?.metodo_pago ?? f.metodo_pago,
      referencia:  f.pagos[0]?.referencia_transaccion ?? null,
    });
  } catch (error) {
    console.error(`  ✗ Error en getReciboFactura:`, error);
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// POST /recepcion/facturas
// ══════════════════════════════════════════════════════════════
export const crearFactura = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      cliente_id,
      cita_ids             = [],
      metodo_pago          = 'efectivo',
      descuento            = 0,
      impuesto             = 0,
      referencia_transaccion,
      notas,
      items,
    } = req.body;

    console.log(`[POST] /recepcion/facturas`);
    console.log(`  Cliente ID: ${cliente_id}`);
    console.log(`  Cita IDs: ${JSON.stringify(cita_ids)}`);
    console.log(`  Items: ${items?.length ?? 0}`);
    console.log(`  Método de pago: ${metodo_pago}`);

    if (!cliente_id)    {
      console.log(`  ✗ Falta cliente_id`);
      throw new AppError('cliente_id es requerido', 400);
    }
    if (!items?.length) {
      console.log(`  ✗ Falta items`);
      throw new AppError('Debes incluir al menos un ítem', 400);
    }

    // Validar que las citas existen
    const citaIdsNum: number[] = (Array.isArray(cita_ids) ? cita_ids : [cita_ids])
      .map(Number)
      .filter(n => !isNaN(n));

    console.log(`  [DEBUG] Cita IDs validados: ${citaIdsNum.length}`);

    if (citaIdsNum.length > 0) {
      const citasDB = await prisma.citas.findMany({
        where: { id: { in: citaIdsNum } },
        include: { facturas: true },
      });

      console.log(`  [DEBUG] Citas encontradas en BD: ${citasDB.length}`);

      for (const c of citasDB) {
        if (c.estado !== 'completada') {
          console.log(`  ✗ Cita #${c.id} no está completada (estado: ${c.estado})`);
          throw new AppError(`La cita #${c.id} no está completada`, 400);
        }
        if (c.facturas.length > 0) {
          console.log(`  ✗ Cita #${c.id} ya fue facturada`);
          throw new AppError(`La cita #${c.id} ya fue facturada`, 400);
        }
      }
    }

    const subtotal   = items.reduce((s: number, i: any) => s + Number(i.precio_unitario) * Number(i.cantidad), 0);
    const descuentoN = Number(descuento) || 0;
    const impuestoN  = Number(impuesto)  || 0;
    const total      = Math.max(0, subtotal - descuentoN + impuestoN);

    console.log(`  [DEBUG] Cálculo: subtotal=${subtotal}, descuento=${descuentoN}, impuesto=${impuestoN}, total=${total}`);

    const numero_factura = await generarNumeroFactura();
    const cita_id_principal = citaIdsNum[0] ?? null;

    const resultado = await prisma.$transaction(async tx => {
      const factura = await tx.facturas.create({
        data: {
          numero_factura,
          cliente_id: Number(cliente_id),
          cita_id:    cita_id_principal,
          subtotal,
          descuento:  descuentoN,
          impuesto:   impuestoN,
          total,
          estado:     'pagada',
          metodo_pago,
          notas:      notas ?? null,
          detalle_factura: {
            create: items.map((i: any) => ({
              descripcion:     String(i.descripcion),
              cantidad:        Number(i.cantidad),
              precio_unitario: Number(i.precio_unitario),
              subtotal:        Number(i.precio_unitario) * Number(i.cantidad),
            })),
          },
        },
        include: { detalle_factura: true },
      });

      // Crear el pago
      await tx.pagos.create({
        data: {
          factura_id:             factura.id,
          monto:                  total,
          metodo_pago,
          referencia_transaccion: referencia_transaccion ?? null,
          estado:                 'completado',
          registrado_por:         req.user?.id ?? null,
        },
      });

      return factura;
    });

    const cliente = await prisma.clientes.findUnique({
      where:  { id: Number(cliente_id) },
      select: { nombre: true, apellido: true, ci: true },
    });

    console.log(`  ✓ Factura creada: ${numero_factura}`);

    res.status(201).json({
      message: `Factura ${numero_factura} registrada`,
      recibo: {
        numero_factura,
        fecha:       new Date().toLocaleString('es-BO'),
        cliente:     `${cliente?.nombre} ${cliente?.apellido}`,
        ci:          cliente?.ci ?? '',
        items:       resultado.detalle_factura.map(d => ({
          descripcion:     d.descripcion,
          cantidad:        d.cantidad,
          precio_unitario: Number(d.precio_unitario),
          subtotal:        Number(d.subtotal),
        })),
        subtotal:    Number(resultado.subtotal),
        descuento:   Number(resultado.descuento),
        impuesto:    Number(resultado.impuesto),
        total:       Number(resultado.total),
        metodo_pago,
        factura_id:  resultado.id,
        citas_incluidas: citaIdsNum,
      },
    });
  } catch (error) {
    console.error(`  ✗ Error en crearFactura:`, error);
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GET /recepcion/caja/resumen?fecha=YYYY-MM-DD
// ══════════════════════════════════════════════════════════════
export const getCierreCaja = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const fechaStr = (req.query.fecha as string) ?? toLocalDate(new Date());
    
    console.log(`[GET] /recepcion/caja/resumen`);
    console.log(`  Fecha: ${fechaStr}`);

    const inicio   = new Date(`${fechaStr}T00:00:00`);
    const fin      = new Date(`${fechaStr}T23:59:59`);

    const pagos = await prisma.pagos.findMany({
      where: {
        estado:    'completado',
        creado_en: { gte: inicio, lte: fin },
      },
      include: {
        facturas: {
          include: {
            clientes:  { select: { nombre: true, apellido: true, ci: true } },
            citas: {
              include: {
                mascotas:  { select: { nombre: true } },
                servicios: { select: { nombre: true } },
              },
            },
          },
        },
      },
      orderBy: { creado_en: 'asc' },
    });

    const facturasPendientes = await prisma.facturas.findMany({
      where: {
        estado:        'pendiente',
        fecha_emision: { gte: inicio, lte: fin },
      },
      select: { total: true },
    });

    const totalPendiente  = facturasPendientes.reduce((s, f) => s + Number(f.total), 0);
    const totales: Record<string, number> = { efectivo: 0, qr: 0, transferencia: 0 };
    let   totalGeneral = 0;

    const transacciones = pagos.map(p => {
      const monto = Number(p.monto);
      totales[p.metodo_pago] = (totales[p.metodo_pago] ?? 0) + monto;
      totalGeneral          += monto;

      const cita = p.facturas.citas;

      return {
        id:             p.id,
        hora:           p.creado_en.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
        numero_factura: p.facturas.numero_factura,
        factura_id:     p.facturas.id,
        cliente:        `${p.facturas.clientes.nombre} ${p.facturas.clientes.apellido}`,
        ci:             p.facturas.clientes.ci,
        cita_desc:      cita ? `${cita.mascotas.nombre} — ${cita.servicios.nombre}` : null,
        metodo_pago:    p.metodo_pago,
        monto,
        referencia:     p.referencia_transaccion,
      };
    });

    console.log(`  [DEBUG] Pagos completados: ${transacciones.length}`);
    console.log(`  [DEBUG] Total general: Bs ${totalGeneral}`);

    res.json({
      fecha:                  fechaStr,
      totales,
      total_general:          totalGeneral,
      cantidad_transacciones: transacciones.length,
      pendientes: {
        total:    totalPendiente,
        cantidad: facturasPendientes.length,
      },
      transacciones,
    });
  } catch (error) {
    console.error(`  ✗ Error en getCierreCaja:`, error);
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// STUBS para otros endpoints que faltan
// ══════════════════════════════════════════════════════════════

export const getCitasPendientesPago = async (
  _req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    console.log(`[GET] /recepcion/citas/pendientes-pago`);
    res.json([]);
  } catch (error) {
    next(error);
  }
};

export const getClientesFrecuentes = async (
  _req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    console.log(`[GET] /recepcion/clientes/frecuentes`);
    res.json([]);
  } catch (error) {
    next(error);
  }
};