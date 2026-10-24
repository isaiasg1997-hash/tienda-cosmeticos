// =========================================================
// Preparación al arrancar el servidor. Permite instalar la tienda
// sin consola (por ejemplo en Render): todo se controla con variables.
//
//   - Crea o actualiza las tablas (igual que "npm run migrar"). Siempre.
//   - DEMO_DATOS=si          → si no hay productos, carga los datos de ejemplo.
//   - ADMIN_EMAIL + ADMIN_CLAVE → si ese usuario del panel no existe, lo crea.
//     Nunca cambia la contraseña de un usuario que ya existe.
// =========================================================
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { hashear } = require('./auth');

const DIR = path.join(__dirname, '../db');
const si = (v) => /^(1|si|sí|true|yes)$/i.test(String(v || '').trim());

async function preparar() {
  await db.query(fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8'));
  console.log('[arranque] Tablas al día');

  if (si(process.env.DEMO_DATOS)) {
    const { rows: [{ n }] } = await db.query('SELECT COUNT(*)::int AS n FROM productos');
    if (n === 0) {
      await db.query(fs.readFileSync(path.join(DIR, 'seed.sql'), 'utf8'));
      console.log('[arranque] Datos de ejemplo cargados (DEMO_DATOS)');
    }
  }

  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const clave = String(process.env.ADMIN_CLAVE || '');
  if (email && clave) {
    if (clave.length < 10) {
      console.error('[arranque] ADMIN_CLAVE debe tener al menos 10 caracteres: no se creó el usuario del panel');
    } else {
      const { rowCount } = await db.query(
        `INSERT INTO admins (email, nombre, hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`,
        [email, String(process.env.ADMIN_NOMBRE || 'Administrador').slice(0, 60), await hashear(clave)],
      );
      if (rowCount) console.log(`[arranque] Usuario del panel creado: ${email}`);
    }
  }
}

module.exports = { preparar };
