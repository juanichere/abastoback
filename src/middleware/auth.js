const { supabase } = require('../utils/supabase');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('[auth] error:', error);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.user = user;
  next();
}

async function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const role = req.user.user_metadata?.role || 'operador';

    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }

    next();
  };
}

module.exports = { requireAuth, requireRole };
