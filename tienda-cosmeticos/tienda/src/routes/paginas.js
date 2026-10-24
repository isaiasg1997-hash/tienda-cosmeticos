// =========================================================
// Páginas armadas en el servidor: agregan el título, la descripción
// y la imagen que muestran WhatsApp, Instagram, Facebook y Google
// al compartir un enlace (esos robots no ejecutan JavaScript).
// =========================================================
const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const db = require('../db');
const config = require('../config');
const ajustes = require('../lib/ajustes');
const catalogo = require('../lib/catalogo');

const PUBLIC = path.join(__dirname, '../../public');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const absoluta = (u) => (!u ? '' : /^https?:\/\//.test(u) ? u : `${config.publicUrl}${u.startsWith('/') ? '' : '/'}${u}`);

const plantillas = new Map();
function leer(archivo) {
  // En producción se guarda en memoria; en desarrollo se relee para ver cambios al tiro
  if (config.ambiente === 'produccion' && plantillas.has(archivo)) return plantillas.get(archivo);
  const html = fs.readFileSync(path.join(PUBLIC, archivo), 'utf8');
  plantillas.set(archivo, html);
  return html;
}

async function datosMarca() {
  const a = await ajustes.todos();
  return { marca: a.marca || { nombre: 'Tienda' }, colores: a.colores || {}, img: a.imagenes || {} };
}

// Inserta las metaetiquetas en el <head> de la página
function conMeta(html, { titulo, descripcion, imagen, url, tipo = 'website', marca, colores }) {
  const tags = [
    `<meta name="description" content="${esc(descripcion)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="${tipo}">`,
    `<meta property="og:site_name" content="${esc(marca.nombre)}">`,
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(descripcion)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:locale" content="es_CL">`,
    ...(imagen ? [`<meta property="og:image" content="${esc(imagen)}">`, `<meta name="twitter:image" content="${esc(imagen)}">`] : []),
    `<meta name="twitter:card" content="${imagen ? 'summary_large_image' : 'summary'}">`,
    `<meta name="theme-color" content="${esc(colores.bg || '#ffffff')}">`,
  ].join('\n');
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(titulo)}</title>`)
    .replace(/<meta name="description"[^>]*>\s*/, '')
    .replace('</head>', `${tags}\n</head>`);
}

// ---------- Icono de la pestaña ----------
// Si la tienda subió un ícono se usa ese; si no, se dibuja la inicial con su color.
router.get('/favicon.svg', async (req, res, next) => {
  try {
    const { marca, colores, img } = await datosMarca();
    if (img.icono) return res.redirect(302, img.icono);
    const inicial = esc((marca.nombre || 'T').trim().charAt(0).toUpperCase());
    const fondo = /^#[0-9a-f]{6}$/i.test(colores.brand || '') ? colores.brand : '#9C4F7E';
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${fondo}"/>`
      + `<text x="32" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#fff">${inicial}</text></svg>`,
    );
  } catch (e) { next(e); }
});
router.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

// ---------- Inicio ----------
router.get(['/', '/index.html'], async (req, res, next) => {
  try {
    const { marca, colores, img } = await datosMarca();
    res.set('Cache-Control', 'no-cache').type('html').send(conMeta(leer('index.html'), {
      titulo: marca.titulo ? `${marca.nombre} · ${marca.titulo}` : marca.nombre,
      descripcion: marca.bajada || `Tienda online de ${marca.nombre}`,
      imagen: absoluta(img.portada || img.logo),
      url: `${config.publicUrl}/`,
      marca, colores,
    }));
  } catch (e) { next(e); }
});

// ---------- Página de producto ----------
router.get('/producto/:slug', async (req, res, next) => {
  try {
    const p = await catalogo.productoPorSlug(req.params.slug);
    const { marca, colores, img } = await datosMarca();
    if (!p) return paginaNoEncontrada(res, { marca, colores });
    const imagen = absoluta(p.imagen_url || img.portada || img.logo);
    const url = `${config.publicUrl}/producto/${encodeURIComponent(p.slug)}`;
    const precios = p.variantes.length ? p.variantes.map((v) => v.precio) : [p.precio];
    // Datos estructurados: Google puede mostrar precio, stock y estrellas en los resultados
    const ld = {
      '@context': 'https://schema.org', '@type': 'Product', name: p.nombre,
      description: p.descripcion || p.detalle || undefined,
      image: imagen ? [imagen, ...p.imagenes.slice(1).map(absoluta)] : undefined,
      brand: { '@type': 'Brand', name: marca.nombre },
      offers: {
        '@type': 'AggregateOffer', priceCurrency: 'CLP', lowPrice: Math.min(...precios), highPrice: Math.max(...precios),
        availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url,
      },
      ...(p.num_resenas ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.num_resenas } } : {}),
    };
    const html = conMeta(leer('producto.html'), {
      titulo: `${p.nombre} · ${marca.nombre}`,
      descripcion: p.descripcion || `${p.nombre} en ${marca.nombre}`,
      imagen, url, tipo: 'product', marca, colores,
    }).replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  } catch (e) { next(e); }
});

function paginaNoEncontrada(res, { marca, colores }) {
  res.status(404).type('html').send(conMeta(leer('404.html'), {
    titulo: `Página no encontrada · ${marca.nombre}`, descripcion: 'La página que buscas no existe.',
    imagen: '', url: config.publicUrl, marca, colores,
  }));
}

module.exports = { router, conMeta, datosMarca, absoluta, leer, esc, paginaNoEncontrada };
