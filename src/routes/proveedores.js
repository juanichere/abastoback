const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/proveedores
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('proveedores')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proveedores/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('proveedores')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proveedores
router.post('/', requireAuth, async (req, res) => {
  try {
    const { nombre, rubro, condicion_pago, descuento_pct, descuento_condicion, email, telefono } = req.body;

    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

    const { data, error } = await supabaseAdmin
      .from('proveedores')
      .insert({ nombre, rubro, condicion_pago, descuento_pct, descuento_condicion, email, telefono })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/proveedores/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const campos = req.body;
    const { data, error } = await supabaseAdmin
      .from('proveedores')
      .update(campos)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proveedores/:id/precios — maestro de precios vigentes
router.get('/:id/precios', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('maestro_precios')
      .select('*, insumos(nombre, unidad_medida)')
      .eq('proveedor_id', req.params.id)
      .is('vigencia_hasta', null) // solo vigentes
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proveedores/:id/precios — agregar precio pactado
router.post('/:id/precios', requireAuth, async (req, res) => {
  try {
    const { insumo_id, precio_pactado, vigencia_desde, notas } = req.body;

    if (!insumo_id || !precio_pactado || !vigencia_desde) {
      return res.status(400).json({ error: 'insumo_id, precio_pactado y vigencia_desde son requeridos' });
    }

    // Cerrar precio anterior si existe
    await supabaseAdmin
      .from('maestro_precios')
      .update({ vigencia_hasta: vigencia_desde })
      .eq('proveedor_id', req.params.id)
      .eq('insumo_id', insumo_id)
      .is('vigencia_hasta', null);

    // Insertar nuevo precio
    const { data, error } = await supabaseAdmin
      .from('maestro_precios')
      .insert({
        proveedor_id: req.params.id,
        insumo_id,
        precio_pactado,
        vigencia_desde,
        notas
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
