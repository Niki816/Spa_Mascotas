import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';
import { AvailabilityService } from '../services/availability.service';


const availabilityService = new AvailabilityService();

interface RequestWithUser extends Request {
  user?: { id: number; email: string; rol: string; jti: string };
}

// Obtener dashboard (citas hoy + total clientes + últimos clientes)
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
      include: {
        mascotas: true,
        servicios: true,
        groomers: true,
      },
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

// Obtener citas de hoy (detallado)
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
      include: {
        mascotas: true,
        servicios: true,
        groomers: true,
      },
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

// Listar clientes (con búsqueda opcional)
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

// Listar mascotas (para combos)
export const getMascotas = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const mascotas = await prisma.mascotas.findMany({
      include: {
        clientes: true,
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(mascotas.map(m => ({
      id: m.id,
      nombre: m.nombre,
      especie: m.especie,
      dueno: `${m.clientes.nombre} ${m.clientes.apellido}`,
    })));
  } catch (error) {
    next(error);
  }
};

// Listar servicios activos
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

// Listar groomers activos
export const getGroomers = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const groomers = await prisma.groomers.findMany({
      where: { estado_activo: true },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        especialidad: true,
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(groomers);
  } catch (error) {
    next(error);
  }
};

// Crear una cita (desde recepción)
export const crearCita = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { mascota_id, servicio_id, groomer_id, fecha, hora, notas } = req.body;
    const user = req.user!;

    // Validar que existan
    const mascota = await prisma.mascotas.findUnique({ where: { id: mascota_id } });
    if (!mascota) throw new AppError('Mascota no encontrada', 404);

    const servicio = await prisma.servicios.findUnique({ where: { id: servicio_id } });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);

    const groomer = await prisma.groomers.findUnique({ where: { id: groomer_id } });
    if (!groomer) throw new AppError('Groomer no encontrado', 404);

    // Construir fecha y hora
    const fechaHoraInicio = new Date(`${fecha}T${hora}:00`);
    if (isNaN(fechaHoraInicio.getTime())) throw new AppError('Fecha/hora inválida', 400);

    const duracionMin = servicio.duracion_base_minutos;
    const fechaHoraFin = new Date(fechaHoraInicio.getTime() + duracionMin * 60000);

    // Verificar conflicto con otras citas del mismo groomer
    const conflicto = await prisma.citas.findFirst({
      where: {
        groomer_id,
        estado: { notIn: ['cancelada', 'no_asistio'] },
        OR: [
          {
            fecha_hora_inicio: { lt: fechaHoraFin },
            fecha_hora_fin: { gt: fechaHoraInicio },
          },
        ],
      },
    });
    if (conflicto) throw new AppError('El groomer ya tiene una cita en ese horario', 409);

    const nuevaCita = await prisma.citas.create({
      data: {
        mascota_id,
        servicio_id,
        groomer_id,
        fecha_hora_inicio: fechaHoraInicio,
        fecha_hora_fin: fechaHoraFin,
        duracion_estimada_min: duracionMin,
        precio_calculado: servicio.precio_base,
        estado: 'agendada',
        creado_por: user.id,
        notas: notas || null,
      },
      include: {
        mascotas: true,
        servicios: true,
        groomers: true,
      },
    });

    res.status(201).json(nuevaCita);
  } catch (error) {
    next(error);
  }
};

