// =========================================================
// Código compartido por todas las páginas: datos de la tienda,
// header, footer, carrito lateral y utilidades.
// =========================================================
const $ = (s, el = document) => el.querySelector(s);
const clp = (n) => '$' + Number(n).toLocaleString('es-CL');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const estrellas = (n) => { const r = Math.round(n); return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); };
const pctDescuento = (p) => (p.precio_antes ? Math.round((1 - p.precio / p.precio_antes) * 100) : 0);

// ---------- Envases dibujados (si el producto no tiene foto) ----------
function envase(forma, [claro, fuerte], cls = '') {
  const f = {
    dropper: `<rect x="38" y="4" width="24" height="34" rx="10" fill="${fuerte}"/><rect x="34" y="34" width="32" height="10" rx="3" fill="${fuerte}" opacity=".85"/><rect x="18" y="44" width="64" height="112" rx="22" fill="${claro}"/><rect x="18" y="98" width="64" height="58" rx="22" fill="${fuerte}" opacity=".35"/>`,
    jar: `<rect x="10" y="64" width="80" height="22" rx="8" fill="${fuerte}"/><rect x="6" y="84" width="88" height="72" rx="20" fill="${claro}"/><rect x="22" y="104" width="56" height="26" rx="6" fill="${fuerte}" opacity=".25"/>`,
    pump: `<rect x="44" y="4" width="12" height="20" fill="${fuerte}"/><rect x="30" y="4" width="26" height="9" rx="4" fill="${fuerte}"/><rect x="36" y="22" width="28" height="16" rx="4" fill="${fuerte}"/><rect x="20" y="38" width="60" height="118" rx="16" fill="${claro}"/><rect x="20" y="80" width="60" height="30" fill="${fuerte}" opacity=".3"/>`,
    tube: `<path d="M24 10h52l-6 120H30Z" fill="${claro}"/><rect x="28" y="128" width="44" height="28" rx="6" fill="${fuerte}"/><rect x="34" y="40" width="32" height="40" rx="4" fill="${fuerte}" opacity=".3"/>`,
    stick: `<rect x="34" y="6" width="32" height="40" rx="14" fill="${fuerte}"/><rect x="30" y="44" width="40" height="112" rx="10" fill="${claro}"/><rect x="30" y="92" width="40" height="8" fill="${fuerte}" opacity=".4"/>`,
  };
  return `<svg class="${cls}" viewBox="0 0 100 160" aria-hidden="true">${f[forma] || f.jar}</svg>`;
}
function imagenProducto(p, cls = '') {
  return p.imagen_url
    ? `<img src="${esc(p.imagen_url)}" alt="${esc(p.nombre)}" loading="lazy" class="${cls}" style="width:100%;height:100%;object-fit:cover">`
    : envase(p.forma, p.colores, cls);
}

// ---------- Datos de la tienda (una sola llamada a la API) ----------
let TIENDA = null;
async function cargarTienda() {
  const r = await fetch('/api/tienda');
  if (!r.ok) throw new Error('No se pudo cargar la tienda');
  TIENDA = await r.json();
  aplicarMarca();
  return TIENDA;
}
function aplicarMarca() {
  const c = TIENDA.colores || {};
  const st = document.createElement('style');
  st.textContent = `:root{${Object.entries(c).map(([k, v]) => `--${k}:${v}`).join(';')}}`;
  document.head.appendChild(st);
  document.querySelectorAll('[data-marca]').forEach((el) => { el.textContent = TIENDA.marca[el.dataset.marca] || ''; });
  if (!document.title.includes(TIENDA.marca.nombre)) document.title = `${document.title} | ${TIENDA.marca.nombre}`;
}

