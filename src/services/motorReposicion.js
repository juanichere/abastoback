const { supabaseAdmin } = require('../utils/supabase');

const BUFFER = 1.2; // 20% de buffer sobre el mínimo

async function generar(semanaInicio) {
  console.log(`[motorReposicion] Generando sugerencia para semana: ${semanaInicio}`);

  // 1. Obtener temporada activa
  const { data: config } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'temporada_activa')
    .single();

  const temporada = config?.valor || 'normal';

  // 2. Obtener inventario de esa semana
  const { data: inventario, error: invError } = await supabaseAdmin
    .from('inventario_semanas')
    .select('insumo_id, stock_real')
    .eq('semana_inicio', semanaInicio);

  if (invError) throw invError;

  const stockMap = {};
  (inventario || []).forEach(i => { stockMap[i.insumo_id] = i.stock_real; });

  // 3. Obtener mínimos de inventario según temporada
  const { data: minimos, error: minError } = await supabaseAdmin
    .from('minimos_inventario')
    .select('insumo_id, cantidad_minima')
    .eq('temporada', temporada)
    .eq('vigente', true);

  if (minError) throw minError;

  // 4. Detectar qué insumos necesitan reposición
  const necesidades = [];

  for (const minimo of minimos) {
    const stock = stockMap[minimo.insumo_id] ?? 0;

    if (stock < minimo.cantidad_minima) {
      const cantidad_sugerida = (minimo.cantidad_minima * BUFFER) - stock;
      necesidades.push({
        insumo_id: minimo.insumo_id,
        stock_actual: stock,
        cantidad_minima: minimo.cantidad_minima,
        cantidad_sugerida: Math.ceil(cantidad_sugerida * 100) / 100
      });
    }
  }

  if (necesidades.length === 0) {
    return { mensaje: 'Stock suficiente, no se generaron órdenes', ordenes: [] };
  }

  // 5. Obtener proveedor default y precio vigente para cada insumo
  const insumoIds = necesidades.map(n => n.insumo_id);

  const { data: insumos } = await supabaseAdmin
    .from('insumos')
    .select('id, nombre, unidad_medida, proveedor_id_default')
    .in('id', insumoIds);

  const insumoMap = {};
  (insumos || []).forEach(i => { insumoMap[i.id] = i; });

  // 6. Obtener precios vigentes
  const { data: precios } = await supabaseAdmin
    .from('maestro_precios')
    .select('insumo_id, proveedor_id, precio_pactado')
    .in('insumo_id', insumoIds)
    .is('vigencia_hasta', null);

  const precioMap = {};
  (precios || []).forEach(p => {
    const key = `${p.insumo_id}_${p.proveedor_id}`;
    precioMap[key] = p.precio_pactado;
  });

  // 7. Agrupar por proveedor
  const porProveedor = {};

  for (const necesidad of necesidades) {
    const insumo = insumoMap[necesidad.insumo_id];
    if (!insumo?.proveedor_id_default) continue;

    const provId = insumo.proveedor_id_default;
    const key = `${necesidad.insumo_id}_${provId}`;
    const precio = precioMap[key] || 0;
    const subtotal = precio * necesidad.cantidad_sugerida;

    if (!porProveedor[provId]) porProveedor[provId] = { items: [], monto_total: 0 };

    porProveedor[provId].items.push({
      insumo_id: necesidad.insumo_id,
      nombre: insumo.nombre,
      cantidad: necesidad.cantidad_sugerida,
      precio_unitario_esperado: precio,
      subtotal
    });
    porProveedor[provId].monto_total += subtotal;
  }

  // 8. Verificar presupuesto disponible
  const { data: ventas } = await supabaseAdmin
    .from('ventas_semanas')
    .select('ventas_total')
    .eq('semana_inicio', semanaInicio)
    .single();

  const presupuesto = (ventas?.ventas_total || 0) * 0.32;
  const total_sugerido = Object.values(porProveedor).reduce((s, p) => s + p.monto_total, 0);

  // 9. Crear órdenes de compra en borrador
  const ordenes = [];

  for (const [proveedorId, data] of Object.entries(porProveedor)) {
    const { data: orden, error: ordenError } = await supabaseAdmin
      .from('ordenes_compra')
      .insert({
        semana_inicio: semanaInicio,
        proveedor_id: proveedorId,
        monto_estimado: Math.round(data.monto_total * 100) / 100,
        estado: 'borrador',
        notas: `Generado automáticamente para semana ${semanaInicio}`
      })
      .select()
      .single();

    if (ordenError) throw ordenError;

    // Insertar items
    const items = data.items.map(item => ({
      orden_id: orden.id,
      insumo_id: item.insumo_id,
      cantidad: item.cantidad,
      precio_unitario_esperado: item.precio_unitario_esperado,
      subtotal: item.subtotal
    }));

    await supabaseAdmin.from('orden_items').insert(items);

    ordenes.push({ ...orden, items });
  }

  return {
    semana_inicio: semanaInicio,
    temporada,
    ordenes_generadas: ordenes.length,
    total_sugerido: Math.round(total_sugerido),
    presupuesto_disponible: Math.round(presupuesto),
    excede_presupuesto: total_sugerido > presupuesto,
    ordenes
  };
}

module.exports = { generar };
