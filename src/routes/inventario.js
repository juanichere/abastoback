const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/inventario/estado — stock actual vs mínimos
router.get('/estado', requireAuth, async (req, res) => {
  try {
    // Obtener temporada activa
    const { data: config } = await supabaseAdmin
      .from('configuracion')
      .select('valor')
      .eq('clave', 'temporada_activa')
      .single();

    const temporada = config?.valor || 'normal';

    // Obtener último inventario por insumo
    const { data: insumos, error } = await supabaseAdmin
      .from('insumos')
      .select(`
        id, nombre, unidad_medida, categoria,
        minimos_inventario!inner(cantidad_minima, temporada),
        inventario_semanas(stock_real, semana_inicio)
      `)
      .eq('activo', true)
      .eq('minimos_inventario.temporada', temporada)
      .eq('minimos_inventario.vigente', true);

    if (error) throw error;

    // Calcular estado por insumo
    const estado = insumos.map(insumo => {
      const inventarios = insumo.inventario_semanas || [];
      const ultimo = inventarios.sort((a, b) =>
        new Date(b.semana_inicio) - new Date(a.semana_inicio)
      )[0];

      const stock_real = ultimo?.stock_real ?? null;
      const minimo = insumo.minimos_inventario[0]?.cantidad_minima ?? 0;
      const faltante = stock_real !== null ? Math.max(0, minimo - stock_real) : null;

      return {
        id: insumo.id,
        nombre: insumo.nombre,
        unidad_medida: insumo.unidad_medida,
        categoria: insumo.categoria,
        stock_real,
        minimo,
        faltante,
        estado: stock_real === null ? 'sin_datos'
          : stock_real === 0 ? 'critico'
          : stock_real < minimo ? 'bajo'
          : 'ok',
        ultima_semana: ultimo?.semana_inicio || null
      };
    });

    res.json({ temporada, estado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventario/semana/:fecha
router.get('/semana/:fecha', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('inventario_semanas')
      .select('*, insumos(nombre, unidad_medida, categoria)')
      .eq('semana_inicio', req.params.fecha)
      .order('created_at');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventario/semana — carga conteo del domingo
router.post('/semana', requireAuth, async (req, res) => {
  try {
    const { semana_inicio, items, temporada } = req.body;
    // items: [{ insumo_id, stock_real }]

    if (!semana_inicio || !items?.length) {
      return res.status(400).json({ error: 'semana_inicio e items son requeridos' });
    }

    const registros = items.map(item => ({
      semana_inicio,
      insumo_id: item.insumo_id,
      stock_real: item.stock_real,
      temporada: temporada || 'normal',
      cargado_por: req.user.id
    }));

    // Upsert para permitir correcciones
    const { data, error } = await supabaseAdmin
      .from('inventario_semanas')
      .upsert(registros, { onConflict: 'semana_inicio,insumo_id' })
      .select();

    if (error) throw error;
    res.status(201).json({ cargados: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
