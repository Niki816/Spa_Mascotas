import { Router, Request, Response, NextFunction } from 'express';
import {
  register, verifyEmail, login, refresh, logout,
  requestPasswordReset, resetPassword, changePassword,
  generate2FA, enable2FA, disable2FA,
  verifyTwoFactor, firstLoginChangePassword
  // ← QUITAMOS resendVerification, no existe en el controller
} from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { allowRoles }     from '../middlewares/rbac.middleware';
import { AuthService }    from '../services/auth.service';
import { signJwt, signRefreshToken } from '../utils/jwt';
import { generateSecureToken }       from '../utils/tokenGenerator';
import { AppError }       from '../utils/errors';
import { env }            from '../config/env';
import prisma             from '../config/database';
import passport           from 'passport';

const router  = Router();
const authSvc = new AuthService();

// ── Debug log ──
router.use((req, _res, next) => {
  console.log(`🛣️  [auth.routes] ${req.method} ${req.path}`);
  next();
});

// ── Auth básico ──
router.post('/register',            register);
router.get('/verify-email/:token',  verifyEmail);
router.post('/login',               login);
router.post('/refresh',             refresh);
router.post('/logout',              authMiddleware, logout);

// ── Contraseña ──
router.post('/forgot-password',     requestPasswordReset);
router.post('/reset-password',      resetPassword);
router.post('/change-password',     authMiddleware, changePassword);

// ── Reenviar verificación ──
router.post('/resend-verification', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const result = await authSvc.resendVerificationEmail(email);
    res.json(result);
  } catch (e) { next(e); }
});

// ── 2FA ──
router.post('/2fa/generate', authMiddleware, allowRoles('admin'), generate2FA);
router.post('/2fa/enable',   authMiddleware, allowRoles('admin'), enable2FA);
router.post('/2fa/disable',  authMiddleware, allowRoles('admin'), disable2FA);

// ── Emergencia 2FA ──
router.post('/2fa/emergency-disable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await authSvc.emergencyDisable2FA(email, password);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/2fa/verify',                  authMiddleware, allowRoles('admin'), verifyTwoFactor);
router.post('/first-login-change-password', authMiddleware, firstLoginChangePassword);
// ── Perfil del usuario autenticado ──
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) throw new AppError('No autenticado', 401);

    const usuario = await prisma.usuarios.findUnique({
      where:  { id: userId },
      select: {
        id:                 true,
        email:              true,
        email_verificado:   true,
        two_factor_enabled: true,
        ultimo_acceso:      true,
        roles:              { select: { nombre: true } },
      },
    });
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    res.json({
      id:               usuario.id,
      email:            usuario.email,
      rol:              usuario.roles.nombre,
      emailVerificado:  usuario.email_verificado,
      twoFactorEnabled: usuario.two_factor_enabled,
      ultimoAcceso:     usuario.ultimo_acceso,
    });
  } catch (e) { next(e); }
});

// ── Google OAuth ──
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.FRONTEND_URL}/index.html?error=oauth`,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const usuarioCompleto = await prisma.usuarios.findUnique({
        where:   { id: user.id },
        include: { roles: true },
      });
      if (!usuarioCompleto) return res.redirect(`${env.FRONTEND_URL}/index.html?error=usuario`);

      const jti          = generateSecureToken();
      const accessToken  = signJwt({ sub: user.id, rol: usuarioCompleto.roles.nombre, jti });
      const refreshToken = signRefreshToken({ id: user.id, jti });

      await prisma.user_sessions.create({
        data: {
          usuario_id:         user.id,
          jti,
          token_jwt:          accessToken,
          refresh_token:      refreshToken,
          ip_address:         req.ip || '',
          user_agent:         req.headers['user-agent'] || '',
          ultima_actividad:   new Date(),
          fecha_expiracion:   new Date(Date.now() + 60 * 60 * 1000),
          refresh_expiracion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          activa:             true,
        },
      });

      await prisma.auth_log.create({
        data: {
          usuario_id:    user.id,
          email_intento: usuarioCompleto.email,
          accion:        'oauth_login',
          ip_address:    req.ip || '0.0.0.0',
          user_agent:    req.headers['user-agent'] || '',
          detalle:       'proveedor: google',
        },
      });

      const params = new URLSearchParams({
        token: accessToken,
        refreshToken,
        email: usuarioCompleto.email,
        rol:   usuarioCompleto.roles.nombre,
      });
      res.redirect(`${env.FRONTEND_URL}/dashboard.html?${params.toString()}`);
    } catch (e) { next(e); }
  }
);

export default router;