// ---------- Carrito (localStorage: { "idProducto" o "idProducto:idVariante": cantidad }) ----------
const Carrito = {
  KEY: 'tienda-carrito',
  leer() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch { return {}; } },
  guardar(c) { try { localStorage.setItem(this.KEY, JSON.stringify(c)); } catch {} },
  // Resuelve una clave del carrito a producto/variante vigentes (o null si ya no existe)
  resolver(key) {
    const [id, vid] = String(key).split(':');
    const p = TIENDA.productos.find((x) => String(x.id) === id);
    if (!p) return null;
    if (p.variantes?.length) {
      const v = p.variantes.find((x) => String(x.id) === vid);
      return v ? { p, v, nombre: `${p.nombre} · ${v.nombre}`, precio: v.precio, stock: v.stock } : null;
    }
    return vid ? null : { p, v: null, nombre: p.nombre, precio: p.precio, stock: p.stock };
  },
  // Solo líneas que siguen existiendo y con stock
  lineas() {
    return Object.entries(this.leer()).map(([key, cantidad]) => {
      const r = this.resolver(key);
      return r && r.stock > 0 ? { key, ...r, cantidad: Math.min(cantidad, r.stock) } : null;
    }).filter(Boolean);
  },
  agregar(id, vid = null, cantidad = 1) {
    const key = vid ? `${id}:${vid}` : String(id);
    const r = this.resolver(key); if (!r) return toast('Elige una opción primero');
    const c = this.leer();
    if ((c[key] || 0) + cantidad > r.stock) return toast(`No hay más stock de ${r.nombre}`);
    c[key] = (c[key] || 0) + cantidad; this.guardar(c); pintarCarrito(); toast(`${r.nombre} agregado al carrito`);
  },
  cambiar(key, q) { const c = this.leer(); if (q <= 0) delete c[key]; else c[key] = q; this.guardar(c); pintarCarrito(); },
  vaciar() { this.guardar({}); },
  subtotal() { return this.lineas().reduce((s, l) => s + l.precio * l.cantidad, 0); },
};
// Precio a mostrar: "Desde $X" si las variantes tienen precios distintos
function precioDesde(p) {
  const precios = (p.variantes || []).map((v) => v.precio);
  if (precios.length && Math.min(...precios) !== Math.max(...precios)) return { desde: true, precio: Math.min(...precios) };
  return { desde: false, precio: precios[0] ?? p.precio };
}
const slugTitulo = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Reemplaza {tienda}, {razon_social}, {correo}, {whatsapp} y arma párrafos
function parrafosConMarca(texto) {
  const m = TIENDA.marca || {};
  const datos = { tienda: m.nombre, razon_social: m.nombre_legal || m.nombre, correo: m.email, whatsapp: m.whatsapp };
  return esc(texto).replace(/\{(tienda|razon_social|correo|whatsapp)\}/g, (_, k) => esc(datos[k] || ''))
    .split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
}
const urlProducto = (p) => `/producto/${encodeURIComponent(p.slug)}`;

