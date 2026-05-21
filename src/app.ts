import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import { AppError } from './utils/errors';
import './config/env';
import passport from 'passport';           // ← AGREGAR
import './config/passport';                // ← AGREGAR (carga la estrategia Google)
import recepcionRoutes from './routes/recepcion.routes';




const app = express();

const PORT = process.env.PORT || 4000;

// 1️⃣ CORS primero — siempre antes que todo
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true,
}));

app.use(express.json());
app.use(passport.initialize());   
app.use('/api/recepcion', recepcionRoutes);

// 🔥 LOG ANTES DE LAS RUTAS
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
//app.use('/api/groomer', groomerRoutes);
//app.use('/api/cliente', clienteRoutes);


app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Servidor Pet Spa funcionando' });
});

// ← ESTO ES LO QUE FALTABA: manejador global de errores
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

app.use('/api/recepcion', recepcionRoutes);