const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/insumos?proveedor_id=xxx
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('insumos')
      .select('*, proveedores(id, nombre)')
      .eq('activo', true)
      .order('nombre');

    if (req.query.proveedor_id) {
      query = query.eq('proveedor_id_default', req.query.proveedor_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insumos/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('insumos')
      .select('*, proveedores(nombre)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/insumos
router.post('/', requireAuth, async (req, res) => {
  try {
    const { nombre, unidad_medida, categoria, proveedor_id_default } = req.body;

    if (!nombre || !unidad_medida) {
      return res.status(400).json({ error: 'nombre y unidad_medida son requeridos' });
    }

    const { data, error } = await supabaseAdmin
      .from('insumos')
      .insert({ nombre, unidad_medida, categoria, proveedor_id_default })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/insumos/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const {
      nombre, unidad_medida, categoria, proveedor_id_default, activo,
      marca, unidad_precio, precio_lista,
      descuento_pct_1, descuento_pct_2, descuento_pct_3,
      iva_pct, iibb_pct, costo_final,
      tipo_envase, unidades_por_presentacion, contenido_por_unidad,
    } = req.body;

    // Calcular costo por unidad de uso (gr/ml/und)
    const unidades = unidades_por_presentacion || 1;
    const contenido = contenido_por_unidad || unidad_precio || 1;
    const costo_por_unidad_uso = costo_final && contenido
      ? costo_final / (unidades * contenido)
      : null;

    const { data, error } = await supabaseAdmin
      .from('insumos')
      .update({
        nombre, unidad_medida, categoria, proveedor_id_default, activo,
        marca, unidad_precio, precio_lista,
        descuento_pct_1, descuento_pct_2, descuento_pct_3,
        iva_pct, iibb_pct, costo_final,
        tipo_envase, unidades_por_presentacion, contenido_por_unidad,
        costo_por_unidad_uso,
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

// DELETE /api/insumos/:id (soft delete)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('insumos')
      .update({ activo: false })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Insumo desactivado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
