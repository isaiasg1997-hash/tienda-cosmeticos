// =========================================================
// API del panel de administración (/api/admin/*)
// =========================================================
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const db = require('../db');
const auth = require('../lib/auth');
const correo = require('../lib/correo');
const config = require('../config');

class Invalido extends Error {}
const ok = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof Invalido) return res.status(400).json({ error: e.message });
    if (e.code === '23503') return res.status(400).json({ error: 'La categoría o el producto elegido ya no existe' });
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un registro con ese identificador (slug o correo)' });
    next(e);
  }
};
const txt = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const entero = (v, campo, { min = 0, nulo = false } = {}) => {
  if (nulo && (v === null || v === '' || v === undefined)) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new Invalido(`${campo}: debe ser un número entero${min ? ` mayor o igual a ${min}` : ''}`);
  return n;
};
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const HEX = /^#[0-9a-fA-F]{6}$/;

// ---------------- Sesión ----------------
let _falso; const hashFalso = async () => (_falso ||= await auth.hashear(crypto.randomBytes(16).toString('hex')));
const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' } });

router.post('/login', limiteLogin, ok(async (req, res) => {
  const email = txt(req.body?.email, 200).toLowerCase();
  const clave = typeof req.body?.clave === 'string' ? req.body.clave : '';
  const { rows: [a] } = await db.query('SELECT id, nombre, hash FROM admins WHERE email = $1 AND activo', [email]);
  // Se verifica igual aunque no exista el usuario, para no revelar qué correos existen
  const valido = await auth.verificar(clave, a?.hash || await hashFalso()).catch(() => false);
  if (!a || !valido) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  await auth.iniciarSesion(res, a.id);
  res.json({ nombre: a.nombre });
}));

router.post('/logout', ok(async (req, res) => { await auth.cerrarSesion(req, res); res.json({ ok: true }); }));

// Todo lo de abajo requiere sesión
router.use(auth.requerirAdmin);
router.get('/yo', (req, res) => res.json(req.admin));

// ---------------- Resumen ----------------
router.get('/resumen', ok(async (req, res) => {
  const [ventas, estados, stock, serie] = await Promise.all([
    db.query(`SELECT
        COALESCE(SUM(total) FILTER (WHERE pagado_en >= date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'),0)::int AS hoy,
        COALESCE(SUM(total) FILTER (WHERE pagado_en >= date_trunc('month', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'),0)::int AS mes,
        COUNT(*) FILTER (WHERE pagado_en >= date_trunc('month', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago')::int AS pedidos_mes
      FROM pedidos WHERE estado IN ('pagado','despachado','entregado')`),
    db.query('SELECT estado, COUNT(*)::int AS n FROM pedidos GROUP BY estado'),
    db.query(`SELECT p.id, p.nombre, p.stock FROM productos p
                WHERE p.activo AND p.stock <= 5 AND NOT EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.activo)
              UNION ALL
              SELECT p.id, p.nombre || ' · ' || v.nombre, v.stock FROM variantes v JOIN productos p ON p.id = v.producto_id
                WHERE p.activo AND v.activo AND v.stock <= 5
              ORDER BY 3, 2`),
    db.query(`SELECT to_char(d, 'YYYY-MM-DD') AS dia, COALESCE(SUM(p.total),0)::int AS total
      FROM generate_series((now() AT TIME ZONE 'America/Santiago')::date - 29, (now() AT TIME ZONE 'America/Santiago')::date, '1 day') d
      LEFT JOIN pedidos p ON (p.pagado_en AT TIME ZONE 'America/Santiago')::date = d AND p.estado IN ('pagado','despachado','entregado')
      GROUP BY d ORDER BY d`),
  ]);
  res.json({
    ...ventas.rows[0],
    por_estado: Object.fromEntries(estados.rows.map((r) => [r.estado, r.n])),
    stock_bajo: stock.rows,
    serie: serie.rows,
  });
}));

// ---------------- Pedidos ----------------
const ESTADOS = ['pendiente', 'pagado', 'rechazado', 'anulado', 'despachado', 'entregado'];
// Cambios de estado que se pueden hacer a mano
const TRANSICIONES = { pagado: ['despachado'], despachado: ['entregado', 'pagado'], entregado: ['despachado'], pendiente: ['anulado'] };

