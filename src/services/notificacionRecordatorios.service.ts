// src/services/notificacionRecordatorios.service.ts
import prisma from '../config/database';
import { sendWhatsAppMessage } from './whatsapp.service';
import { sendTelegramMessage  } from './telegram.service';

// ─── Tipos auxiliares ────────────────────────────────────────────────────

type TipoEvento =
  | 'confirmacion'
  | 'recordatorio_24h'
  | 'recordatorio_2h'
  | 'listo_recoger'
  | 'encuesta'
  | 'promocion';

type CanalNotif = 'whatsapp' | 'email' | 'sms';

// ─── Constantes ───────────────────────────────────────────────────────────

/**
 * Ventana de tolerancia para evitar que dos ejecuciones del cron
 * (separadas 5 min) procesen la misma cita dos veces.
 * Debe ser MENOR al intervalo del cron (5 min = 300 000 ms).
 */
const VENTANA_MS = 4 * 60 * 1000; // 4 minutos

/** Máximo de reintentos antes de abandonar una notificación fallida. */
const MAX_REINTENTOS = 3;

// ─── Función principal ────────────────────────────────────────────────────

/**
 * Procesa todos los recordatorios pendientes. Se ejecuta cada 5 minutos
 * desde app.ts via setInterval.
 *
 * Cubre:
 *  1. Recordatorio 24 h antes de la cita.
 *  2. Recordatorio 2 h antes de la cita.
 *  3. Aviso "listo para recoger" cuando la ficha de grooming se cierra.
 *  4. Reintentos de notificaciones fallidas (hasta MAX_REINTENTOS veces).
 */
export async function procesarNotificacionesPendientes(): Promise<void> {
  const ahora = new Date();

  // Ejecutar en paralelo para no bloquear el event loop más de lo necesario
  await Promise.allSettled([
    procesarRecordatorios24h(ahora),
    procesarRecordatorios2h(ahora),
    procesarListosParaRecoger(),
    procesarReintentos(),
  ]);
}

// ─── 1. Recordatorios 24 h ────────────────────────────────────────────────

async function procesarRecordatorios24h(ahora: Date): Promise<void> {
  const objetivo = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const desde    = new Date(objetivo.getTime() - VENTANA_MS);
  const hasta    = new Date(objetivo.getTime() + VENTANA_MS);

  const citas = await prisma.citas.findMany({
    where: {
      fecha_hora_inicio: { gte: desde, lte: hasta },
      estado:            { in: ['agendada', 'confirmada'] },
      // Excluir citas que ya tienen recordatorio_24h enviado o pendiente
      notificaciones: {
        none: { tipo_evento: 'recordatorio_24h' },
      },
    },
    include: citaInclude(),
  });

  for (const cita of citas) {
    const hora = cita.fecha_hora_inicio.toLocaleTimeString('es-BO', {
      hour: '2-digit', minute: '2-digit',
    });
    const mensaje =
      `🐾 ¡Hola! Te recordamos que tu cita de *${cita.servicios.nombre}* ` +
      `para *${cita.mascotas.nombre}* es mañana a las *${hora}*. ` +
      `Te esperamos en Pet Spa 🐕`;

    await crearYEnviarNotificacion({
      citaId:      cita.id,
      clienteId:   cita.mascotas.clientes.id,
      tipoEvento:  'recordatorio_24h',
      canal:       cita.mascotas.clientes.canal_notif_preferido as CanalNotif,
      telefono:    cita.mascotas.clientes.telefono,
      mensaje,
    });
  }
}

// ─── 2. Recordatorios 2 h ─────────────────────────────────────────────────

