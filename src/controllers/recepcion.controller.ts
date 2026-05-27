// ─── src/controllers/recepcion.controller.ts ─────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';
import { AvailabilityService } from '../services/availability.service';
import { hashPassword } from '../utils/bcrypt';

const availabilityService = new AvailabilityService();

interface RequestWithUser extends Request {
  user?: { id: number; email: string; rol: string; jti: string };
}

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

/** Formatea un Date como "HH:MM" usando las horas/minutos locales del objeto. */
function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Convierte un string TIME ("HH:mm:ss" o "HH:mm") a "HH:MM" en formato 24h */
function formatTimeString(time: string): string {
  return time.substring(0, 5);
}

/** Parsea un string TIME ("HH:mm:ss" o "HH:mm") en horas y minutos */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m };
}

/** Mapeo nombre de día → número ISO (1=lunes … 7=domingo). */
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

function extractTime(value: Date | string): { hours: number; minutes: number } {
  if (value instanceof Date) {
    return { hours: value.getUTCHours(), minutes: value.getUTCMinutes() };
  }
  const [h, m] = String(value).split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

function formatTime(value: Date | string): string {
  const { hours, minutes } = extractTime(value);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════════════════
// HELPER: multiplicador de duración según mascota
// ══════════════════════════════════════════════════════════════
function calcularMultiplicadorDuracion(mascota: {
  peso_kg:      number | null;
  temperamento: string | null;
  especie:      string;
}): number {
  let multiplicador = 1.0;
  const peso = mascota.peso_kg ?? 0;
  if      (peso < 5)  multiplicador = 1.00;
  else if (peso < 20) multiplicador = 1.10;
  else if (peso < 45) multiplicador = 1.15;
  else                multiplicador = 1.30;

  const temp = (mascota.temperamento ?? '').toLowerCase();
  if (['agresivo', 'nervioso', 'ansioso'].includes(temp)) multiplicador += 0.20;

  return multiplicador;
}

// ══════════════════════════════════════════════════════════════
// HELPER CENTRAL: Validar disponibilidad para una cita
//
//  Verifica (en orden):
//   1. Bloqueos globales del spa (feriado / mantenimiento)
//   2. Bloqueos individuales del groomer (vacaciones / ausencia)
//   3. Día y horario del groomer
//      · Si tiene disponibilidad_groomer configurada → respeta SOLO esos días/horas
//      · Si no tiene nada configurado → cae en el horario general del spa
//
//  Lanza AppError con mensaje descriptivo si algo no pasa.
// ══════════════════════════════════════════════════════════════
async function validarDisponibilidadParaCita({
  groomer_id,
  fechaHoraInicio,
  fechaHoraFin,
}: {
  groomer_id:      number;
  fechaHoraInicio: Date;
  fechaHoraFin:    Date;
}): Promise<void> {

  // Nombre del groomer para mensajes de error
  const groomer = await prisma.groomers.findUnique({
    where:  { id: groomer_id },
    select: { nombre: true, apellido: true },
  });
  const groomerNombre = groomer
    ? `${groomer.nombre} ${groomer.apellido}`
    : `Groomer #${groomer_id}`;

  // ── 1. Bloqueos GLOBALES del spa ─────────────────────────────────────────
  const bloqueosGlobales = await prisma.bloqueos_calendario.findMany({
    where: {
      groomer_id: null,
      fecha_inicio: { lte: fechaHoraFin   },
      fecha_fin:    { gte: fechaHoraInicio },
    },
  });

  if (bloqueosGlobales.length > 0) {
    const b     = bloqueosGlobales[0];
    const label = tipoBloqueoLabel[b.tipo_bloqueo] ?? b.tipo_bloqueo;
    const desde = new Date(b.fecha_inicio).toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
    const hasta = new Date(b.fecha_fin).toLocaleDateString('es-BO',   { day: '2-digit', month: 'long', year: 'numeric' });
    throw new AppError(
      `⛔ No se pueden agendar citas: ${label}` +
      `${b.descripcion ? ` — "${b.descripcion}"` : ''}. ` +
      `Período bloqueado: ${desde} al ${hasta}.`,
      409,
    );
  }

  // ── 2. Bloqueos ESPECÍFICOS del groomer ──────────────────────────────────
  const bloqueosGroomer = await prisma.bloqueos_calendario.findMany({
    where: {
      groomer_id,
      fecha_inicio: { lte: fechaHoraFin   },
      fecha_fin:    { gte: fechaHoraInicio },
    },
  });

  if (bloqueosGroomer.length > 0) {
    const b     = bloqueosGroomer[0];
    const label = tipoBloqueoLabel[b.tipo_bloqueo] ?? b.tipo_bloqueo;
    const desde = new Date(b.fecha_inicio).toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
    const hasta = new Date(b.fecha_fin).toLocaleDateString('es-BO',   { day: '2-digit', month: 'long', year: 'numeric' });
    throw new AppError(
      `⛔ ${groomerNombre} no está disponible: ${label}` +
      `${b.descripcion ? ` — "${b.descripcion}"` : ''}. ` +
      `Período: ${desde} al ${hasta}.`,
      409,
    );
  }

  // ── 3. Verificar día y horario del groomer ────────────────────────────────
  const diaSemanaJS  = fechaHoraInicio.getDay();           // 0 = domingo
  const diaSemana    = diaSemanaJS === 0 ? 7 : diaSemanaJS; // 1=lun … 7=dom
  const diaNombre    = diasNombresES[diaSemana];

  // ¿Tiene el groomer ALGÚN horario personal configurado?
  const totalDiasPersonales = await prisma.disponibilidad_groomer.count({
    where: { groomer_id },
  });

  if (totalDiasPersonales === 0) {
    // ── Sin horario personal → usar configuración general del spa ──────────
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
        `⛔ El día ${diaNombre} no es laborable en el spa. ` +
        `Días disponibles: ${diasLab.join(', ')}.`,
        400,
      );
    }

    // Verificar horario general
    const [hIni, mIni] = config.horario_inicio.split(':').map(Number);
    const [hFin, mFin] = config.horario_fin.split(':').map(Number);
    const minIniSPA  = hIni * 60 + mIni;
    const minFinSPA  = hFin * 60 + mFin;
    const minIniCita = fechaHoraInicio.getHours() * 60 + fechaHoraInicio.getMinutes();
    const minFinCita = fechaHoraFin.getHours()    * 60 + fechaHoraFin.getMinutes();

    if (minIniCita < minIniSPA || minFinCita > minFinSPA) {
      throw new AppError(
        `⛔ El horario solicitado (${toHHMM(fechaHoraInicio)}–${toHHMM(fechaHoraFin)}) ` +
        `está fuera del horario del spa ` +
        `(${config.horario_inicio}–${config.horario_fin}).`,
        400,
      );
    }

  } else {
    const dispDia = await prisma.disponibilidad_groomer.findFirst({
      where: { groomer_id, dia_semana: diaSemana },
    });

    if (!dispDia) {
      throw new AppError(
        `⛔ ${groomerNombre} no trabaja los ${diaNombre}. ` +
        `Consulta su disponibilidad para elegir un día en que sí atiende.`,
        400,
      );
    }

    // ✅ Usa extractTime() — funciona tanto si Prisma devuelve Date como string
    const ini = extractTime(dispDia.hora_inicio as unknown as Date | string);
    const fin = extractTime(dispDia.hora_fin    as unknown as Date | string);

    const minIniGroomer = ini.hours * 60 + ini.minutes;
    const minFinGroomer = fin.hours * 60 + fin.minutes;
    const minIniCita    = fechaHoraInicio.getHours() * 60 + fechaHoraInicio.getMinutes();
    const minFinCita    = fechaHoraFin.getHours()    * 60 + fechaHoraFin.getMinutes();

    if (minIniCita < minIniGroomer || minFinCita > minFinGroomer) {
      throw new AppError(
        `⛔ ${groomerNombre} trabaja los ${diaNombre} de ` +
        `${formatTime(dispDia.hora_inicio as unknown as Date | string)} a ` +
        `${formatTime(dispDia.hora_fin    as unknown as Date | string)}. ` +
        `La cita de ${toHHMM(fechaHoraInicio)} a ${toHHMM(fechaHoraFin)} ` +
        `está fuera de su horario de trabajo.`,
        400,
      );
    }
  }
}


// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
export const getDashboard = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const citasHoy = await prisma.citas.findMany({
      where: {
        fecha_hora_inicio: { gte: hoy, lt: manana },
        estado: { not: 'cancelada' },
      },
      include: { mascotas: true, servicios: true, groomers: true },
      orderBy: { fecha_hora_inicio: 'asc' },
    });

    const totalClientes = await prisma.clientes.count();

    const ultimosClientes = await prisma.clientes.findMany({
      take: 5,
      orderBy: { creado_en: 'desc' },
      include: { usuarios: true },
    });

    res.json({
      citasHoy: citasHoy.map(c => ({
        id:       c.id,
        hora:     c.fecha_hora_inicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mascota:  c.mascotas.nombre,
        servicio: c.servicios.nombre,
        groomer:  `${c.groomers.nombre} ${c.groomers.apellido}`,
        estado:   c.estado,
      })),
      totalClientes,
      ultimosClientes: ultimosClientes.map(c => ({
        nombre:   c.nombre,
        apellido: c.apellido,
        email:    c.usuarios.email,
        telefono: c.telefono,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// CITAS DE HOY
// ══════════════════════════════════════════════════════════════
export const getCitasHoy = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const citas = await prisma.citas.findMany({
      where: {
        fecha_hora_inicio: { gte: hoy, lt: manana },
        estado: { not: 'cancelada' },
      },
      include: { mascotas: true, servicios: true, groomers: true },
      orderBy: { fecha_hora_inicio: 'asc' },
    });

    res.json(citas.map(c => ({
      id:       c.id,
      hora:     c.fecha_hora_inicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mascota:  c.mascotas.nombre,
      servicio: c.servicios.nombre,
      groomer:  `${c.groomers.nombre} ${c.groomers.apellido}`,
      estado:   c.estado,
    })));
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// CITAS ACTIVAS (próximos 30 días — para el select de cancelar)
// ══════════════════════════════════════════════════════════════
export const getCitasActivas = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const ahora   = new Date();
    const treinta = new Date();
    treinta.setDate(treinta.getDate() + 30);

    const citas = await prisma.citas.findMany({
      where: {
        fecha_hora_inicio: { gte: ahora, lt: treinta },
        estado: { in: ['agendada', 'confirmada'] },
      },
      include: { mascotas: true, servicios: true, groomers: true },
      orderBy: { fecha_hora_inicio: 'asc' },
      take: 100,
    });

    res.json(citas.map(c => ({
      id: c.id,
      fechaHora: c.fecha_hora_inicio.toLocaleString('es-BO', {
        weekday: 'short', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }),
      hora:     c.fecha_hora_inicio.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
      fecha:    c.fecha_hora_inicio.toLocaleDateString('es-BO'),
      mascota:  c.mascotas.nombre,
      servicio: c.servicios.nombre,
      groomer:  `${c.groomers.nombre} ${c.groomers.apellido}`,
      estado:   c.estado,
    })));
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// CANCELAR CITA
// ══════════════════════════════════════════════════════════════
export const cancelarCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({ where: { id: citaId } });
    if (!cita) throw new AppError('Cita no encontrada', 404);

    if (!['agendada', 'confirmada'].includes(cita.estado)) {
      throw new AppError(`No se puede cancelar una cita en estado "${cita.estado}"`, 400);
    }

    const updateData: any = { estado: 'cancelada' };
    const motivo = req.body?.motivo;
    if (motivo) {
      // updateData.motivo_cancelacion = motivo; // descomentar si el campo existe
    }

    const updated = await prisma.citas.update({ where: { id: citaId }, data: updateData });
    res.json({ message: 'Cita cancelada correctamente', cita: updated });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// CONFIRMAR CITA
// ══════════════════════════════════════════════════════════════
export const confirmarCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({ where: { id: citaId } });
    if (!cita) throw new AppError('Cita no encontrada', 404);

    if (cita.estado !== 'agendada') {
      throw new AppError(`No se puede confirmar una cita en estado ${cita.estado}`, 400);
    }

    const updated = await prisma.citas.update({
      where: { id: citaId },
      data:  { estado: 'confirmada' },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════
export const getClientes = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const where: any = {};
    if (search) {
      where.OR = [
        { nombre:   { contains: search } },
        { apellido: { contains: search } },
        { ci:       { contains: search } },
        { usuarios: { email: { contains: search } } },
      ];
    }
    const clientes = await prisma.clientes.findMany({
      where,
      include:  { usuarios: true },
      orderBy:  { creado_en: 'desc' },
      take: 50,
    });
    res.json(clientes.map(c => ({
      id:        c.id,
      nombre:    c.nombre,
      apellido:  c.apellido,
      email:     c.usuarios.email,
      telefono:  c.telefono,
      ci:        c.ci,
      direccion: c.direccion,
    })));
  } catch (error) {
    next(error);
  }
};

export const crearCliente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nombre, apellido, email, password, ci, telefono, direccion } = req.body;

    if (!nombre || !apellido || !email || !password || !ci) {
      throw new AppError('Faltan campos obligatorios: nombre, apellido, email, password, ci', 400);
    }

    const existeEmail = await prisma.usuarios.findUnique({ where: { email } });
    if (existeEmail) throw new AppError('El email ya está registrado', 409);

    const existeCI = await prisma.clientes.findUnique({ where: { ci } });
    if (existeCI) throw new AppError('La cédula ya está registrada', 409);

    const rolCliente = await prisma.roles.findUnique({ where: { nombre: 'cliente' } });
    if (!rolCliente) throw new AppError('Rol cliente no configurado en la BD', 500);

    const hash = await hashPassword(password);

    const usuario = await prisma.usuarios.create({
      data: {
        email,
        password_hash:    hash,
        email_verificado: false,
        rol_id:           rolCliente.id,
        estado_activo:    true,
      },
    });

    const cliente = await prisma.clientes.create({
      data: {
        usuario_id: usuario.id,
        nombre,
        apellido,
        ci,
        telefono:  telefono  || null,
        direccion: direccion || null,
      },
    });

    await prisma.audit_log.create({
      data: {
        accion:         'CREATE',
        tabla:          'clientes',
        registro_id:    usuario.id,
        valores_nuevos: JSON.stringify({ email, nombre, apellido, ci }),
      },
    }).catch(console.error);

    res.status(201).json({
      message:   `Cliente ${nombre} ${apellido} registrado exitosamente`,
      clienteId: cliente.id,
      usuarioId: usuario.id,
    });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// SERVICIOS
// ══════════════════════════════════════════════════════════════
export const getServicios = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const servicios = await prisma.servicios.findMany({
      where:   { estado_activo: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(servicios.map(s => ({
      id:          s.id,
      nombre:      s.nombre,
      duracion:    s.duracion_base_minutos,
      precio_base: s.precio_base,
    })));
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GROOMERS
// ══════════════════════════════════════════════════════════════
export const getGroomers = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const groomers = await prisma.groomers.findMany({
      where:  { estado_activo: true },
      select: { id: true, nombre: true, apellido: true, especialidad: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(groomers);
  } catch (error) {
    next(error);
  }
};

export const getGroomersList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groomers = await prisma.groomers.findMany({
      where:  { estado_activo: true },
      select: { id: true, nombre: true, apellido: true },
    });
    res.json(groomers);
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// MASCOTAS
// ══════════════════════════════════════════════════════════════
export const getAllMascotas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mascotas = await prisma.mascotas.findMany({
      include: {
        clientes: { select: { id: true, nombre: true, apellido: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(mascotas.map(m => ({
      id:                 m.id,
      nombre:             m.nombre,
      especie:            m.especie,
      dueno_principal_id: m.dueno_principal_id,
      dueno:              `${m.clientes.nombre} ${m.clientes.apellido}`,
      peso_kg:            m.peso_kg,
      temperamento:       m.temperamento,
    })));
  } catch (error) {
    next(error);
  }
};

export const getMascotaById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);
    const mascota = await prisma.mascotas.findUnique({
      where:   { id },
      include: { clientes: true },
    });
    if (!mascota) throw new AppError('Mascota no encontrada', 404);
    res.json(mascota);
  } catch (error) {
    next(error);
  }
};

export const crearMascota = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      cliente_id, nombre, especie, raza, fecha_nacimiento,
      peso_kg, temperamento, alergias, restricciones_medicas, notas_adicionales,
    } = req.body;

    if (!cliente_id || !nombre || !especie) {
      throw new AppError('Faltan campos obligatorios: cliente_id, nombre, especie', 400);
    }

    const cliente = await prisma.clientes.findUnique({ where: { id: Number(cliente_id) } });
    if (!cliente) throw new AppError('Cliente no encontrado', 404);

    const nuevaMascota = await prisma.mascotas.create({
      data: {
        dueno_principal_id:    Number(cliente_id),
        nombre,
        especie,
        raza:                  raza || null,
        fecha_nacimiento:      fecha_nacimiento ? new Date(fecha_nacimiento) : null,
        peso_kg:               peso_kg ? parseFloat(peso_kg) : null,
        temperamento:          temperamento || null,
        alergias:              alergias || null,
        restricciones_medicas: restricciones_medicas || null,
        notas_adicionales:     notas_adicionales || null,
      },
    });

    await prisma.mascota_dueno.create({
      data: {
        mascota_id:   nuevaMascota.id,
        cliente_id:   Number(cliente_id),
        es_principal: true,
      },
    });

    const p = peso_kg ? parseFloat(peso_kg) : 0;
    const tamanioEstimado = p < 5 ? 'pequeño' : p < 20 ? 'mediano' : p < 45 ? 'grande' : 'gigante';

    res.status(201).json({
      message:          `Mascota ${nombre} registrada exitosamente`,
      mascota:          nuevaMascota,
      tamanio_estimado: tamanioEstimado,
    });
  } catch (error) {
    next(error);
  }
};

export const updateMascota = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const {
      nombre, especie, raza, fecha_nacimiento, peso_kg,
      temperamento, alergias, restricciones_medicas, notas_adicionales, foto_url,
    } = req.body;

    const existe = await prisma.mascotas.findUnique({ where: { id } });
    if (!existe) throw new AppError('Mascota no encontrada', 404);

    const updated = await prisma.mascotas.update({
      where: { id },
      data: {
        nombre,
        especie,
        raza:                  raza || null,
        fecha_nacimiento:      fecha_nacimiento ? new Date(fecha_nacimiento) : null,
        peso_kg:               peso_kg ? parseFloat(peso_kg) : null,
        temperamento:          temperamento || null,
        alergias:              alergias || null,
        restricciones_medicas: restricciones_medicas || null,
        notas_adicionales:     notas_adicionales || null,
        foto_url:              foto_url || null,
      },
    });
    res.json({ message: 'Mascota actualizada', mascota: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteMascota = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new AppError('ID inválido', 400);

    const citas = await prisma.citas.count({ where: { mascota_id: id } });
    if (citas > 0) {
      throw new AppError('No se puede eliminar la mascota porque tiene citas registradas', 400);
    }

    await prisma.mascota_dueno.deleteMany({ where: { mascota_id: id } });
    await prisma.mascotas.delete({ where: { id } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// SLOTS DISPONIBLES
// ══════════════════════════════════════════════════════════════
export const getAvailableSlots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fecha, servicio_id, groomer_id } = req.query;
    if (!fecha || !servicio_id) throw new AppError('fecha y servicio_id son requeridos', 400);

    const fechaObj     = new Date(fecha as string);
    const diaSemanaNum = fechaObj.getDay();
    const diaSemana    = diaSemanaNum === 0 ? 7 : diaSemanaNum;

    const config      = await availabilityService.getGeneralConfig();
    const diasNumeros = config.dias_laborales.map((d: string) => diaNombreANumero[d.toLowerCase()]);
    if (!diasNumeros.includes(diaSemana)) {
      return res.json({ slots: [], message: 'Día no laborable' });
    }

    const bloqueosGlobales = await prisma.bloqueos_calendario.findMany({
      where: {
        groomer_id:   null,
        fecha_inicio: { lte: fechaObj },
        fecha_fin:    { gte: fechaObj },
      },
    });
    if (bloqueosGlobales.length > 0) {
      const b = bloqueosGlobales[0];
      return res.json({
        slots:   [],
        message: `Día bloqueado: ${tipoBloqueoLabel[b.tipo_bloqueo] ?? b.tipo_bloqueo}` +
                 `${b.descripcion ? ` — ${b.descripcion}` : ''}`,
      });
    }

    const servicio = await prisma.servicios.findUnique({ where: { id: Number(servicio_id) } });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);
    const duracionMin = servicio.duracion_base_minutos;

    let groomerIds: number[] = [];
    if (groomer_id) {
      groomerIds = [Number(groomer_id)];
    } else {
      const groomers = await prisma.groomers.findMany({ where: { estado_activo: true }, select: { id: true } });
      groomerIds = groomers.map(g => g.id);
    }

    const allSlots = [];

    for (const gid of groomerIds) {
      const bloqueosGroomer = await prisma.bloqueos_calendario.findMany({
        where: {
          groomer_id:   gid,
          fecha_inicio: { lte: fechaObj },
          fecha_fin:    { gte: fechaObj },
        },
      });
      if (bloqueosGroomer.length > 0) continue;

      const disponibilidadPersonal = await availabilityService.getGroomerAvailability(gid);
      const personalDia = disponibilidadPersonal.find((d: any) => d.dia_semana === diaSemana);

      const totalDiasPersonales = await prisma.disponibilidad_groomer.count({ where: { groomer_id: gid } });
      if (totalDiasPersonales > 0 && !personalDia) continue;

      // Determinar hora de inicio y fin (en minutos)
      let hIni: number, mIni: number, hFin: number, mFin: number;

      if (personalDia) {
        const ini = extractTime(personalDia.hora_inicio as unknown as Date | string);
        const fin = extractTime(personalDia.hora_fin    as unknown as Date | string);
        hIni = ini.hours;
        mIni = ini.minutes;
        hFin = fin.hours;
        mFin = fin.minutes;
      } else {
        [hIni, mIni] = config.horario_inicio.split(':').map(Number);
        [hFin, mFin] = config.horario_fin.split(':').map(Number);
      }

      const startOfDay = new Date(fechaObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

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

      while (current.getTime() + duracionMin * 60_000 <= end.getTime()) {
        const slotStart = new Date(current);
        const slotEnd   = new Date(current.getTime() + duracionMin * 60_000);

        const conflicto = citasExistentes.some(c => {
          const cStart = new Date(c.fecha_hora_inicio);
          const cEnd   = new Date(cStart.getTime() + c.duracion_estimada_min * 60_000);
          return slotStart < cEnd && slotEnd > cStart;
        });

        if (!conflicto) {
          allSlots.push({ groomer_id: gid, inicio: slotStart.toISOString(), fin: slotEnd.toISOString() });
        }
        current = new Date(current.getTime() + 30 * 60_000);
      }
    }

    res.json({ slots: allSlots });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// CREAR CITA  ← CON VALIDACIÓN COMPLETA DE DISPONIBILIDAD
// ══════════════════════════════════════════════════════════════
export const crearCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { mascota_id, servicio_id, groomer_id, fecha, hora, notas } = req.body;
    const user = req.user!;

    if (!mascota_id || !servicio_id || !groomer_id || !fecha || !hora) {
      throw new AppError('Faltan campos: mascota_id, servicio_id, groomer_id, fecha, hora', 400);
    }

    const horaLimpia       = String(hora).substring(0, 5);
    const fechaHoraStr     = `${fecha}T${horaLimpia}:00`;
    const fechaHoraInicio  = new Date(fechaHoraStr);

    if (isNaN(fechaHoraInicio.getTime())) {
      throw new AppError(`Fecha u hora inválida: fecha="${fecha}", hora="${hora}"`, 400);
    }
    if (fechaHoraInicio < new Date()) {
      throw new AppError('No se pueden crear citas en el pasado', 400);
    }

    const mascota  = await prisma.mascotas.findUnique({ where: { id: Number(mascota_id) } });
    if (!mascota)  throw new AppError('Mascota no encontrada', 404);

    const servicio = await prisma.servicios.findUnique({ where: { id: Number(servicio_id) } });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);

    const groomer  = await prisma.groomers.findUnique({ where: { id: Number(groomer_id) } });
    if (!groomer)  throw new AppError('Groomer no encontrado', 404);

    const multiplicador    = calcularMultiplicadorDuracion({
      peso_kg:      (mascota as any).peso_kg,
      temperamento: (mascota as any).temperamento,
      especie:      mascota.especie,
    });
    const duracionAjustada = Math.ceil(servicio.duracion_base_minutos * multiplicador);
    const fechaHoraFin     = new Date(fechaHoraInicio.getTime() + duracionAjustada * 60_000);

    // ── VALIDACIÓN COMPLETA: bloqueos + horario del groomer ──────────────────
    await validarDisponibilidadParaCita({
      groomer_id:      Number(groomer_id),
      fechaHoraInicio,
      fechaHoraFin,
    });

    // ── Conflicto de agenda del groomer ─────────────────────────────────────
    const conflicto = await prisma.citas.findFirst({
      where: {
        groomer_id: Number(groomer_id),
        estado:     { notIn: ['cancelada', 'no_asistio'] },
        OR: [{ fecha_hora_inicio: { lt: fechaHoraFin }, fecha_hora_fin: { gt: fechaHoraInicio } }],
      },
    });
    if (conflicto) {
      throw new AppError(
        `⛔ ${groomer.nombre} ya tiene una cita agendada de ` +
        `${toHHMM(new Date(conflicto.fecha_hora_inicio))} a ` +
        `${toHHMM(new Date(conflicto.fecha_hora_fin))}. ` +
        `Elige otro horario o groomer.`,
        409,
      );
    }

    // ── Capacidad diaria del spa ─────────────────────────────────────────────
    const config = await availabilityService.getGeneralConfig();
    const startOfDay = new Date(fechaHoraInicio);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
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

    // ── Crear la cita ────────────────────────────────────────────────────────
    const nuevaCita = await prisma.citas.create({
      data: {
        mascota_id:            Number(mascota_id),
        servicio_id:           Number(servicio_id),
        groomer_id:            Number(groomer_id),
        fecha_hora_inicio:     fechaHoraInicio,
        fecha_hora_fin:        fechaHoraFin,
        duracion_estimada_min: duracionAjustada,
        precio_calculado:      servicio.precio_base,
        estado:                'agendada',
        creado_por:            user.id,
        notas:                 notas || null,
      },
      include: { mascotas: true, servicios: true, groomers: true },
    });

    const peso    = (mascota as any).peso_kg ?? 0;
    const tamanio = peso < 5 ? 'pequeño' : peso < 20 ? 'mediano' : peso < 45 ? 'grande' : 'gigante';

    res.status(201).json({
      ...nuevaCita,
      _info: {
        duracion_ajustada_min:  duracionAjustada,
        duracion_base_min:      servicio.duracion_base_minutos,
        multiplicador_aplicado: multiplicador,
        tamanio_mascota:        tamanio,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GET /citas/:id  — leer una cita completa para el modal de edición
// ══════════════════════════════════════════════════════════════
export const getCitaById = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({
      where:   { id: citaId },
      include: { mascotas: true, servicios: true, groomers: true },
    });
    if (!cita) throw new AppError('Cita no encontrada', 404);

    res.json({
      id:          cita.id,
      mascota_id:  cita.mascota_id,
      servicio_id: cita.servicio_id,
      groomer_id:  cita.groomer_id,
      fecha:       cita.fecha_hora_inicio.toISOString().split('T')[0],
      hora:        cita.fecha_hora_inicio.toISOString().split('T')[1].slice(0, 5),
      notas:       cita.notas,
      estado:      cita.estado,
      duracion_estimada_min: cita.duracion_estimada_min,
      precio_calculado:      cita.precio_calculado,
      mascota:  cita.mascotas.nombre,
      servicio: cita.servicios.nombre,
      groomer:  `${cita.groomers.nombre} ${cita.groomers.apellido}`,
    });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// PATCH /citas/:id  — editar cita existente  ← CON VALIDACIÓN COMPLETA
// ══════════════════════════════════════════════════════════════
export const updateCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({ where: { id: citaId } });
    if (!cita) throw new AppError('Cita no encontrada', 404);

    if (!['agendada', 'confirmada'].includes(cita.estado)) {
      throw new AppError(
        `No se puede editar una cita en estado "${cita.estado}". Solo agendada o confirmada.`,
        400,
      );
    }

    const {
      mascota_id  = cita.mascota_id,
      servicio_id = cita.servicio_id,
      groomer_id  = cita.groomer_id,
      fecha,
      hora,
      notas,
    } = req.body;

    let fechaHoraInicio: Date;
    if (fecha && hora) {
      const horaLimpia = String(hora).substring(0, 5);
      fechaHoraInicio  = new Date(`${fecha}T${horaLimpia}:00`);
      if (isNaN(fechaHoraInicio.getTime())) {
        throw new AppError(`Fecha u hora inválida: fecha="${fecha}", hora="${hora}"`, 400);
      }
      if (fechaHoraInicio < new Date()) {
        throw new AppError('No se pueden mover citas al pasado', 400);
      }
    } else {
      fechaHoraInicio = new Date(cita.fecha_hora_inicio);
    }

    const mascota  = await prisma.mascotas.findUnique({ where: { id: Number(mascota_id) } });
    if (!mascota)  throw new AppError('Mascota no encontrada', 404);

    const servicio = await prisma.servicios.findUnique({ where: { id: Number(servicio_id) } });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);

    const groomer  = await prisma.groomers.findUnique({ where: { id: Number(groomer_id) } });
    if (!groomer)  throw new AppError('Groomer no encontrado', 404);

    const multiplicador    = calcularMultiplicadorDuracion({
      peso_kg:      (mascota as any).peso_kg,
      temperamento: (mascota as any).temperamento,
      especie:      mascota.especie,
    });
    const duracionAjustada = Math.ceil(servicio.duracion_base_minutos * multiplicador);
    const fechaHoraFin     = new Date(fechaHoraInicio.getTime() + duracionAjustada * 60_000);

    await validarDisponibilidadParaCita({
      groomer_id:      Number(groomer_id),
      fechaHoraInicio,
      fechaHoraFin,
    });

    const conflicto = await prisma.citas.findFirst({
      where: {
        id:         { not: citaId },
        groomer_id: Number(groomer_id),
        estado:     { notIn: ['cancelada', 'no_asistio'] },
        OR: [{
          fecha_hora_inicio: { lt: fechaHoraFin   },
          fecha_hora_fin:    { gt: fechaHoraInicio },
        }],
      },
    });
    if (conflicto) {
      throw new AppError(
        `⛔ ${groomer.nombre} ya tiene una cita de ` +
        `${toHHMM(new Date(conflicto.fecha_hora_inicio))} a ` +
        `${toHHMM(new Date(conflicto.fecha_hora_fin))} en ese horario.`,
        409,
      );
    }

    const updated = await prisma.citas.update({
      where: { id: citaId },
      data: {
        mascota_id:            Number(mascota_id),
        servicio_id:           Number(servicio_id),
        groomer_id:            Number(groomer_id),
        fecha_hora_inicio:     fechaHoraInicio,
        fecha_hora_fin:        fechaHoraFin,
        duracion_estimada_min: duracionAjustada,
        precio_calculado:      servicio.precio_base,
        notas:                 notas !== undefined ? (notas || null) : cita.notas,
      },
      include: { mascotas: true, servicios: true, groomers: true },
    });

    const peso    = (mascota as any).peso_kg ?? 0;
    const tamanio = peso < 5 ? 'pequeño' : peso < 20 ? 'mediano' : peso < 45 ? 'grande' : 'gigante';

    res.json({
      ...updated,
      _info: {
        duracion_ajustada_min:  duracionAjustada,
        duracion_base_min:      servicio.duracion_base_minutos,
        multiplicador_aplicado: multiplicador,
        tamanio_mascota:        tamanio,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// DELETE /citas/:id  — eliminar permanente
// ══════════════════════════════════════════════════════════════
export const deleteCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({ where: { id: citaId } });
    if (!cita) throw new AppError('Cita no encontrada', 404);

    if (cita.estado === 'completada') {
      throw new AppError(
        'No se pueden eliminar citas completadas. Cancélalas primero si fue un error.',
        400,
      );
    }

    await prisma.citas.delete({ where: { id: citaId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GET /citas/todas
// ══════════════════════════════════════════════════════════════
export const getCitasTodas = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { estado, desde, hasta } = req.query;
    const where: any = {};

    if (estado) where.estado = estado as string;

    if (desde || hasta) {
      where.fecha_hora_inicio = {};
      if (desde) where.fecha_hora_inicio.gte = new Date(`${desde}T00:00:00.000Z`);
      if (hasta) where.fecha_hora_inicio.lte = new Date(`${hasta}T23:59:59.999Z`);
    } else {
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      const en30 = new Date();
      en30.setDate(en30.getDate() + 30);
      where.fecha_hora_inicio = { gte: hace30, lte: en30 };
    }

    const citas = await prisma.citas.findMany({
      where,
      include: { mascotas: true, servicios: true, groomers: true },
      orderBy: { fecha_hora_inicio: 'desc' },
      take: 200,
    });

    res.json(citas.map(c => ({
      id: c.id,
      fechaHora: c.fecha_hora_inicio.toLocaleString('es-BO', {
        weekday: 'short', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }),
      fecha:    c.fecha_hora_inicio.toLocaleDateString('es-BO'),
      hora:     c.fecha_hora_inicio.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
      mascota:  c.mascotas.nombre,
      servicio: c.servicios.nombre,
      groomer:  `${c.groomers.nombre} ${c.groomers.apellido}`,
      estado:   c.estado,
      duracion: c.duracion_estimada_min,
      precio:   c.precio_calculado,
      notas:    c.notas,
    })));
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// GET /citas/calendario?mes=YYYY-MM
// ══════════════════════════════════════════════════════════════

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
 
function terminaEnMedianoche(d: Date): boolean {
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}
 
export const getCitasCalendario = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const mesParam = (req.query.mes as string) ?? '';
    const match    = mesParam.match(/^(\d{4})-(\d{2})$/);
    if (!match) throw new AppError('Parámetro mes inválido. Usa YYYY-MM', 400);
 
    const year  = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
 
    const inicioMes = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const finMes    = new Date(year, month,     1, 0, 0, 0, 0);
 
    const bloqueos = await prisma.bloqueos_calendario.findMany({
      where: {
        fecha_inicio: { lt: finMes    },
        fecha_fin:    { gt: inicioMes },
      },
      select: {
        groomer_id:   true,
        tipo_bloqueo: true,
        fecha_inicio: true,
        fecha_fin:    true,
        descripcion:  true,
      },
    });
 
    const bloqueosPorDia: Record<
      string,
      { tipo: string; descripcion: string | null; es_global: boolean }
    > = {};
 
    for (const b of bloqueos) {
      const esGlobal = b.groomer_id === null;
 
      const cursor = new Date(
        b.fecha_inicio.getFullYear(),
        b.fecha_inicio.getMonth(),
        b.fecha_inicio.getDate(),
        0, 0, 0, 0,
      );
 
      const ultimoDia = terminaEnMedianoche(b.fecha_fin)
        ? new Date(
            b.fecha_fin.getFullYear(),
            b.fecha_fin.getMonth(),
            b.fecha_fin.getDate() - 1,
            0, 0, 0, 0,
          )
        : new Date(
            b.fecha_fin.getFullYear(),
            b.fecha_fin.getMonth(),
            b.fecha_fin.getDate(),
            0, 0, 0, 0,
          );
 
      while (cursor <= ultimoDia) {
        const dStr = toLocalDate(cursor);
 
        if (cursor >= inicioMes && cursor < finMes) {
          const existing = bloqueosPorDia[dStr];
          if (!existing || (!existing.es_global && esGlobal)) {
            bloqueosPorDia[dStr] = {
              tipo:        b.tipo_bloqueo,
              descripcion: b.descripcion,
              es_global:   esGlobal,
            };
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
 
    const citas = await prisma.citas.findMany({
      where: {
        fecha_hora_inicio: { gte: inicioMes, lt: finMes },
        estado:            { not: 'cancelada' },
      },
      select: { fecha_hora_inicio: true },
    });
 
    const citasPorDia: Record<string, number> = {};
    for (const c of citas) {
      const fecha = toLocalDate(c.fecha_hora_inicio);
      citasPorDia[fecha] = (citasPorDia[fecha] ?? 0) + 1;
    }
 
    let capacidadMax = 10;
    try {
      const avSvc = new AvailabilityService();
      const cfg   = await avSvc.getGeneralConfig();
      capacidadMax = cfg.capacidad_maxima_dia ?? capacidadMax;
    } catch { /* usa default */ }
 
    const diasEnMes = new Date(year, month, 0).getDate();
    const dias: {
      fecha:    string;
      total:    number;
      estado:   string;
      bloqueo?: { tipo: string; descripcion: string | null; es_global: boolean };
    }[] = [];
 
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const total = citasPorDia[fecha] ?? 0;
      const blq   = bloqueosPorDia[fecha];
 
      let estado: string;
      if (blq) {
        estado = 'bloqueo';
      } else if (total === 0) {
        estado = 'libre';
      } else if (total >= capacidadMax) {
        estado = 'lleno';
      } else {
        estado = 'parcial';
      }
 
      dias.push({
        fecha,
        total,
        estado,
        ...(blq ? { bloqueo: blq } : {}),
      });
    }
 
    res.json({ mes: mesParam, capacidad_max: capacidadMax, dias });
  } catch (error) {
    next(error);
  }
};
 
// ══════════════════════════════════════════════════════════════
// CONFIGURACIÓN GENERAL DEL SPA
// ══════════════════════════════════════════════════════════════
export const getSpaConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await availabilityService.getGeneralConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
};

export const updateSpaConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await availabilityService.updateGeneralConfig(req.body);
    res.json(config);
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// BLOQUEOS
// ══════════════════════════════════════════════════════════════
export const getBloqueos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { desde, hasta, groomerId } = req.query;
    const bloqueos = await availabilityService.getBloqueos(
      desde     ? new Date(desde     as string) : undefined,
      hasta     ? new Date(hasta     as string) : undefined,
      groomerId ? Number(groomerId)             : undefined,
    );
    res.json(bloqueos);
  } catch (error) {
    next(error);
  }
};

export const createBloqueo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const creado_por = (req as any).user.id;
    const bloqueo    = await availabilityService.createBloqueo({ ...req.body, creado_por });
    res.status(201).json(bloqueo);
  } catch (error) {
    next(error);
  }
};

export const deleteBloqueo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await availabilityService.deleteBloqueo(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ══════════════════════════════════════════════════════════════
// DISPONIBILIDAD POR GROOMER
// ══════════════════════════════════════════════════════════════
export const getGroomerAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disponibilidad = await availabilityService.getGroomerAvailability(Number(req.params.id));
    res.json(disponibilidad);
  } catch (error) {
    next(error);
  }
};

export const setGroomerAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await availabilityService.setGroomerAvailability(Number(req.params.id), req.body);
    res.json({ message: 'Disponibilidad actualizada' });
  } catch (error) {
    next(error);
  }
};