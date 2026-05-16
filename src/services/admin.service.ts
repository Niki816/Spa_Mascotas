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

export class AdminService {

  // ═══════════════════════════════════════
  // CREAR GROOMER (CON TODOS LOS CAMPOS)
  // ═══════════════════════════════════════
  async crearGroomer(data: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    telefono?: string;
    especialidad?: string;
    sucursal_id?: number;
    turno?: string;          // "mañana", "tarde" o "completo"
    capacidad_simultanea?: number;
    horario_trabajo?: any;
  }) {
    // Validar contraseña fuerte
    if (!isValidPassword(data.password)) {
      throw new AppError(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo',
        400
      );
    }

    // Verificar email único
    const existe = await prisma.usuarios.findUnique({ where: { email: data.email } });
    if (existe) throw new AppError('El email ya está registrado', 409);

    // Validar sucursal si se proporcionó
    if (data.sucursal_id) {
      const sucursal = await prisma.sucursales.findUnique({
        where: { id: data.sucursal_id, estado_activo: true },
      });
      if (!sucursal) throw new AppError('Sucursal no válida', 400);
    }

    const rolGroomer = await prisma.roles.findUnique({ where: { nombre: 'groomer' } });
    if (!rolGroomer) throw new AppError('Rol groomer no configurado en la BD', 500);

    const hash = await hashPassword(data.password);

    // Crear usuario
    const usuario = await prisma.usuarios.create({
      data: {
        email:            data.email,
        password_hash:    hash,
        email_verificado: false,
        rol_id:           rolGroomer.id,
        estado_activo:    true,
      },
    });

    // Valores por defecto para turno y capacidad
    const turnoValue = data.turno || 'completo';
    if (!['mañana', 'tarde', 'completo'].includes(turnoValue)) {
      throw new AppError('Turno inválido. Debe ser "mañana", "tarde" o "completo"', 400);
    }

// Mapear a los valores internos del enum de Prisma
    let turnoEnum: 'ma_ana' | 'tarde' | 'completo';
    switch (turnoValue) {
      case 'mañana': turnoEnum = 'ma_ana'; break;
      case 'tarde': turnoEnum = 'tarde'; break;
      case 'completo': turnoEnum = 'completo'; break;
      default: throw new AppError('Turno inválido', 400);
    }
    let horarioFinal = null;
    if (data.horario_trabajo) {
      horarioFinal = typeof data.horario_trabajo === 'object' 
        ? JSON.stringify(data.horario_trabajo) 
        : data.horario_trabajo;
    }


    // Crear el perfil de groomer con todos los campos
    await prisma.groomers.create({
      data: {
        usuario_id:           usuario.id,
        sucursal_id:          data.sucursal_id || null,
        nombre:               data.nombre,
        apellido:             data.apellido,
        telefono:             data.telefono || null,
        especialidad:         data.especialidad || null,
        turno:                turnoEnum,        // ← usa el valor mapeado
        capacidad_simultanea: data.capacidad_simultanea ?? 1,
        horario_trabajo:      horarioFinal || null,
        estado_activo:        true,
      },
    });
    // Generar código de verificación de 6 dígitos y token
    const codigo = generarCodigo6();
    const token = generateSecureToken();

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token,
        tipo:       'activacion_email',
        expira_en:  new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token:      codigo,
        tipo:       'activacion_email',
        expira_en:  new Date(Date.now() + 15 * 60 * 1000),
      },
    });
