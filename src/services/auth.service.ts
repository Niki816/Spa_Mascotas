import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/bcrypt';
import { signJwt, signRefreshToken, MyJwtPayload, verifyRefreshToken } from '../utils/jwt';
import { generateSecureToken } from '../utils/tokenGenerator';
import { isValidPassword } from '../utils/passwordValidator';
import { sendVerificationEmail, sendPasswordResetEmail } from './email.service';
import { generateTOTPSecret, verifyTOTP } from './totp.service';
import { AppError } from '../utils/errors';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export class AuthService {
  // ================================
  // REGISTRO Y VERIFICACIÓN
  // ================================
  
  async registerCliente(data: {
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    ci: string;
    telefono: string;
    direccion?: string;
  }) {
    if (!isValidPassword(data.password)) {
      throw new AppError('La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo', 400);
    }

    const existingUser = await prisma.usuarios.findUnique({ where: { email: data.email } });
    if (existingUser) throw new AppError('El email ya está registrado', 409);

    const rolCliente = await prisma.roles.findUnique({ where: { nombre: 'cliente' } });
    if (!rolCliente) throw new AppError('Rol cliente no configurado', 500);

    const hashedPassword = await hashPassword(data.password);
    const usuario = await prisma.usuarios.create({
      data: {
        email: data.email,
        password_hash: hashedPassword,
        email_verificado: false,
        rol_id: rolCliente.id,
        estado_activo: true,
      },
    });

    const cliente = await prisma.clientes.create({
      data: {
        usuario_id: usuario.id,
        nombre: data.nombre,
        apellido: data.apellido,
        ci: data.ci,
        telefono: data.telefono,
        direccion: data.direccion,
      },
    });

    const token = generateSecureToken();
    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token,
        tipo: 'activacion_email',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    sendVerificationEmail(data.email, token).catch(console.error);
    return { usuarioId: usuario.id, clienteId: cliente.id, message: 'Registro exitoso. Revise su email para activar la cuenta.' };
  }

  async verifyEmail(token: string) {
    const tokenRecord = await prisma.tokens_verificacion.findFirst({
      where: { token, tipo: 'activacion_email', usado: false, expira_en: { gt: new Date() } },
    });
    if (!tokenRecord) throw new AppError('Token inválido o expirado', 400);

    await prisma.$transaction([
      prisma.tokens_verificacion.update({ where: { id: tokenRecord.id }, data: { usado: true } }),
      prisma.usuarios.update({ where: { id: tokenRecord.usuario_id }, data: { email_verificado: true } }),
    ]);
    return { message: 'Email verificado correctamente' };
  }

  // ================================
  // LOGIN, LOGOUT, REFRESH
  // ================================

  async login(email: string, password: string, ip: string, userAgent: string, totpCode?: string) {
    const usuario = await prisma.usuarios.findUnique({
      where: { email },
      include: { roles: true, clientes: true, groomers: true },
    });
    if (!usuario) {
      await this.logAuth(null, email, 'login_fallido', ip, userAgent, 'Usuario no existe');
      throw new AppError('Credenciales inválidas', 401);
    }

    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      throw new AppError(`Cuenta bloqueada hasta ${usuario.bloqueado_hasta}`, 403);
    }

    const passwordMatch = await comparePassword(password, usuario.password_hash || '');
    if (!passwordMatch) {
      const nuevosIntentos = usuario.intentos_fallidos + 1;
      let bloqueadoHasta = null;
      if (nuevosIntentos >= 5) {
        bloqueadoHasta = new Date(Date.now() + 15 * 60 * 1000);
      }
      await prisma.usuarios.update({
        where: { id: usuario.id },
        data: { intentos_fallidos: nuevosIntentos, bloqueado_hasta: bloqueadoHasta },
      });
      await this.logAuth(usuario.id, email, 'login_fallido', ip, userAgent, `Intento ${nuevosIntentos}/5`);
      throw new AppError('Credenciales inválidas', 401);
    }

    if (!usuario.email_verificado) {
      throw new AppError('Debe verificar su email antes de iniciar sesión', 403);
    }

    const esAdmin = usuario.roles.nombre === 'admin';
    if (esAdmin && usuario.two_factor_enabled) {
      if (!totpCode) throw new AppError('Código 2FA requerido', 401);
      const isValid = verifyTOTP(usuario.two_factor_secret!, totpCode);
      if (!isValid) {
        await this.logAuth(usuario.id, email, 'verificacion_2fa_fallida', ip, userAgent);
        throw new AppError('Código 2FA inválido', 401);
      }
      await this.logAuth(usuario.id, email, 'verificacion_2fa_exitosa', ip, userAgent);
    }

    await prisma.usuarios.update({
      where: { id: usuario.id },
      data: { intentos_fallidos: 0, bloqueado_hasta: null, ultimo_acceso: new Date() },
    });

    const jti = generateSecureToken();
    const payload: MyJwtPayload = { sub: usuario.id, rol: usuario.roles.nombre, jti };
    const accessToken = signJwt(payload);
    const refreshToken = signRefreshToken({ id: usuario.id, jti });

    await prisma.user_sessions.create({
      data: {
        usuario_id: usuario.id,
        jti,
        token_jwt: accessToken,
        refresh_token: refreshToken,
        ip_address: ip,
        user_agent: userAgent,
        ultima_actividad: new Date(),
        fecha_expiracion: new Date(Date.now() + 60 * 60 * 1000),
        refresh_expiracion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        activa: true,
      },
    });

    await this.logAuth(usuario.id, email, 'login_exitoso', ip, userAgent);
    return { accessToken, refreshToken, rol: usuario.roles.nombre , debeCambiarPassword: usuario.ultimo_acceso === null};
  }

  async refreshToken(refreshToken: string, ip: string, userAgent: string) {
    const decoded = verifyRefreshToken(refreshToken);
    const session = await prisma.user_sessions.findFirst({
      where: { jti: decoded.jti, refresh_token: refreshToken, activa: true, refresh_expiracion: { gt: new Date() } },
      include: { usuarios: { include: { roles: true } } },
    });
    if (!session) throw new AppError('Refresh token inválido', 401);

    const newJti = generateSecureToken();
    const newAccessToken = signJwt({ sub: session.usuario_id, rol: session.usuarios.roles.nombre, jti: newJti });
    const newRefreshToken = signRefreshToken({ id: session.usuario_id, jti: newJti });

    await prisma.$transaction([
      prisma.user_sessions.update({ where: { id: session.id }, data: { activa: false } }),
      prisma.user_sessions.create({
        data: {
          usuario_id: session.usuario_id,
          jti: newJti,
          token_jwt: newAccessToken,
          refresh_token: newRefreshToken,
          ip_address: ip,
          user_agent: userAgent,
          ultima_actividad: new Date(),
          fecha_expiracion: new Date(Date.now() + 60 * 60 * 1000),
          refresh_expiracion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          activa: true,
        },
      }),
    ]);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(jti: string) {
    await prisma.user_sessions.updateMany({ where: { jti, activa: true }, data: { activa: false } });
    return { message: 'Sesión cerrada' };
  }

  async updateActivity(jti: string) {
    await prisma.user_sessions.updateMany({
      where: { jti, activa: true },
      data: { ultima_actividad: new Date() },
    });
  }

  // ================================
  // RECUPERACIÓN DE CONTRASEÑA
  // ================================

  async requestPasswordReset(email: string, ip: string, userAgent: string) {
    const usuario = await prisma.usuarios.findUnique({ where: { email } });
    if (!usuario) {
      // No revelar si el email existe o no (seguridad)
      await this.logAuth(null, email, 'solicitud_reset_password', ip, userAgent, 'Email no registrado');
      return { message: 'Si el email está registrado, recibirás un enlace de recuperación' };
    }

    // Invalidar tokens anteriores no usados del mismo tipo
    await prisma.tokens_verificacion.updateMany({
      where: { usuario_id: usuario.id, tipo: 'reset_password', usado: false },
      data: { usado: true }, // invalidar
    });

    const token = generateSecureToken();
    await prisma.tokens_verificacion.create({
      data: {
        usuario_id: usuario.id,
        token,
        tipo: 'reset_password',
        expira_en: new Date(Date.now() + 15 * 60 * 1000),
        ip_solicitud: ip,
      },
    });

    await this.logAuth(usuario.id, email, 'solicitud_reset_password', ip, userAgent);
    sendPasswordResetEmail(email, token).catch(console.error);
    return { message: 'Si el email está registrado, recibirás un enlace de recuperación' };
  }

  async resetPassword(token: string, newPassword: string, ip: string, userAgent: string) {
    if (!isValidPassword(newPassword)) {
      throw new AppError('La nueva contraseña no cumple los requisitos de seguridad', 400);
    }

    const tokenRecord = await prisma.tokens_verificacion.findFirst({
      where: { token, tipo: 'reset_password', usado: false, expira_en: { gt: new Date() } },
    });
    if (!tokenRecord) throw new AppError('Token inválido o expirado', 400);

    const hashedPassword = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.tokens_verificacion.update({ where: { id: tokenRecord.id }, data: { usado: true } }),
      prisma.usuarios.update({
        where: { id: tokenRecord.usuario_id },
        data: { password_hash: hashedPassword, intentos_fallidos: 0, bloqueado_hasta: null },
      }),
      // Invalidar todas las sesiones activas del usuario por seguridad
      prisma.user_sessions.updateMany({
        where: { usuario_id: tokenRecord.usuario_id, activa: true },
        data: { activa: false },
      }),
    ]);

    await this.logAuth(tokenRecord.usuario_id, '', 'reset_password_exitoso', ip, userAgent);
    return { message: 'Contraseña restablecida correctamente. Por favor inicia sesión.' };
  }

  // ================================
  // CAMBIO DE CONTRASEÑA (autenticado)
  // ================================

  async changePassword(userId: number, oldPassword: string, newPassword: string, ip: string, userAgent: string) {
    const usuario = await prisma.usuarios.findUnique({ where: { id: userId } });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    const validOld = await comparePassword(oldPassword, usuario.password_hash || '');
    if (!validOld) throw new AppError('Contraseña actual incorrecta', 401);

    if (!isValidPassword(newPassword)) {
      throw new AppError('La nueva contraseña no cumple los requisitos de seguridad', 400);
    }

    const hashedNew = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.usuarios.update({
        where: { id: userId },
        data: { password_hash: hashedNew, intentos_fallidos: 0, bloqueado_hasta: null },
      }),
      // Invalidar todas las sesiones excepto la actual? Mejor todas por seguridad.
      prisma.user_sessions.updateMany({
        where: { usuario_id: userId, activa: true },
        data: { activa: false },
      }),
    ]);

    await this.logAuth(userId, usuario.email, 'cambio_password', ip, userAgent);
    return { message: 'Contraseña cambiada correctamente. Debes volver a iniciar sesión.' };
  }

  // ================================
  // 2FA (TOTP) - OBLIGATORIO PARA ADMIN
  // ================================

  async generateTwoFactorSecret(userId: number) {
    const usuario = await prisma.usuarios.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    // Solo administradores pueden usar 2FA (por requerimiento)
    if (usuario.roles.nombre !== 'admin') {
      throw new AppError('Solo los administradores pueden habilitar 2FA', 403);
    }

    if (usuario.two_factor_enabled) {
      throw new AppError('2FA ya está habilitado. Debes deshabilitarlo primero.', 400);
    }

    const secret = speakeasy.generateSecret({ length: 20, name: `PetSpa:${usuario.email}` });
    // Guardar temporalmente el secreto (lo activaremos tras verificar)
    await prisma.usuarios.update({
      where: { id: userId },
      data: { two_factor_secret: secret.base32 },
    });

    const otpauthUrl = secret.otpauth_url!;
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    return { secret: secret.base32, qrCode, message: 'Escanea el código QR con Google Authenticator' };
  }

  async enableTwoFactor(userId: number, totpCode: string) {
    const usuario = await prisma.usuarios.findUnique({ where: { id: userId } });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);
    if (!usuario.two_factor_secret) throw new AppError('No hay secreto 2FA generado previamente', 400);
    if (usuario.two_factor_enabled) throw new AppError('2FA ya está activado', 400);

    const isValid = verifyTOTP(usuario.two_factor_secret, totpCode);
    if (!isValid) throw new AppError('Código TOTP inválido', 401);

    await prisma.usuarios.update({
      where: { id: userId },
      data: { two_factor_enabled: true },
    });
    return { message: '2FA habilitado correctamente' };
  }

  async disableTwoFactor(userId: number, totpCode: string) {
    const usuario = await prisma.usuarios.findUnique({ where: { id: userId } });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);
    if (!usuario.two_factor_enabled) throw new AppError('2FA no está activado', 400);

    const isValid = verifyTOTP(usuario.two_factor_secret!, totpCode);
    if (!isValid) throw new AppError('Código TOTP inválido', 401);

    await prisma.usuarios.update({
      where: { id: userId },
      data: { two_factor_enabled: false, two_factor_secret: null },
    });
    return { message: '2FA deshabilitado correctamente' };
  }

  // ================================
  // LOG INTERNO
  // ================================

  private async logAuth(usuarioId: number | null, email: string, accion: string, ip: string, userAgent: string, detalle?: string) {
    await prisma.auth_log.create({
      data: {
        usuario_id: usuarioId,
        email_intento: email,
        accion: accion as any,
        ip_address: ip,
        user_agent: userAgent,
        detalle,
      },
    });
  }
      // Deshabilitar 2FA de emergencia (cuando el admin pierde su autenticador)
    async emergencyDisable2FA(email: string, password: string) {
      const usuario = await prisma.usuarios.findUnique({ where: { email } });
      if (!usuario) throw new AppError('Credenciales inválidas', 401);

      const passwordMatch = await comparePassword(password, usuario.password_hash || '');
      if (!passwordMatch) throw new AppError('Credenciales inválidas', 401);

      if (!usuario.two_factor_enabled) {
        throw new AppError('El 2FA no está activo', 400);
      }

      await prisma.usuarios.update({
        where: { id: usuario.id },
        data: { two_factor_enabled: false, two_factor_secret: null },
      });

      return { message: '2FA deshabilitado. Ya puedes iniciar sesión normalmente.' };
    }
