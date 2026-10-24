// Consulta de productos para la tienda (portada y página de producto).
// Incluye variantes activas, valoración y stock total.
const db = require('../db');

const SQL = `
  SELECT p.id, p.slug, p.nombre, p.descripcion, p.detalle, p.ingredientes, p.modo_uso,
         c.slug AS categoria, c.nombre AS categoria_nombre, p.precio, p.precio_antes,
         p.imagen_url, p.imagenes, p.forma, p.colores, p.variante_etiqueta,
         COALESCE(v.lista, '[]'::json) AS variantes,
         CASE WHEN v.lista IS NULL THEN p.stock ELSE v.stock_total END AS stock,
         COALESCE(r.rating, 0)::float AS rating, COALESCE(r.num, 0)::int AS num_resenas
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', id, 'nombre', nombre, 'color', color,
             'precio', COALESCE(precio, p.precio), 'stock', stock) ORDER BY orden, id) AS lista,
           SUM(stock)::int AS stock_total
    FROM variantes WHERE producto_id = p.id AND activo
  ) v ON TRUE
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(estrellas)::numeric, 1) AS rating, COUNT(*) AS num
    FROM resenas WHERE producto_id = p.id AND aprobada
  ) r ON TRUE
  WHERE p.activo`;

async function productos() {
  const { rows } = await db.query(`${SQL} ORDER BY p.orden, p.nombre`);
  return rows;
}

async function productoPorSlug(slug) {
  const { rows: [p] } = await db.query(`${SQL} AND p.slug = $1`, [slug]);
  return p || null;
}

module.exports = { productos, productoPorSlug };