// Dentro de crearGroomer, antes de sendStaffCreationEmail:
console.log(`📧 Enlace de verificación para ${data.email}: ${process.env.FRONTEND_URL}/verify-email.html?token=${token}`);
console.log(`📧 Código de 6 dígitos: ${codigo}`);
    // Enviar email con credenciales
    sendStaffCreationEmail({
      to:           data.email,
      nombre:       data.nombre,
      tempPassword: data.password,
      token,
      rol:          'groomer',
    }).catch(console.error);

    // Auditoría
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
  // CREAR CLIENTE (por admin)
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
        tipo:       'activacion_email',
        expira_en:  new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token:      codigo,
        tipo:       'activacion_email',
        expira_en:  new Date(Date.now() + 15 * 60 * 1000),
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
  // AUTH LOGS (con emailMap)
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
        where: { id: { in: usuarioIds } },
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
  // DESACTIVAR USUARIO (solo cambiar estado_activo = false)
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

  // ============================================================
  // NUEVOS MÉTODOS PARA CRUD COMPLETO
  // ============================================================

  // 🟢 Obtener usuario con todos sus datos (para editar)
  async getUserById(usuarioId: number) {
    const usuario = await prisma.usuarios.findUnique({
      where: { id: usuarioId },
      include: {
        roles: true,
        clientes: true,
        groomers: true,
      },
    });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);
    return usuario;
  }

  // 🟢 Actualizar usuario (genérico)
  async updateUser(usuarioId: number, data: any, adminId: number, adminEmail: string) {
    const { email, nombre, apellido, telefono, ci, direccion, especialidad } = data;

    // Validar email único si cambia
    if (email) {
      const exists = await prisma.usuarios.findFirst({
        where: { email, NOT: { id: usuarioId } },
      });
      if (exists) throw new AppError('El email ya está en uso', 409);
    }

    // Actualizar tabla usuarios
    await prisma.usuarios.update({
      where: { id: usuarioId },
      data: { email: email || undefined },
    });

    // Obtener rol del usuario
    const usuario = await prisma.usuarios.findUnique({
      where: { id: usuarioId },
      include: { roles: true },
    });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    // Actualizar perfil según rol
    if (usuario.roles.nombre === 'cliente') {
      if (ci) {
        const existingCi = await prisma.clientes.findFirst({
          where: { ci, NOT: { usuario_id: usuarioId } },
        });
        if (existingCi) throw new AppError('El CI ya está registrado', 409);
      }
      await prisma.clientes.update({
        where: { usuario_id: usuarioId },
        data: { nombre, apellido, telefono, ci, direccion },
      });
    } else if (usuario.roles.nombre === 'groomer') {
      await prisma.groomers.update({
        where: { usuario_id: usuarioId },
        data: { nombre, apellido, telefono, especialidad },
      });
    }

    // Registrar auditoría
    await this.logAdminAction(adminId, adminEmail, 'UPDATE_USER', usuarioId, JSON.stringify(data));
    return { message: 'Usuario actualizado correctamente' };
  }

  // 🟢 Reactivar usuario
  async reactivateUser(usuarioId: number, adminId: number, adminEmail: string) {
    await prisma.usuarios.update({
      where: { id: usuarioId },
      data: { estado_activo: true, intentos_fallidos: 0, bloqueado_hasta: null },
    });
    await this.logAdminAction(adminId, adminEmail, 'REACTIVATE_USER', usuarioId);
    return { message: 'Usuario reactivado' };
  }

  // 🟢 Eliminar usuario permanentemente (solo si está inactivo)
  async permanentDeleteUser(usuarioId: number, adminId: number, adminEmail: string) {
    const usuario = await prisma.usuarios.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new AppError('Usuario no existe', 404);
    if (usuario.estado_activo) {
      throw new AppError('No se puede eliminar un usuario activo. Desactívelo primero.', 400);
    }
    // Eliminación en cascada (las relaciones se borran automáticamente por ON DELETE CASCADE)
    await prisma.usuarios.delete({ where: { id: usuarioId } });
    await this.logAdminAction(adminId, adminEmail, 'PERMANENT_DELETE_USER', usuarioId);
    return { message: 'Usuario eliminado permanentemente' };
  }

  // 🟢 Listar usuarios con paginación y filtro
  async listUsersPaginated(page: number, limit: number, estado?: 'activo' | 'inactivo', search?: string) {
    const where: any = {};
    if (estado === 'activo') where.estado_activo = true;
    if (estado === 'inactivo') where.estado_activo = false;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { clientes: { nombre: { contains: search, mode: 'insensitive' } } },
        { groomers: { nombre: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const total = await prisma.usuarios.count({ where });
    const usuarios = await prisma.usuarios.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: { roles: true, clientes: true, groomers: true },
      orderBy: { creado_en: 'desc' },
    });
    return { total, page, limit, data: usuarios };
  }

  // 🟢 Auditoría de acciones de admin (usa 'cambio_password' que existe en el ENUM)
  private async logAdminAction(adminId: number, adminEmail: string, accion: string, targetId?: number, detalles?: string) {
    await prisma.auth_log.create({
      data: {
        usuario_id: adminId,
        email_intento: adminEmail,
        accion: 'cambio_password',      // valor existente en el ENUM
        detalle: `ADMIN_ACTION: ${accion} - usuario objetivo: ${targetId || 'N/A'} - ${detalles || ''}`,
        ip_address: 'admin-panel',
        user_agent: 'web',
      },
    });
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
  // Validar contraseña fuerte
  if (!isValidPassword(data.password)) {
    throw new AppError(
      'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo',
      400
    );
  }

  // Verificar email único
  const existe = await prisma.usuarios.findUnique({ where: { email: data.email } });
  if (existe) throw new AppError('El email ya está registrado', 409);

  // Obtener rol 'recepcion' (debe existir en tabla roles)
  const rolRecepcion = await prisma.roles.findUnique({ where: { nombre: 'recepcion' } });
  if (!rolRecepcion) throw new AppError('Rol recepcion no configurado en la BD', 500);

  const hash = await hashPassword(data.password);

  // Crear usuario
  const usuario = await prisma.usuarios.create({
    data: {
      email:            data.email,
      password_hash:    hash,
      email_verificado: false,
      rol_id:           rolRecepcion.id,
      estado_activo:    true,
    },
  });

  // Nota: como no hay tabla específica para recepcionistas (se usa solo usuarios), 
  // podrías opcionalmente crear un perfil en groomers con rol especial o en otra tabla.
  // Pero según tu esquema, 'recepcion' solo está en roles. No necesita datos extra.
  // Solo lo registramos en usuarios. Enviaremos email de verificación igual.

  const codigo = generarCodigo6();
  const token  = generateSecureToken();

  await prisma.tokens_verificacion.create({
    data: {
      usuario_id: usuario.id,
      token,
      tipo:       'activacion_email',
      expira_en:  new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  await prisma.tokens_verificacion.create({
    data: {
      usuario_id: usuario.id,
      token:      codigo,
      tipo:       'activacion_email',
      expira_en:  new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  // Enviar email
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
}