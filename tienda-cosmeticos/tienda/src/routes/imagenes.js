// Sirve las fotos guardadas en la base de datos: /img/<id>.<ext>
// El id es aleatorio y la foto nunca cambia, así que el navegador puede guardarla un año.
const router = require('express').Router();
const db = require('../db');

const cache = new Map();          // pequeña caché en memoria para no ir a la BD en cada visita
const CACHE_MAX_BYTES = 40 * 1024 * 1024;
let cacheBytes = 0;

router.get('/img/:archivo', async (req, res, next) => {
  try {
    const m = req.params.archivo.match(/^([a-f0-9]{32})\.(jpg|png|webp)$/);
    if (!m) return res.status(404).end();
    const id = m[1];
    let f = cache.get(id);
    if (!f) {
      const { rows: [r] } = await db.query('SELECT tipo, datos FROM archivos WHERE id = $1', [id]);
      if (!r) return res.status(404).end();
      f = { tipo: r.tipo, datos: r.datos };
      if (cacheBytes + f.datos.length < CACHE_MAX_BYTES) { cache.set(id, f); cacheBytes += f.datos.length; }
    }
    if (req.get('If-None-Match') === `"${id}"`) return res.status(304).end();
    res.set({
      'Content-Type': f.tipo,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${id}"`,
      'X-Content-Type-Options': 'nosniff',
    }).send(f.datos);
  } catch (e) { next(e); }
});

module.exports = router;
