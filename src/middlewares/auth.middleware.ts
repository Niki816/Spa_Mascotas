import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';
import prisma from '../config/database';
import { AppError } from '../utils/errors';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';

interface RequestWithUser extends Request {
  user?: {
    id: number;
    email: string;
    rol: string;
    jti: string;
  };
}

export const authMiddleware = async (req: RequestWithUser, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token no provisto', 401);
    }

    const token = authHeader.split(' ')[1];

    // ── Verificar JWT con manejo específico de errores ──
    let payload;
    try {
      payload = verifyJwt(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        // 401 limpio → el frontend hará el refresh automáticamente
        throw new AppError('Token expirado', 401);
      }
      if (err instanceof JsonWebTokenError) {
        throw new AppError('Token inválido', 401);
      }
      throw new AppError('Error al verificar token', 401);
    }

    // ── Buscar sesión activa ──
    const session = await prisma.user_sessions.findFirst({
      where: {
        jti:              payload.jti,
        activa:           true,
        fecha_expiracion: { gt: new Date() },
      },
      include: { usuarios: { include: { roles: true } } },
    });

    if (!session) throw new AppError('Sesión inválida o expirada', 401);

    // ── Verificar inactividad (30 min) ──
    const now             = new Date();
    const lastActivity    = new Date(session.ultima_actividad);
    const inactiveMinutes = (now.getTime() - lastActivity.getTime()) / 60000;

    if (inactiveMinutes > 30) {
      await prisma.user_sessions.update({
        where: { id: session.id },
        data:  { activa: false },
      });
      throw new AppError('Sesión cerrada por inactividad', 401);
    }

    // ── Actualizar última actividad ──
    await prisma.user_sessions.update({
      where: { id: session.id },
      data:  { ultima_actividad: now },
    });

    // ── Adjuntar usuario al request ──
    req.user = {
      id:    session.usuarios.id,
      email: session.usuarios.email,
      rol:   session.usuarios.roles.nombre,
      jti:   payload.jti,
    };

    next();
  } catch (error) {
    next(error);
  }
};