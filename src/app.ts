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
import checklistRoutes from './routes/admin-checklist.routes';
import groomerRoutes from './routes/groomer.routes';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true,
}));

// ✅ CRÍTICO: express.json() solo cuando NO es multipart
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return next(); // multer lo maneja en la ruta específica
  }
  express.json()(req, res, next);
});

app.use(passport.initialize());

app.use((req, _res, next) => {
  console.log(`📡 ${req.method} ${req.path} | CT: ${req.headers['content-type'] ?? 'none'}`);
  next();
});

app.use('/api/auth',            authRoutes);
app.use('/api/admin',           adminRoutes);
app.use('/api/admin',           productosRoutes);
app.use('/api/admin/checklist', checklistRoutes);
app.use('/api/recepcion',       recepcionRoutes);
app.use('/api/recepcion',       pagosRoutes);
app.use('/api/groomers',        groomerRoutes);

app.use(express.static(path.join(__dirname, '../public')));

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