async function procesarRecordatorios2h(ahora: Date): Promise<void> {
  const objetivo = new Date(ahora.getTime() + 2 * 60 * 60 * 1000);
  const desde    = new Date(objetivo.getTime() - VENTANA_MS);
  const hasta    = new Date(objetivo.getTime() + VENTANA_MS);

  const citas = await prisma.citas.findMany({
    where: {
      fecha_hora_inicio: { gte: desde, lte: hasta },
      estado:            { in: ['agendada', 'confirmada'] },
      notificaciones: {
        none: { tipo_evento: 'recordatorio_2h' },
      },
    },
    include: citaInclude(),
  });

  for (const cita of citas) {
    const hora = cita.fecha_hora_inicio.toLocaleTimeString('es-BO', {
      hour: '2-digit', minute: '2-digit',
    });
    const mensaje =
      `⏰ ¡Recuerda! Tu cita de *${cita.servicios.nombre}* ` +
      `para *${cita.mascotas.nombre}* comienza hoy a las *${hora}* ` +
      `(en aproximadamente 2 horas). ¡Te esperamos! 🐾`;

    await crearYEnviarNotificacion({
      citaId:     cita.id,
      clienteId:  cita.mascotas.clientes.id,
      tipoEvento: 'recordatorio_2h',
      canal:      cita.mascotas.clientes.canal_notif_preferido as CanalNotif,
      telefono:   cita.mascotas.clientes.telefono,
      mensaje,
    });
  }
}

// ─── 3. Listo para recoger ────────────────────────────────────────────────

async function procesarListosParaRecoger(): Promise<void> {
  // Citas completadas con ficha cerrada (fecha_cierre NOT NULL)
  // que aún NO tienen notificación "listo_recoger"
  const citas = await prisma.citas.findMany({
    where: {
      estado: 'completada',
      fichas_grooming: {
        fecha_cierre: { not: null }, // la ficha fue cerrada por el groomer
      },
      notificaciones: {
        none: { tipo_evento: 'listo_recoger' },
      },
    },
    include: citaInclude(),
  });

  for (const cita of citas) {
    const mensaje =
      `🎉 ¡*${cita.mascotas.nombre}* ya está listo para recoger en Pet Spa! ` +
      `Pasa cuando puedas. ¡Quedó hermoso! 🐕✨`;

    await crearYEnviarNotificacion({
      citaId:     cita.id,
      clienteId:  cita.mascotas.clientes.id,
      tipoEvento: 'listo_recoger',
      canal:      cita.mascotas.clientes.canal_notif_preferido as CanalNotif,
      telefono:   cita.mascotas.clientes.telefono,
      mensaje,
    });
  }
}

// ─── 4. Reintentos de fallidos ────────────────────────────────────────────

async function procesarReintentos(): Promise<void> {
  const fallidas = await prisma.notificaciones.findMany({
    where: {
      estado:     'fallido',
      reintentos: { lt: MAX_REINTENTOS },
    },
    include: {
      citas: {
        include: {
          mascotas: {
            select: { nombre: true },
          },
          servicios: { select: { nombre: true } },
        },
      },
    },
    take: 50, // procesar máximo 50 por ciclo para no saturar
  });

  for (const notif of fallidas) {
    // Re-construir mensaje según tipo_evento
    const nombreMascota  = notif.citas?.mascotas?.nombre  ?? 'tu mascota';
    const nombreServicio = notif.citas?.servicios?.nombre ?? 'el servicio';
    let mensaje = '';

    switch (notif.tipo_evento) {
      case 'recordatorio_24h':
        mensaje = `🐾 Recordatorio: tu cita de *${nombreServicio}* para *${nombreMascota}* es pronto. ¡Te esperamos en Pet Spa!`;
        break;
      case 'recordatorio_2h':
        mensaje = `⏰ Tu cita de *${nombreServicio}* para *${nombreMascota}* comienza en ~2 horas. ¡No olvides llegar a tiempo!`;
        break;
      case 'listo_recoger':
        mensaje = `🎉 ¡*${nombreMascota}* ya está listo para recoger en Pet Spa! Pasa cuando puedas.`;
        break;
      default:
        continue; // no reintentamos tipos desconocidos
    }

    const enviado = await enviarPorCanal(
      notif.tipo_canal as CanalNotif,
      notif.destino,
      mensaje,
    );

    const nuevoReintentos = notif.reintentos + 1;

    if (enviado) {
      await prisma.notificaciones.update({
        where: { id: notif.id },
        data:  { estado: 'enviado', fecha_envio: new Date(), reintentos: nuevoReintentos },
      });
      await prisma.log_recordatorios.create({
        data: {
          notificacion_id: notif.id,
          intento:         nuevoReintentos,
          resultado:       'exito',
        },
      });
    } else {
      await prisma.notificaciones.update({
        where: { id: notif.id },
        data:  {
          reintentos: nuevoReintentos,
          // Si alcanzó el máximo, dejar en 'fallido' definitivamente
          estado: nuevoReintentos >= MAX_REINTENTOS ? 'fallido' : 'pendiente',
        },
      });
      await prisma.log_recordatorios.create({
        data: {
          notificacion_id: notif.id,
          intento:         nuevoReintentos,
          resultado:       'fallo',
          detalle_error:   `Reintento ${nuevoReintentos}/${MAX_REINTENTOS} fallido`,
        },
      });
    }
  }
}

