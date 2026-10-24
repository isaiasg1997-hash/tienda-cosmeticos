// Autenticación del panel: contraseñas con scrypt y sesiones en base de datos.
// La cookie lleva un token aleatorio; en la BD solo se guarda su hash.
const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../db');
const config = require('../config');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'admin_sesion';
const DURACION_HORAS = 12;

async function hashear(clave) {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(clave, sal, 64);
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`;
}

async function verificar(clave, guardado) {
  const [, salHex, hHex] = String(guardado).split('$');
  if (!salHex || !hHex) return false;
  const h = await scrypt(clave, Buffer.from(salHex, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hHex, 'hex'));
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function leerCookie(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

function opcionesCookie(maxAgeSeg) {
  const seguro = config.publicUrl.startsWith('https://');
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeg}${seguro ? '; Secure' : ''}`;
}

async function iniciarSesion(res, adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO sesiones (token_hash, admin_id, expira) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [sha(token), adminId, DURACION_HORAS],
  );
  await db.query('DELETE FROM sesiones WHERE expira < now()'); // limpieza
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${opcionesCookie(DURACION_HORAS * 3600)}`);
}

async function cerrarSesion(req, res) {
  const t = leerCookie(req);
  if (t) await db.query('DELETE FROM sesiones WHERE token_hash = $1', [sha(t)]);
  res.setHeader('Set-Cookie', `${COOKIE}=; ${opcionesCookie(0)}`);
}

// Middleware: exige sesión válida. Para cambios exige además el encabezado
// X-Panel: 1, que un formulario de otro sitio no puede enviar (protección CSRF extra).
async function requerirAdmin(req, res, next) {
  try {
    const t = leerCookie(req);
    if (!t) return res.status(401).json({ error: 'Inicia sesión' });
    const { rows: [a] } = await db.query(
      `SELECT a.id, a.email, a.nombre FROM sesiones s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = $1 AND s.expira > now() AND a.activo`, [sha(t)],
    );
    if (!a) return res.status(401).json({ error: 'Tu sesión expiró. Inicia sesión de nuevo.' });
    if (req.method !== 'GET' && req.get('X-Panel') !== '1') return res.status(403).json({ error: 'Solicitud no permitida' });
    req.admin = a;
    next();
  } catch (e) { next(e); }
}

module.exports = { hashear, verificar, iniciarSesion, cerrarSesion, requerirAdmin };
