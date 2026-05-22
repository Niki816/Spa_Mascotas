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
        id: c.id,
        hora: c.fecha_hora_inicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mascota: c.mascotas.nombre,
        servicio: c.servicios.nombre,
        groomer: `${c.groomers.nombre} ${c.groomers.apellido}`,
        estado: c.estado,
      })),
      totalClientes,
      ultimosClientes: ultimosClientes.map(c => ({
        nombre: c.nombre,
        apellido: c.apellido,
        email: c.usuarios.email,
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
      id: c.id,
      hora: c.fecha_hora_inicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mascota: c.mascotas.nombre,
      servicio: c.servicios.nombre,
      groomer: `${c.groomers.nombre} ${c.groomers.apellido}`,
      estado: c.estado,
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

    // ── IMPORTANTE: solo incluye motivo_cancelacion si ese campo existe en tu schema.
    //    Si no existe, quita esa línea del data y añade solo { estado: 'cancelada' }
    const updateData: any = { estado: 'cancelada' };
    const motivo = req.body?.motivo;
    if (motivo) {
      // Descomenta la siguiente línea SOLO si tienes motivo_cancelacion en tu schema de Prisma:
      // updateData.motivo_cancelacion = motivo;
    }

    const updated = await prisma.citas.update({
      where: { id: citaId },
      data: updateData,
    });

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
      data: { estado: 'confirmada' },
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
        { nombre: { contains: search } },
        { apellido: { contains: search } },
        { ci: { contains: search } },
        { usuarios: { email: { contains: search } } },
      ];
    }
    const clientes = await prisma.clientes.findMany({
      where,
      include: { usuarios: true },
      orderBy: { creado_en: 'desc' },
      take: 50,
    });
    res.json(clientes.map(c => ({
      id: c.id,
      nombre: c.nombre,
      apellido: c.apellido,
      email: c.usuarios.email,
      telefono: c.telefono,
      ci: c.ci,
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
      where: { estado_activo: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(servicios.map(s => ({
      id: s.id,
      nombre: s.nombre,
      duracion: s.duracion_base_minutos,
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
      where: { estado_activo: true },
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
      where: { estado_activo: true },
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
      id: m.id,
      nombre: m.nombre,
      especie: m.especie,
      dueno_principal_id: m.dueno_principal_id,
      dueno: `${m.clientes.nombre} ${m.clientes.apellido}`,
      peso_kg: m.peso_kg,
      temperamento: m.temperamento,
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
      where: { id },
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
        dueno_principal_id: Number(cliente_id),
        nombre,
        especie,
        raza:                 raza || null,
        fecha_nacimiento:     fecha_nacimiento ? new Date(fecha_nacimiento) : null,
        peso_kg:              peso_kg ? parseFloat(peso_kg) : null,
        temperamento:         temperamento || null,
        alergias:             alergias || null,
        restricciones_medicas: restricciones_medicas || null,
        notas_adicionales:    notas_adicionales || null,
      },
    });

    await prisma.mascota_dueno.create({
      data: {
        mascota_id: nuevaMascota.id,
        cliente_id: Number(cliente_id),
        es_principal: true,
      },
    });

    const p = peso_kg ? parseFloat(peso_kg) : 0;
    const tamanioEstimado = p < 5 ? 'pequeño' : p < 20 ? 'mediano' : p < 45 ? 'grande' : 'gigante';

    res.status(201).json({
      message: `Mascota ${nombre} registrada exitosamente`,
      mascota: nuevaMascota,
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
        raza:                 raza || null,
        fecha_nacimiento:     fecha_nacimiento ? new Date(fecha_nacimiento) : null,
        peso_kg:              peso_kg ? parseFloat(peso_kg) : null,
        temperamento:         temperamento || null,
        alergias:             alergias || null,
        restricciones_medicas: restricciones_medicas || null,
        notas_adicionales:    notas_adicionales || null,
        foto_url:             foto_url || null,
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
const diaNombreANumero: Record<string, number> = {
  lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
  jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 7,
};

export const getAvailableSlots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fecha, servicio_id, groomer_id } = req.query;
    if (!fecha || !servicio_id) throw new AppError('fecha y servicio_id son requeridos', 400);

    const fechaObj    = new Date(fecha as string);
    const diaSemanaNum = fechaObj.getDay();
    const diaSemana   = diaSemanaNum === 0 ? 7 : diaSemanaNum;

    const config      = await availabilityService.getGeneralConfig();
    const diasNumeros = config.dias_laborales.map((d: string) => diaNombreANumero[d.toLowerCase()]);
    if (!diasNumeros.includes(diaSemana)) {
      return res.json({ slots: [], message: 'Día no laborable' });
    }

    const bloqueosGlobales = await prisma.bloqueos_calendario.findMany({
      where: {
        groomer_id: null,
        fecha_inicio: { lte: fechaObj },
        fecha_fin:    { gte: fechaObj },
      },
    });
    if (bloqueosGlobales.length > 0) {
      return res.json({ slots: [], message: 'Día bloqueado por feriado/mantenimiento general' });
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
          groomer_id: gid,
          fecha_inicio: { lte: fechaObj },
          fecha_fin:    { gte: fechaObj },
        },
      });
      if (bloqueosGroomer.length > 0) continue;

      const disponibilidadPersonal = await availabilityService.getGroomerAvailability(gid);
      const personalDia = disponibilidadPersonal.find((d: any) => d.dia_semana === diaSemana);
      let horaInicio = config.horario_inicio;
      let horaFin    = config.horario_fin;
      if (personalDia) {
        horaInicio = personalDia.hora_inicio;
        horaFin    = personalDia.hora_fin;
      }

      const startOfDay = new Date(fechaObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const citasExistentes = await prisma.citas.findMany({
        where: {
          groomer_id: gid,
          fecha_hora_inicio: { gte: startOfDay, lt: endOfDay },
          estado: { notIn: ['cancelada', 'no_asistio'] },
        },
        orderBy: { fecha_hora_inicio: 'asc' },
      });

      const [hInicio, mInicio] = horaInicio.split(':').map(Number);
      const [hFin, mFin]       = horaFin.split(':').map(Number);
      let current = new Date(fechaObj);
      current.setHours(hInicio, mInicio, 0, 0);
      const end = new Date(fechaObj);
      end.setHours(hFin, mFin, 0, 0);

      while (current.getTime() + duracionMin * 60000 <= end.getTime()) {
        const slotStart = new Date(current);
        const slotEnd   = new Date(current.getTime() + duracionMin * 60000);

        const conflicto = citasExistentes.some(c => {
          const cStart = new Date(c.fecha_hora_inicio);
          const cEnd   = new Date(cStart.getTime() + c.duracion_estimada_min * 60000);
          return slotStart < cEnd && slotEnd > cStart;
        });

        if (!conflicto) {
          allSlots.push({ groomer_id: gid, inicio: slotStart.toISOString(), fin: slotEnd.toISOString() });
        }
        current = new Date(current.getTime() + 30 * 60000);
      }
    }

    res.json({ slots: allSlots });
  } catch (error) {
    next(error);
  }
};

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
  if (peso < 5)       multiplicador = 1.0;
  else if (peso < 20) multiplicador = 1.10;
  else if (peso < 45) multiplicador = 1.15;
  else                multiplicador = 1.30;

  const temp = (mascota.temperamento ?? '').toLowerCase();
  if (['agresivo', 'nervioso', 'ansioso'].includes(temp)) multiplicador += 0.20;

  return multiplicador;
}

// ══════════════════════════════════════════════════════════════
// CREAR CITA  (única versión consolidada — usa fecha + hora)
// ══════════════════════════════════════════════════════════════
export const crearCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { mascota_id, servicio_id, groomer_id, fecha, hora, notas } = req.body;
    const user = req.user!;

    if (!mascota_id || !servicio_id || !groomer_id || !fecha || !hora) {
      throw new AppError('Faltan campos: mascota_id, servicio_id, groomer_id, fecha, hora', 400);
    }

    // Normalizar hora a "HH:MM" (por si llega "HH:MM:SS")
    const horaLimpia    = String(hora).substring(0, 5);
    const fechaHoraStr  = `${fecha}T${horaLimpia}:00`;
    const fechaHoraInicio = new Date(fechaHoraStr);

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

    const multiplicador   = calcularMultiplicadorDuracion({
      peso_kg:      (mascota as any).peso_kg,
      temperamento: (mascota as any).temperamento,
      especie:      mascota.especie,
    });
    const duracionAjustada = Math.ceil(servicio.duracion_base_minutos * multiplicador);
    const fechaHoraFin     = new Date(fechaHoraInicio.getTime() + duracionAjustada * 60_000);

    const conflicto = await prisma.citas.findFirst({
      where: {
        groomer_id: Number(groomer_id),
        estado: { notIn: ['cancelada', 'no_asistio'] },
        OR: [{ fecha_hora_inicio: { lt: fechaHoraFin }, fecha_hora_fin: { gt: fechaHoraInicio } }],
      },
    });
    if (conflicto) throw new AppError('El groomer ya tiene una cita en ese horario', 409);

    const config = await availabilityService.getGeneralConfig();
    const startOfDay = new Date(fechaHoraInicio);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const citasEseDia = await prisma.citas.count({
      where: {
        fecha_hora_inicio: { gte: startOfDay, lt: endOfDay },
        estado: { notIn: ['cancelada', 'no_asistio'] },
      },
    });
    if (citasEseDia >= config.capacidad_diaria_max) {
      throw new AppError('Se alcanzó la capacidad máxima de citas para ese día', 400);
    }

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
        duracion_ajustada_min:   duracionAjustada,
        duracion_base_min:       servicio.duracion_base_minutos,
        multiplicador_aplicado:  multiplicador,
        tamanio_mascota:         tamanio,
      },
    });
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
// ─────────────────────────────────────────────────────────────────────────────
// AÑADE ESTAS 3 FUNCIONES al final de recepcion.controller.ts
// (antes del bloque de configuración del SPA)
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// GET /citas/:id  — leer una cita completa para el modal de edición
// ══════════════════════════════════════════════════════════════
export const getCitaById = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({
      where: { id: citaId },
      include: {
        mascotas:  true,
        servicios: true,
        groomers:  true,
      },
    });

    if (!cita) throw new AppError('Cita no encontrada', 404);

    // Devuelve todo lo que el frontend necesita para poblar el modal
    res.json({
      id:          cita.id,
      mascota_id:  cita.mascota_id,
      servicio_id: cita.servicio_id,
      groomer_id:  cita.groomer_id,
      // fecha e hora por separado para los inputs type="date" y type="time"
      fecha: cita.fecha_hora_inicio.toISOString().split('T')[0],          // "YYYY-MM-DD"
      hora:  cita.fecha_hora_inicio.toISOString().split('T')[1].slice(0, 5), // "HH:MM"
      notas:  cita.notas,
      estado: cita.estado,
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
// PATCH /citas/:id  — editar una cita existente
//   Permite cambiar: groomer, fecha/hora, servicio, mascota, notas
//   Recalcula duración si cambia mascota o servicio
//   Solo editable si estado es 'agendada' o 'confirmada'
// ══════════════════════════════════════════════════════════════
export const updateCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({ where: { id: citaId } });
    if (!cita) throw new AppError('Cita no encontrada', 404);

    // Solo se pueden editar citas activas
    if (!['agendada', 'confirmada'].includes(cita.estado)) {
      throw new AppError(
        `No se puede editar una cita en estado "${cita.estado}". Solo agendada o confirmada.`,
        400
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

    // ── Construir fecha/hora ───────────────────────────────────
    // Si no mandan fecha/hora, conservar la original
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

    // ── Recalcular duración si cambia mascota o servicio ──────
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

    // ── Verificar conflicto (excluyendo la cita que se edita) ──
    const conflicto = await prisma.citas.findFirst({
      where: {
        id:         { not: citaId },          // excluir la cita actual
        groomer_id: Number(groomer_id),
        estado:     { notIn: ['cancelada', 'no_asistio'] },
        OR: [{
          fecha_hora_inicio: { lt: fechaHoraFin  },
          fecha_hora_fin:    { gt: fechaHoraInicio },
        }],
      },
    });
    if (conflicto) throw new AppError('El groomer ya tiene una cita en ese horario', 409);

    // ── Guardar ────────────────────────────────────────────────
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
//   Solo permitido si la cita está cancelada o no_asistio
//   (para no romper histórico de citas completadas)
// ══════════════════════════════════════════════════════════════
export const deleteCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const citaId = parseInt(req.params.id as string);
    if (isNaN(citaId)) throw new AppError('ID inválido', 400);

    const cita = await prisma.citas.findUnique({ where: { id: citaId } });
    if (!cita) throw new AppError('Cita no encontrada', 404);

    // Seguridad: no eliminar citas completadas (histórico)
    if (cita.estado === 'completada') {
      throw new AppError(
        'No se pueden eliminar citas completadas. Cancélalas primero si fue un error.',
        400
      );
    }

    await prisma.citas.delete({ where: { id: citaId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getCitasTodas = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    // Filtros opcionales por query params
    // ?estado=cancelada  → filtra por estado
    // ?desde=2025-01-01  → desde esa fecha
    // ?hasta=2025-12-31  → hasta esa fecha
    const { estado, desde, hasta } = req.query;
 
    const where: any = {};
 
    if (estado) {
      where.estado = estado as string;
    }
 
    if (desde || hasta) {
      where.fecha_hora_inicio = {};
      if (desde) where.fecha_hora_inicio.gte = new Date(desde as string);
      if (hasta) {
        const hastaDate = new Date(hasta as string);
        hastaDate.setHours(23, 59, 59, 999);
        where.fecha_hora_inicio.lte = hastaDate;
      }
    } else {
      // Sin filtro de fecha: últimos 30 días + próximos 30 días
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      const en30 = new Date();
      en30.setDate(en30.getDate() + 30);
      where.fecha_hora_inicio = { gte: hace30, lte: en30 };
    }
 
    const citas = await prisma.citas.findMany({
      where,
      include: {
        mascotas:  true,
        servicios: true,
        groomers:  true,
      },
      orderBy: { fecha_hora_inicio: 'desc' },
      take: 200,
    });
 
    res.json(citas.map(c => ({
      id:         c.id,
      fechaHora:  c.fecha_hora_inicio.toLocaleString('es-BO', {
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