async resendVerificationEmail(email: string) {
  console.log(`🔄 [AuthService.resendVerificationEmail] Email solicitado: ${email}`);

  const usuario = await prisma.usuarios.findUnique({ where: { email } });
  console.log(`👤 [AuthService] Usuario encontrado: ${usuario ? `id=${usuario.id}, verificado=${usuario.email_verificado}` : 'NO ENCONTRADO'}`);

  if (!usuario || usuario.email_verificado) {
    console.log(`ℹ️  [AuthService] Respuesta genérica (usuario no existe o ya verificado)`);
    return { message: 'Si el email existe y no está verificado, recibirás un nuevo enlace.' };
  }

  await prisma.tokens_verificacion.updateMany({
    where: { usuario_id: usuario.id, tipo: 'activacion_email', usado: false },
    data: { usado: true },
  });
  console.log(`🗑️  [AuthService] Tokens anteriores invalidados`);

  const token = generateSecureToken();
  const expira = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.tokens_verificacion.create({
    data: {
      usuario_id: usuario.id,
      token,
      tipo: 'activacion_email',
      expira_en: expira,
    },
  });
  console.log(`🎫 [AuthService] Nuevo token creado, expira: ${expira.toISOString()}`);

  try {
    await sendVerificationEmail(email, token); // await en lugar de .catch para ver el error
    console.log(`✅ [AuthService] Email de verificación enviado a ${email}`);
  } catch (err: any) {
    console.error(`❌ [AuthService] Falló el envío del email:`, err.message);
    // No lanzar: devolver éxito igual por seguridad, pero el log te dirá qué pasó
  }

  return { message: 'Si el email existe y no está verificado, recibirás un nuevo enlace.' };
}
async verifyTwoFactorCode(userId: number, totpCode: string) {
  const usuario = await prisma.usuarios.findUnique({ where: { id: userId } });
  if (!usuario) throw new AppError('Usuario no encontrado', 404);
  if (!usuario.two_factor_enabled || !usuario.two_factor_secret) {
    throw new AppError('2FA no está activado', 400);
  }
  const isValid = verifyTOTP(usuario.two_factor_secret, totpCode);
  if (!isValid) throw new AppError('Código 2FA inválido', 401);
  return { message: 'Código verificado' };
}

async firstLoginChangePassword(userId: number, newPassword: string, ip: string, userAgent: string) {
  if (!isValidPassword(newPassword)) {
    throw new AppError('La contraseña no cumple los requisitos de seguridad', 400);
  }
  const usuario = await prisma.usuarios.findUnique({ where: { id: userId } });
  if (!usuario) throw new AppError('Usuario no encontrado', 404);

  const hashedNew = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.usuarios.update({
      where: { id: userId },
      data:  {
        password_hash: hashedNew,
        ultimo_acceso: new Date()   // ✅ Evita el bucle de cambio de contraseña
      },
    }),
    prisma.user_sessions.updateMany({
      where: { usuario_id: userId, activa: true },
      data:  { activa: false },
    }),
  ]);
  await this.logAuth(userId, usuario.email, 'cambio_password', ip, userAgent, 'Primer cambio obligatorio');
  return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
}
}
