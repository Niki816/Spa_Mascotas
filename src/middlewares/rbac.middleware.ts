import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

interface RequestWithUser extends Request {
  user?: {
    id: number;
    email: string;
    rol: string;
    jti: string;
  };
}

export const allowRoles = (...roles: string[]) => {
  return (req: RequestWithUser, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('No autenticado', 401));
    if (!roles.includes(req.user.rol)) {
      return next(new AppError('No tiene permisos para acceder a este recurso', 403));
    }
    next();
  };
};