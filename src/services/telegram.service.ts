// src/services/telegram.service.ts
import axios from 'axios';

/**
 * Envía un mensaje al chat de Telegram configurado en .env.
 *
 * Variables requeridas:
 *   TELEGRAM_BOT_TOKEN — token del bot (obtenido de @BotFather)
 *   TELEGRAM_CHAT_ID   — ID del chat o grupo destino
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('⚠️ Telegram no configurado. Defina TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env');
    return false;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id:    chatId,
        text,
        parse_mode: 'HTML',
      },
      { timeout: 10_000 }, // 10 s de timeout para no bloquear el proceso
    );
    console.log('✅ Mensaje de Telegram enviado');
    return true;
  } catch (err: any) {
    const detail = err?.response?.data?.description ?? err?.message ?? 'Error desconocido';
    console.error(`❌ Error al enviar Telegram: ${detail}`);
    return false;
  }
}