import prisma from '../config/database';
import { hashPassword } from '../utils/bcrypt';
import { isValidPassword } from '../utils/passwordValidator';
import { generateSecureToken } from '../utils/tokenGenerator';
import { sendStaffCreationEmail } from './email.service';
import { AppError } from '../utils/errors';

// Genera un código numérico de 6 dígitos
function generarCodigo6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Mapa turno → disponibilidad semanal (dia_semana: 1=Lunes … 6=Sábado)
// Mapa turno → disponibilidad semanal (dia_semana: 1=Lunes … 6=Sábado)
const DISPONIBILIDAD_POR_TURNO: Record<
  'ma_ana' | 'tarde' | 'completo',
  { dia: number; inicio: string; fin: string }[]
> = {
  ma_ana: [
    { dia: 1, inicio: '08:00', fin: '14:00' },
    { dia: 2, inicio: '08:00', fin: '14:00' },
    { dia: 3, inicio: '08:00', fin: '14:00' },
    { dia: 4, inicio: '08:00', fin: '14:00' },
    { dia: 5, inicio: '08:00', fin: '14:00' },
    { dia: 6, inicio: '08:00', fin: '13:00' },
  ],

  tarde: [
    { dia: 1, inicio: '14:00', fin: '20:00' },
    { dia: 2, inicio: '14:00', fin: '20:00' },
    { dia: 3, inicio: '14:00', fin: '20:00' },
    { dia: 4, inicio: '14:00', fin: '20:00' },
    { dia: 5, inicio: '14:00', fin: '20:00' },
    { dia: 6, inicio: '14:00', fin: '19:00' },
  ],

  completo: [
    { dia: 1, inicio: '08:00', fin: '20:00' },
    { dia: 2, inicio: '08:00', fin: '20:00' },
    { dia: 3, inicio: '08:00', fin: '20:00' },
    { dia: 4, inicio: '08:00', fin: '20:00' },
    { dia: 5, inicio: '08:00', fin: '20:00' },
    { dia: 6, inicio: '08:00', fin: '18:00' },
  ],
};

export class AdminService {

