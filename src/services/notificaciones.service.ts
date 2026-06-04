// src/services/notificaciones.service.ts
import { sendWhatsAppMessage } from './whatsapp.service';
import { sendTelegramMessage  } from './telegram.service';

type Canal = 'whatsapp' | 'telegram' | 'email';

/**
 * Servicio genérico para enviar notificaciones internas del spa
 * (p. ej. alertas de bajo stock a recepción/admin).
 *
 * Para notificaciones a clientes, usa notificacionRecordatorios.service.ts
 */
export class NotificacionService {
  /**
   * Envía un mensaje al canal indicado usando el destino apropiado.
   *
   * @param canal    'whatsapp' | 'telegram' | 'email'
   * @param mensaje  Texto del mensaje (puede usar *negrita* en WhatsApp/Telegram)
   * @param destino  Número de teléfono (WhatsApp) o ignorado (Telegram usa CHAT_ID del .env)
   */
  static async enviarPorCanal(
    canal:   Canal,
    mensaje: string,
    destino?: string,
  ): Promise<boolean> {
    try {
      switch (canal) {
        case 'whatsapp': {
          const numero = destino ?? process.env.SPA_WHATSAPP_NUMBER;
          if (!numero) {
            console.error('⚠️ No se configuró SPA_WHATSAPP_NUMBER en .env');
            return false;
          }
          return (await sendWhatsAppMessage(numero, mensaje)).success;
        }

        case 'telegram': {
          // sendTelegramMessage lee TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID del .env
          return await sendTelegramMessage(mensaje);
        }

        case 'email': {
          // TODO: integrar nodemailer o SendGrid
          console.warn(`📧 Canal "email" no implementado aún. Mensaje: ${mensaje}`);
          return false;
        }

        default: {
          console.warn(`⚠️ Canal desconocido: ${canal}`);
          return false;
        }
      }
    } catch (err) {
      console.error(`❌ Error al enviar notificación por ${canal}:`, err);
      return false;
    }
  }

  /**
   * Notifica al equipo del spa (recepción/admin) sobre un evento interno.
   * Usa WhatsApp si hay número configurado, luego intenta Telegram como respaldo.
   */
  static async notificarSpa(mensaje: string): Promise<void> {
    const enviado = await NotificacionService.enviarPorCanal('whatsapp', mensaje);
    if (!enviado) {
      // Intentar por Telegram como respaldo
      await NotificacionService.enviarPorCanal('telegram', mensaje);
    }
  }
}