function filtroPedidos(q) {
  const where = []; const params = [];
  if (ESTADOS.includes(q.estado)) { params.push(q.estado); where.push(`estado = $${params.length}`); }
  else if (q.estado !== 'todos') where.push("estado NOT IN ('anulado','rechazado')");   // por defecto, solo los que importan
  if (q.q) {
    params.push(`%${txt(q.q, 100)}%`);
    where.push(`(codigo ILIKE $${params.length} OR nombre ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/pedidos', ok(async (req, res) => {
  const { sql, params } = filtroPedidos(req.query);
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const { rows } = await db.query(
    `SELECT id, codigo, estado, nombre, email, comuna, region, retiro, total, creado_en, pagado_en, seguimiento,
            COUNT(*) OVER() AS total_filas
     FROM pedidos ${sql} ORDER BY creado_en DESC LIMIT 25 OFFSET ${(pagina - 1) * 25}`, params);
  res.json({ pedidos: rows.map(({ total_filas, ...r }) => r), total: Number(rows[0]?.total_filas || 0), pagina, por_pagina: 25 });
}));

// Exportar a CSV (abre directo en Excel)
router.get('/pedidos.csv', ok(async (req, res) => {
  const { sql, params } = filtroPedidos(req.query);
  const { rows } = await db.query(
    `SELECT p.codigo, p.estado, to_char(p.creado_en AT TIME ZONE 'America/Santiago','DD-MM-YYYY HH24:MI') AS fecha,
            p.nombre, p.rut, p.email, p.telefono, p.region, p.comuna, p.direccion,
            string_agg(i.nombre || ' x' || i.cantidad, ' | ') AS productos,
            p.subtotal, p.envio, p.total, p.pasarela, p.seguimiento
     FROM pedidos p LEFT JOIN pedido_items i ON i.pedido_id = p.id ${sql.replace(/\b(estado|codigo|nombre|email)\b/g, 'p.$1')}
     GROUP BY p.id ORDER BY p.creado_en DESC`, params);
  const col = ['codigo', 'estado', 'fecha', 'nombre', 'rut', 'email', 'telefono', 'region', 'comuna', 'direccion', 'productos', 'subtotal', 'envio', 'total', 'pasarela', 'seguimiento'];
  const celda = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=@\t\r]|^[+\-](?![\d\s])/.test(s)) s = `'${s}`;          // evita inyección de fórmulas en Excel
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [col.join(';'), ...rows.map((r) => col.map((c) => celda(r[c])).join(';'))].join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send(csv);
}));

router.get('/pedidos/:id', ok(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'No encontrado' });
  const { rows: [p] } = await db.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  const { rows: items } = await db.query('SELECT nombre, precio, cantidad FROM pedido_items WHERE pedido_id = $1', [p.id]);
  const { rows: correos } = await db.query(
    'SELECT tipo, destinatario, estado, intentos, error, enviado_en, proximo FROM correos WHERE pedido_id = $1 ORDER BY creado_en', [p.id]);
  res.json({ ...p, items, correos });
}));

router.patch('/pedidos/:id', ok(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'No encontrado' });
  const { rows: [p] } = await db.query('SELECT estado FROM pedidos WHERE id = $1', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  const nuevo = req.body?.estado ?? p.estado;
  if (nuevo !== p.estado && !(TRANSICIONES[p.estado] || []).includes(nuevo)) {
    throw new Invalido(`No se puede pasar de "${p.estado}" a "${nuevo}"`);
  }
  if (nuevo === 'anulado' && p.estado === 'pendiente') {
    await require('../lib/pedidos').anular(req.params.id, { motivo: 'anulado en el panel' });
    return res.json({ id: req.params.id, estado: 'anulado' });
  }
  const seguimiento = req.body?.seguimiento !== undefined ? (txt(req.body.seguimiento, 100) || null) : undefined;
  const { rows: [upd] } = await db.query(
    `UPDATE pedidos SET estado = $2,
       seguimiento = CASE WHEN $3::boolean THEN $4 ELSE seguimiento END,
       despachado_en = CASE WHEN $2 = 'despachado' AND estado <> 'despachado' THEN now()
                            WHEN $2 = 'pagado' THEN NULL ELSE despachado_en END
     WHERE id = $1 RETURNING id, estado, seguimiento, despachado_en`,
    [req.params.id, nuevo, seguimiento !== undefined, seguimiento ?? null],
  );
  if (nuevo === 'despachado' && p.estado === 'pagado') {
    const { rows: [{ email }] } = await db.query('SELECT email FROM pedidos WHERE id = $1', [req.params.id]);
    await correo.encolar(null, req.params.id, 'despacho', email);   // solo la primera vez
    correo.procesar().catch(() => {});
  }
  res.json(upd);
}));