// Confirmar una cita (cambiar estado a confirmada)
export const confirmarCita = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const idParam = req.params.id;

    if (Array.isArray(idParam)) {
      throw new AppError('ID inválido', 400);
    }

    const citaId = parseInt(idParam);

    if (isNaN(citaId)) {
      throw new AppError('ID inválido', 400);
    }

    const cita = await prisma.citas.findUnique({
      where: { id: citaId }
    });

    if (!cita) {
      throw new AppError('Cita no encontrada', 404);
    }

    if (cita.estado !== 'agendada') {
      throw new AppError(
        `No se puede confirmar una cita en estado ${cita.estado}`,
        400
      );
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

// La lógica de slots disponibles para un día específico, considerando bloqueos, disponibilidad personalizada, citas existentes y capacidad diaria máxima, es bastante compleja. La implementamos en el servicio de disponibilidad para mantener el controlador limpio. Lo mismo para la creación de citas, que requiere varias validaciones y cálculos de horarios.
// disponibilidad y creación de citas requieren lógica más compleja, así que las implementamos en el servicio

// Mapeo de nombres de días a números (1=lunes, 7=domingo) según tu schema
const diaNombreANumero: Record<string, number> = {
  lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 7,
};

export const getAvailableSlots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fecha, servicio_id, groomer_id } = req.query;
    if (!fecha || !servicio_id) throw new AppError('fecha y servicio_id son requeridos', 400);

    const fechaObj = new Date(fecha as string);
    const diaSemanaNum = fechaObj.getDay(); // 0 domingo, 1 lunes...
    let diaSemana = diaSemanaNum === 0 ? 7 : diaSemanaNum; // convertir a 1-7

    // Obtener configuración general (desde variables)
    const config = await availabilityService.getGeneralConfig();
    const diasLaborales = config.dias_laborales;
    const diasNumeros = diasLaborales.map(d => diaNombreANumero[d.toLowerCase()]);
    if (!diasNumeros.includes(diaSemana)) {
      return res.json({ slots: [], message: 'Día no laborable' });
    }

    // Verificar bloqueos globales (groomer_id = null)
    const bloqueosGlobales = await prisma.bloqueos_calendario.findMany({
      where: {
        groomer_id: null,
        fecha_inicio: { lte: fechaObj },
        fecha_fin: { gte: fechaObj },
      },
    });
    if (bloqueosGlobales.length > 0) {
      return res.json({ slots: [], message: 'Día bloqueado por feriado/mantenimiento general' });
    }

    // Obtener servicio
    const servicio = await prisma.servicios.findUnique({
      where: { id: Number(servicio_id) },
    });
    if (!servicio) throw new AppError('Servicio no encontrado', 404);
    const duracionMin = servicio.duracion_base_minutos;

    // Obtener groomers (si se especifica uno, solo ese)
    let groomerIds: number[] = [];
    if (groomer_id) {
      groomerIds = [Number(groomer_id)];
    } else {
      const groomers = await prisma.groomers.findMany({ where: { estado_activo: true }, select: { id: true } });
      groomerIds = groomers.map(g => g.id);
    }

    const allSlots = [];

    for (const gid of groomerIds) {
      // Bloqueos específicos del groomer
      const bloqueosGroomer = await prisma.bloqueos_calendario.findMany({
        where: {
          groomer_id: gid,
          fecha_inicio: { lte: fechaObj },
          fecha_fin: { gte: fechaObj },
        },
      });
      if (bloqueosGroomer.length > 0) continue;

      // Obtener disponibilidad personalizada
      const disponibilidadPersonal = await availabilityService.getGroomerAvailability(gid);
      const personalDia = disponibilidadPersonal.find(d => d.dia_semana === diaSemana);
      let horaInicio = config.horario_inicio;
      let horaFin = config.horario_fin;
      if (personalDia) {
        horaInicio = personalDia.hora_inicio;
        horaFin = personalDia.hora_fin;
      }

      // Obtener citas ya existentes para ese groomer en esa fecha
      const startOfDay = new Date(fechaObj);
      startOfDay.setHours(0,0,0,0);
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

      // Generar slots cada 30 minutos (podría ser configurable)
      const [hInicio, mInicio] = horaInicio.split(':').map(Number);
      const [hFin, mFin] = horaFin.split(':').map(Number);
      let current = new Date(fechaObj);
      current.setHours(hInicio, mInicio, 0, 0);
      const end = new Date(fechaObj);
      end.setHours(hFin, mFin, 0, 0);

      while (current.getTime() + duracionMin * 60000 <= end.getTime()) {
        const slotStart = new Date(current);
        const slotEnd = new Date(current.getTime() + duracionMin * 60000);

        // Verificar conflicto con citas existentes
        const conflicto = citasExistentes.some(c => {
          const cStart = new Date(c.fecha_hora_inicio);
          const cEnd = new Date(cStart.getTime() + c.duracion_estimada_min * 60000);
          return (slotStart < cEnd && slotEnd > cStart);
        });

        if (!conflicto) {
          allSlots.push({
            groomer_id: gid,
            inicio: slotStart.toISOString(),
            fin: slotEnd.toISOString(),
          });
        }
        // Avanzar 30 minutos
        current = new Date(current.getTime() + 30 * 60000);
      }
    }
    res.json({ slots: allSlots });
  } catch (err) { next(err); }
};

