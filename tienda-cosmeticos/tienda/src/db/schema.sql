-- =========================================================
-- Esquema de la tienda. Es el mismo para todos los clientes:
-- cada instalación tiene su propia base de datos.
-- =========================================================

CREATE TABLE IF NOT EXISTS ajustes (
  clave  TEXT PRIMARY KEY,
  valor  JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS categorias (
  id      SERIAL PRIMARY KEY,
  slug    TEXT UNIQUE NOT NULL,
  nombre  TEXT NOT NULL,
  orden   INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productos (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  nombre        TEXT NOT NULL,
  descripcion   TEXT NOT NULL DEFAULT '',
  categoria_id  INT REFERENCES categorias(id) ON DELETE SET NULL,
  precio        INT  NOT NULL CHECK (precio >= 0),        -- CLP, IVA incluido
  precio_antes  INT  CHECK (precio_antes IS NULL OR precio_antes > precio),
  stock         INT  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  imagen_url    TEXT,                                     -- si es NULL se dibuja el envase
  forma         TEXT NOT NULL DEFAULT 'jar',              -- dropper | jar | tube | pump | stick
  colores       JSONB NOT NULL DEFAULT '["#EED6E4","#9C4F7E"]',
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INT NOT NULL DEFAULT 0,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resenas (
  id           SERIAL PRIMARY KEY,
  producto_id  INT REFERENCES productos(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  estrellas    INT  NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  texto        TEXT NOT NULL,
  verificada   BOOLEAN NOT NULL DEFAULT FALSE,
  aprobada     BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         TEXT UNIQUE NOT NULL,                    -- número visible: P-000123
  estado         TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','pagado','rechazado','anulado','despachado','entregado')),
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL,
  telefono       TEXT NOT NULL,
  rut            TEXT,
  region         TEXT NOT NULL,
  comuna         TEXT NOT NULL,
  direccion      TEXT NOT NULL,
  notas          TEXT,
  subtotal       INT NOT NULL,
  envio          INT NOT NULL,
  total          INT NOT NULL,
  pasarela       TEXT NOT NULL,
  pasarela_ref   TEXT,                                    -- token / id de la pasarela
  pasarela_resp  JSONB,                                   -- respuesta cruda, para auditoría
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  pagado_en      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pedidos_ref_idx ON pedidos (pasarela, pasarela_ref);

CREATE TABLE IF NOT EXISTS pedido_items (
  id           SERIAL PRIMARY KEY,
  pedido_id    UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id  INT REFERENCES productos(id) ON DELETE SET NULL,
  nombre       TEXT NOT NULL,          -- copia: el pedido no cambia si después editan el producto
  precio       INT  NOT NULL,
  cantidad     INT  NOT NULL CHECK (cantidad > 0)
);

CREATE SEQUENCE IF NOT EXISTS pedido_numero START 1001;

-- =========================================================
-- Panel de administración
-- =========================================================
CREATE TABLE IF NOT EXISTS admins (
  id         SERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  nombre     TEXT NOT NULL,
  hash       TEXT NOT NULL,                 -- scrypt
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash  TEXT PRIMARY KEY,             -- se guarda el hash, nunca el token
  admin_id    INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expira      TIMESTAMPTZ NOT NULL
);

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS seguimiento TEXT;      -- n° de seguimiento del courier
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS despachado_en TIMESTAMPTZ;

-- =========================================================
-- Correos (cola con reintentos). Un correo por pedido y tipo:
-- aunque el pago se confirme dos veces, se envía una sola vez.
-- =========================================================
CREATE TABLE IF NOT EXISTS correos (
  id            SERIAL PRIMARY KEY,
  pedido_id     UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,                 -- confirmacion | aviso_venta | despacho
  destinatario  TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','fallido')),
  intentos      INT  NOT NULL DEFAULT 0,
  proximo       TIMESTAMPTZ NOT NULL DEFAULT now(),
  error         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_en    TIMESTAMPTZ,
  UNIQUE (pedido_id, tipo)
);
CREATE INDEX IF NOT EXISTS correos_cola_idx ON correos (proximo) WHERE estado = 'pendiente';

-- =========================================================
-- Entrega local: retiro coordinado (sin dirección)
-- =========================================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS retiro BOOLEAN NOT NULL DEFAULT FALSE;

-- =========================================================
-- Variantes (tonos, tamaños). Opcionales: un producto sin
-- variantes usa su propio stock y precio.
-- =========================================================
CREATE TABLE IF NOT EXISTS variantes (
  id           SERIAL PRIMARY KEY,
  producto_id  INT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,                 -- "Arena", "50 ml"
  color        TEXT,                          -- #hex para mostrar el tono (opcional)
  precio       INT CHECK (precio IS NULL OR precio > 0),  -- NULL = precio del producto
  stock        INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  orden        INT NOT NULL DEFAULT 0,
  UNIQUE (producto_id, nombre)
);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS variante_etiqueta TEXT;     -- "Tono", "Tamaño"
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS variante_id INT REFERENCES variantes(id) ON DELETE SET NULL;
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS variante TEXT;           -- copia del nombre

-- Página de producto
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagenes JSONB NOT NULL DEFAULT '[]';   -- fotos adicionales
ALTER TABLE productos ADD COLUMN IF NOT EXISTS detalle TEXT NOT NULL DEFAULT '';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS ingredientes TEXT NOT NULL DEFAULT '';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS modo_uso TEXT NOT NULL DEFAULT '';

-- =========================================================
-- Reserva de stock: se aparta al crear el pedido y se devuelve
-- si no se paga. NULL = pedido antiguo (antes de la reserva).
--   reservado  → apartado, esperando el pago
--   descontado → pagado, el stock ya salió
--   liberado   → anulado/rechazado, el stock se devolvió
-- =========================================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS stock_estado TEXT;

-- =========================================================
-- Fotos guardadas en la base de datos (no en disco), para que
-- sobrevivan reinicios en hostings sin disco permanente (Render, etc.)
-- =========================================================
CREATE TABLE IF NOT EXISTS archivos (
  id         TEXT PRIMARY KEY,                -- 32 caracteres hex aleatorios
  tipo       TEXT NOT NULL,                   -- image/jpeg | image/png | image/webp
  datos      BYTEA NOT NULL,
  tamano     INT NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
