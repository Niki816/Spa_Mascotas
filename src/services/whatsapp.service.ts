// src/services/whatsapp.service.ts
// ── Meta WhatsApp Cloud API ──────────────────────────────────────────────
// Reemplaza Baileys (QR personal) por la API oficial de Meta.
// Variables requeridas en .env:
//   WA_PHONE_NUMBER_ID   → tu Phone Number ID  (ej. 1434148268470511)
//   WA_ACCESS_TOKEN      → tu token permanente o temporal de Meta
//   WA_API_VERSION       → versión de la API (default: v19.0)

import axios, { AxiosError } from 'axios';

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface WASendResult {
  success:   boolean;
  messageId: string | null;
  /** Código de error de Meta si hubo fallo */
  errorCode: number | null;
  /** Descripción legible del error */
  errorMsg:  string | null;
}

// ─── Helpers internos ─────────────────────────────────────────────────────

/**
 * Normaliza un número de teléfono al formato E.164 sin el "+".
 * Ejemplos:
 *   "72397932"        → "59172397932"  (Bolivia, agrega 591)
 *   "+591 72 397 932" → "59172397932"
 *   "591-72397932"    → "59172397932"
 */
function normalizarNumero(raw: string): string {
  // Quitar todo excepto dígitos
  const soloDigitos = raw.replace(/\D/g, '');

  // Si ya empieza con el código de país (591 para Bolivia)
  // y tiene la longitud correcta (11 dígitos = 591 + 8), dejarlo
  if (soloDigitos.startsWith('591') && soloDigitos.length === 11) {
    return soloDigitos;
  }

  // Si empieza con "0" (algunos países usan trunk prefix)
  if (soloDigitos.startsWith('0')) {
    return `591${soloDigitos.slice(1)}`;
  }

  // Número local boliviano de 8 dígitos → agregar 591
  if (soloDigitos.length === 8) {
    return `591${soloDigitos}`;
  }

  // Devolver tal cual (puede ser otro país ya con código)
  return soloDigitos;
}

/**
 * Traduce los códigos de error de Meta a mensajes entendibles.
 * Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
function traducirErrorMeta(code: number, details?: string): string {
  const errores: Record<number, string> = {
    0:      'Error genérico de autenticación',
    1:      'Error desconocido de la API de Meta',
    2:      'Error de servicio temporal en Meta',
    4:      'Límite de velocidad de la API alcanzado (rate limit)',
    10:     'Permiso denegado — revisa los permisos de tu app en Meta',
    100:    'Parámetro inválido en la petición',
    131026: 'El número destinatario no existe en WhatsApp o no acepta mensajes',
    131047: 'El mensaje no pudo entregarse — número inválido o no registrado en WA',
    131051: 'Tipo de mensaje no soportado por este número',
    131052: 'El archivo adjunto supera el tamaño permitido',
    132000: 'Plantilla no encontrada o no aprobada',
    132001: 'La plantilla fue rechazada por Meta',
    133000: 'El número de destino está en la lista negra',
    133004: 'El servidor de Meta está bajo mantenimiento',
    135000: 'Error de datos — el cuerpo del mensaje tiene formato incorrecto',
  };
  const base = errores[code] ?? `Error Meta código ${code}`;
  return details ? `${base} — Detalle: ${details}` : base;
}

// ─── Función principal: enviar mensaje de texto ───────────────────────────

/**
 * Envía un mensaje de texto plano a un número de WhatsApp usando la
 * Cloud API de Meta.
 *
 * @param to   Número en cualquier formato (se normaliza internamente)
 * @param text Cuerpo del mensaje
 * @returns    WASendResult con éxito/fallo y detalles del error si los hay
 */
