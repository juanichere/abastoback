-- Migration 002: Extend schema for Excel import (Base_de_Datos + Proyecto B)

-- ─── INSUMOS: add new columns ────────────────────────────────────────────────
ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS id_interno text,           -- código numérico de Base_de_Datos
  ADD COLUMN IF NOT EXISTS id_codigo text,            -- código ALM/VER/etc
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS unidad_precio numeric,     -- Gr / cm3
  ADD COLUMN IF NOT EXISTS precio_lista numeric,
  ADD COLUMN IF NOT EXISTS descuento_pct_1 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_pct_2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_pct_3 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS neto_dtos numeric,
  ADD COLUMN IF NOT EXISTS iva_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iibb_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_final numeric;

-- ─── RECETARIO: add new columns ──────────────────────────────────────────────
ALTER TABLE recetario
  ADD COLUMN IF NOT EXISTS id_pos text,               -- código THINKION (POS)
  ADD COLUMN IF NOT EXISTS codigo text,               -- código interno (PB1, PB2, etc.)
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'plato'  -- plato | prep | trago | postre
    CHECK (tipo IN ('plato', 'prep', 'trago', 'postre', 'otro')),
  ADD COLUMN IF NOT EXISTS presentacion text,         -- "130 GR", "9000 ML", etc.
  ADD COLUMN IF NOT EXISTS costo_calculado numeric;   -- costo total importado del Excel

-- ─── RECETA_INSUMOS: add insumo detail columns ───────────────────────────────
ALTER TABLE receta_insumos
  ADD COLUMN IF NOT EXISTS id_codigo text,            -- código ALM/VER del ingrediente
  ADD COLUMN IF NOT EXISTS presentacion_insumo numeric, -- presentación del insumo (ej: 300 gr)
  ADD COLUMN IF NOT EXISTS costo_en_receta numeric;   -- costo calculado para esta cantidad

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_insumos_id_interno ON insumos(id_interno);
CREATE INDEX IF NOT EXISTS idx_insumos_id_codigo  ON insumos(id_codigo);
CREATE INDEX IF NOT EXISTS idx_recetario_codigo   ON recetario(codigo);
CREATE INDEX IF NOT EXISTS idx_recetario_id_pos   ON recetario(id_pos);
