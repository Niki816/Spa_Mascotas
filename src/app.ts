import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import passport from 'passport';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import recepcionRoutes from './routes/recepcion.routes';
import productosRoutes from './routes/productos.routes'; 
import { AppError } from './utils/errors';
import './config/env';
import './config/passport';
import pagosRoutes from './routes/pagos.routes';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());
app.use((req, _res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});
app.use('/api/auth',      authRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/admin',     productosRoutes);
app.use('/api/recepcion', recepcionRoutes);
app.use('/api/recepcion', pagosRoutes); 
app.use(express.static(path.join(__dirname, 'public')));
console.log('✓ Router /api/recepcion registrado');
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Servidor Pet Spa funcionando 🐾' });
});
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
startAutoCancelJob();
