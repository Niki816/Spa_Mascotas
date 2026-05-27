// ─── src/jobs/autoCancelExpiredAppointments.ts ───────────────────────────────
//
//  Job que revisa periódicamente las citas y marca como 'no_asistio' aquellas
//  que ya pasaron su hora de inicio sin haber sido completadas ni canceladas.
//
//  USO en tu app principal (p. ej. src/index.ts o src/app.ts):
//
//    import { startAutoCancelJob } from './jobs/autoCancelExpiredAppointments';
//    startAutoCancelJob();          // corre cada 15 minutos por defecto
//
//  No requiere dependencias externas — usa setInterval nativo de Node.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../config/database';

// ── Configuración ─────────────────────────────────────────────────────────────

/**
 * Tiempo de gracia en minutos después de fecha_hora_inicio.
 * Si la cita estaba "agendada" o "confirmada" y ya pasaron X minutos
 * desde su hora de inicio sin que el groomer la marcara en progreso
 * o completada, se considera que el cliente no asistió.
 */
const GRACE_PERIOD_MINUTES = 60; // 1 hora de gracia

/** Intervalo de ejecución del job en minutos. */
const JOB_INTERVAL_MINUTES = 15;

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Busca citas vencidas y las marca como 'no_asistio'.
 * Una cita se considera vencida cuando:
 *   - Su estado es 'agendada' o 'confirmada'  (nunca llegó a en_progreso ni completada)
 *   - Han pasado más de GRACE_PERIOD_MINUTES desde fecha_hora_inicio
 *
 * Retorna el número de citas actualizadas.
 */
export async function cancelExpiredAppointments(): Promise<number> {
  const ahora   = new Date();
  const cutoff  = new Date(ahora.getTime() - GRACE_PERIOD_MINUTES * 60_000);

  try {
    const result = await prisma.citas.updateMany({
      where: {
        estado:            { in: ['agendada', 'confirmada'] },
        fecha_hora_inicio: { lt: cutoff },
      },
      data: {
        estado:         'no_asistio',
        actualizado_en: ahora,
      },
    });

    if (result.count > 0) {
      console.log(
        `[AutoCancel][${ahora.toLocaleString('es-BO')}] ` +
        `${result.count} cita(s) marcadas como no_asistio ` +
        `(cutoff: ${cutoff.toLocaleString('es-BO')})`,
      );
    }

    return result.count;
  } catch (err) {
    console.error('[AutoCancel] Error al actualizar citas expiradas:', err);
    return 0;
  }
}

// ── Función de inicio del job ─────────────────────────────────────────────────

/**
 * Inicia el job de auto-cancelación.
 * - Ejecuta una pasada inmediata al arrancar.
 * - Luego repite cada `intervalMinutes` minutos.
 *
 * @param intervalMinutes  Frecuencia de ejecución (por defecto 15 min).
 * @returns  El objeto NodeJS.Timeout que puedes limpiar con clearInterval().
 */
export function startAutoCancelJob(
  intervalMinutes: number = JOB_INTERVAL_MINUTES,
): ReturnType<typeof setInterval> {
  const ms = intervalMinutes * 60_000;

  console.log(
    `[AutoCancel] Job iniciado — ` +
    `se ejecuta cada ${intervalMinutes} min · ` +
    `gracia de ${GRACE_PERIOD_MINUTES} min tras inicio de cita`,
  );

  // Pasada inicial al arrancar el servidor
  cancelExpiredAppointments().catch(console.error);

  // Ejecución periódica
  return setInterval(() => {
    cancelExpiredAppointments().catch(console.error);
  }, ms);
}

// ── Ejecución manual (para scripts/CLI) ───────────────────────────────────────
//
//  ts-node src/jobs/autoCancelExpiredAppointments.ts
//
if (require.main === module) {
  (async () => {
    console.log('[AutoCancel] Ejecutando manualmente...');
    const n = await cancelExpiredAppointments();
    console.log(`[AutoCancel] Listo. ${n} cita(s) actualizadas.`);
    await prisma.$disconnect();
  })();
}