// ─── Helper: crear notificación y enviar ──────────────────────────────────

interface CrearNotifParams {
  citaId:     number;
  clienteId:  number;
  tipoEvento: TipoEvento;
  canal:      CanalNotif;
  telefono:   string | null;
  mensaje:    string;
}

async function crearYEnviarNotificacion({
  citaId,
  clienteId,
  tipoEvento,
  canal,
  telefono,
  mensaje,
}: CrearNotifParams): Promise<void> {
  // Si no hay destino válido, usar 'email' como canal de respaldo
  // (o simplemente registrar el intento fallido)
  const destino = telefono?.trim() || '';

  // Crear registro de notificación en estado "pendiente"
  const notif = await prisma.notificaciones.create({
    data: {
      cita_id:            citaId,
      cliente_id:         clienteId,
      tipo_canal:         canal === 'sms' ? 'whatsapp' : canal, // sms → whatsapp por ahora
      tipo_evento:        tipoEvento,
      destino:            destino || 'sin-contacto',
      fecha_programacion: new Date(),
      estado:             'pendiente',
    },
  });

  if (!destino) {
    // Sin número de contacto → marcar como fallido
    await prisma.notificaciones.update({
      where: { id: notif.id },
      data:  { estado: 'fallido' },
    });
    await prisma.log_recordatorios.create({
      data: {
        notificacion_id: notif.id,
        intento:         1,
        resultado:       'fallo',
        detalle_error:   'Cliente sin número de teléfono registrado',
      },
    });
    return;
  }

  // Intentar envío
  const canalEfectivo: CanalNotif = canal === 'sms' ? 'whatsapp' : canal;
  const enviado = await enviarPorCanal(canalEfectivo, destino, mensaje);

  if (enviado) {
    await prisma.notificaciones.update({
      where: { id: notif.id },
      data:  { estado: 'enviado', fecha_envio: new Date() },
    });
    await prisma.log_recordatorios.create({
      data: {
        notificacion_id: notif.id,
        intento:         1,
        resultado:       'exito',
      },
    });
  } else {
    await prisma.notificaciones.update({
      where: { id: notif.id },
      data:  { estado: 'fallido', reintentos: 1 },
    });
    await prisma.log_recordatorios.create({
      data: {
        notificacion_id: notif.id,
        intento:         1,
        resultado:       'fallo',
        detalle_error:   `Fallo al enviar por ${canalEfectivo}`,
      },
    });
  }
}

// ─── Helper: envío por canal ──────────────────────────────────────────────

async function enviarPorCanal(
  canal:    CanalNotif,
  destino:  string,
  mensaje:  string,
): Promise<boolean> {
  try {
    if (canal === 'whatsapp') {
      return (await sendWhatsAppMessage(destino, mensaje)).success;
    }
    if (canal === 'email') {
      // TODO: integrar servicio de email (nodemailer / sendgrid)
      console.warn(`📧 Email no implementado aún. Destinatario: ${destino}`);
      return false;
    }
    console.warn(`⚠️ Canal desconocido: ${canal}`);
    return false;
  } catch (err) {
    console.error(`❌ Error al enviar por ${canal} a ${destino}:`, err);
    return false;
  }
}

// ─── Helper: include reutilizable ─────────────────────────────────────────

function citaInclude() {
  return {
    mascotas: {
      include: {
        clientes: {
          select: {
            id:                    true,
            telefono:              true,
            canal_notif_preferido: true,
            usuarios: { select: { email: true } },
          },
        },
      },
    },
    servicios: { select: { nombre: true } },
  } as const;
}