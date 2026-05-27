require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Permitir cualquier localhost en desarrollo
    if (!origin || origin.match(/^http:\/\/localhost:\d+$/)) return callback(null, true);
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'ABASTO', version: '0.1.0' });
});

// Rutas
app.use('/api/insumos',      require('./src/routes/insumos'));
app.use('/api/proveedores',  require('./src/routes/proveedores'));
app.use('/api/recetario',    require('./src/routes/recetario'));
app.use('/api/inventario',   require('./src/routes/inventario'));
app.use('/api/reposicion',   require('./src/routes/ordenes'));
app.use('/api/presupuesto',  require('./src/routes/presupuesto'));
app.use('/api/ventas',       require('./src/routes/presupuesto'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 ABASTO API corriendo en http://localhost:${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`   Entorno: ${process.env.NODE_ENV}`);
});
