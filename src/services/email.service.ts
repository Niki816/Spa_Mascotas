import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

// ── Verificación de email (auto-registro cliente) ──
export const sendVerificationEmail = async (to: string, token: string) => {
  const link = `${env.FRONTEND_URL}/verify-email.html?token=${token}`;
  await transporter.sendMail({
    from: `"Pet Spa 🐾" <${env.SMTP_USER}>`,
    to,
    subject: 'Activa tu cuenta — Pet Spa',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#faf7f2;padding:32px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#1e3a2f;font-size:28px;margin:0;">🐾 Pet Spa</h1>
          <p style="color:#4a6355;margin:4px 0 0;">Sistema de gestión</p>
        </div>
        <div style="background:white;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
          <h2 style="color:#1e3a2f;margin:0 0 12px;">¡Bienvenido!</h2>
          <p style="color:#4a6355;line-height:1.6;">Haz clic en el botón para verificar tu email y activar tu cuenta.</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${link}" style="display:inline-block;background:#1e3a2f;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;">
              Verificar mi cuenta
            </a>
          </div>
          <p style="color:#8aab97;font-size:12px;text-align:center;">El enlace expira en <strong>15 minutos</strong>.</p>
        </div>
      </div>`,
  });
};


// ── Reset de contraseña ──
export const sendPasswordResetEmail = async (to: string, token: string) => {
  const link = `${env.FRONTEND_URL}/reset-password.html?token=${token}`;
  await transporter.sendMail({
    from: `"Pet Spa 🐾" <${env.SMTP_USER}>`,
    to,
    subject: 'Recupera tu contraseña — Pet Spa',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#faf7f2;padding:32px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#1e3a2f;font-size:28px;margin:0;">🐾 Pet Spa</h1>
        </div>
        <div style="background:white;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
          <h2 style="color:#1e3a2f;margin:0 0 12px;">Recuperar contraseña</h2>
          <p style="color:#4a6355;line-height:1.6;">Haz clic para restablecer tu contraseña:</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${link}" style="display:inline-block;background:#d4845a;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;">
              Restablecer contraseña
            </a>
          </div>
          <p style="color:#8aab97;font-size:12px;text-align:center;">El enlace expira en <strong>15 minutos</strong>. Si no solicitaste esto, ignora este correo.</p>
        </div>
      </div>`,
  });
};

// ── Creación de personal por admin (groomer / cliente) ──
// Incluye: contraseña temporal + código de 6 dígitos + link de verificación
export const sendStaffCreationEmail = async (params: {
  to: string;
  nombre: string;
  tempPassword: string;
  token: string;        // solo se mantiene el token para el link (ya no se usa el codigo)
  rol: string;
}) => {
  const { to, nombre, tempPassword, token, rol } = params;
  const link = `${env.FRONTEND_URL}/verify-email.html?token=${token}`;
  const rolLabel = rol === 'groomer' ? '✂️ Groomer' : (rol === 'recepcion' ? '📞 Recepcionista' : '🐶 Cliente');

  await transporter.sendMail({
    from: `"Pet Spa 🐾" <${env.SMTP_USER}>`,
    to,
    subject: `Bienvenido a Pet Spa — Tu cuenta de ${rolLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#faf7f2;padding:32px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#1e3a2f;font-size:28px;margin:0;">🐾 Pet Spa</h1>
          <p style="color:#4a6355;margin:4px 0 0;">${rolLabel}</p>
        </div>
        <div style="background:white;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
          <h2 style="color:#1e3a2f;margin:0 0 8px;">¡Hola, ${nombre}!</h2>
          <p style="color:#4a6355;line-height:1.6;">
            El administrador de Pet Spa ha creado tu cuenta. <br>
            <strong>Debes verificar tu email para poder ingresar al sistema.</strong>
          </p>

          <!-- Credenciales -->
          <div style="background:#e8f5ed;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:#2d5a45;font-weight:bold;">📋 Tus credenciales de acceso:</p>
            <p style="margin:0;font-size:13px;color:#1e3a2f;">📧 Email: <strong>${to}</strong></p>
            <p style="margin:4px 0 0;font-size:13px;color:#1e3a2f;">🔑 Contraseña temporal: <strong style="font-family:monospace;font-size:15px;">${tempPassword}</strong></p>
            <p style="margin:8px 0 0;font-size:12px;color:#8aab97;">Cambia tu contraseña después de tu primer inicio de sesión.</p>
          </div>

          <!-- Botón de verificación (sin código numérico) -->
          <div style="text-align:center;margin:24px 0 16px;">
            <a href="${link}" style="display:inline-block;background:#1e3a2f;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;">
              Verificar mi cuenta →
            </a>
          </div>

          <p style="color:#8aab97;font-size:12px;text-align:center;margin-top:16px;">
            El enlace expira en <strong>15 minutos</strong>.
          </p>
        </div>
        <p style="text-align:center;font-size:11px;color:#8aab97;margin-top:16px;">
          Pet Spa — Sistema de gestión
        </p>
      </div>`,
  });
};