export async function sendWhatsAppMessage(
  to:   string,
  text: string,
): Promise<WASendResult> {

  // ── 1. Leer configuración ────────────────────────────────────────────
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const accessToken   = process.env.WA_ACCESS_TOKEN;
  const apiVersion    = process.env.WA_API_VERSION ?? 'v19.0';

  if (!phoneNumberId || !accessToken) {
    const msg = '⚠️ WhatsApp no configurado. Falta WA_PHONE_NUMBER_ID o WA_ACCESS_TOKEN en .env';
    console.error(msg);
    return { success: false, messageId: null, errorCode: null, errorMsg: msg };
  }

  // ── 2. Normalizar número ─────────────────────────────────────────────
  const numeroCrudo     = String(to).trim();
  const numeroNormalizado = normalizarNumero(numeroCrudo);

  if (!/^\d{7,15}$/.test(numeroNormalizado)) {
    const msg = `⚠️ Número de WhatsApp inválido tras normalización: "${numeroCrudo}" → "${numeroNormalizado}"`;
    console.error(msg);
    return { success: false, messageId: null, errorCode: null, errorMsg: msg };
  }

  console.log(`📱 Enviando WhatsApp a: ${numeroCrudo} → normalizado: ${numeroNormalizado}`);

  // ── 3. Construir payload ─────────────────────────────────────────────
  const url     = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                numeroNormalizado,
    type:              'text',
    text: {
      preview_url: false,
      body:        text,
    },
  };

  // ── 4. Enviar petición ───────────────────────────────────────────────
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000, // 15 segundos
    });

    const messageId = response.data?.messages?.[0]?.id ?? null;
    console.log(`✅ WhatsApp enviado a ${numeroNormalizado}. MessageID: ${messageId}`);

    return { success: true, messageId, errorCode: null, errorMsg: null };

  } catch (err) {

    // ── 4a. Error de la API de Meta (respuesta 4xx/5xx) ────────────────
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError<any>;
      const metaError = axiosErr.response?.data?.error;

      if (metaError) {
        const code    = metaError.code        as number ?? -1;
        const subcode = metaError.error_subcode as number | undefined;
        const details = metaError.error_data?.details as string | undefined;
        const msg     = traducirErrorMeta(subcode ?? code, details ?? metaError.message);

        console.error(`❌ Error Meta al enviar a ${numeroNormalizado}:`);
        console.error(`   Código: ${code}${subcode ? ` / Subcódigo: ${subcode}` : ''}`);
        console.error(`   Mensaje: ${msg}`);
        console.error(`   Raw:`, JSON.stringify(metaError, null, 2));

        // Detectar explícitamente "número no existe en WA"
        if (code === 131026 || code === 131047 || subcode === 131026 || subcode === 131047) {
          console.warn(`⚠️ El número ${numeroNormalizado} NO existe en WhatsApp o no acepta mensajes.`);
        }

        return { success: false, messageId: null, errorCode: subcode ?? code, errorMsg: msg };
      }

      // Error de red / timeout
      const networkMsg = `Error de red: ${axiosErr.message}`;
      console.error(`❌ Error de red al enviar WhatsApp a ${numeroNormalizado}: ${axiosErr.message}`);
      return { success: false, messageId: null, errorCode: null, errorMsg: networkMsg };
    }

    // ── 4b. Error inesperado ───────────────────────────────────────────
    const unexpectedMsg = `Error inesperado: ${String(err)}`;
    console.error(`❌ Error inesperado al enviar WhatsApp a ${numeroNormalizado}:`, err);
    return { success: false, messageId: null, errorCode: null, errorMsg: unexpectedMsg };
  }
}

// ─── Compatibilidad con el resto del código ───────────────────────────────
// Los demás servicios (notificacionRecordatorios, notificaciones) llaman a
// sendWhatsAppMessage y esperan un boolean. Esta función wrapper mantiene
// esa interfaz sin romper nada.
export async function sendWhatsAppMessageBool(
  to:   string,
  text: string,
): Promise<boolean> {
  const result = await sendWhatsAppMessage(to, text);
  return result.success;
}

// ─── Funciones legacy para compatibilidad con Baileys ────────────────────
// Si algún otro archivo importa getCurrentQR o startWhatsAppClient,
// estas funciones evitan errores de compilación.

export function getCurrentQR(): {
  qr:        string | null;
  connected: boolean;
  expiresIn: number | null;
} {
  // Con la Cloud API de Meta no se necesita QR
  return { qr: null, connected: true, expiresIn: null };
}

export async function startWhatsAppClient(): Promise<void> {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const accessToken   = process.env.WA_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('⚠️ WhatsApp Cloud API no configurada. Agrega WA_PHONE_NUMBER_ID y WA_ACCESS_TOKEN en .env');
    return;
  }
  console.log('✅ WhatsApp Cloud API lista. Phone Number ID:', phoneNumberId);
}

