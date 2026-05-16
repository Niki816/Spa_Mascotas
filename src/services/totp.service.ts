// src/services/totp.service.ts

import speakeasy from 'speakeasy';

/**
 * Genera un secreto TOTP (Time-based One-Time Password) para un usuario.
 * @param nombreApp - Nombre de la aplicación que aparecerá en Google Authenticator (ej: "PetSpa")
 * @param emailUsuario - Email del usuario (opcional, para identificar la cuenta)
 * @returns Objeto con el secreto en base32 y la URL OTP para generar el QR.
 */
export const generateTOTPSecret = (
  nombreApp: string = 'PetSpa',
  emailUsuario?: string
): { secret: string; otpauthUrl: string } => {
  const secretObj = speakeasy.generateSecret({
    length: 20,
    name: emailUsuario ? `${nombreApp}:${emailUsuario}` : nombreApp,
  });

  return {
    secret: secretObj.base32, // Guardar este secreto en el campo two_factor_secret del usuario
    otpauthUrl: secretObj.otpauth_url!,
  };
};

/**
 * Verifica un código TOTP ingresado por el usuario contra el secreto almacenado.
 * @param secret - Secreto en base32 (almacenado en el usuario)
 * @param token - Código de 6 dígitos ingresado por el usuario
 * @returns true si el código es válido y está dentro de la ventana de tiempo (generalmente ±30 segundos)
 */
export const verifyTOTP = (secret: string, token: string): boolean => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 1, // Permite 1 paso de tiempo antes/después (±30 segundos) para tolerancia
  });
};

/**
 * Opcional: Genera un código TOTP actual (útil para pruebas o enviar por SMS/email si se requiere)
 * @param secret - Secreto en base32
 * @returns código de 6 dígitos
 */
export const generateTOTPToken = (secret: string): string => {
  return speakeasy.totp({
    secret: secret,
    encoding: 'base32',
  });
};