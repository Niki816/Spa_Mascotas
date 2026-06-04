// src/controllers/cliente.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';
import { uploadCarnet } from '../config/upload';
import { AvailabilityService } from '../services/availability.service';
import { sendWhatsAppMessage } from '../services/whatsapp.service';

const availabilityService = new AvailabilityService();

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface RequestWithUser extends Request {
  user?: { id: number; email: string; rol: string; jti: string };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calcula el multiplicador de duración según peso y temperamento de la mascota.
 */
function calcularMultiplicadorDuracion(mascota: {
  peso_kg: number | null;
  temperamento: string | null;
  especie: string;
}): number {
  let multiplicador = 1.0;
  const peso = Number(mascota.peso_kg ?? 0);

  if      (peso < 5)  multiplicador = 1.00;
  else if (peso < 20) multiplicador = 1.10;
  else if (peso < 45) multiplicador = 1.15;
  else                multiplicador = 1.30;

  const temp = (mascota.temperamento ?? '').toLowerCase();
  if (['agresivo', 'nervioso', 'ansioso'].includes(temp)) multiplicador += 0.20;

  return multiplicador;
}

/** Formatea una Date a "HH:MM" usando la hora local. */
function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Extrae horas y minutos de un campo Time de Prisma (puede llegar como Date o string). */
function extractTime(value: Date | string): { hours: number; minutes: number } {
  if (value instanceof Date) {
    return { hours: value.getUTCHours(), minutes: value.getUTCMinutes() };
  }
  const [h, m] = String(value).split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

/** Devuelve un campo Time como string "HH:MM". */
function formatTime(value: Date | string): string {
  const { hours, minutes } = extractTime(value);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const diaNombreANumero: Record<string, number> = {
  lunes: 1, martes: 2, 'miércoles': 3, miercoles: 3,
  jueves: 4, viernes: 5, 'sábado': 6, sabado: 6, domingo: 7,
};

const diasNombresES: Record<number, string> = {
  1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves',
  5: 'viernes', 6: 'sábado', 7: 'domingo',
};

const tipoBloqueoLabel: Record<string, string> = {
  feriado:       '🎉 Feriado',
  mantenimiento: '🔧 Mantenimiento',
  vacaciones:    '🏖️ Vacaciones',
  ausencia:      '🚫 Ausencia',
};

/** Convierte "pequeño" | "mediano" | "grande" | "gigante" a kg estimados. */
function pesoEstimadoPorTamaño(tamanio: string): number {
  switch (tamanio.toLowerCase()) {
    case 'pequeño':
    case 'pequeno': return 4;
    case 'mediano': return 15;
    case 'grande':  return 35;
    case 'gigante': return 60;
    default:        return 15;
  }
}

/** Normaliza el temperamento al enum de Prisma. */
function mapearTemperamento(input: string): string {
  const mapa: Record<string, string> = {
    tranquilo: 'tranquilo',
    jugueton:  'jugueton',
    agresivo:  'agresivo',
    ansioso:   'ansioso',
    nervioso:  'ansioso',   // "nervioso" del spec → enum "ansioso"
    inquieto:  'ansioso',   // "inquieto" del spec → enum "ansioso"
    otro:      'otro',
  };
  return mapa[input.toLowerCase()] ?? 'otro';
}

/** Obtiene el cliente_id asociado al usuario autenticado. */
async function getClienteIdFromUser(userId: number): Promise<number> {
  const cliente = await prisma.clientes.findUnique({
    where:  { usuario_id: userId },
    select: { id: true },
  });
  if (!cliente) throw new AppError('Cliente no encontrado', 404);
  return cliente.id;
}

// ─── Validación de disponibilidad (reutilizada en crearCitaCliente) ──────────

async function validarDisponibilidadParaCita({
  groomer_id,
  fechaHoraInicio,
  fechaHoraFin,
}: {
  groomer_id:      number;
  fechaHoraInicio: Date;
  fechaHoraFin:    Date;
}): Promise<void> {
  const groomer = await prisma.groomers.findUnique({
    where:  { id: groomer_id },
    select: { nombre: true, apellido: true },
  });
  const groomerNombre = groomer
    ? `${groomer.nombre} ${groomer.apellido}`
    : `Groomer #${groomer_id}`;

  // ── 1. Bloqueos globales (groomer_id = null) ─────────────────────────────
  const bloqueosGlobales = await prisma.bloqueos_calendario.findMany({
    where: {
      groomer_id:   null,
      fecha_inicio: { lte: fechaHoraFin },
      fecha_fin:    { gte: fechaHoraInicio },
    },
  });
  if (bloqueosGlobales.length > 0) {
    const b = bloqueosGlobales[0];
    const label = tipoBloqueoLabel[b.tipo_bloqueo] ?? b.tipo_bloqueo;
    const desde = new Date(b.fecha_inicio).toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
    const hasta  = new Date(b.fecha_fin  ).toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
    throw new AppError(
      `⛔ No se pueden agendar citas: ${label}${b.descripcion ? ` — "${b.descripcion}"` : ''}. Período bloqueado: ${desde} al ${hasta}.`,
      409,
    );
  }

  // ── 2. Bloqueos del groomer ───────────────────────────────────────────────
  const bloqueosGroomer = await prisma.bloqueos_calendario.findMany({
    where: {
      groomer_id,
      fecha_inicio: { lte: fechaHoraFin },
      fecha_fin:    { gte: fechaHoraInicio },
    },
  });
  if (bloqueosGroomer.length > 0) {
    const b = bloqueosGroomer[0];
    const label = tipoBloqueoLabel[b.tipo_bloqueo] ?? b.tipo_bloqueo;
    const desde = new Date(b.fecha_inicio).toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
    const hasta  = new Date(b.fecha_fin  ).toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
    throw new AppError(
      `⛔ ${groomerNombre} no está disponible: ${label}${b.descripcion ? ` — "${b.descripcion}"` : ''}. Período: ${desde} al ${hasta}.`,
      409,
    );
  }

  // ── 3. Horario laboral ────────────────────────────────────────────────────
  const diaSemanaJS = fechaHoraInicio.getDay();
  const diaSemana   = diaSemanaJS === 0 ? 7 : diaSemanaJS;
  const diaNombre   = diasNombresES[diaSemana];

  const totalDiasPersonales = await prisma.disponibilidad_groomer.count({
    where: { groomer_id },
  });

  if (totalDiasPersonales === 0) {
    // Sin horario personal → usar config general del spa
    const config = await availabilityService.getGeneralConfig();
    const diasLab: string[] = Array.isArray(config.dias_laborales)
      ? config.dias_laborales
      : String(config.dias_laborales).split(',').map((d: string) => d.trim().toLowerCase());

    const diaEnSPA = diasLab.some(d => {
      const n = d.toLowerCase().trim();
      return n === diaNombre || diaNombreANumero[n] === diaSemana;
    });
    if (!diaEnSPA) {
      throw new AppError(
        `⛔ El día ${diaNombre} no es laborable. Días disponibles: ${diasLab.join(', ')}.`,
        400,
      );
    }

    const [hIni, mIni] = config.horario_inicio.split(':').map(Number);
    const [hFin, mFin] = config.horario_fin.split(':').map(Number);
    const minIniSPA  = hIni * 60 + mIni;
    const minFinSPA  = hFin * 60 + mFin;
    const minIniCita = fechaHoraInicio.getHours() * 60 + fechaHoraInicio.getMinutes();
    const minFinCita = fechaHoraFin.getHours()    * 60 + fechaHoraFin.getMinutes();

    if (minIniCita < minIniSPA || minFinCita > minFinSPA) {
      throw new AppError(
        `⛔ El horario solicitado (${toHHMM(fechaHoraInicio)}–${toHHMM(fechaHoraFin)}) está fuera del horario del spa (${config.horario_inicio}–${config.horario_fin}).`,
        400,
      );
    }
  } else {
    // Horario personal del groomer
    const dispDia = await prisma.disponibilidad_groomer.findFirst({
      where: { groomer_id, dia_semana: diaSemana },
    });
    if (!dispDia) {
      throw new AppError(`⛔ ${groomerNombre} no trabaja los ${diaNombre}.`, 400);
    }

    const ini = extractTime(dispDia.hora_inicio as unknown as Date | string);
    const fin = extractTime(dispDia.hora_fin    as unknown as Date | string);
    const minIniGroomer = ini.hours * 60 + ini.minutes;
    const minFinGroomer = fin.hours * 60 + fin.minutes;
    const minIniCita    = fechaHoraInicio.getHours() * 60 + fechaHoraInicio.getMinutes();
    const minFinCita    = fechaHoraFin.getHours()    * 60 + fechaHoraFin.getMinutes();

    if (minIniCita < minIniGroomer || minFinCita > minFinGroomer) {
      throw new AppError(
        `⛔ ${groomerNombre} trabaja de ${formatTime(dispDia.hora_inicio as any)} a ${formatTime(dispDia.hora_fin as any)}. Tu cita de ${toHHMM(fechaHoraInicio)} a ${toHHMM(fechaHoraFin)} está fuera de ese horario.`,
        400,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SERVICIOS Y GROOMERS (catálogo público)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/clientes/servicios
 * Lista todos los servicios activos.
 */
export const getServiciosCliente = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const servicios = await prisma.servicios.findMany({
      where:   { estado_activo: true },
      orderBy: { nombre: 'asc' },
    });

    res.json(
      servicios.map(s => ({
        id:       s.id,
        nombre:   s.nombre,
        descripcion: s.descripcion,
        duracion: s.duracion_base_minutos,
        precio:   Number(s.precio_base),
      })),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clientes/groomers
 * Lista todos los groomers activos.
 */
export const getGroomersCliente = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const groomers = await prisma.groomers.findMany({
      where:   { estado_activo: true },
      select:  { id: true, nombre: true, apellido: true, especialidad: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(groomers);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  SLOTS DISPONIBLES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/clientes/slots?fecha=YYYY-MM-DD&servicio_id=1[&groomer_id=2]
 * Devuelve franjas horarias libres para la fecha y servicio indicados.
 * Considera el buffer_minutos del groomer para no encimar citas.
 */
export const getAvailableSlotsCliente = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { fecha, servicio_id, groomer_id } = req.query;
    if (!fecha || !servicio_id) {
      throw new AppError('fecha y servicio_id son requeridos', 400);
    }

    // Validar formato de fecha
    const fechaObj = new Date(fecha as string);
    if (isNaN(fechaObj.getTime())) {
      throw new AppError('Formato de fecha inválido. Use YYYY-MM-DD', 400);
    }

    // No permitir fechas pasadas
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (fechaObj < hoy) {
      return res.json({ slots: [], message: 'No se pueden consultar fechas pasadas' });
    }

    const diaSemanaNum = fechaObj.getDay();
    const diaSemana    = diaSemanaNum === 0 ? 7 : diaSemanaNum;

    // Verificar día laborable
    const config      = await availabilityService.getGeneralConfig();
    const diasNumeros = (config.dias_laborales as string[]).map(
      (d: string) => diaNombreANumero[d.toLowerCase().trim()],
    );
    if (!diasNumeros.includes(diaSemana)) {
      return res.json({ slots: [], message: 'Día no laborable' });
    }

    // Bloqueos globales para esa fecha
    const inicioFecha = new Date(fechaObj); inicioFecha.setHours(0,  0,  0, 0);
    const finFecha    = new Date(fechaObj); finFecha   .setHours(23, 59, 59, 999);

    const bloqueosGlobales = await prisma.bloqueos_calendario.findMany({
      where: {
        groomer_id:   null,
        fecha_inicio: { lte: finFecha },
        fecha_fin:    { gte: inicioFecha },
      },
    });
    if (bloqueosGlobales.length > 0) {
      const b = bloqueosGlobales[0];
      return res.json({
        slots:   [],
        message: `Día bloqueado: ${tipoBloqueoLabel[b.tipo_bloqueo] ?? b.tipo_bloqueo}${b.descripcion ? ` — ${b.descripcion}` : ''}`,
      });
    }

    // Obtener servicio
    const servicio = await prisma.servicios.findUnique({
      where: { id: Number(servicio_id) },
    });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);
    const duracionMin = servicio.duracion_base_minutos;

    // Groomers a evaluar
    let groomerIds: number[] = [];
    if (groomer_id) {
      const g = await prisma.groomers.findUnique({
        where:  { id: Number(groomer_id) },
        select: { id: true, estado_activo: true },
      });
      if (!g || !g.estado_activo) {
        throw new AppError('Groomer no encontrado o inactivo', 404);
      }
      groomerIds = [g.id];
    } else {
      const groomers = await prisma.groomers.findMany({
        where:  { estado_activo: true },
        select: { id: true },
      });
      groomerIds = groomers.map(g => g.id);
    }

    const allSlots: Array<{
      groomer_id: number;
      inicio:     string;
      fin:        string;
      hora:       string;
    }> = [];

    for (const gid of groomerIds) {
      // Bloqueos específicos del groomer en esa fecha
      const bloqueosGroomer = await prisma.bloqueos_calendario.findMany({
        where: {
          groomer_id:   gid,
          fecha_inicio: { lte: finFecha },
          fecha_fin:    { gte: inicioFecha },
        },
      });
      if (bloqueosGroomer.length > 0) continue;

      // Disponibilidad personal del groomer
      const disponibilidadPersonal = await availabilityService.getGroomerAvailability(gid);
      const personalDia = disponibilidadPersonal.find((d: any) => d.dia_semana === diaSemana);

      const totalDiasPersonales = await prisma.disponibilidad_groomer.count({
        where: { groomer_id: gid },
      });

      // Si tiene horario personal pero no trabaja ese día, saltar
      if (totalDiasPersonales > 0 && !personalDia) continue;

      // Determinar rango horario y buffer
      let hIni: number, mIni: number, hFin: number, mFin: number;
      let bufferMinutos = 0;

      if (personalDia) {
        const ini = extractTime(personalDia.hora_inicio as unknown as Date | string);
        const fin = extractTime(personalDia.hora_fin    as unknown as Date | string);
        hIni = ini.hours;
        mIni = ini.minutes;
        hFin = fin.hours;
        mFin = fin.minutes;
        bufferMinutos = personalDia.buffer_minutos ?? 15;
      } else {
        [hIni, mIni] = config.horario_inicio.split(':').map(Number);
        [hFin, mFin] = config.horario_fin.split(':').map(Number);
        bufferMinutos = 15; // buffer por defecto si usa config general
      }

      const startOfDay = new Date(fechaObj); startOfDay.setHours(0,   0,  0, 0);
      const endOfDay   = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Citas existentes del groomer para ese día
      const citasExistentes = await prisma.citas.findMany({
        where: {
          groomer_id:        gid,
          fecha_hora_inicio: { gte: startOfDay, lt: endOfDay },
          estado:            { notIn: ['cancelada', 'no_asistio'] },
        },
        orderBy: { fecha_hora_inicio: 'asc' },
      });

      let current = new Date(fechaObj);
      current.setHours(hIni, mIni, 0, 0);

      const end = new Date(fechaObj);
      end.setHours(hFin, mFin, 0, 0);

      // Avanzar de 30 en 30 minutos
      while (current.getTime() + duracionMin * 60_000 <= end.getTime()) {
        const slotStart = new Date(current);
        const slotEnd   = new Date(current.getTime() + duracionMin * 60_000);

        // Verificar conflicto considerando el buffer
        const conflicto = citasExistentes.some(c => {
          const cStart = new Date(c.fecha_hora_inicio);
          // La cita ocupa su duración + buffer al final
          const cEnd   = new Date(cStart.getTime() + (c.duracion_estimada_min + bufferMinutos) * 60_000);
          return slotStart < cEnd && slotEnd > cStart;
        });

        if (!conflicto) {
          allSlots.push({
            groomer_id: gid,
            inicio: slotStart.toISOString(),
            fin:    slotEnd.toISOString(),
            hora:   toHHMM(slotStart),
          });
        }

        current = new Date(current.getTime() + 30 * 60_000);
      }
    }

    // Ordenar por hora
    allSlots.sort((a, b) => a.inicio.localeCompare(b.inicio));

    res.json({ slots: allSlots });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  MASCOTAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/clientes/mis-mascotas
 * Devuelve todas las mascotas del cliente autenticado.
 */
export const getMisMascotas = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);

    const mascotas = await prisma.mascotas.findMany({
      where:   { dueno_principal_id: clienteId },
      select: {
        id:               true,
        nombre:           true,
        especie:          true,
        raza:             true,
        peso_kg:          true,
        temperamento:     true,
        foto_url:         true,
        fecha_nacimiento: true,
        alergias:         true,
        vacunas_mascota: {
          select: {
            nombre_vacuna:     true,
            fecha_aplicacion:  true,
            fecha_vencimiento: true,
            veterinario:       true,
          },
          orderBy: { fecha_aplicacion: 'desc' },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json(
      mascotas.map(m => ({
        ...m,
        peso_kg: m.peso_kg ? Number(m.peso_kg) : null,
      })),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/clientes/mascotas
 * Registra una nueva mascota para el cliente autenticado.
 * Campos: nombre, especie, raza, tamanio, fecha_nacimiento, temperamento, alergias
 */
export const crearMascotaCliente = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const {
      nombre,
      especie,
      raza,
      tamanio,
      fecha_nacimiento,
      temperamento,
      alergias,
    } = req.body;

    // ── Validaciones ──────────────────────────────────────────────────────
    if (!nombre || !String(nombre).trim()) {
      throw new AppError('El nombre de la mascota es obligatorio', 400);
    }
    if (!especie) {
      throw new AppError('La especie es obligatoria', 400);
    }

    const especiesValidas = ['perro', 'gato', 'otro'];
    if (!especiesValidas.includes(String(especie).toLowerCase())) {
      throw new AppError('Especie no válida. Opciones: perro, gato, otro', 400);
    }

    const tamañosValidos = ['pequeño', 'pequeno', 'mediano', 'grande', 'gigante'];
    if (tamanio && !tamañosValidos.includes(String(tamanio).toLowerCase())) {
      throw new AppError('Tamaño no válido. Opciones: pequeño, mediano, grande, gigante', 400);
    }

    const temperamentosValidos = ['tranquilo', 'jugueton', 'agresivo', 'ansioso', 'nervioso', 'inquieto', 'otro'];
    if (temperamento && !temperamentosValidos.includes(String(temperamento).toLowerCase())) {
      throw new AppError('Temperamento no válido. Opciones: tranquilo, jugueton, agresivo, ansioso, nervioso, inquieto, otro', 400);
    }

    if (fecha_nacimiento && isNaN(new Date(fecha_nacimiento).getTime())) {
      throw new AppError('Formato de fecha de nacimiento inválido', 400);
    }
    if (fecha_nacimiento && new Date(fecha_nacimiento) > new Date()) {
      throw new AppError('La fecha de nacimiento no puede ser futura', 400);
    }

    const peso = tamanio ? pesoEstimadoPorTamaño(String(tamanio)) : null;
    const temperamentoFinal = temperamento ? mapearTemperamento(String(temperamento)) : null;

    // ── Crear mascota ─────────────────────────────────────────────────────
    const nuevaMascota = await prisma.mascotas.create({
      data: {
        dueno_principal_id: clienteId,
        nombre:             String(nombre).trim(),
        especie:            String(especie).toLowerCase(),
        raza:               raza ? String(raza).trim() : null,
        fecha_nacimiento:   fecha_nacimiento ? new Date(fecha_nacimiento) : null,
        peso_kg:            peso,
        temperamento:       temperamentoFinal as any,
        alergias:           alergias ? String(alergias).trim() : null,
      },
    });

    // ── Relación mascota_dueno ────────────────────────────────────────────
    await prisma.mascota_dueno.create({
      data: {
        mascota_id:   nuevaMascota.id,
        cliente_id:   clienteId,
        es_principal: true,
      },
    });

    res.status(201).json({
      message: `Mascota "${nuevaMascota.nombre}" registrada exitosamente`,
      mascota: {
        id:          nuevaMascota.id,
        nombre:      nuevaMascota.nombre,
        especie:     nuevaMascota.especie,
        raza:        nuevaMascota.raza,
        peso_kg:     nuevaMascota.peso_kg ? Number(nuevaMascota.peso_kg) : null,
        temperamento: nuevaMascota.temperamento,
        alergias:    nuevaMascota.alergias,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/clientes/mascotas/:id/carnet
 * Sube el carnet de vacunas (PDF o imagen) de una mascota del cliente.
 */
export const subirCarnetVacunas = [
  uploadCarnet.single('carnet'),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const mascotaId = parseInt(req.params.id as string);
      if (isNaN(mascotaId)) throw new AppError('ID de mascota inválido', 400);

      const clienteId = await getClienteIdFromUser(req.user!.id);

      const mascota = await prisma.mascotas.findFirst({
        where: { id: mascotaId, dueno_principal_id: clienteId },
      });
      if (!mascota) {
        throw new AppError('Mascota no encontrada o no te pertenece', 404);
      }

      if (!req.file) {
        throw new AppError('No se recibió ningún archivo. Asegúrese de enviar el campo "carnet"', 400);
      }

      // Validar tipo de archivo (PDF o imagen)
      const mimePermitidos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!mimePermitidos.includes(req.file.mimetype)) {
        throw new AppError('Tipo de archivo no permitido. Use PDF, JPG, PNG o WEBP', 400);
      }

      const url = `/carnets/${req.file.filename}`;

      await prisma.mascotas.update({
        where: { id: mascotaId },
        data:  { foto_url: url },
      });

      res.json({
        message: 'Carnet de vacunas subido exitosamente',
        url,
        mascota_id: mascotaId,
      });
    } catch (error) {
      next(error);
    }
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  CITAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/clientes/citas
 * El cliente solicita una cita. Queda en estado "agendada" pendiente de
 * confirmación por recepción (según spec: "sujeta a revisión y aprobación").
 *
 * Body: mascota_id, servicio_id, groomer_id, fecha (YYYY-MM-DD), hora (HH:MM), notas?
 */
export const crearCitaCliente = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const { mascota_id, servicio_id, groomer_id, fecha, hora, notas } = req.body;

    // ── Validaciones de campos requeridos ─────────────────────────────────
    if (!mascota_id || !servicio_id || !groomer_id || !fecha || !hora) {
      throw new AppError(
        'Faltan campos requeridos: mascota_id, servicio_id, groomer_id, fecha, hora',
        400,
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
      throw new AppError('Formato de fecha inválido. Use YYYY-MM-DD', 400);
    }
    if (!/^\d{2}:\d{2}$/.test(String(hora).substring(0, 5))) {
      throw new AppError('Formato de hora inválido. Use HH:MM', 400);
    }

    // ── Validar mascota del cliente ───────────────────────────────────────
    const mascota = await prisma.mascotas.findFirst({
      where: { id: Number(mascota_id), dueno_principal_id: clienteId },
    });
    if (!mascota) throw new AppError('Mascota no encontrada o no te pertenece', 404);

    // ── Validar servicio activo ───────────────────────────────────────────
    const servicio = await prisma.servicios.findUnique({
      where: { id: Number(servicio_id) },
    });
    if (!servicio || !servicio.estado_activo) {
      throw new AppError('Servicio no encontrado o no disponible', 404);
    }

    // ── Validar groomer activo ────────────────────────────────────────────
    const groomer = await prisma.groomers.findUnique({
      where: { id: Number(groomer_id) },
    });
    if (!groomer || !groomer.estado_activo) {
      throw new AppError('Groomer no encontrado o inactivo', 404);
    }

    // ── Construir fechaHoraInicio ─────────────────────────────────────────
    const horaLimpia      = String(hora).substring(0, 5);
    const fechaHoraStr    = `${fecha}T${horaLimpia}:00`;
    const fechaHoraInicio = new Date(fechaHoraStr);

    if (isNaN(fechaHoraInicio.getTime())) {
      throw new AppError(`Fecha u hora inválida: fecha="${fecha}", hora="${hora}"`, 400);
    }

    // Mínimo 1 hora en el futuro para dar tiempo a recepción
    const minimoPermitido = new Date(Date.now() + 60 * 60 * 1000);
    if (fechaHoraInicio < minimoPermitido) {
      throw new AppError('La cita debe agendarse con al menos 1 hora de anticipación', 400);
    }

    // ── Calcular duración según mascota ───────────────────────────────────
    const multiplicador    = calcularMultiplicadorDuracion(mascota as any);
    const duracionAjustada = Math.ceil(servicio.duracion_base_minutos * multiplicador);
    const fechaHoraFin     = new Date(fechaHoraInicio.getTime() + duracionAjustada * 60_000);

    // ── Validar disponibilidad (horario, bloqueos) ────────────────────────
    await validarDisponibilidadParaCita({
      groomer_id:      Number(groomer_id),
      fechaHoraInicio,
      fechaHoraFin,
    });

    // ── Verificar conflicto con otras citas del groomer ───────────────────
    const conflicto = await prisma.citas.findFirst({
      where: {
        groomer_id: Number(groomer_id),
        estado:     { notIn: ['cancelada', 'no_asistio'] },
        OR: [{
          fecha_hora_inicio: { lt: fechaHoraFin },
          fecha_hora_fin:    { gt: fechaHoraInicio },
        }],
      },
    });
    if (conflicto) {
      throw new AppError(
        `⛔ ${groomer.nombre} ya tiene una cita de ${toHHMM(new Date(conflicto.fecha_hora_inicio))} a ${toHHMM(new Date(conflicto.fecha_hora_fin))}. Elige otro horario o groomer.`,
        409,
      );
    }

    // ── Verificar capacidad diaria del spa ────────────────────────────────
    const config     = await availabilityService.getGeneralConfig();
    const startOfDay = new Date(fechaHoraInicio); startOfDay.setHours(0,  0,  0, 0);
    const endOfDay   = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const citasEseDia = await prisma.citas.count({
      where: {
        fecha_hora_inicio: { gte: startOfDay, lt: endOfDay },
        estado:            { notIn: ['cancelada', 'no_asistio'] },
      },
    });
    if (citasEseDia >= config.capacidad_diaria_max) {
      throw new AppError(
        `⛔ Se alcanzó la capacidad máxima de ${config.capacidad_diaria_max} citas para ese día.`,
        400,
      );
    }

    // ── Crear cita ────────────────────────────────────────────────────────
    // El estado "agendada" indica que está pendiente de confirmación por recepción.
    const nuevaCita = await prisma.citas.create({
      data: {
        mascota_id:            Number(mascota_id),
        servicio_id:           Number(servicio_id),
        groomer_id:            Number(groomer_id),
        fecha_hora_inicio:     fechaHoraInicio,
        fecha_hora_fin:        fechaHoraFin,
        duracion_estimada_min: duracionAjustada,
        precio_calculado:      servicio.precio_base,
        estado:                'agendada', // pendiente de confirmación por recepción
        creado_por:            req.user!.id,
        notas:                 notas ? String(notas).trim() : null,
      },
      include: {
        mascotas:  { select: { nombre: true } },
        servicios: { select: { nombre: true, precio_base: true } },
        groomers:  { select: { nombre: true, apellido: true } },
      },
    });

    res.status(201).json({
      message: '✅ Solicitud de cita enviada. Quedará confirmada una vez que recepción la apruebe.',
      cita: {
        id:                    nuevaCita.id,
        mascota:               nuevaCita.mascotas.nombre,
        servicio:              nuevaCita.servicios.nombre,
        groomer:               `${nuevaCita.groomers.nombre} ${nuevaCita.groomers.apellido}`,
        fecha_hora_inicio:     nuevaCita.fecha_hora_inicio,
        fecha_hora_fin:        nuevaCita.fecha_hora_fin,
        duracion_estimada_min: nuevaCita.duracion_estimada_min,
        precio_calculado:      Number(nuevaCita.precio_calculado),
        estado:                nuevaCita.estado,
        notas:                 nuevaCita.notas,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clientes/mis-citas
 * Devuelve las citas de todas las mascotas del cliente.
 * Query params: estado (opcional, filtra por estado)
 */
export const getMisCitas = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const { estado } = req.query;

    const estadosValidos = ['agendada', 'confirmada', 'en_progreso', 'completada', 'cancelada', 'no_asistio'];

    const whereEstado: any = {};
    if (estado) {
      if (!estadosValidos.includes(String(estado))) {
        throw new AppError(`Estado no válido. Opciones: ${estadosValidos.join(', ')}`, 400);
      }
      whereEstado.estado = String(estado);
    }

    const citas = await prisma.citas.findMany({
      where: {
        mascotas: { dueno_principal_id: clienteId },
        ...whereEstado,
      },
      include: {
        mascotas:  { select: { nombre: true, especie: true } },
        servicios: { select: { nombre: true } },
        groomers:  { select: { nombre: true, apellido: true } },
      },
      orderBy: { fecha_hora_inicio: 'desc' },
      take:    100,
    });

    res.json(
      citas.map(c => ({
        id:                    c.id,
        mascota:               c.mascotas.nombre,
        especie:               c.mascotas.especie,
        servicio:              c.servicios.nombre,
        groomer:               `${c.groomers.nombre} ${c.groomers.apellido}`,
        fecha_hora_inicio:     c.fecha_hora_inicio,
        fecha_hora_fin:        c.fecha_hora_fin,
        estado:                c.estado,
        duracion_estimada_min: c.duracion_estimada_min,
        precio_calculado:      Number(c.precio_calculado),
        notas:                 c.notas,
        motivo_cancelacion:    c.motivo_cancelacion,
      })),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/clientes/citas/:id/cancelar
 * El cliente cancela su propia cita con al menos 24 h de anticipación.
 * Body: motivo? (string)
 */
export const cancelarCitaCliente = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const citaId    = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID de cita inválido', 400);

    // Verificar que la cita pertenece al cliente
    const cita = await prisma.citas.findFirst({
      where: {
        id:      citaId,
        mascotas: { dueno_principal_id: clienteId },
      },
      include: {
        mascotas:  { select: { nombre: true } },
        servicios: { select: { nombre: true } },
        groomers:  { select: { nombre: true, apellido: true } },
      },
    });
    if (!cita) throw new AppError('Cita no encontrada o no tienes permiso para cancelarla', 404);

    // Solo se pueden cancelar citas en estado agendada o confirmada
    if (!['agendada', 'confirmada'].includes(cita.estado)) {
      throw new AppError(
        `No se puede cancelar una cita en estado "${cita.estado}". Solo puedes cancelar citas agendadas o confirmadas.`,
        400,
      );
    }

    // Política: al menos 24 horas de anticipación
    const ahora     = new Date();
    const diffHoras = (cita.fecha_hora_inicio.getTime() - ahora.getTime()) / (1000 * 60 * 60);
    if (diffHoras < 24) {
      throw new AppError(
        '⛔ No puedes cancelar con menos de 24 horas de anticipación. Por favor contacta con recepción directamente.',
        400,
      );
    }

    // Motivo (opcional pero recomendado)
    const { motivo } = req.body;
    const motivoFinal = motivo ? String(motivo).trim().substring(0, 300) : null;

    const updated = await prisma.citas.update({
      where: { id: citaId },
      data:  {
        estado:              'cancelada',
        motivo_cancelacion:  motivoFinal,
      },
    });

    res.json({
      message: '✅ Cita cancelada correctamente. El horario quedó liberado.',
      cita: {
        id:                 updated.id,
        fecha_hora_inicio:  updated.fecha_hora_inicio,
        estado:             updated.estado,
        motivo_cancelacion: updated.motivo_cancelacion,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  HISTORIAL Y REPORTE DE MASCOTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/clientes/mascotas/:id/historial
 * Historial de servicios completados de la mascota, con fotos antes/después.
 */
export const getHistorialMascota = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const mascotaId = parseInt(req.params.id as string);
    if (isNaN(mascotaId)) throw new AppError('ID de mascota inválido', 400);

    const mascota = await prisma.mascotas.findFirst({
      where: { id: mascotaId, dueno_principal_id: clienteId },
    });
    if (!mascota) throw new AppError('Mascota no encontrada o no te pertenece', 404);

    const citas = await prisma.citas.findMany({
      where: {
        mascota_id: mascotaId,
        estado:     'completada',
      },
      include: {
        servicios: { select: { nombre: true } },
        groomers:  { select: { nombre: true, apellido: true } },
        fichas_grooming: {
          include: {
            fotos_ficha: {
              orderBy: { creado_en: 'asc' },
              select:  { url: true, tipo: true, descripcion: true },
            },
          },
        },
      },
      orderBy: { fecha_hora_inicio: 'desc' },
    });

    const historial = citas.map(c => {
      const ficha   = c.fichas_grooming;
      const fotos   = ficha?.fotos_ficha ?? [];
      const antes   = fotos.filter(f => f.tipo === 'antes');
      const despues = fotos.filter(f => f.tipo === 'despues');

      return {
        cita_id:        c.id,
        fecha:          c.fecha_hora_inicio,
        servicio:       c.servicios.nombre,
        groomer:        `${c.groomers.nombre} ${c.groomers.apellido}`,
        duracion_real:  c.duracion_real_min,
        estado_inicial: ficha?.estado_inicial ?? null,
        estado_final:   ficha?.estado_final   ?? null,
        notas:          ficha?.notas_internas ?? null,
        fotos: {
          antes:   antes  .map(f => ({ url: f.url, descripcion: f.descripcion })),
          despues: despues.map(f => ({ url: f.url, descripcion: f.descripcion })),
        },
      };
    });

    res.json({
      mascota: {
        id:      mascota.id,
        nombre:  mascota.nombre,
        especie: mascota.especie,
      },
      total_servicios: historial.length,
      historial,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clientes/mascotas/:id/reporte
 * Reporte completo: historial, nivel de fidelidad, recomendaciones y alertas.
 */
export const getReporteMascota = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const mascotaId = parseInt(req.params.id as string);
    if (isNaN(mascotaId)) throw new AppError('ID de mascota inválido', 400);

    const mascota = await prisma.mascotas.findFirst({
      where:  { id: mascotaId, dueno_principal_id: clienteId },
      select: {
        id:          true,
        nombre:      true,
        especie:     true,
        raza:        true,
        peso_kg:     true,
        temperamento: true,
        alergias:    true,
      },
    });
    if (!mascota) throw new AppError('Mascota no encontrada o no te pertenece', 404);

    // Citas completadas con fichas y fotos
    const citas = await prisma.citas.findMany({
      where: { mascota_id: mascotaId, estado: 'completada' },
      include: {
        servicios: { select: { nombre: true } },
        groomers:  { select: { nombre: true, apellido: true } },
        fichas_grooming: {
          include: {
            fotos_ficha: {
              orderBy: { creado_en: 'asc' },
              select:  { url: true, tipo: true, descripcion: true },
            },
          },
        },
      },
      orderBy: { fecha_hora_inicio: 'desc' },
    });

    // Eventos de historial (recomendaciones, alertas)
    const eventos = await prisma.historial_mascota.findMany({
      where:   { mascota_id: mascotaId },
      orderBy: { creado_en: 'desc' },
      select:  { tipo_evento: true, descripcion: true, creado_en: true },
    });

    const totalServicios = citas.length;

    // Nivel de fidelidad: bronce < 5, plata 5-9, oro 10+
    let nivel    = 'Bronce 🥉';
    let descuento = '';
    if      (totalServicios >= 10) { nivel = 'Oro 🥇';   descuento = '10% de descuento en tu próximo servicio'; }
    else if (totalServicios >= 5)  { nivel = 'Plata 🥈'; descuento = '5% de descuento en tu próximo servicio';  }

    // Historial de servicios
    const historial = citas.map(c => {
      const ficha   = c.fichas_grooming;
      const fotos   = ficha?.fotos_ficha ?? [];
      const antes   = fotos.filter(f => f.tipo === 'antes');
      const despues = fotos.filter(f => f.tipo === 'despues');

      return {
        cita_id:        c.id,
        fecha:          c.fecha_hora_inicio,
        servicio:       c.servicios.nombre,
        groomer:        `${c.groomers.nombre} ${c.groomers.apellido}`,
        duracion_real:  c.duracion_real_min,
        estado_inicial: ficha?.estado_inicial ?? null,
        estado_final:   ficha?.estado_final   ?? null,
        notas_internas: ficha?.notas_internas ?? null,
        fotos: {
          antes:   antes  .map(f => ({ url: f.url, descripcion: f.descripcion })),
          despues: despues.map(f => ({ url: f.url, descripcion: f.descripcion })),
        },
      };
    });

    res.json({
      mascota: {
        ...mascota,
        peso_kg: mascota.peso_kg ? Number(mascota.peso_kg) : null,
      },
      total_servicios: totalServicios,
      nivel_fidelidad: nivel,
      beneficio_descuento: descuento,
      historial,
      recomendaciones: eventos.filter(e => e.tipo_evento === 'recomendacion'),
      alertas:         eventos.filter(e => e.tipo_evento === 'alerta'),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  PERFIL DEL CLIENTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/clientes/perfil
 * Datos del perfil del cliente autenticado.
 */
export const getPerfil = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);

    const cliente = await prisma.clientes.findUnique({
      where:  { id: clienteId },
      select: {
        nombre:                true,
        apellido:              true,
        telefono:              true,
        ci:                    true,
        direccion:             true,
        canal_notif_preferido: true,
        usuarios: { select: { email: true, email_verificado: true } },
      },
    });

    res.json(cliente);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TIENDA — PRODUCTOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/clientes/productos
 * Catálogo público de productos activos con variantes.
 * Query params: search, categoria_id
 */
export const getProductosCatalogo = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { search, categoria_id } = req.query;
    const where: any = { estado_activo: true };

    if (search) {
      where.OR = [
        { nombre:      { contains: String(search) } },
        { descripcion: { contains: String(search) } },
      ];
    }
    if (categoria_id) {
      const cid = Number(categoria_id);
      if (isNaN(cid)) throw new AppError('categoria_id debe ser un número', 400);
      where.categoria_id = cid;
    }

    const productos = await prisma.productos.findMany({
      where,
      include: {
        categorias_producto: { select: { id: true, nombre: true } },
        variantes_producto: {
          where:  { estado_activo: true },
          select: {
            id:           true,
            atributo:     true,
            valor:        true,
            sku_variante: true,
            precio_extra: true,
            stock:        true,
            unidad_medida: true,
            cantidad:     true,
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    const result = productos.map(p => ({
      id:          p.id,
      nombre:      p.nombre,
      descripcion: p.descripcion,
      sku:         p.sku,
      precio_base: Number(p.precio_base),
      stock:       p.stock,
      imagen_url:  p.imagen_url,
      categoria:   p.categorias_producto.nombre,
      categoria_id: p.categorias_producto.id,
      agotado:     p.stock === 0,
      variantes:   p.variantes_producto.map(v => ({
        id:           v.id,
        atributo:     v.atributo,
        valor:        v.valor,
        precio_extra: Number(v.precio_extra),
        precio_final: Number(p.precio_base) + Number(v.precio_extra),
        stock:        v.stock,
        agotado:      v.stock === 0,
        cantidad:     v.cantidad ? Number(v.cantidad) : null,
        unidad_medida: v.unidad_medida,
      })),
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TIENDA — CARRITO
// ═══════════════════════════════════════════════════════════════════════════

/** Helper: obtiene o crea el carrito del cliente. */
async function obtenerOCrearCarrito(clienteId: number) {
  let carrito = await prisma.carritos.findFirst({
    where: { cliente_id: clienteId },
  });
  if (!carrito) {
    carrito = await prisma.carritos.create({
      data: {
        cliente_id:    clienteId,
        session_token: `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        expires_at:    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });
  }
  return carrito;
}

/** Helper: calcula el total del carrito y devuelve los items formateados. */
async function getCarritoFormateado(carritoId: number) {
  const items = await prisma.detalle_carrito.findMany({
    where: { carrito_id: carritoId },
    include: {
      productos: {
        select: { id: true, nombre: true, precio_base: true, imagen_url: true },
      },
      variantes_producto: {
        select: { id: true, atributo: true, valor: true, precio_extra: true },
      },
    },
  });

  const itemsFormato = items.map(item => ({
    id:                   item.id,
    producto_id:          item.productos.id,
    producto_nombre:      item.productos.nombre,
    imagen_url:           item.productos.imagen_url,
    variante_id:          item.variante_id,
    variante_descripcion: item.variantes_producto
      ? `${item.variantes_producto.atributo}: ${item.variantes_producto.valor}`
      : null,
    cantidad:       item.cantidad,
    precio_unitario: Number(item.precio_unitario),
    subtotal:        Number(item.precio_unitario) * item.cantidad,
  }));

  const total = itemsFormato.reduce((sum, i) => sum + i.subtotal, 0);

  return { itemsFormato, total };
}

/**
 * GET /api/clientes/carrito
 * Devuelve el carrito actual del cliente.
 */
export const getCarritoCliente = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const carrito   = await obtenerOCrearCarrito(clienteId);
    const { itemsFormato, total } = await getCarritoFormateado(carrito.id);

    res.json({
      carrito_id: carrito.id,
      items:      itemsFormato,
      total,
      cantidad_items: itemsFormato.reduce((sum, i) => sum + i.cantidad, 0),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/clientes/carrito
 * Agrega un producto (con variante opcional) al carrito.
 * Body: producto_id, variante_id?, cantidad
 */
export const agregarAlCarritoCliente = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const { producto_id, variante_id, cantidad } = req.body;

    if (!producto_id || !cantidad) {
      throw new AppError('producto_id y cantidad son requeridos', 400);
    }
    const cantidadNum = Number(cantidad);
    if (!Number.isInteger(cantidadNum) || cantidadNum <= 0) {
      throw new AppError('La cantidad debe ser un número entero mayor a 0', 400);
    }

    // Validar producto
    const producto = await prisma.productos.findUnique({
      where: { id: Number(producto_id) },
    });
    if (!producto || !producto.estado_activo) {
      throw new AppError('Producto no disponible', 404);
    }

    let precioFinal = Number(producto.precio_base);

    if (variante_id) {
      // Validar variante
      const variante = await prisma.variantes_producto.findUnique({
        where: { id: Number(variante_id) },
      });
      if (!variante || variante.producto_id !== producto.id || !variante.estado_activo) {
        throw new AppError('Variante no válida o inactiva', 400);
      }
      if (variante.stock < cantidadNum) {
        throw new AppError(`Stock insuficiente. Solo hay ${variante.stock} unidades disponibles de esta variante`, 400);
      }
      precioFinal += Number(variante.precio_extra);
    } else {
      // Sin variante → verificar stock del producto base
      if (producto.stock < cantidadNum) {
        throw new AppError(`Stock insuficiente. Solo hay ${producto.stock} unidades disponibles`, 400);
      }
    }

    const carrito = await obtenerOCrearCarrito(clienteId);

    // Si ya existe el mismo producto+variante en el carrito → actualizar cantidad
    const existingItem = await prisma.detalle_carrito.findFirst({
      where: {
        carrito_id:  carrito.id,
        producto_id: Number(producto_id),
        variante_id: variante_id ? Number(variante_id) : null,
      },
    });

    if (existingItem) {
      const nuevaCantidad = existingItem.cantidad + cantidadNum;
      // Re-validar stock con la cantidad total
      if (variante_id) {
        const variante = await prisma.variantes_producto.findUnique({ where: { id: Number(variante_id) } });
        if (variante && variante.stock < nuevaCantidad) {
          throw new AppError(`Stock insuficiente. Solo hay ${variante.stock} unidades en total`, 400);
        }
      } else {
        if (producto.stock < nuevaCantidad) {
          throw new AppError(`Stock insuficiente. Solo hay ${producto.stock} unidades en total`, 400);
        }
      }
      await prisma.detalle_carrito.update({
        where: { id: existingItem.id },
        data:  { cantidad: nuevaCantidad },
      });
    } else {
      await prisma.detalle_carrito.create({
        data: {
          carrito_id:     carrito.id,
          producto_id:    Number(producto_id),
          variante_id:    variante_id ? Number(variante_id) : null,
          cantidad:       cantidadNum,
          precio_unitario: precioFinal,
        },
      });
    }

    const { itemsFormato, total } = await getCarritoFormateado(carrito.id);

    res.json({
      message:    '✅ Producto agregado al carrito',
      carrito_id: carrito.id,
      items:      itemsFormato,
      total,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/clientes/carrito/:itemId
 * Actualiza la cantidad de un item. Si cantidad <= 0 lo elimina.
 * Body: cantidad
 */
export const actualizarItemCarritoCliente = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const itemId    = parseInt(req.params.itemId as string);
    if (isNaN(itemId)) throw new AppError('ID de item inválido', 400);

    const { cantidad } = req.body;
    if (cantidad === undefined || cantidad === null) {
      throw new AppError('El campo "cantidad" es requerido', 400);
    }

    const cantidadNum = Number(cantidad);

    // Verificar que el item pertenece al cliente
    const item = await prisma.detalle_carrito.findUnique({
      where:   { id: itemId },
      include: { carritos: true },
    });
    if (!item || item.carritos.cliente_id !== clienteId) {
      throw new AppError('Item no encontrado', 404);
    }

    if (cantidadNum <= 0) {
      // Eliminar item
      await prisma.detalle_carrito.delete({ where: { id: itemId } });
      const { itemsFormato, total } = await getCarritoFormateado(item.carrito_id);
      return res.json({ message: 'Item eliminado del carrito', items: itemsFormato, total });
    }

    // Validar stock disponible
    if (item.variante_id) {
      const variante = await prisma.variantes_producto.findUnique({ where: { id: item.variante_id } });
      if (variante && variante.stock < cantidadNum) {
        throw new AppError(`Stock insuficiente. Solo hay ${variante.stock} unidades disponibles`, 400);
      }
    } else {
      const producto = await prisma.productos.findUnique({ where: { id: item.producto_id } });
      if (producto && producto.stock < cantidadNum) {
        throw new AppError(`Stock insuficiente. Solo hay ${producto.stock} unidades disponibles`, 400);
      }
    }

    await prisma.detalle_carrito.update({
      where: { id: itemId },
      data:  { cantidad: cantidadNum },
    });

    const { itemsFormato, total } = await getCarritoFormateado(item.carrito_id);
    res.json({ message: '✅ Carrito actualizado', items: itemsFormato, total });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/clientes/carrito/:itemId
 * Elimina un item del carrito.
 */
export const eliminarItemCarritoCliente = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const itemId    = parseInt(req.params.itemId as string);
    if (isNaN(itemId)) throw new AppError('ID de item inválido', 400);

    const item = await prisma.detalle_carrito.findUnique({
      where:   { id: itemId },
      include: { carritos: true },
    });
    if (!item || item.carritos.cliente_id !== clienteId) {
      throw new AppError('Item no encontrado', 404);
    }

    await prisma.detalle_carrito.delete({ where: { id: itemId } });

    const { itemsFormato, total } = await getCarritoFormateado(item.carrito_id);
    res.json({ message: '✅ Item eliminado del carrito', items: itemsFormato, total });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TIENDA — PEDIDOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/clientes/pedidos
 * Convierte el carrito en un pedido y genera el enlace de envío
 * por WhatsApp o Telegram.
 * Body: metodo_contacto ("whatsapp" | "telegram")
 */
// ═══════════════════════════════════════════════════════════════════════════
//  TIENDA — PEDIDOS  (reemplaza crearPedido en cliente.controller.ts)
// ═══════════════════════════════════════════════════════════════════════════
//
//  INSTRUCCIONES:
//  1. Busca la función crearPedido en src/controllers/cliente.controller.ts
//  2. Reemplázala completa con esta versión
//  3. Asegúrate de que el import de whatsapp.service esté así:
//       import { sendWhatsAppMessage } from '../services/whatsapp.service';
//
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/clientes/pedidos
 * Convierte el carrito en un pedido, envía el resumen directamente al
 * WhatsApp del cliente (usando Meta Cloud API) y genera también el enlace
 * de respaldo por si el envío falla.
 *
 * Body: metodo_contacto ("whatsapp" | "telegram")
 */

export const crearPedido = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);

    // ── Obtener datos del cliente ─────────────────────────────────────────
    const cliente = await prisma.clientes.findUnique({
      where:  { id: clienteId },
      select: {
        nombre:   true,
        apellido: true,
        telefono: true,
        usuarios: { select: { email: true } },
      },
    });
    if (!cliente) throw new AppError('Cliente no encontrado', 404);

    if (!cliente.telefono || cliente.telefono.trim() === '') {
      throw new AppError(
        '⚠️ No tenés un número de teléfono registrado en tu perfil. ' +
        'Actualizá tu perfil antes de realizar un pedido.',
        400,
      );
    }

    // ── Obtener carrito con items ─────────────────────────────────────────
    const carrito = await prisma.carritos.findFirst({
      where: { cliente_id: clienteId },
      include: {
        detalle_carrito: {
          include: {
            productos:          { select: { nombre: true, precio_base: true } },
            variantes_producto: { select: { atributo: true, valor: true, precio_extra: true } },
          },
        },
      },
    });

    if (!carrito || carrito.detalle_carrito.length === 0) {
      throw new AppError('El carrito está vacío', 400);
    }

    // ── Validar stock para cada ítem del carrito ──────────────────────────
    for (const item of carrito.detalle_carrito) {
      if (item.variante_id) {
        const variante = await prisma.variantes_producto.findUnique({
          where: { id: item.variante_id },
        });
        if (!variante || variante.stock < item.cantidad) {
          throw new AppError(
            `Stock insuficiente para "${item.productos.nombre}" (${variante?.atributo}: ${variante?.valor}). Disponible: ${variante?.stock ?? 0}`,
            400,
          );
        }
      } else {
        const producto = await prisma.productos.findUnique({
          where: { id: item.producto_id },
        });
        if (!producto || producto.stock < item.cantidad) {
          throw new AppError(
            `Stock insuficiente para "${item.productos.nombre}". Disponible: ${producto?.stock ?? 0}`,
            400,
          );
        }
      }
    }

    // ── Calcular totales ──────────────────────────────────────────────────
    const subtotal = carrito.detalle_carrito.reduce(
      (sum, item) => sum + item.cantidad * Number(item.precio_unitario),
      0,
    );
    const descuento = 0;
    const impuesto = 0;
    const total     = subtotal - descuento + impuesto;

    // ── Crear pedido en BD ────────────────────────────────────────────────
    const pedido = await prisma.pedidos.create({
      data: {
        cliente_id:      clienteId,
        carrito_id:      carrito.id,
        metodo_contacto: 'whatsapp',
        estado:          'pendiente',
        subtotal,
        descuento,
        total,
      },
    });

    // ── Mover items del carrito a detalle_pedido ──────────────────────────
    for (const item of carrito.detalle_carrito) {
      await prisma.detalle_pedido.create({
        data: {
          pedido_id:      pedido.id,
          producto_id:    item.producto_id,
          variante_id:    item.variante_id,
          cantidad:       item.cantidad,
          precio_momento: item.precio_unitario,
          subtotal:       item.cantidad * Number(item.precio_unitario),
        },
      });
    }

    // ── IMPORTANTE: Crear factura automáticamente ──────────────────────────
    // Generar número de factura único (formato: YYYY-MM-NNNNN)
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const ultimaFactura = await prisma.facturas.findFirst({
      where: {
        numero_factura: {
          startsWith: `${año}-${mes}`,
        },
      },
      orderBy: { numero_factura: 'desc' },
    });
    
    let secuencial = 1;
    if (ultimaFactura) {
      const partes = ultimaFactura.numero_factura.split('-');
      secuencial = (parseInt(partes[2] || '0') || 0) + 1;
    }
    const numeroFactura = `${año}-${mes}-${String(secuencial).padStart(5, '0')}`;

    // Crear factura vinculada al pedido
    const factura = await prisma.facturas.create({
      data: {
        numero_factura: numeroFactura,
        cliente_id:     clienteId,
        pedido_id:      pedido.id,
        fecha_emision:  new Date(),
        subtotal,
        descuento,
        impuesto,
        total,
        estado:         'pendiente', // Pendiente de confirmación
        metodo_pago:    'efectivo',
        notas:          'Pedido de tienda - En espera de confirmación',
      },
    });

    // ── Crear detalle de factura (una línea por cada producto) ────────────
    for (const item of carrito.detalle_carrito) {
      const descripcion = item.variantes_producto
        ? `${item.productos.nombre} (${item.variantes_producto.atributo}: ${item.variantes_producto.valor})`
        : item.productos.nombre;

      await prisma.detalle_factura.create({
        data: {
          factura_id:      factura.id,
          descripcion,
          cantidad:        item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal:        item.cantidad * Number(item.precio_unitario),
        },
      });
    }

    // ── Descontar stock ───────────────────────────────────────────────────
    for (const item of carrito.detalle_carrito) {
      if (item.variante_id) {
        await prisma.variantes_producto.update({
          where: { id: item.variante_id },
          data: { stock: { decrement: item.cantidad } },
        });
      } else {
        await prisma.productos.update({
          where: { id: item.producto_id },
          data: { stock: { decrement: item.cantidad } },
        });
      }
    }

    // ── Vaciar carrito ────────────────────────────────────────────────────
    await prisma.detalle_carrito.deleteMany({ where: { carrito_id: carrito.id } });

    // ── Obtener citas activas del cliente ────────────────────────────────
    const citasActivas = await prisma.citas.findMany({
      where: {
        mascotas: { dueno_principal_id: clienteId },
        estado:   { in: ['agendada', 'confirmada'] },
      },
      include: {
        mascotas:  { select: { nombre: true } },
        servicios: { select: { nombre: true, precio_base: true } },
      },
      orderBy: { fecha_hora_inicio: 'asc' },
      take: 5,
    });

    // ── Construir mensaje WhatsApp ────────────────────────────────────────
    const nombreCliente = `${cliente.nombre} ${cliente.apellido}`.trim();
    const fechaHoy      = new Date().toLocaleDateString('es-BO', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    let mensaje = `🐾 *Pedido Pet Spa — #${pedido.id}*\n`;
    mensaje    += `📄 Factura: ${numeroFactura}\n`;
    mensaje    += `📅 ${fechaHoy}\n`;
    mensaje    += `👤 ${nombreCliente}\n`;
    if (cliente.usuarios?.email) mensaje += `📧 ${cliente.usuarios.email}\n`;
    mensaje    += `─────────────────────\n`;

    // ── Productos del carrito ─────────────────────────────────────────────
    mensaje += `🛒 *Productos:*\n`;
    for (const item of carrito.detalle_carrito) {
      const variante = item.variantes_producto
        ? ` (${item.variantes_producto.atributo}: ${item.variantes_producto.valor})`
        : '';
      const subtotalItem = item.cantidad * Number(item.precio_unitario);
      mensaje += `• ${item.productos.nombre}${variante}\n`;
      mensaje += `  ${item.cantidad} × Bs ${Number(item.precio_unitario).toFixed(2)} = Bs ${subtotalItem.toFixed(2)}\n`;
    }

    // ── Citas activas (si tiene) ──────────────────────────────────────────
    if (citasActivas.length > 0) {
      mensaje += `\n📅 *Servicios agendados:*\n`;
      for (const cita of citasActivas) {
        const fechaCita = new Date(cita.fecha_hora_inicio).toLocaleDateString('es-BO', {
          day: '2-digit', month: 'short', year: 'numeric',
        });
        const horaCita = new Date(cita.fecha_hora_inicio).toLocaleTimeString('es-BO', {
          hour: '2-digit', minute: '2-digit',
        });
        mensaje += `• ${cita.servicios.nombre} — ${cita.mascotas.nombre}\n`;
        mensaje += `  📅 ${fechaCita} ${horaCita} — Bs ${Number(cita.precio_calculado).toFixed(2)}\n`;
      }
    }

    // ── Totales ───────────────────────────────────────────────────────────
    mensaje += `\n─────────────────────\n`;
    if (descuento > 0) {
      mensaje += `Subtotal:  Bs ${subtotal.toFixed(2)}\n`;
      mensaje += `Descuento: -Bs ${descuento.toFixed(2)}\n`;
    }
    mensaje += `✅ *TOTAL: Bs ${total.toFixed(2)}*\n`;
    mensaje += `─────────────────────\n`;
    mensaje += `💳 *Métodos de pago:*\n`;
    mensaje += `• Efectivo en tienda\n`;
    mensaje += `• QR (escaneando en caja)\n`;
    mensaje += `• Transferencia bancaria\n`;
    mensaje += `\n¡Gracias por tu compra! 🐾`;

    // ── Enviar WhatsApp ──────────────────────────────────────────────────
    console.log(`\n📤 Enviando WhatsApp a cliente: ${cliente.telefono}`);
    const resultado = await sendWhatsAppMessage(cliente.telefono, mensaje);

    if (resultado.success) {
      console.log(`✅ WhatsApp enviado. MessageID: ${resultado.messageId}`);
    } else {
      console.warn(`⚠️ No se pudo enviar WhatsApp. Error: ${resultado.errorMsg}`);
    }

    const numeroNoExiste = !resultado.success && (
      resultado.errorCode === 131026 ||
      resultado.errorCode === 131047 ||
      (resultado.errorMsg ?? '').includes('131026') ||
      (resultado.errorMsg ?? '').includes('131047')
    );

    // ── Respuesta ─────────────────────────────────────────────────────────
    return res.status(201).json({
      message: resultado.success
        ? '✅ Pedido creado y factura generada. Resumen enviado a tu WhatsApp.'
        : numeroNoExiste
          ? '✅ Pedido creado. Atención: el número registrado no existe en WhatsApp, comunicate con recepción.'
          : '✅ Pedido creado. No se pudo enviar el resumen por WhatsApp, comunicate con recepción.',

      pedido: {
        id:           pedido.id,
        total,
        estado:       pedido.estado,
      },

      factura: {
        id:             factura.id,
        numero_factura: numeroFactura,
        estado:         factura.estado,
      },

      whatsapp: {
        enviado:             resultado.success,
        message_id:          resultado.messageId,
        numero_no_existe_wa: numeroNoExiste,
        error: !resultado.success
          ? (process.env.NODE_ENV !== 'production'
              ? resultado.errorMsg
              : numeroNoExiste
                ? 'El número no existe en WhatsApp.'
                : 'No se pudo entregar el mensaje.')
          : null,
      },
    });

  } catch (error) {
    next(error);
  }
};


/**
 * GET /api/clientes/pedidos
 * Lista todos los pedidos del cliente.
 */
export const getMisPedidos = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);

    const pedidos = await prisma.pedidos.findMany({
      where:   { cliente_id: clienteId },
      include: {
        detalle_pedido: {
          include: {
            productos:          { select: { nombre: true } },
            variantes_producto: { select: { atributo: true, valor: true } },
          },
        },
      },
      orderBy: { creado_en: 'desc' },
    });

    res.json(
      pedidos.map(p => ({
        id:              p.id,
        estado:          p.estado,
        metodo_contacto: p.metodo_contacto,
        subtotal:        Number(p.subtotal),
        descuento:       Number(p.descuento),
        total:           Number(p.total),
        creado_en:       p.creado_en,
        items:           p.detalle_pedido.map(d => ({
          producto:  d.productos.nombre,
          variante:  d.variantes_producto
            ? `${d.variantes_producto.atributo}: ${d.variantes_producto.valor}`
            : null,
          cantidad:  d.cantidad,
          precio:    Number(d.precio_momento),
          subtotal:  Number(d.subtotal),
        })),
      })),
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  FACTURAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/clientes/facturas
 * Lista todas las facturas del cliente.
 */
export const getMisFacturas = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);

    const facturas = await prisma.facturas.findMany({
      where: { cliente_id: clienteId },
      include: {
        detalle_factura: true,
        citas:   { select: { id: true, fecha_hora_inicio: true, servicios: { select: { nombre: true } } } },
        pedidos: { select: { id: true, creado_en: true } },
      },
      orderBy: { fecha_emision: 'desc' },
    });

    res.json(
      facturas.map(f => ({
        id:              f.id,
        numero_factura:  f.numero_factura,
        fecha_emision:   f.fecha_emision,
        subtotal:        Number(f.subtotal),
        descuento:       Number(f.descuento),
        impuesto:        Number(f.impuesto),
        total:           Number(f.total),
        estado:          f.estado,
        metodo_pago:     f.metodo_pago,
        origen:          f.cita_id
          ? `Cita #${f.cita_id} — ${f.citas?.servicios?.nombre ?? ''}`
          : f.pedido_id
            ? `Pedido #${f.pedido_id}`
            : '—',
        notas:           f.notas,
        items:           f.detalle_factura.map(d => ({
          descripcion:     d.descripcion,
          cantidad:        d.cantidad,
          precio_unitario: Number(d.precio_unitario),
          subtotal:        Number(d.subtotal),
        })),
      })),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clientes/facturas/:id/pdf
 * Genera y descarga el PDF de una factura del cliente.
 */
export const descargarFacturaPDF = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const facturaId = parseInt(req.params.id as string);
    if (isNaN(facturaId)) throw new AppError('ID de factura inválido', 400);

    const factura = await prisma.facturas.findUnique({
      where: { id: facturaId },
      include: {
        detalle_factura: true,
        clientes: {
          select: { nombre: true, apellido: true, ci: true, telefono: true },
        },
        citas: {
          select: {
            fecha_hora_inicio: true,
            servicios: { select: { nombre: true } },
          },
        },
        pedidos: { select: { creado_en: true } },
      },
    });

    if (!factura || factura.cliente_id !== clienteId) {
      throw new AppError('Factura no encontrada o no tienes permiso para verla', 404);
    }

    // Convertir Decimal a number para evitar errores con toFixed
    const subtotalNum  = Number(factura.subtotal);
    const descuentoNum = Number(factura.descuento);
    const impuestoNum  = Number(factura.impuesto);
    const totalNum     = Number(factura.total);

    // Generar PDF con pdfkit
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc         = new PDFDocument({ margin: 40, size: 'A4' });

    const filename = `factura_${factura.numero_factura}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // ── Encabezado ────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').text('🐾 Pet Spa', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Servicios de Grooming & Tienda', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);

    doc.fontSize(16).font('Helvetica-Bold').text(`Factura N° ${factura.numero_factura}`, { align: 'center' });
    doc.moveDown(0.5);

    // ── Datos del cliente ─────────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica');
    doc.text(`Fecha de emisión: ${factura.fecha_emision.toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.text(`Cliente: ${factura.clientes.nombre} ${factura.clientes.apellido}`);
    if (factura.clientes.ci)       doc.text(`CI/NIT: ${factura.clientes.ci}`);
    if (factura.clientes.telefono) doc.text(`Teléfono: ${factura.clientes.telefono}`);

    // Origen
    if (factura.cita_id && factura.citas) {
      doc.text(`Servicio: ${factura.citas.servicios?.nombre ?? 'Grooming'} — ${factura.citas.fecha_hora_inicio?.toLocaleDateString('es-BO') ?? ''}`);
    } else if (factura.pedido_id && factura.pedidos) {
      doc.text(`Pedido #${factura.pedido_id} — ${factura.pedidos.creado_en?.toLocaleDateString('es-BO') ?? ''}`);
    }
    doc.moveDown(0.5);

    // ── Tabla de ítems ────────────────────────────────────────────────────
    const tableTop = doc.y + 5;
    const colDesc  = 40;
    const colCant  = 330;
    const colPUnit = 395;
    const colSub   = 480;

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Descripción',   colDesc, tableTop, { width: 280 });
    doc.text('Cant.',         colCant, tableTop, { width: 55,  align: 'center' });
    doc.text('P. Unitario',   colPUnit, tableTop, { width: 80, align: 'right'  });
    doc.text('Subtotal',      colSub,  tableTop, { width: 75,  align: 'right'  });

    let y = tableTop + 14;
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#cccccc').stroke();
    y += 6;
    doc.font('Helvetica').fontSize(9);

    for (const item of factura.detalle_factura) {
      if (y + 16 > 760) {
        doc.addPage();
        y = 40;
      }
      const desc = item.descripcion.length > 45
        ? item.descripcion.substring(0, 45) + '…'
        : item.descripcion;

      doc.text(desc,                                       colDesc, y, { width: 280 });
      doc.text(String(item.cantidad),                      colCant, y, { width: 55,  align: 'center' });
      doc.text(`Bs ${Number(item.precio_unitario).toFixed(2)}`, colPUnit, y, { width: 80, align: 'right' });
      doc.text(`Bs ${Number(item.subtotal).toFixed(2)}`,   colSub,  y, { width: 75,  align: 'right'  });
      y += 16;
    }

    // ── Totales ───────────────────────────────────────────────────────────
    y += 10;
    doc.moveTo(380, y).lineTo(555, y).strokeColor('#000000').stroke();
    y += 6;

    doc.font('Helvetica').fontSize(9);
    doc.text(`Subtotal:`,          380, y, { width: 100 });
    doc.text(`Bs ${subtotalNum.toFixed(2)}`,  480, y, { width: 75, align: 'right' });
    y += 14;

    if (descuentoNum > 0) {
      doc.text(`Descuento:`,       380, y, { width: 100 });
      doc.text(`-Bs ${descuentoNum.toFixed(2)}`, 480, y, { width: 75, align: 'right' });
      y += 14;
    }
    if (impuestoNum > 0) {
      doc.text(`Impuesto:`,        380, y, { width: 100 });
      doc.text(`Bs ${impuestoNum.toFixed(2)}`,   480, y, { width: 75, align: 'right' });
      y += 14;
    }

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(`TOTAL:`,             380, y, { width: 100 });
    doc.text(`Bs ${totalNum.toFixed(2)}`, 480, y, { width: 75, align: 'right' });
    y += 20;

    // ── Estado y pago ─────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(9);
    doc.text(`Estado: ${factura.estado.toUpperCase()}`,    40, y);
    doc.text(`Método de pago: ${factura.metodo_pago}`,     40, y + 14);

    if (factura.notas) {
      doc.moveDown(1);
      doc.text(`Notas: ${factura.notas}`, 40, doc.y);
    }

    // ── Pie de página ─────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#888888').text('Gracias por confiar en Pet Spa 🐾', { align: 'center' });

    doc.end();
  } catch (error) {
    next(error);
  }
};

export const getFacturaById = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const clienteId = await getClienteIdFromUser(req.user!.id);
    const facturaId = parseInt(req.params.id as string);
    if (isNaN(facturaId)) throw new AppError('ID de factura inválido', 400);

    const factura = await prisma.facturas.findUnique({
      where: { id: facturaId },
      include: {
        detalle_factura: true,
        clientes: { select: { nombre: true, apellido: true, ci: true, telefono: true } },
        citas: { select: { fecha_hora_inicio: true, servicios: { select: { nombre: true } } } },
        pedidos: { select: { creado_en: true } },
      },
    });

    if (!factura || factura.cliente_id !== clienteId) {
      throw new AppError('Factura no encontrada o no tienes permiso para verla', 404);
    }

    res.json({
      id: factura.id,
      numero_factura: factura.numero_factura,
      fecha_emision: factura.fecha_emision,
      subtotal: Number(factura.subtotal),
      descuento: Number(factura.descuento),
      impuesto: Number(factura.impuesto),
      total: Number(factura.total),
      estado: factura.estado,
      metodo_pago: factura.metodo_pago,
      notas: factura.notas,
      origen: factura.cita_id
        ? `Cita #${factura.cita_id} — ${factura.citas?.servicios?.nombre ?? ''}`
        : factura.pedido_id ? `Pedido #${factura.pedido_id}` : '—',
      items: factura.detalle_factura.map(d => ({
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio_unitario: Number(d.precio_unitario),
        subtotal: Number(d.subtotal),
      })),
    });
  } catch (error) { next(error); }
};