// ---------- Header, footer, anuncios ----------
function pintarHeaderFooter() {
  const m = TIENDA.marca;
  $('#header').innerHTML = `
  <div class="announce" role="region" aria-label="Anuncios"><a href="/#productos" id="announceText">${esc(TIENDA.anuncios[0] || '')}</a></div>
  <header class="site"><div class="wrap head">
    <button class="icon-btn menu-btn" id="menuBtn" aria-label="Abrir menú" aria-expanded="false"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h18M3 12h18M3 17h18"/></svg></button>
    <a href="/" class="logo">${TIENDA.imagenes?.logo ? `<img src="${esc(TIENDA.imagenes.logo)}" alt="${esc(m.nombre)}" class="logo-img">` : esc(m.nombre)}</a>
    <nav class="main" id="mainNav" aria-label="Principal"><ul>
      <li><a href="/#productos">Productos</a></li><li><a href="/#nosotras">Por qué ${esc(m.nombre)}</a></li>
      <li><a href="/#resenas">Reseñas</a></li><li><a href="/#faq">Preguntas frecuentes</a></li></ul></nav>
    <div class="head-actions"><button class="icon-btn" id="cartBtn" aria-label="Abrir carrito">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
      <span class="cart-count" id="cartCount">0</span></button></div>
  </div></header>`;

  $('#footer').innerHTML = `
  <footer class="site"><div class="wrap">
    <div class="foot-grid">
      <div><div class="logo" style="color:var(--bg)">${esc(m.nombre)}</div>
        <p style="opacity:.8;max-width:22rem">Cosmética para el cuidado de tu piel, con entregas en ${esc(TIENDA.envio?.region ? 'la región de ' + TIENDA.envio.region : 'tu ciudad')}.</p></div>
      <div><h4>Tienda</h4><ul><li><a href="/#productos">Productos</a></li><li><a href="/#resenas">Reseñas</a></li><li><a href="/#faq">Preguntas frecuentes</a></li></ul></div>
      <div><h4>Políticas</h4><ul><li><a href="/terminos.html">Términos y condiciones</a></li>${(TIENDA.terminos?.secciones || []).slice(1, 4).map((s) => `<li><a href="/terminos.html#${slugTitulo(s.titulo)}">${esc(s.titulo)}</a></li>`).join('')}</ul></div>
      <div><h4>Contacto</h4><ul>
        ${m.email ? `<li><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></li>` : ''}
        ${m.whatsapp ? `<li><a href="https://wa.me/${esc(m.whatsapp.replace(/\D/g, ''))}" rel="noopener">WhatsApp</a></li>` : ''}
        ${m.instagram ? `<li><a href="${esc(m.instagram)}" rel="noopener">Instagram</a></li>` : ''}
        ${m.tiktok ? `<li><a href="${esc(m.tiktok)}" rel="noopener">TikTok</a></li>` : ''}</ul></div>
    </div>
    <div class="legal"><span>© ${new Date().getFullYear()} ${esc(m.nombre_legal || m.nombre)}</span><span>Precios con IVA incluido</span></div>
  </div></footer>
  <div class="scrim" id="scrim"></div>
  <aside class="cart" id="cart" aria-label="Carrito" aria-hidden="true">
    <div class="cart-head"><h2>Tu carrito</h2><button class="icon-btn" id="closeCart" aria-label="Cerrar carrito"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="ship"><span id="shipText"></span><div class="ship-bar"><i id="shipBar"></i></div></div>
    <div class="cart-items" id="cartItems"></div>
    <div class="cart-foot"><div class="total"><span>Subtotal</span><span id="cartTotal">$0</span></div>
      <small>IVA incluido. El costo de entrega depende de tu localidad.</small>
      <a class="btn" id="checkoutBtn" href="/checkout.html">Ir a pagar</a></div>
  </aside>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  let i = 0;
  if (TIENDA.anuncios.length > 1) setInterval(() => { i = (i + 1) % TIENDA.anuncios.length; $('#announceText').textContent = TIENDA.anuncios[i]; }, 4000);
  $('#menuBtn').onclick = () => { const o = $('#mainNav').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); };
  $('#mainNav').addEventListener('click', (e) => { if (e.target.tagName === 'A') $('#mainNav').classList.remove('open'); });
  $('#cartBtn').onclick = abrirCarrito; $('#closeCart').onclick = cerrarCarrito; $('#scrim').onclick = cerrarCarrito;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarCarrito(); });
  $('#cartItems').addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { const l = Carrito.lineas().find((x) => x.key === q.dataset.q); const n = l.cantidad + Number(q.dataset.d); if (n <= l.stock) Carrito.cambiar(q.dataset.q, n); else toast('No hay más stock'); return; }
    const r = e.target.closest('[data-rm]'); if (r) return Carrito.cambiar(r.dataset.rm, 0);
    if (e.target.closest('[data-cerrar]')) cerrarCarrito();
  });
  pintarCarrito();
}

function pintarCarrito() {
  if (!$('#cartItems')) return;
  const lineas = Carrito.lineas();
  const total = Carrito.subtotal();
  const gratis = TIENDA.envio?.gratis_desde || 0;
  $('#cartCount').textContent = lineas.reduce((s, l) => s + l.cantidad, 0);
  $('#cartTotal').textContent = clp(total);
  const falta = gratis - total;
  $('#shipText').textContent = !gratis ? '' : falta > 0 ? `Te faltan ${clp(falta)} para la entrega gratis` : 'Tienes entrega gratis';
  $('#shipText').parentElement.hidden = !gratis;
  $('#shipBar').style.width = gratis ? Math.min(100, (total / gratis) * 100) + '%' : '0';
  $('#checkoutBtn').toggleAttribute('hidden', !lineas.length);
  $('#cartItems').innerHTML = lineas.length ? lineas.map(({ key, p, nombre, precio, cantidad }) => `
    <div class="line-item">
      <a class="thumb" href="${urlProducto(p)}" style="background:${esc(p.colores[0])}">${imagenProducto(p)}</a>
      <div><h3>${esc(nombre)}</h3>
        <div class="qty"><button data-q="${esc(key)}" data-d="-1" aria-label="Quitar uno">−</button><span>${cantidad}</span><button data-q="${esc(key)}" data-d="1" aria-label="Agregar uno">+</button></div>
        <button class="remove" data-rm="${esc(key)}">Eliminar</button></div>
      <strong>${clp(precio * cantidad)}</strong>
    </div>`).join('')
    : `<div class="cart-empty"><p>Tu carrito está vacío.</p><a href="/#productos" class="btn" data-cerrar>Ver productos</a></div>`;
  document.dispatchEvent(new Event('carrito'));
}
function abrirCarrito() { $('#cart').classList.add('open'); $('#scrim').classList.add('show'); $('#cart').setAttribute('aria-hidden', 'false'); $('#closeCart').focus(); }
function cerrarCarrito() { $('#cart')?.classList.remove('open'); $('#scrim')?.classList.remove('show'); $('#cart')?.setAttribute('aria-hidden', 'true'); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }
