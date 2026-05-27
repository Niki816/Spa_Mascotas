import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import passport from 'passport';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import recepcionRoutes from './routes/recepcion.routes';
import { AppError } from './utils/errors';
import './config/env';
import './config/passport';
import pagosRoutes from './routes/pagos.routes';

const app = express();
const PORT = process.env.PORT || 4000;

// ── 1. CORS (siempre primero) ──
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true,
}));

// ── 2. Body parser ──
app.use(express.json());

// ── 3. Passport ──
app.use(passport.initialize());

// ── 4. Logger global (ANTES de las rutas para que loguee TODO) ──
app.use((req, _res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

// ── 5. Rutas (una sola vez cada una) ──
app.use('/api/auth',      authRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/recepcion', recepcionRoutes);  // ← AHORA ESTÁ
app.use('/api/recepcion', pagosRoutes);  // ← AÑADE ESTA LÍNEA
console.log('✓ Router /api/recepcion registrado');
// app.use('/api/groomer',  groomerRoutes);  ← descomenta cuando lo tengas
// app.use('/api/cliente',  clienteRoutes);  ← descomenta cuando lo tengas

// ── 6. Ruta de salud ──
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Servidor Pet Spa funcionando 🐾' });
});

// ── 7. Manejador global de errores (siempre al final) ──
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('❌ Error inesperado:', err);
  return res.status(500).json({ message: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});

import { startAutoCancelJob } from './jobs/autoCancelExpiredAppointments';
startAutoCancelJob(); // corre cada 15 min, gracia de 60 min tras inicio
// src/app.ts

// Bajo el prefijo /recepcion
