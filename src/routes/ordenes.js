const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');
const motorReposicion = require('../services/motorReposicion');

// GET /api/reposicion/ordenes
router.get('/ordenes', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ordenes_compra')
      .select('*, proveedores(nombre), orden_items(*, insumos(nombre, unidad_medida))')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reposicion/semana/:fecha
router.get('/semana/:fecha', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ordenes_compra')
      .select('*, proveedores(nombre), orden_items(*, insumos(nombre, unidad_medida))')
      .eq('semana_inicio', req.params.fecha);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reposicion/generar — trigger manual del motor
router.post('/generar', requireAuth, async (req, res) => {
  try {
    const { semana_inicio } = req.body;

    if (!semana_inicio) {
      return res.status(400).json({ error: 'semana_inicio es requerido (formato: YYYY-MM-DD)' });
    }

    const resultado = await motorReposicion.generar(semana_inicio);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reposicion/ordenes/:id/aprobar
router.put('/ordenes/:id/aprobar', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ordenes_compra')
      .update({
        estado: 'aprobada',
        aprobado_por: req.user.id
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
