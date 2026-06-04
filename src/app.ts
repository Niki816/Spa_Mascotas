// src/app.ts
import './config/env';       // ← primero: carga variables de entorno
import './config/passport';  // ← segundo: configura passport (usa env vars)

import express, { Request, Response, NextFunction } from 'express';
import cors     from 'cors';
import passport from 'passport';
import path     from 'path';

import authRoutes     from './routes/auth.routes';
import adminRoutes    from './routes/admin.routes';
import recepcionRoutes from './routes/recepcion.routes';
import productosRoutes from './routes/productos.routes';
import pagosRoutes    from './routes/pagos.routes';
import groomerRoutes  from './routes/groomer.routes';
import clienteRoutes  from './routes/cliente.routes';

import { AppError } from './utils/errors';
import { startWhatsAppClient } from './services/whatsapp.service';
import { procesarNotificacionesPendientes } from './services/notificacionRecordatorios.service';
import { startAutoCancelJob } from './jobs/autoCancelExpiredAppointments';

// ─── Express app ──────────────────────────────────────────────────────────
const app  = express();
const PORT = Number(process.env.PORT) || 4000;

// ─── CORS ─────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:5500,http://localhost:5500')
  .split(',')
  .map(o => o.trim());

app.use(
  cors({
    origin:      allowedOrigins,
    credentials: true,
  }),
);

// ─── Body parsers ─────────────────────────────────────────────────────────
// express.json() para todos los requests NO-multipart
// multer gestiona multipart/form-data automáticamente en las rutas
app.use((req: Request, res: Response, next: NextFunction) => {
  const ct = req.headers['content-type'] ?? '';
  if (ct.includes('multipart/form-data')) return next();
  express.json({ limit: '10mb' })(req, res, next);
});

// ─── Passport ────────────────────────────────────────────────────────────
app.use(passport.initialize());

// ─── Logger de peticiones (solo en desarrollo) ────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`📡 ${req.method} ${req.path} | CT: ${req.headers['content-type'] ?? 'none'}`);
    next();
  });
}

// ─── RUTAS ────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/admin',      productosRoutes);   // productos admin comparte prefijo /api/admin
app.use('/api/recepcion',  recepcionRoutes);
app.use('/api/recepcion',  pagosRoutes);       // pagos comparte prefijo /api/recepcion
app.use('/api/clientes',   clienteRoutes);
app.use('/api/groomers',   groomerRoutes);

// ─── ESTÁTICOS ────────────────────────────────────────────────────────────
// Sirve archivos de la carpeta public/ (HTML, JS, CSS del frontend)
app.use(express.static(path.join(__dirname, '../public')));

// ─── Ruta raíz de health-check ────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: '🐾 Servidor Pet Spa funcionando' });
});

// ─── MANEJADOR DE ERRORES GLOBAL ──────────────────────────────────────────
// Debe ir DESPUÉS de todas las rutas
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('❌ Error inesperado:', err);
  return res.status(500).json({ message: 'Error interno del servidor' });
});

// ─── INICIO DEL SERVIDOR ──────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);

  // ── WhatsApp ──────────────────────────────────────────────────────────
  try {
    await startWhatsAppClient();
  } catch (err) {
    console.error('⚠️  No se pudo iniciar el cliente de WhatsApp:', err);
  }

  // ── Job de auto-cancelación de citas expiradas ────────────────────────
  try {
    startAutoCancelJob();
    console.log('✅ Job de auto-cancelación iniciado');
  } catch (err) {
    console.error('⚠️  Error al iniciar job de auto-cancelación:', err);
  }

  // ── Notificaciones y recordatorios: corre cada 5 minutos ─────────────
  // Primera ejecución al arrancar para procesar cualquier pendiente
  procesarNotificacionesPendientes().catch(err =>
    console.error('⚠️  Error en primera ejecución de notificaciones:', err),
  );
  setInterval(() => {
    procesarNotificacionesPendientes().catch(err =>
      console.error('⚠️  Error en ciclo de notificaciones:', err),
    );
  }, 5 * 60 * 1000); // cada 5 minutos
});

export default app;