// Crear cita (desde recepción)
export const createAppointment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mascota_id, servicio_id, groomer_id, fecha_hora_inicio, notas } = req.body;
    const user = (req as any).user;
    const fechaInicio = new Date(fecha_hora_inicio);
    const servicio = await prisma.servicios.findUnique({ where: { id: servicio_id } });
    if (!servicio) throw new AppError('Servicio no válido', 400);
    const duracion = servicio.duracion_base_minutos;
    const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000);

    // Verificar conflicto
    const conflicto = await prisma.citas.findFirst({
      where: {
        groomer_id,
        estado: { notIn: ['cancelada', 'no_asistio'] },
        OR: [
          { fecha_hora_inicio: { lt: fechaFin, gte: fechaInicio } },
          { fecha_hora_fin: { gt: fechaInicio, lte: fechaFin } },
        ],
      },
    });
    if (conflicto) throw new AppError('El groomer ya tiene una cita en ese horario', 409);

    // Validar capacidad diaria (usando la configuración de variables)
    const config = await availabilityService.getGeneralConfig();
    const startOfDay = new Date(fechaInicio);
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const citasEseDia = await prisma.citas.count({
      where: {
        fecha_hora_inicio: { gte: startOfDay, lt: endOfDay },
        estado: { notIn: ['cancelada', 'no_asistio'] },
      },
    });
    if (citasEseDia >= config.capacidad_diaria_max) {
      throw new AppError('Se alcanzó la capacidad máxima de citas para hoy', 400);
    }

    const cita = await prisma.citas.create({
      data: {
        mascota_id,
        servicio_id,
        groomer_id,
        fecha_hora_inicio: fechaInicio,
        fecha_hora_fin: fechaFin,
        duracion_estimada_min: duracion,
        estado: 'agendada',
        creado_por: user.id,
        precio_calculado: servicio.precio_base,
        notas: notas || null,
      },
      include: { mascotas: { include: { clientes: true } }, servicios: true, groomers: true },
    });
    res.status(201).json(cita);
  } catch (err) { next(err); }
};
// En recepcion.controller.ts


//export const getGroomersList = async (req, res, next) => {
//  try {
//
//    const groomers = await prisma.groomers.findMany({ where: { estado_activo: true } });
//    res.json(groomers);
//  } catch (err) { next(err); }
//};
export const getGroomersList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groomers = await prisma.groomers.findMany({
      where: { estado_activo: true },
      select: { id: true, nombre: true, apellido: true }
    });
    res.json(groomers);
  } catch (err) { next(err); }
};

export const getAllMascotas = async (req, res, next) => {
  try {
    const mascotas = await prisma.mascotas.findMany({
      include: { clientes: { select: { nombre: true, apellido: true } } }
    });
    res.json(mascotas.map(m => ({ id: m.id, nombre: m.nombre, cliente_nombre: `${m.clientes.nombre} ${m.clientes.apellido}` })));
  } catch (err) { next(err); }
};

// Configuración general
export const getSpaConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await availabilityService.getGeneralConfig();
    res.json(config);
  } catch (err) { next(err); }
};

export const updateSpaConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await availabilityService.updateGeneralConfig(req.body);
    res.json(config);
  } catch (err) { next(err); }
};

// Bloqueos
export const getBloqueos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { desde, hasta, groomerId } = req.query;
    const bloqueos = await availabilityService.getBloqueos(
      desde ? new Date(desde as string) : undefined,
      hasta ? new Date(hasta as string) : undefined,
      groomerId ? Number(groomerId) : undefined
    );
    res.json(bloqueos);
  } catch (err) { next(err); }
};

export const createBloqueo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const creado_por = (req as any).user.id;
    const bloqueo = await availabilityService.createBloqueo({ ...req.body, creado_por });
    res.status(201).json(bloqueo);
  } catch (err) { next(err); }
};

export const deleteBloqueo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await availabilityService.deleteBloqueo(Number(req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
};

// Disponibilidad por groomer
export const getGroomerAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disponibilidad = await availabilityService.getGroomerAvailability(Number(req.params.id));
    res.json(disponibilidad);
  } catch (err) { next(err); }
};

export const setGroomerAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await availabilityService.setGroomerAvailability(Number(req.params.id), req.body);
    res.json({ message: 'Disponibilidad actualizada' });
  } catch (err) { next(err); }
};

