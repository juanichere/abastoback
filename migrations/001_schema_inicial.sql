-- ============================================================
-- ABASTO — Schema inicial v0.1
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- PROVEEDORES (va primero porque insumos la referencia)
CREATE TABLE proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  rubro text,
  condicion_pago text,
  descuento_pct numeric,
  descuento_condicion text,
  email text,
  telefono text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- INSUMOS
CREATE TABLE insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  unidad_medida text NOT NULL,
  categoria text,
  proveedor_id_default uuid REFERENCES proveedores(id),
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- MAESTRO DE PRECIOS
CREATE TABLE maestro_precios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid REFERENCES proveedores(id) ON DELETE CASCADE,
  insumo_id uuid REFERENCES insumos(id) ON DELETE CASCADE,
  precio_pactado numeric NOT NULL,
  vigencia_desde date NOT NULL,
  vigencia_hasta date,
  notas text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(proveedor_id, insumo_id, vigencia_desde)
);

-- RECETARIO
CREATE TABLE recetario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  categoria text,
  precio_venta numeric,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RECETA_INSUMOS
CREATE TABLE receta_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receta_id uuid REFERENCES recetario(id) ON DELETE CASCADE,
  insumo_id uuid REFERENCES insumos(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL,
  unidad text NOT NULL
);

-- MINIMOS_INVENTARIO
CREATE TABLE minimos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid REFERENCES insumos(id) ON DELETE CASCADE,
  temporada text NOT NULL CHECK (temporada IN ('normal', 'alta', 'baja')),
  cantidad_minima numeric NOT NULL,
  vigente boolean DEFAULT true
);

-- INVENTARIO_SEMANAS
CREATE TABLE inventario_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio date NOT NULL,
  insumo_id uuid REFERENCES insumos(id) ON DELETE CASCADE,
  stock_real numeric NOT NULL,
  temporada text DEFAULT 'normal',
  cargado_por uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(semana_inicio, insumo_id)
);

-- VENTAS_SEMANAS
CREATE TABLE ventas_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio date NOT NULL UNIQUE,
  ventas_total numeric NOT NULL,
  fuente text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

-- ORDENES_COMPRA
CREATE TABLE ordenes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio date NOT NULL,
  proveedor_id uuid REFERENCES proveedores(id),
  monto_estimado numeric,
  estado text DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobada', 'enviada', 'recibida')),
  aprobado_por uuid,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- ORDEN_ITEMS
CREATE TABLE orden_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  insumo_id uuid REFERENCES insumos(id),
  cantidad numeric NOT NULL,
  precio_unitario_esperado numeric,
  subtotal numeric
);

-- FACTURAS_COMPRA
CREATE TABLE facturas_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid REFERENCES ordenes_compra(id),
  proveedor_id uuid REFERENCES proveedores(id),
  fecha_factura date,
  numero_factura text,
  monto_total numeric,
  archivo_url text,
  fuente text DEFAULT 'upload' CHECK (fuente IN ('email', 'whatsapp', 'drive', 'upload')),
  ocr_json jsonb,
  estado_revision text DEFAULT 'pendiente' CHECK (estado_revision IN ('pendiente', 'revisada', 'con_desvios', 'aprobada')),
  created_at timestamptz DEFAULT now()
);

-- FACTURA_ITEMS
CREATE TABLE factura_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid REFERENCES facturas_compra(id) ON DELETE CASCADE,
  insumo_id uuid REFERENCES insumos(id),
  nombre_original text,
  cantidad numeric,
  precio_unitario numeric,
  descuento_aplicado_pct numeric,
  subtotal numeric
);

-- DESVIOS
CREATE TABLE desvios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid REFERENCES facturas_compra(id),
  factura_item_id uuid REFERENCES factura_items(id),
  insumo_id uuid REFERENCES insumos(id),
  proveedor_id uuid REFERENCES proveedores(id),
  precio_pactado numeric,
  precio_cobrado numeric,
  diferencia numeric,
  impacto_total numeric,
  tipo text CHECK (tipo IN ('aumento_sin_aviso', 'descuento_no_aplicado', 'item_no_autorizado')),
  resuelto boolean DEFAULT false,
  resolucion text,
  created_at timestamptz DEFAULT now()
);

-- BENCHMARK_PRECIOS
CREATE TABLE benchmark_precios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid REFERENCES insumos(id),
  fuente text NOT NULL,
  nombre_fuente text,
  precio numeric NOT NULL,
  unidad text,
  fecha_captura date NOT NULL,
  url_fuente text,
  created_at timestamptz DEFAULT now()
);

-- INSUMO_ALIASES (para matching de nombres en facturas)
CREATE TABLE insumo_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid REFERENCES insumos(id) ON DELETE CASCADE,
  nombre_alternativo text NOT NULL UNIQUE,
  creado_por text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

-- CONFIGURACION (clave-valor para settings del sistema)
CREATE TABLE configuracion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  valor text NOT NULL,
  descripcion text,
  updated_at timestamptz DEFAULT now()
);

-- Valor inicial de temporada
INSERT INTO configuracion (clave, valor, descripcion)
VALUES ('temporada_activa', 'normal', 'Temporada activa: normal | alta | baja');

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_inventario_semana ON inventario_semanas(semana_inicio);
CREATE INDEX idx_inventario_insumo ON inventario_semanas(insumo_id);
CREATE INDEX idx_maestro_insumo ON maestro_precios(insumo_id);
CREATE INDEX idx_maestro_proveedor ON maestro_precios(proveedor_id);
CREATE INDEX idx_desvios_factura ON desvios(factura_id);
CREATE INDEX idx_desvios_proveedor ON desvios(proveedor_id);
CREATE INDEX idx_ordenes_semana ON ordenes_compra(semana_inicio);
CREATE INDEX idx_benchmark_insumo ON benchmark_precios(insumo_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS básico — todos los usuarios autenticados leen)
-- ============================================================

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE maestro_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetario ENABLE ROW LEVEL SECURITY;
ALTER TABLE receta_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE minimos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE desvios ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden leer todo
CREATE POLICY "Lectura autenticada" ON proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON maestro_precios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON recetario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON receta_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON minimos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON inventario_semanas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON ventas_semanas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON ordenes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON orden_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON facturas_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON factura_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON desvios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON benchmark_precios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON insumo_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticada" ON configuracion FOR SELECT TO authenticated USING (true);

-- Política: escritura también para autenticados (el backend usa service_role y bypasea esto)
CREATE POLICY "Escritura autenticada" ON proveedores FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON insumos FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON maestro_precios FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON recetario FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON receta_insumos FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON minimos_inventario FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON inventario_semanas FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON ventas_semanas FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON ordenes_compra FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON orden_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON facturas_compra FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON factura_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON desvios FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON benchmark_precios FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON insumo_aliases FOR ALL TO authenticated USING (true);
CREATE POLICY "Escritura autenticada" ON configuracion FOR ALL TO authenticated USING (true);