// Reenviar un correo del pedido (por ejemplo, si la clienta no lo encuentra)
router.post('/pedidos/:id/correos/:tipo', ok(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'No encontrado' });
  const { rows: [p] } = await db.query('SELECT id, email, estado FROM pedidos WHERE id = $1', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  const pagado = ['pagado', 'despachado', 'entregado'].includes(p.estado);
  const { tipo } = req.params;
  let destinatario;
  if (tipo === 'confirmacion' && pagado) destinatario = p.email;
  else if (tipo === 'despacho' && ['despachado', 'entregado'].includes(p.estado)) destinatario = p.email;
  else if (tipo === 'aviso_venta' && pagado) {
    const { rows: [m] } = await db.query("SELECT valor->>'email' AS email FROM ajustes WHERE clave = 'marca'");
    destinatario = config.avisoVentasA || m?.email;
  } else throw new Invalido('Este correo no corresponde al estado del pedido');
  if (!destinatario) throw new Invalido('No hay correo de destino. Revisa "Datos de la tienda"');
  await correo.reenviar(p.id, tipo, destinatario);
  res.json({ ok: true, destinatario });
}));

// ---------------- Productos ----------------
const FORMAS = ['dropper', 'jar', 'tube', 'pump', 'stick'];
// Fotos propias: /img/<id>.<ext> (en la base de datos) o /uploads/... (versiones anteriores, en disco)
const IMG_LOCAL = /^\/(img|uploads)\/[a-f0-9]{32}\.(jpg|png|webp)$/;

