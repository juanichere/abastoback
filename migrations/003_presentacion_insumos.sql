-- Migration 003: Presentación de compra detallada por insumo

ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS tipo_envase text,              -- lata, botella, barril, bolsa, caja, kg, unidad
  ADD COLUMN IF NOT EXISTS unidades_por_presentacion numeric DEFAULT 1, -- 24 (para caja x24 latas)
  ADD COLUMN IF NOT EXISTS contenido_por_unidad numeric,  -- 354 (ml por lata) — renombra semánticamente unidad_precio
  ADD COLUMN IF NOT EXISTS costo_por_unidad_uso numeric;  -- calculado: costo_final / (unidades * contenido)
