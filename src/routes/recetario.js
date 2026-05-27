const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/recetario
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('recetario')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recetario/:id — con composición de insumos
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data: receta, error } = await supabaseAdmin
      .from('recetario')
      .select('*, receta_insumos(*, insumos(nombre, unidad_medida))')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(receta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recetario/:id/costo — calcula costo con precios vigentes
router.get('/:id/costo', requireAuth, async (req, res) => {
  try {
    const { data: receta, error: recetaError } = await supabaseAdmin
      .from('recetario')
      .select(`*,
        receta_insumos(
          cantidad, unidad, insumo_id, costo_en_receta, id_codigo,
          insumos(nombre, unidad_medida, proveedor_id_default, costo_final, precio_lista, unidad_precio)
        )`)
      .eq('id', req.params.id)
      .single();

    if (recetaError) throw recetaError;

    let costo_total = 0;
    const detalle = [];

    for (const item of receta.receta_insumos) {
      const proveedorId = item.insumos?.proveedor_id_default;

      // 1. Buscar precio pactado vigente en maestro_precios
      let precio_unitario = null;
      if (proveedorId) {
        const { data: precio } = await supabaseAdmin
          .from('maestro_precios')
          .select('precio_pactado')
          .eq('insumo_id', item.insumo_id)
          .eq('proveedor_id', proveedorId)
          .is('vigencia_hasta', null)
          .maybeSingle();
        precio_unitario = precio?.precio_pactado ?? null;
      }

      // 2. Fallback: costo_final del insumo (por unidad de precio)
      if (precio_unitario === null && item.insumos?.costo_final) {
        const unidadPrecio = item.insumos.unidad_precio || 1;
        precio_unitario = item.insumos.costo_final / unidadPrecio;
      }

      precio_unitario = precio_unitario || 0;

      // 3. Usar costo_en_receta importado si precio calculado es 0
      const subtotal = precio_unitario > 0
        ? precio_unitario * item.cantidad
        : (item.costo_en_receta || 0);

      costo_total += subtotal;

      detalle.push({
        insumo: item.insumos?.nombre || item.id_codigo || '—',
        cantidad: item.cantidad,
        unidad: item.unidad,
        precio_unitario: Math.round(precio_unitario * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
      });
    }

    // Usar costo_calculado importado si el detalle no suma nada
    const costo_final = costo_total > 0 ? costo_total : (receta.costo_calculado || 0);

    const margen = receta.precio_venta && costo_final > 0
      ? ((receta.precio_venta - costo_final) / receta.precio_venta * 100).toFixed(1)
      : null;

    res.json({
      receta: receta.nombre,
      codigo: receta.codigo,
      tipo: receta.tipo,
      presentacion: receta.presentacion,
      precio_venta: receta.precio_venta,
      costo_total: Math.round(costo_final * 100) / 100,
      margen_pct: margen,
      detalle
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recetario
router.post('/', requireAuth, async (req, res) => {
  try {
    const { nombre, categoria, precio_venta, insumos } = req.body;

    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

    // Crear receta
    const { data: receta, error } = await supabaseAdmin
      .from('recetario')
      .insert({ nombre, categoria, precio_venta })
      .select()
      .single();

    if (error) throw error;

    // Agregar insumos si vienen
    if (insumos && insumos.length > 0) {
      const items = insumos.map(i => ({
        receta_id: receta.id,
        insumo_id: i.insumo_id,
        cantidad: i.cantidad,
        unidad: i.unidad
      }));

      const { error: insumosError } = await supabaseAdmin
        .from('receta_insumos')
        .insert(items);

      if (insumosError) throw insumosError;
    }

    res.status(201).json(receta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/recetario/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { nombre, categoria, precio_venta, activo, tipo, presentacion } = req.body;

    const { data, error } = await supabaseAdmin
      .from('recetario')
      .update({ nombre, categoria, precio_venta, activo, tipo, presentacion })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recetario/:id (soft delete)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('recetario')
      .update({ activo: false })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Receta desactivada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
