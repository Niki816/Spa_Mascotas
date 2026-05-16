import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

interface RequestWithUser extends Request {
  user?: {
    id: number;
    email: string;
    rol: string;
    jti: string;
  };
}

const authService = new AuthService();

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.registerCliente(req.body);
    res.status(201).json(result);
  } catch (error) { next(error); }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const result = await authService.verifyEmail(token);
    res.json(result);
  } catch (error) { next(error); }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, totpCode } = req.body;
    const ip = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const result = await authService.login(email, password, ip, userAgent, totpCode);
    res.json(result);
  } catch (error) { next(error); }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    const ip = req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    const result = await authService.refreshToken(refreshToken, ip, userAgent);
    res.json(result);
  } catch (error) { next(error); }
};

export const logout = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const jti = req.user?.jti;
    if (jti) await authService.logout(jti);
    res.json({ message: 'Logout exitoso' });
  } catch (error) { next(error); }
};

export const requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const ip = req.ip || '';
    const ua = req.headers['user-agent'] || '';
    const result = await authService.requestPasswordReset(email, ip, ua);
    res.json(result);
  } catch (error) { next(error); }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    const ip = req.ip || '';
    const ua = req.headers['user-agent'] || '';
    const result = await authService.resetPassword(token, newPassword, ip, ua);
    res.json(result);
  } catch (error) { next(error); }
};

export const changePassword = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { oldPassword, newPassword } = req.body;
    const ip = req.ip || '';
    const ua = req.headers['user-agent'] || '';
    const result = await authService.changePassword(userId, oldPassword, newPassword, ip, ua);
    res.json(result);
  } catch (error) { next(error); }
};

export const generate2FA = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const result = await authService.generateTwoFactorSecret(userId);
    res.json(result);
  } catch (error) { next(error); }
};

export const enable2FA = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { totpCode } = req.body;
    const result = await authService.enableTwoFactor(userId, totpCode);
    res.json(result);
  } catch (error) { next(error); }
};

export const disable2FA = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { totpCode } = req.body;
    const result = await authService.disableTwoFactor(userId, totpCode);
    res.json(result);
  } catch (error) { next(error); }
};

export const resendVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('📧 [resendVerification] Body recibido:', req.body);
    const { email } = req.body;

    if (!email) {
      console.warn('⚠️  [resendVerification] No se recibió email en el body');
      return res.status(400).json({ message: 'El campo email es requerido' });
    }

    console.log(`📧 [resendVerification] Solicitando reenvío para: ${email}`);
    const result = await authService.resendVerificationEmail(email);
    console.log('✅ [resendVerification] Resultado:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ [resendVerification] Error:', error);
    next(error);
  }
};

export const verifyTwoFactor = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { totpCode } = req.body;
    const result = await authService.verifyTwoFactorCode(userId, totpCode);
    res.json(result);
  } catch (error) { next(error); }
};

export const firstLoginChangePassword = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { newPassword } = req.body;
    const ip = req.ip || '';
    const ua = req.headers['user-agent'] || '';
    const result = await authService.firstLoginChangePassword(userId, newPassword, ip, ua);
    res.json(result);
  } catch (error) { next(error); }
};