  // ═══════════════════════════════════════
  // CREAR GROOMER
  // ═══════════════════════════════════════
  async crearGroomer(data: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    telefono?: string;
    especialidad?: string;
    sucursal_id?: number;
    turno?: string;
    capacidad_simultanea?: number;
    horario_trabajo?: any;
  }) {
    if (!isValidPassword(data.password)) {
      throw new AppError(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo',
        400
      );
    }

    const existe = await prisma.usuarios.findUnique({ where: { email: data.email } });
    if (existe) throw new AppError('El email ya está registrado', 409);

    if (data.sucursal_id) {
      const sucursal = await prisma.sucursales.findUnique({
        where: { id: data.sucursal_id, estado_activo: true },
      });
      if (!sucursal) throw new AppError('Sucursal no válida', 400);
    }

    const rolGroomer = await prisma.roles.findUnique({ where: { nombre: 'groomer' } });
    if (!rolGroomer) throw new AppError('Rol groomer no configurado en la BD', 500);

    const hash = await hashPassword(data.password);

    const usuario = await prisma.usuarios.create({
      data: {
        email:            data.email,
        password_hash:    hash,
        email_verificado: false,
        rol_id:           rolGroomer.id,
        estado_activo:    true,
      },
    });

    const turnoValue = data.turno || 'completo';
    if (!['mañana', 'tarde', 'completo'].includes(turnoValue)) {
      throw new AppError('Turno inválido. Debe ser "mañana", "tarde" o "completo"', 400);
    }

    let turnoEnum: 'ma_ana' | 'tarde' | 'completo';
    switch (turnoValue) {
      case 'mañana':   turnoEnum = 'ma_ana';   break;
      case 'tarde':    turnoEnum = 'tarde';    break;
      case 'completo': turnoEnum = 'completo'; break;
      default: throw new AppError('Turno inválido', 400);
    }

    let horarioFinal = null;
    if (data.horario_trabajo) {
      horarioFinal = typeof data.horario_trabajo === 'object'
        ? JSON.stringify(data.horario_trabajo)
        : data.horario_trabajo;
    }

    // Crear perfil groomer — capturamos el resultado para obtener groomer.id
    const groomer = await prisma.groomers.create({
      data: {
        usuario_id:           usuario.id,
        sucursal_id:          data.sucursal_id || null,
        nombre:               data.nombre,
        apellido:             data.apellido,
        telefono:             data.telefono || null,
        especialidad:         data.especialidad || null,
        turno:                turnoEnum,
        capacidad_simultanea: data.capacidad_simultanea ?? 1,
        horario_trabajo:      horarioFinal || null,
        estado_activo:        true,
      },
    });

    // Poblar disponibilidad_groomer según el turno
    // hora_inicio / hora_fin son Time(0) en MySQL → Prisma los espera como DateTime
    // Convención: fecha epoch 1970-01-01 con la hora en UTC
    const slots = DISPONIBILIDAD_POR_TURNO[turnoEnum];
    if (slots?.length) {
      await prisma.disponibilidad_groomer.createMany({
        data: slots.map(slot => ({
          groomer_id:     groomer.id,
          dia_semana:     slot.dia,
          hora_inicio:    new Date(`1970-01-01T${slot.inicio}:00Z`),
          hora_fin:       new Date(`1970-01-01T${slot.fin}:00Z`),
          buffer_minutos: 15,
        })),
        skipDuplicates: true,
      });
    }

    // Tokens de verificación
    const codigo = generarCodigo6();
    const token  = generateSecureToken();

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token,
        tipo:      'activacion_email',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token:     codigo,
        tipo:      'activacion_email',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    console.log(`📧 Enlace de verificación para ${data.email}: ${process.env.FRONTEND_URL}/verify-email.html?token=${token}`);
    console.log(`📧 Código de 6 dígitos: ${codigo}`);

    sendStaffCreationEmail({
      to:           data.email,
      nombre:       data.nombre,
      tempPassword: data.password,
      token,
      rol:          'groomer',
    }).catch(console.error);

    await prisma.audit_log.create({
      data: {
        accion:         'CREATE',
        tabla:          'groomers',
        registro_id:    usuario.id,
        valores_nuevos: JSON.stringify({ email: data.email, nombre: data.nombre, turno: turnoValue }),
      },
    }).catch(console.error);

    return {
      message: `Groomer ${data.nombre} creado. Se envió email con código de verificación a ${data.email}.`,
    };
  }

  // ═══════════════════════════════════════
  // CREAR CLIENTE
  // ═══════════════════════════════════════
  async crearCliente(data: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    ci: string;
    telefono?: string;
    direccion?: string;
  }) {
    if (!isValidPassword(data.password)) {
      throw new AppError(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo',
        400
      );
    }

    const existeEmail = await prisma.usuarios.findUnique({ where: { email: data.email } });
    if (existeEmail) throw new AppError('El email ya está registrado', 409);

    const existeCI = await prisma.clientes.findUnique({ where: { ci: data.ci } });
    if (existeCI) throw new AppError('La cédula de identidad ya está registrada', 409);

    const rolCliente = await prisma.roles.findUnique({ where: { nombre: 'cliente' } });
    if (!rolCliente) throw new AppError('Rol cliente no configurado en la BD', 500);

    const hash = await hashPassword(data.password);

    const usuario = await prisma.usuarios.create({
      data: {
        email:            data.email,
        password_hash:    hash,
        email_verificado: false,
        rol_id:           rolCliente.id,
        estado_activo:    true,
      },
    });

    await prisma.clientes.create({
      data: {
        usuario_id: usuario.id,
        nombre:     data.nombre,
        apellido:   data.apellido,
        ci:         data.ci,
        telefono:   data.telefono  || null,
        direccion:  data.direccion || null,
      },
    });

    const codigo = generarCodigo6();
    const token  = generateSecureToken();

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token,
        tipo:      'activacion_email',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token:     codigo,
        tipo:      'activacion_email',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    sendStaffCreationEmail({
      to:           data.email,
      nombre:       data.nombre,
      tempPassword: data.password,
      token,
      rol:          'cliente',
    }).catch(console.error);

    await prisma.audit_log.create({
      data: {
        accion:         'CREATE',
        tabla:          'clientes',
        registro_id:    usuario.id,
        valores_nuevos: JSON.stringify({ email: data.email, ci: data.ci }),
      },
    }).catch(console.error);

    return {
      message: `Cliente ${data.nombre} creado. Se envió email con código de verificación a ${data.email}.`,
    };
  }

  // ═══════════════════════════════════════
  // AUTH LOGS
  // ═══════════════════════════════════════
  async getAuthLogs(limit = 20, offset = 0, filtroAccion?: string) {
    const where: any = {};
    if (filtroAccion && filtroAccion.trim() !== '') {
      where.accion = filtroAccion;
    }

    const [logs, total] = await Promise.all([
      prisma.auth_log.findMany({
        where,
        orderBy: { creado_en: 'desc' },
        take:    limit,
        skip:    offset,
      }),
      prisma.auth_log.count({ where }),
    ]);

    const usuarioIds = [...new Set(logs.map(l => l.usuario_id).filter(Boolean))] as number[];
    let emailMap: Record<number, string> = {};
    if (usuarioIds.length > 0) {
      const usuarios = await prisma.usuarios.findMany({
        where:  { id: { in: usuarioIds } },
        select: { id: true, email: true },
      });
      emailMap = Object.fromEntries(usuarios.map(u => [u.id, u.email]));
    }

    return {
      total,
      logs: logs.map(l => ({
        id:           Number(l.id),
        accion:       l.accion,
        emailIntento: l.email_intento ?? null,
        usuarioEmail: l.usuario_id ? (emailMap[l.usuario_id] ?? null) : null,
        ip:           l.ip_address,
        userAgent:    l.user_agent ?? null,
        detalle:      l.detalle    ?? null,
        fecha:        l.creado_en,
      })),
    };
  }

  // ═══════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════
  async getStats() {
    const hoy    = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const [totalUsuarios, totalGroomers, totalClientes, citasHoy] = await Promise.all([
      prisma.usuarios.count({ where: { estado_activo: true } }),
      prisma.groomers.count({ where: { estado_activo: true } }),
      prisma.clientes.count(),
      prisma.citas.count({
        where: { fecha_hora_inicio: { gte: hoy, lt: manana } },
      }).catch(() => 0),
    ]);

    return { totalUsuarios, totalGroomers, totalClientes, citasHoy };
  }

  // ═══════════════════════════════════════
  // LISTAR USUARIOS (simple)
  // ═══════════════════════════════════════
  async getUsuarios() {
    const usuarios = await prisma.usuarios.findMany({
      orderBy: { creado_en: 'desc' },
      include: { roles: { select: { nombre: true } } },
    });
    return usuarios.map(u => ({
      id:              u.id,
      email:           u.email,
      rol:             u.roles.nombre,
      emailVerificado: u.email_verificado,
      activo:          u.estado_activo,
      ultimoAcceso:    u.ultimo_acceso,
    }));
  }

  // ═══════════════════════════════════════
  // DESACTIVAR USUARIO
  // ═══════════════════════════════════════
  async desactivarUsuario(usuarioId: number) {
    const usuario = await prisma.usuarios.findUnique({
      where:   { id: usuarioId },
      include: { roles: true },
    });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);
    if (usuario.roles.nombre === 'admin') {
      throw new AppError('No puedes desactivar al administrador', 403);
    }

    await prisma.$transaction([
      prisma.usuarios.update({
        where: { id: usuarioId },
        data:  { estado_activo: false },
      }),
      prisma.user_sessions.updateMany({
        where: { usuario_id: usuarioId, activa: true },
        data:  { activa: false },
      }),
    ]);

    await prisma.audit_log.create({
      data: {
        accion:         'UPDATE',
        tabla:          'usuarios',
        registro_id:    usuarioId,
        valores_nuevos: JSON.stringify({ estado_activo: false }),
      },
    }).catch(console.error);

    return { message: 'Usuario desactivado correctamente' };
  }

  // ═══════════════════════════════════════
  // OBTENER USUARIO POR ID
  // ═══════════════════════════════════════
  async getUserById(usuarioId: number) {
    const usuario = await prisma.usuarios.findUnique({
      where:   { id: usuarioId },
      include: { roles: true, clientes: true, groomers: true },
    });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);
    return usuario;
  }

  // ═══════════════════════════════════════
  // ACTUALIZAR USUARIO
  // ═══════════════════════════════════════
  async updateUser(usuarioId: number, data: any, adminId: number, adminEmail: string) {
    const { email, nombre, apellido, telefono, ci, direccion, especialidad } = data;

    if (email) {
      const exists = await prisma.usuarios.findFirst({
        where: { email, NOT: { id: usuarioId } },
      });
      if (exists) throw new AppError('El email ya está en uso', 409);
    }

    await prisma.usuarios.update({
      where: { id: usuarioId },
      data:  { email: email || undefined },
    });

    const usuario = await prisma.usuarios.findUnique({
      where:   { id: usuarioId },
      include: { roles: true },
    });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    if (usuario.roles.nombre === 'cliente') {
      if (ci) {
        const existingCi = await prisma.clientes.findFirst({
          where: { ci, NOT: { usuario_id: usuarioId } },
        });
        if (existingCi) throw new AppError('El CI ya está registrado', 409);
      }
      await prisma.clientes.update({
        where: { usuario_id: usuarioId },
        data:  { nombre, apellido, telefono, ci, direccion },
      });
    } else if (usuario.roles.nombre === 'groomer') {
      await prisma.groomers.update({
        where: { usuario_id: usuarioId },
        data:  { nombre, apellido, telefono, especialidad },
      });
    }

    await this.logAdminAction(adminId, adminEmail, 'UPDATE_USER', usuarioId, JSON.stringify(data));
    return { message: 'Usuario actualizado correctamente' };
  }

  // ═══════════════════════════════════════
  // REACTIVAR USUARIO
  // ═══════════════════════════════════════
  async reactivateUser(usuarioId: number, adminId: number, adminEmail: string) {
    await prisma.usuarios.update({
      where: { id: usuarioId },
      data:  { estado_activo: true, intentos_fallidos: 0, bloqueado_hasta: null },
    });
    await this.logAdminAction(adminId, adminEmail, 'REACTIVATE_USER', usuarioId);
    return { message: 'Usuario reactivado' };
  }

  // ═══════════════════════════════════════
  // ELIMINAR USUARIO PERMANENTEMENTE
  // ═══════════════════════════════════════
  async permanentDeleteUser(usuarioId: number, adminId: number, adminEmail: string) {
    const usuario = await prisma.usuarios.findUnique({
      where:   { id: usuarioId },
      include: { groomers: true, clientes: true },
    });
    if (!usuario) throw new AppError('Usuario no existe', 404);
    if (usuario.estado_activo) {
      throw new AppError('No se puede eliminar un usuario activo. Desactívelo primero.', 400);
    }

    await prisma.$transaction(async (tx) => {
      // ── Si es groomer: limpiar sus citas y relaciones antes de borrar ──
      if (usuario.groomers) {
        const groomerId = usuario.groomers.id;

        // 1. Citas del groomer: primero borrar lo que cuelga de ellas
        const citasIds = await tx.citas.findMany({
          where:  { groomer_id: groomerId },
          select: { id: true },
        });
        const ids = citasIds.map(c => c.id);

        if (ids.length > 0) {
          // Notificaciones de esas citas
          await tx.notificaciones.deleteMany({ where: { cita_id: { in: ids } } });

          // Fichas de grooming y lo que cuelga de ellas
          const fichas = await tx.fichas_grooming.findMany({
            where:  { cita_id: { in: ids } },
            select: { id: true },
          });
          const fichaIds = fichas.map(f => f.id);
          if (fichaIds.length > 0) {
            await tx.consumo_insumos_ficha.deleteMany({ where: { ficha_id: { in: fichaIds } } });
            await tx.ficha_checklist.deleteMany({ where: { ficha_id: { in: fichaIds } } });
            await tx.fotos_ficha.deleteMany({ where: { ficha_id: { in: fichaIds } } });
            await tx.fichas_grooming.deleteMany({ where: { id: { in: fichaIds } } });
          }

          // Encuestas de satisfacción de esas citas
          await tx.encuestas_satisfaccion.deleteMany({ where: { cita_id: { in: ids } } });

          // Facturas de esas citas (y su detalle)
          const facturas = await tx.facturas.findMany({
            where:  { cita_id: { in: ids } },
            select: { id: true },
          });
          const facturaIds = facturas.map(f => f.id);
          if (facturaIds.length > 0) {
            await tx.detalle_factura.deleteMany({ where: { factura_id: { in: facturaIds } } });
            await tx.pagos.deleteMany({ where: { factura_id: { in: facturaIds } } });
            await tx.facturas.deleteMany({ where: { id: { in: facturaIds } } });
          }

          // Ahora sí: borrar las citas
          await tx.citas.deleteMany({ where: { groomer_id: groomerId } });
        }

        // 2. Bloqueos y disponibilidad (tienen Cascade pero por si acaso)
        await tx.bloqueos_calendario.deleteMany({ where: { groomer_id: groomerId } });
        await tx.disponibilidad_groomer.deleteMany({ where: { groomer_id: groomerId } });
      }

      // ── Si es cliente: sus citas también pueden bloquear ──
      if (usuario.clientes) {
        const clienteId = usuario.clientes.id;

        const citasIds = await tx.citas.findMany({
          where:  { mascotas: { dueno_principal_id: clienteId } },
          select: { id: true },
        });
        const ids = citasIds.map(c => c.id);

        if (ids.length > 0) {
          await tx.notificaciones.deleteMany({ where: { cita_id: { in: ids } } });

          const fichas = await tx.fichas_grooming.findMany({
            where:  { cita_id: { in: ids } },
            select: { id: true },
          });
          const fichaIds = fichas.map(f => f.id);
          if (fichaIds.length > 0) {
            await tx.consumo_insumos_ficha.deleteMany({ where: { ficha_id: { in: fichaIds } } });
            await tx.ficha_checklist.deleteMany({ where: { ficha_id: { in: fichaIds } } });
            await tx.fotos_ficha.deleteMany({ where: { ficha_id: { in: fichaIds } } });
            await tx.fichas_grooming.deleteMany({ where: { id: { in: fichaIds } } });
          }

          await tx.encuestas_satisfaccion.deleteMany({ where: { cita_id: { in: ids } } });

          const facturas = await tx.facturas.findMany({
            where:  { cita_id: { in: ids } },
            select: { id: true },
          });
          const facturaIds = facturas.map(f => f.id);
          if (facturaIds.length > 0) {
            await tx.detalle_factura.deleteMany({ where: { factura_id: { in: facturaIds } } });
            await tx.pagos.deleteMany({ where: { factura_id: { in: facturaIds } } });
            await tx.facturas.deleteMany({ where: { id: { in: facturaIds } } });
          }

          await tx.citas.deleteMany({
            where: { mascotas: { dueno_principal_id: clienteId } },
          });
        }
      }

      // ── Finalmente: borrar el usuario (Cascade limpia el resto) ──
      await tx.usuarios.delete({ where: { id: usuarioId } });
    });

    await this.logAdminAction(adminId, adminEmail, 'PERMANENT_DELETE_USER', usuarioId);
    return { message: 'Usuario eliminado permanentemente' };
  }

  // ═══════════════════════════════════════
  // LISTAR USUARIOS PAGINADOS
  // ═══════════════════════════════════════
  async listUsersPaginated(page: number, limit: number, estado?: 'activo' | 'inactivo', search?: string) {
    const where: any = {};
    if (estado === 'activo')   where.estado_activo = true;
    if (estado === 'inactivo') where.estado_activo = false;
    if (search) {
      where.OR = [
        { email:    { contains: search, mode: 'insensitive' } },
        { clientes: { nombre: { contains: search, mode: 'insensitive' } } },
        { groomers: { nombre: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const total    = await prisma.usuarios.count({ where });
    const usuarios = await prisma.usuarios.findMany({
      where,
      skip:     (page - 1) * limit,
      take:     limit,
      include:  { roles: true, clientes: true, groomers: true },
      orderBy:  { creado_en: 'desc' },
    });
    return { total, page, limit, data: usuarios };
  }

  // ═══════════════════════════════════════
  // CREAR RECEPCIONISTA
  // ═══════════════════════════════════════
  async crearRecepcion(data: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    telefono?: string;
  }) {
    if (!isValidPassword(data.password)) {
      throw new AppError(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo',
        400
      );
    }

    const existe = await prisma.usuarios.findUnique({ where: { email: data.email } });
    if (existe) throw new AppError('El email ya está registrado', 409);

    const rolRecepcion = await prisma.roles.findUnique({ where: { nombre: 'recepcion' } });
    if (!rolRecepcion) throw new AppError('Rol recepcion no configurado en la BD', 500);

    const hash = await hashPassword(data.password);

    const usuario = await prisma.usuarios.create({
      data: {
        email:            data.email,
        password_hash:    hash,
        email_verificado: false,
        rol_id:           rolRecepcion.id,
        estado_activo:    true,
      },
    });

    const codigo = generarCodigo6();
    const token  = generateSecureToken();

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token,
        tipo:      'activacion_email',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token:     codigo,
        tipo:      'activacion_email',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    sendStaffCreationEmail({
      to:           data.email,
      nombre:       data.nombre,
      tempPassword: data.password,
      token,
      rol:          'recepcion',
    }).catch(console.error);

    await prisma.audit_log.create({
      data: {
        accion:         'CREATE',
        tabla:          'usuarios',
        registro_id:    usuario.id,
        valores_nuevos: JSON.stringify({ email: data.email, rol: 'recepcion' }),
      },
    }).catch(console.error);

    return {
      message: `Recepcionista ${data.nombre} creado. Se envió email con código de verificación a ${data.email}.`,
    };
  }

  // ═══════════════════════════════════════
  // AUDITORÍA INTERNA
  // ═══════════════════════════════════════
  private async logAdminAction(
    adminId: number,
    adminEmail: string,
    accion: string,
    targetId?: number,
    detalles?: string,
  ) {
    await prisma.auth_log.create({
      data: {
        usuario_id:    adminId,
        email_intento: adminEmail,
        accion:        'cambio_password', // único valor del ENUM disponible para este uso
        detalle:       `ADMIN_ACTION: ${accion} — objetivo: ${targetId ?? 'N/A'} — ${detalles ?? ''}`,
        ip_address:    'admin-panel',
        user_agent:    'web',
      },
    });
  }
}