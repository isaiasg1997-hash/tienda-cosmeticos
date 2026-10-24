const router = require('express').Router();
const db = require('../db');
const ajustes = require('../lib/ajustes');
const catalogo = require('../lib/catalogo');

// Todo lo que la tienda necesita para pintarse, en una sola llamada
router.get('/tienda', async (req, res, next) => {
  try {
    const [aj, cats, prods, resenas] = await Promise.all([
      ajustes.todos(),
      db.query('SELECT slug, nombre FROM categorias ORDER BY orden, nombre'),
      catalogo.productos(),
      db.query(`
        SELECT r.nombre, r.estrellas, r.texto, r.verificada, p.nombre AS producto
        FROM resenas r LEFT JOIN productos p ON p.id = r.producto_id
        WHERE r.aprobada ORDER BY r.creado_en DESC LIMIT 12`),
    ]);
    res.set('Cache-Control', 'public, max-age=15');
    res.json({
      marca: aj.marca, colores: aj.colores, imagenes: aj.imagenes || {},
      envio: { ...aj.envio, zonas: aj.envio.zonas.filter((z) => z.activo) }, anuncios: aj.anuncios || [],
      comparacion: aj.comparacion || [], faq: aj.faq || [], terminos: aj.terminos,
      categorias: cats.rows, productos: prods, resenas: resenas.rows,
    });
  } catch (e) { next(e); }
});

// Reseñas aprobadas de un producto (para su página)
router.get('/productos/:slug/resenas', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT r.nombre, r.estrellas, r.texto, r.verificada, r.creado_en FROM resenas r
       JOIN productos p ON p.id = r.producto_id
       WHERE p.slug = $1 AND r.aprobada ORDER BY r.creado_en DESC LIMIT 50`, [req.params.slug]);
    res.set('Cache-Control', 'public, max-age=60').json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