function datosProducto(b = {}) {
  const nombre = txt(b.nombre, 120);
  if (nombre.length < 2) throw new Invalido('Escribe el nombre del producto');
  const precio = entero(b.precio, 'Precio', { min: 1 });
  const precio_antes = entero(b.precio_antes, 'Precio anterior', { min: 1, nulo: true });
  if (precio_antes !== null && precio_antes <= precio) throw new Invalido('El precio anterior debe ser mayor que el precio actual (o déjalo vacío)');
  const colores = Array.isArray(b.colores) && b.colores.length === 2 && b.colores.every((c) => HEX.test(c)) ? b.colores : ['#EED6E4', '#9C4F7E'];
  // Fotos: la primera es la principal
  const imagenes = (Array.isArray(b.imagenes) ? b.imagenes : (b.imagen_url ? [b.imagen_url] : []))
    .map((u) => txt(u, 300)).filter(Boolean).slice(0, 8);
  if (imagenes.some((u) => !IMG_LOCAL.test(u) && !/^https:\/\//.test(u))) throw new Invalido('Imagen inválida');
  return {
    nombre,
    slug: slugify(txt(b.slug, 80) || nombre) || crypto.randomBytes(4).toString('hex'),
    descripcion: txt(b.descripcion, 600),
    detalle: txt(b.detalle, 4000),
    ingredientes: txt(b.ingredientes, 3000),
    modo_uso: txt(b.modo_uso, 3000),
    categoria_id: entero(b.categoria_id, 'Categoría', { min: 1, nulo: true }),
    precio, precio_antes,
    stock: entero(b.stock ?? 0, 'Stock'),
    imagen_url: imagenes[0] || null,
    imagenes: JSON.stringify(imagenes),
    forma: FORMAS.includes(b.forma) ? b.forma : 'jar',
    colores: JSON.stringify(colores),
    variante_etiqueta: txt(b.variante_etiqueta, 30) || null,
    activo: b.activo !== false,
    orden: entero(b.orden ?? 0, 'Orden'),
  };
}
const CAMPOS_PROD = ['nombre', 'slug', 'descripcion', 'detalle', 'ingredientes', 'modo_uso', 'categoria_id', 'precio', 'precio_antes',
  'stock', 'imagen_url', 'imagenes', 'forma', 'colores', 'variante_etiqueta', 'activo', 'orden'];

function datosVariantes(lista) {
  if (lista === undefined) return undefined;            // no se tocan
  if (!Array.isArray(lista)) throw new Invalido('Variantes: formato inválido');
  const vistos = new Set();
  return lista.slice(0, 40).map((v, i) => {
    const nombre = txt(v?.nombre, 60);
    if (!nombre) throw new Invalido('Cada opción necesita un nombre');
    if (vistos.has(nombre.toLowerCase())) throw new Invalido(`La opción "${nombre}" está repetida`);
    vistos.add(nombre.toLowerCase());
    const color = txt(v?.color, 7);
    return {
      id: Number.isInteger(v?.id) ? v.id : null,
      nombre,
      color: color && HEX.test(color) ? color : null,
      precio: entero(v?.precio, `Precio de "${nombre}"`, { min: 1, nulo: true }),
      stock: entero(v?.stock ?? 0, `Stock de "${nombre}"`),
      activo: v?.activo !== false,
      orden: i,
    };
  });
}

// Deja las variantes del producto exactamente como vienen en la lista
async function guardarVariantes(c, productoId, variantes) {
  if (variantes === undefined) return;
  const ids = variantes.filter((v) => v.id).map((v) => v.id);
  await c.query('DELETE FROM variantes WHERE producto_id = $1 AND NOT (id = ANY($2::int[]))', [productoId, ids]);
  // Primero se renombran temporalmente para no chocar con la restricción de nombre único al reordenar
  await c.query("UPDATE variantes SET nombre = '~' || id WHERE producto_id = $1", [productoId]);
  for (const v of variantes) {
    if (v.id) {
      await c.query('UPDATE variantes SET nombre=$3, color=$4, precio=$5, stock=$6, activo=$7, orden=$8 WHERE id=$1 AND producto_id=$2',
        [v.id, productoId, v.nombre, v.color, v.precio, v.stock, v.activo, v.orden]);
    } else {
      await c.query('INSERT INTO variantes (producto_id, nombre, color, precio, stock, activo, orden) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [productoId, v.nombre, v.color, v.precio, v.stock, v.activo, v.orden]);
    }
  }
}

router.get('/productos', ok(async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*, c.nombre AS categoria,
      COALESCE((SELECT json_agg(v ORDER BY v.orden, v.id) FROM variantes v WHERE v.producto_id = p.id), '[]') AS variantes,
      (SELECT SUM(stock)::int FROM variantes v WHERE v.producto_id = p.id AND v.activo) AS stock_variantes,
      (SELECT COALESCE(SUM(i.cantidad),0)::int FROM pedido_items i JOIN pedidos pe ON pe.id = i.pedido_id
        WHERE i.producto_id = p.id AND pe.estado IN ('pagado','despachado','entregado')) AS vendidos
    FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id ORDER BY p.orden, p.nombre`);
  res.json(rows);
}));

router.post('/productos', ok(async (req, res) => {
  const d = datosProducto(req.body);
  const variantes = datosVariantes(req.body?.variantes);
  // Si ya hay un producto con ese nombre, el slug queda "nombre-2", "nombre-3"...
  const { rows: usados } = await db.query('SELECT slug FROM productos WHERE slug = $1 OR slug LIKE $2', [d.slug, `${d.slug}-%`]);
  const ocupados = new Set(usados.map((r) => r.slug));
  for (let n = 2, base = d.slug; ocupados.has(d.slug); n++) d.slug = `${base}-${n}`;
  const p = await db.tx(async (c) => {
    const { rows: [nuevo] } = await c.query(
      `INSERT INTO productos (${CAMPOS_PROD.join(',')}) VALUES (${CAMPOS_PROD.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      CAMPOS_PROD.map((k) => d[k]));
    await guardarVariantes(c, nuevo.id, variantes);
    return nuevo;
  });
  res.status(201).json(p);
}));

router.put('/productos/:id', ok(async (req, res) => {
  const id = entero(req.params.id, 'id', { min: 1 });
  const d = datosProducto(req.body);
  const variantes = datosVariantes(req.body?.variantes);
  const p = await db.tx(async (c) => {
    const { rows: [upd] } = await c.query(
      `UPDATE productos SET ${CAMPOS_PROD.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...CAMPOS_PROD.map((k) => d[k])]);
    if (upd) await guardarVariantes(c, id, variantes);
    return upd;
  });
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  res.json(p);
}));

router.delete('/productos/:id', ok(async (req, res) => {
  const id = entero(req.params.id, 'id', { min: 1 });
  // Los pedidos antiguos conservan nombre y precio (pedido_items guarda una copia)
  const { rowCount } = await db.query('DELETE FROM productos WHERE id = $1', [id]);
  res.json({ ok: rowCount > 0 });
}));

// ---------------- Subida de fotos ----------------
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, Boolean(EXT[f.mimetype])),
});
// Comprueba los primeros bytes: que de verdad sea una imagen y no un archivo renombrado
const firmaValida = (buf, tipo) => ({
  'image/jpeg': () => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': () => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': () => buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP',
}[tipo]?.() || false);

router.post('/subir', (req, res, next) => {
  subida.single('imagen')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La foto pesa más de 3 MB' : 'No se pudo subir la foto' });
    if (!req.file || !firmaValida(req.file.buffer, req.file.mimetype)) return res.status(400).json({ error: 'Sube una foto JPG, PNG o WEBP' });
    try {
      // Se guarda en la base de datos: sobrevive reinicios y va incluida en los respaldos
      const id = crypto.randomBytes(16).toString('hex');
      await db.query('INSERT INTO archivos (id, tipo, datos, tamano) VALUES ($1, $2, $3, $4)',
        [id, req.file.mimetype, req.file.buffer, req.file.size]);
      res.status(201).json({ url: `/img/${id}.${EXT[req.file.mimetype]}` });
    } catch (e) { next(e); }
  });
});

// ---------------- Categorías ----------------
router.get('/categorias', ok(async (req, res) => {
  const { rows } = await db.query(`SELECT c.*, COUNT(p.id)::int AS productos FROM categorias c
    LEFT JOIN productos p ON p.categoria_id = c.id GROUP BY c.id ORDER BY c.orden, c.nombre`);
  res.json(rows);
}));
router.post('/categorias', ok(async (req, res) => {
  const nombre = txt(req.body?.nombre, 60);
  if (nombre.length < 2) throw new Invalido('Escribe el nombre de la categoría');
  const { rows: [c] } = await db.query('INSERT INTO categorias (slug, nombre, orden) VALUES ($1,$2,$3) RETURNING *',
    [slugify(nombre), nombre, entero(req.body?.orden ?? 0, 'Orden')]);
  res.status(201).json(c);
}));
router.put('/categorias/:id', ok(async (req, res) => {
  const nombre = txt(req.body?.nombre, 60);
  if (nombre.length < 2) throw new Invalido('Escribe el nombre de la categoría');
  const { rows: [c] } = await db.query('UPDATE categorias SET nombre = $2, orden = $3 WHERE id = $1 RETURNING *',
    [entero(req.params.id, 'id', { min: 1 }), nombre, entero(req.body?.orden ?? 0, 'Orden')]);
  res.json(c || {});
}));
router.delete('/categorias/:id', ok(async (req, res) => {
  await db.query('DELETE FROM categorias WHERE id = $1', [entero(req.params.id, 'id', { min: 1 })]);
  res.json({ ok: true });
}));

// ---------------- Reseñas ----------------
router.get('/resenas', ok(async (req, res) => {
  const { rows } = await db.query(`SELECT r.*, p.nombre AS producto FROM resenas r
    LEFT JOIN productos p ON p.id = r.producto_id ORDER BY r.aprobada, r.creado_en DESC`);
  res.json(rows);
}));
router.post('/resenas', ok(async (req, res) => {
  const b = req.body || {};
  const nombre = txt(b.nombre, 60), texto = txt(b.texto, 800);
  const estrellas = entero(b.estrellas, 'Estrellas', { min: 1 });
  if (estrellas > 5) throw new Invalido('Estrellas: de 1 a 5');
  if (nombre.length < 2 || texto.length < 5) throw new Invalido('Completa nombre y texto de la reseña');
  const { rows: [r] } = await db.query(
    `INSERT INTO resenas (producto_id, nombre, estrellas, texto, verificada, aprobada) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *`,
    [entero(b.producto_id, 'Producto', { min: 1, nulo: true }), nombre, estrellas, texto, b.verificada === true]);
  res.status(201).json(r);
}));
router.patch('/resenas/:id', ok(async (req, res) => {
  const { rows: [r] } = await db.query('UPDATE resenas SET aprobada = $2 WHERE id = $1 RETURNING *',
    [entero(req.params.id, 'id', { min: 1 }), req.body?.aprobada === true]);
  res.json(r || {});
}));
router.delete('/resenas/:id', ok(async (req, res) => {
  await db.query('DELETE FROM resenas WHERE id = $1', [entero(req.params.id, 'id', { min: 1 })]);
  res.json({ ok: true });
}));

// ---------------- Ajustes de la tienda ----------------
const listaTextos = (v, max) => {
  if (!Array.isArray(v)) throw new Invalido('Formato inválido');
  return v.map((x) => txt(x, max)).filter(Boolean).slice(0, 20);
};
const VALIDAR = {
  marca: (v) => {
    const campos = { nombre: 60, nombre_legal: 120, titulo: 160, bajada: 400, email: 120, whatsapp: 30, instagram: 200, tiktok: 200 };
    const out = Object.fromEntries(Object.entries(campos).map(([k, m]) => [k, txt(v?.[k], m)]));
    if (!out.nombre) throw new Invalido('La tienda necesita un nombre');
    for (const k of ['instagram', 'tiktok']) if (out[k] && !/^https:\/\//.test(out[k])) throw new Invalido(`${k}: el enlace debe empezar con https://`);
    return out;
  },
  colores: (v) => {
    const out = {};
    for (const k of ['bg', 'ink', 'muted', 'brand', 'sage', 'sale']) {
      if (!HEX.test(v?.[k] || '')) throw new Invalido(`Color "${k}" inválido`);
      out[k] = v[k];
    }
    return out;
  },
  envio: (v) => {
    if (!Array.isArray(v?.zonas)) throw new Invalido('Formato inválido');
    const vistos = new Set();
    const zonas = v.zonas.map((z) => ({ nombre: txt(z?.nombre, 60), costo: entero(z?.costo ?? 0, `Costo de ${txt(z?.nombre, 60) || 'una localidad'}`), activo: z?.activo !== false }))
      .filter((z) => z.nombre).slice(0, 60);
    for (const z of zonas) {
      const k = z.nombre.toLowerCase();
      if (vistos.has(k)) throw new Invalido(`"${z.nombre}" está repetida`);
      vistos.add(k);
    }
    const retiro = { activo: v.retiro?.activo === true, texto: txt(v.retiro?.texto, 300) };
    if (!zonas.some((z) => z.activo) && !retiro.activo) throw new Invalido('Deja al menos una localidad activa o el retiro activado');
    return { region: txt(v.region, 60), gratis_desde: entero(v.gratis_desde ?? 0, 'Entrega gratis desde'), zonas, retiro };
  },
  imagenes: (v) => {
    const out = {};
    for (const k of ['logo', 'portada', 'icono']) {
      const u = txt(v?.[k], 300);
      if (u && !IMG_LOCAL.test(u)) throw new Invalido('Imagen inválida');
      if (u) out[k] = u;
    }
    return out;
  },
  anuncios: (v) => listaTextos(v, 120),
  terminos: (v) => {
    if (!Array.isArray(v?.secciones)) throw new Invalido('Formato inválido');
    const secciones = v.secciones.map((x) => ({ titulo: txt(x?.titulo, 100), texto: txt(x?.texto, 8000) }))
      .filter((x) => x.titulo && x.texto).slice(0, 20);
    if (!secciones.length) throw new Invalido('Deja al menos una sección con título y texto');
    return { secciones };
  },
  faq: (v) => {
    if (!Array.isArray(v)) throw new Invalido('Formato inválido');
    return v.map((p) => [txt(p?.[0], 200), txt(p?.[1], 1000)]).filter(([q, a]) => q && a).slice(0, 30);
  },
  comparacion: (v) => {
    if (!Array.isArray(v)) throw new Invalido('Formato inválido');
    return v.map((f) => [txt(f?.[0], 120), f?.[1] === true, f?.[2] === true]).filter(([t]) => t).slice(0, 12);
  },
};

router.get('/ajustes', ok(async (req, res) => {
  res.json(await require('../lib/ajustes').todos());
}));
router.put('/ajustes/:clave', ok(async (req, res) => {
  const validar = VALIDAR[req.params.clave];
  if (!validar) return res.status(404).json({ error: 'Ajuste desconocido' });
  const valor = validar(req.body?.valor);
  await db.query(`INSERT INTO ajustes (clave, valor) VALUES ($1, $2)
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`, [req.params.clave, JSON.stringify(valor)]);
  res.json({ clave: req.params.clave, valor });
}));

module.exports = router;
