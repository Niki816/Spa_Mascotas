import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

// Ruta al archivo de configuración (se crea automáticamente)
const CONFIG_PATH = path.join(__dirname, '../config/spaConfig.json');

// Valores por defecto
const DEFAULT_CONFIG = {
  horario_inicio: '09:00',
  horario_fin: '18:00',
  dias_laborales: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  capacidad_diaria_max: 20,
};

// Función para leer la configuración actual
async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Si no existe el archivo, crearlo con valores por defecto
    await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
}

// Función para guardar configuración
async function writeConfig(config: any) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export class AvailabilityService {
  // Obtener configuración actual
  async getGeneralConfig() {
    return await readConfig();
  }

  // Actualizar configuración (usado por admin)
  async updateGeneralConfig(data: {
    horario_inicio?: string;
    horario_fin?: string;
    dias_laborales?: string[];
    capacidad_diaria_max?: number;
  }) {
    const current = await readConfig();
    const updated = { ...current, ...data };
    await writeConfig(updated);
    return updated;
  }

  // ---------- Bloqueos (CRUD) ----------
  async createBloqueo(data: {
    tipo_bloqueo: 'feriado' | 'vacaciones' | 'mantenimiento' | 'ausencia';
    fecha_inicio: Date;
    fecha_fin: Date;
    groomer_id?: number;
    sucursal_id?: number;
    descripcion?: string;
    creado_por: number;
  }) {
    return await prisma.bloqueos_calendario.create({
      data: {
        tipo_bloqueo: data.tipo_bloqueo,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin,
        descripcion: data.descripcion,
        groomer_id: data.groomer_id,
        sucursal_id: data.sucursal_id,
        creado_por: data.creado_por,
      },
    });
  }

  async getBloqueos(fechaInicio?: Date, fechaFin?: Date, groomerId?: number) {
    const where: any = {};
    if (fechaInicio && fechaFin) {
      where.OR = [
        { fecha_inicio: { gte: fechaInicio, lte: fechaFin } },
        { fecha_fin: { gte: fechaInicio, lte: fechaFin } },
      ];
    }
    if (groomerId) where.groomer_id = groomerId;
    return await prisma.bloqueos_calendario.findMany({
      where,
      include: { groomers: true, sucursales: true },
      orderBy: { fecha_inicio: 'asc' },
    });
  }

  async deleteBloqueo(id: number) {
    return await prisma.bloqueos_calendario.delete({ where: { id } });
  }

  // ---------- Disponibilidad por groomer ----------
  async setGroomerAvailability(groomerId: number, availability: { dia_semana: number; hora_inicio: string; hora_fin: string; buffer_minutos?: number }[]) {
    await prisma.disponibilidad_groomer.deleteMany({ where: { groomer_id: groomerId } });
    if (availability.length === 0) return [];
    const data = availability.map(a => ({
      groomer_id: groomerId,
      dia_semana: a.dia_semana,
      hora_inicio: new Date(`1970-01-01T${a.hora_inicio}:00`),
      hora_fin: new Date(`1970-01-01T${a.hora_fin}:00`),
      buffer_minutos: a.buffer_minutos ?? 15,
    }));
    await prisma.disponibilidad_groomer.createMany({ data });
  }

  async getGroomerAvailability(groomerId: number) {
    const records = await prisma.disponibilidad_groomer.findMany({
      where: { groomer_id: groomerId },
    });
    return records.map(r => ({
      dia_semana: r.dia_semana,
      hora_inicio: r.hora_inicio.toISOString().slice(11, 16),
      hora_fin: r.hora_fin.toISOString().slice(11, 16),
      buffer_minutos: r.buffer_minutos,
    }));
  }
}