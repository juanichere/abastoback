const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');

const COGS_LIMITE = 0.32;

// POST /api/ventas/semana — carga ventas de la semana
router.post('/ventas', requireAuth, async (req, res) => {
  try {
    const { semana_inicio, ventas_total, fuente } = req.body;

    if (!semana_inicio || !ventas_total) {
      return res.status(400).json({ error: 'semana_inicio y ventas_total son requeridos' });
    }

    const { data, error } = await supabaseAdmin
      .from('ventas_semanas')
      .upsert({ semana_inicio, ventas_total, fuente: fuente || 'manual' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/presupuesto/semana/:fecha
router.get('/semana/:fecha', requireAuth, async (req, res) => {
  try {
    const semana = req.params.fecha;

    // Ventas de esa semana
    const { data: ventas } = await supabaseAdmin
      .from('ventas_semanas')
      .select('ventas_total')
      .eq('semana_inicio', semana)
      .single();

    // Órdenes de compra de esa semana
    const { data: ordenes } = await supabaseAdmin
      .from('ordenes_compra')
      .select('monto_estimado, estado')
      .eq('semana_inicio', semana);

    const ventas_total = ventas?.ventas_total || 0;
    const presupuesto = ventas_total * COGS_LIMITE;
    const comprometido = (ordenes || [])
      .filter(o => ['aprobada', 'enviada', 'recibida'].includes(o.estado))
      .reduce((sum, o) => sum + (o.monto_estimado || 0), 0);
    const disponible = presupuesto - comprometido;

    res.json({
      semana_inicio: semana,
      ventas_total,
      presupuesto_cogs: Math.round(presupuesto),
      comprometido: Math.round(comprometido),
      disponible: Math.round(disponible),
      porcentaje_usado: ventas_total > 0
        ? Math.round((comprometido / presupuesto) * 100)
        : 0,
      alerta: disponible < 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/presupuesto/historico
router.get('/historico', requireAuth, async (req, res) => {
  try {
    const { data: ventas, error } = await supabaseAdmin
      .from('ventas_semanas')
      .select('*')
      .order('semana_inicio', { ascending: false })
      .limit(12);

    if (error) throw error;

    const historico = ventas.map(v => ({
      semana_inicio: v.semana_inicio,
      ventas_total: v.ventas_total,
      presupuesto_cogs: Math.round(v.ventas_total * COGS_LIMITE),
      fuente: v.fuente
    }));

    res.json(historico);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
