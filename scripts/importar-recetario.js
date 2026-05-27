/**
 * importar-recetario.js
 * Importa Base_de_Datos (insumos) y Proyecto B (recetario + receta_insumos)
 * desde el Excel de Temple 2026.
 *
 * Uso: node scripts/importar-recetario.js
 */

require('dotenv').config();
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXCEL_PATH = path.join(
  process.env.HOME,
  'Downloads/Recetario Temple 2026 (Juani).xlsx'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeNombre(str) {
  if (!str) return '';
  return str.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function safeNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// ─── 1. BASE_DE_DATOS → insumos + proveedores ────────────────────────────────

async function importarBasesDeDatos(wb) {
  console.log('\n📦 Importando Base_de_Datos...');
  const sheet = wb.Sheets['Base_de_Datos'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Los datos reales arrancan en fila 4 (índice 4)
  const dataRows = rows.slice(4).filter(r => {
    const id = r[0];
    const nombre = r[1];
    return typeof id === 'number' && nombre && nombre.toString().trim() !== '';
  });

  console.log(`  → ${dataRows.length} insumos encontrados`);

  // Caché de proveedores ya creados: nombre → uuid
  const proveedoresCache = {};

  async function upsertProveedor(nombre) {
    if (!nombre || nombre.toString().trim() === '') return null;
    const key = normalizeNombre(nombre);
    if (proveedoresCache[key]) return proveedoresCache[key];

    const nombreStr = nombre.toString().trim();

    // Buscar primero
    const { data: existing } = await supabase
      .from('proveedores')
      .select('id')
      .eq('nombre', nombreStr)
      .maybeSingle();

    if (existing) {
      proveedoresCache[key] = existing.id;
      return existing.id;
    }

    // Crear si no existe
    const { data, error } = await supabase
      .from('proveedores')
      .insert({ nombre: nombreStr })
      .select('id')
      .single();

    if (error) {
      console.warn(`  ⚠️  Proveedor no creado: ${nombreStr} — ${error.message}`);
      return null;
    }
    proveedoresCache[key] = data.id;
    return data.id;
  }

  let creados = 0;
  let actualizados = 0;
  let errores = 0;

  for (const r of dataRows) {
    const id_interno = r[0].toString();
    const nombre = r[1].toString().trim();
    const marca = r[2] ? r[2].toString().trim() : null;
    const proveedorNombre = r[3] ? r[3].toString().trim() : null;
    const unidad_precio = safeNum(r[4]);
    const precio_lista = safeNum(r[5]);
    const descuento_pct_1 = safeNum(r[6]);
    const descuento_pct_2 = safeNum(r[8]);
    const descuento_pct_3 = safeNum(r[10]);
    const neto_dtos = safeNum(r[12]);
    const iva_pct = safeNum(r[15]);
    const iibb_pct = safeNum(r[17]);
    const costo_final = safeNum(r[21]);

    const proveedor_id_default = await upsertProveedor(proveedorNombre);

    // Determinar unidad_medida textual
    const unidad_medida = unidad_precio ? `${unidad_precio} ml/gr` : 'unidad';

    const insumoData = {
      nombre,
      marca,
      unidad_medida,
      id_interno,
      precio_lista,
      descuento_pct_1: descuento_pct_1 || 0,
      descuento_pct_2: descuento_pct_2 || 0,
      descuento_pct_3: descuento_pct_3 || 0,
      neto_dtos,
      iva_pct: iva_pct || 0,
      iibb_pct: iibb_pct || 0,
      costo_final,
      unidad_precio,
      activo: true,
      ...(proveedor_id_default ? { proveedor_id_default } : {}),
    };

    // Verificar si ya existe por id_interno
    const { data: existing } = await supabase
      .from('insumos')
      .select('id')
      .eq('id_interno', id_interno)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('insumos')
        .update(insumoData)
        .eq('id', existing.id);
      if (error) { console.warn(`  ⚠️  Update ${nombre}: ${error.message}`); errores++; }
      else actualizados++;
    } else {
      const { error } = await supabase
        .from('insumos')
        .insert(insumoData);
      if (error) { console.warn(`  ⚠️  Insert ${nombre}: ${error.message}`); errores++; }
      else creados++;
    }
  }

  console.log(`  ✅  Insumos creados: ${creados} | actualizados: ${actualizados} | errores: ${errores}`);
}

// ─── 2. PROYECTO B → recetario + receta_insumos ──────────────────────────────

async function importarProyectoB(wb) {
  console.log('\n🍔 Importando Proyecto B...');
  const sheet = wb.Sheets['Proyecto B'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Construir mapa de insumos por nombre normalizado (para lookup)
  const { data: insumosDB } = await supabase
    .from('insumos')
    .select('id, nombre, id_interno');

  const insumosMap = {};
  for (const ins of insumosDB || []) {
    insumosMap[normalizeNombre(ins.nombre)] = ins.id;
  }

  // También cache de insumos creados en esta sesión (por código ALM/VER)
  const codigoCache = {};

  async function resolverInsumoId(codigo, nombre) {
    // 1. Buscar por código en caché
    if (codigo && codigoCache[codigo]) return codigoCache[codigo];

    // 2. Buscar por nombre normalizado
    const key = normalizeNombre(nombre);
    if (insumosMap[key]) {
      if (codigo) codigoCache[codigo] = insumosMap[key];
      return insumosMap[key];
    }

    // 3. No encontrado → crear insumo placeholder
    const { data, error } = await supabase
      .from('insumos')
      .insert({
        nombre: nombre.toString().trim(),
        id_codigo: codigo || null,
        unidad_medida: 'unidad',
        activo: true,
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`  ⚠️  No se pudo crear insumo "${nombre}": ${error.message}`);
      return null;
    }

    const newId = data.id;
    insumosMap[key] = newId;
    if (codigo) codigoCache[codigo] = newId;
    return newId;
  }

  // Parsear recetas de Proyecto B (col 0-8)
  // - Fila de receta: col[1] comienza con "PB" y col[2] es texto y col[3] es número
  // - Fila de ingrediente: col[4] tiene código (ALM/VER/etc)

  const recetas = [];
  let currentReceta = null;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const col1 = r[1] ? r[1].toString().trim() : '';
    const col2 = r[2] ? r[2].toString().trim() : '';
    const col3 = r[3];
    const col4 = r[4] ? r[4].toString().trim() : '';
    const col5 = r[5] ? r[5].toString().trim() : '';
    const col6 = r[6];
    const col7 = r[7];
    const col8 = r[8];

    // Nueva receta: col1 empieza con "PB" o tiene formato similar, col3 es número
    if (col1.match(/^PB\d+/) && typeof col3 === 'number') {
      currentReceta = {
        codigo: col1,
        nombre: col2,
        costo_calculado: col3,
        presentacion: null,
        ingredientes: [],
      };
      recetas.push(currentReceta);

      // Esta misma fila puede tener un ingrediente
      if (col4 && col5) {
        currentReceta.ingredientes.push({
          id_codigo: col4,
          nombre: col5,
          cantidad: safeNum(col6),
          presentacion_insumo: safeNum(col7),
          costo_en_receta: safeNum(col8),
        });
      }
      continue;
    }

    // Si hay currentReceta activa
    if (currentReceta) {
      // Presentación del plato: col2 tiene texto tipo "130 GR", "9000 ML", col4 tiene ingrediente
      if (col2 && !col2.match(/^\d+$/) && col2.match(/GR|ML|KG|UN|KILOS/i)) {
        currentReceta.presentacion = col2;
      }

      // Ingrediente: col4 tiene código
      if (col4 && col5) {
        currentReceta.ingredientes.push({
          id_codigo: col4,
          nombre: col5,
          cantidad: safeNum(col6),
          presentacion_insumo: safeNum(col7),
          costo_en_receta: safeNum(col8),
        });
      } else if (!col1 && !col4 && !col5) {
        // Fila vacía - fin de receta
        // No hacemos nada, currentReceta sigue activa hasta nueva receta
      }
    }
  }

  console.log(`  → ${recetas.length} recetas parseadas`);

  let recetasCreadas = 0;
  let ingredientesCreados = 0;
  let errores = 0;

  for (const receta of recetas) {
    // Determinar tipo basado en código o nombre
    let tipo = 'plato';
    if (receta.nombre.toLowerCase().includes('prep') ||
        receta.nombre.toLowerCase().includes('aderezo') ||
        receta.nombre.toLowerCase().includes('salsa') ||
        receta.nombre.toLowerCase().includes('liquido') ||
        receta.nombre.toLowerCase().includes('relish') ||
        receta.nombre.toLowerCase().includes('crispy') ||
        receta.nombre.toLowerCase().includes('coleslaw') ||
        receta.nombre.toLowerCase().includes('confitura') ||
        receta.nombre.toLowerCase().includes('pickles') ||
        receta.nombre.toLowerCase().includes('marinada') ||
        receta.nombre.toLowerCase().includes('glaseado') ||
        receta.nombre.toLowerCase().includes('tempura') ||
        receta.nombre.toLowerCase().includes('alioli') ||
        receta.nombre.toLowerCase().includes('honey') ||
        receta.nombre.toLowerCase().includes('barbacoa') ||
        receta.nombre.toLowerCase().includes('ketchup') ||
        receta.nombre.toLowerCase().includes('siracha') ||
        receta.nombre.toLowerCase().includes('chili') ||
        receta.nombre.toLowerCase().includes('dressing') ||
        receta.nombre.toLowerCase().includes('pollo')) {
      tipo = 'prep';
    }

    // Upsert receta
    const { data: existingReceta } = await supabase
      .from('recetario')
      .select('id')
      .eq('codigo', receta.codigo)
      .maybeSingle();

    let recetaId;

    if (existingReceta) {
      const { error } = await supabase
        .from('recetario')
        .update({
          nombre: receta.nombre,
          costo_calculado: receta.costo_calculado,
          presentacion: receta.presentacion,
          tipo,
          activo: true,
        })
        .eq('id', existingReceta.id);

      if (error) { console.warn(`  ⚠️  Update receta ${receta.codigo}: ${error.message}`); errores++; continue; }
      recetaId = existingReceta.id;
    } else {
      const { data, error } = await supabase
        .from('recetario')
        .insert({
          codigo: receta.codigo,
          nombre: receta.nombre,
          costo_calculado: receta.costo_calculado,
          presentacion: receta.presentacion,
          tipo,
          activo: true,
        })
        .select('id')
        .single();

      if (error) { console.warn(`  ⚠️  Insert receta ${receta.codigo}: ${error.message}`); errores++; continue; }
      recetaId = data.id;
      recetasCreadas++;
    }

    // Eliminar ingredientes previos y reinsertar
    await supabase.from('receta_insumos').delete().eq('receta_id', recetaId);

    for (const ing of receta.ingredientes) {
      const insumoId = await resolverInsumoId(ing.id_codigo, ing.nombre);
      if (!insumoId) continue;

      const { error } = await supabase
        .from('receta_insumos')
        .insert({
          receta_id: recetaId,
          insumo_id: insumoId,
          id_codigo: ing.id_codigo,
          cantidad: ing.cantidad || 0,
          unidad: 'gr',
          presentacion_insumo: ing.presentacion_insumo,
          costo_en_receta: ing.costo_en_receta,
        });

      if (error) {
        console.warn(`    ⚠️  Ingrediente ${ing.nombre}: ${error.message}`);
      } else {
        ingredientesCreados++;
      }
    }
  }

  // También update insumos con id_codigo para los que encontramos códigos
  for (const [codigo, insumoId] of Object.entries(codigoCache)) {
    await supabase
      .from('insumos')
      .update({ id_codigo: codigo })
      .eq('id', insumoId)
      .is('id_codigo', null);
  }

  console.log(`  ✅  Recetas creadas: ${recetasCreadas} | ingredientes: ${ingredientesCreados} | errores: ${errores}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 ABASTO — Importador Excel');
  console.log('   Archivo:', EXCEL_PATH);

  const wb = XLSX.readFile(EXCEL_PATH);

  await importarBasesDeDatos(wb);
  await importarProyectoB(wb);

  console.log('\n✨ Importación completada.');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
