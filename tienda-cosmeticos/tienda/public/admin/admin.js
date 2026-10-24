// =========================================================
// Panel de administración (una sola página, sin frameworks)
// =========================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (d) => (d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '');
const ESTADOS = { pendiente: 'Pendiente de pago', pagado: 'Pagado', despachado: 'Despachado', entregado: 'Entregado', rechazado: 'Rechazado', anulado: 'Anulado' };
const ESTADOS_RETIRO = { despachado: 'Listo para retiro', entregado: 'Retirado' };
const etiquetaEstado = (e, retiro = false) => `<span class="estado e-${esc(e)}">${(retiro && ESTADOS_RETIRO[e]) || ESTADOS[e] || esc(e)}</span>`;
const PASARELAS = { webpay: 'Webpay', mercadopago: 'Mercado Pago', flow: 'Flow', mock: 'pago simulado' };
const FORMAS = { dropper: 'Gotario', jar: 'Pote', tube: 'Pomo', pump: 'Dispensador', stick: 'Barra' };

function envase(forma, [claro, fuerte] = ['#EED6E4', '#9C4F7E']) {
  const f = {
    dropper: `<rect x="38" y="4" width="24" height="34" rx="10" fill="${fuerte}"/><rect x="18" y="44" width="64" height="112" rx="22" fill="${claro}"/><rect x="18" y="98" width="64" height="58" rx="22" fill="${fuerte}" opacity=".35"/>`,
    jar: `<rect x="10" y="64" width="80" height="22" rx="8" fill="${fuerte}"/><rect x="6" y="84" width="88" height="72" rx="20" fill="${claro}"/>`,
    pump: `<rect x="36" y="10" width="28" height="28" rx="4" fill="${fuerte}"/><rect x="20" y="38" width="60" height="118" rx="16" fill="${claro}"/>`,
    tube: `<path d="M24 10h52l-6 120H30Z" fill="${claro}"/><rect x="28" y="128" width="44" height="28" rx="6" fill="${fuerte}"/>`,
    stick: `<rect x="34" y="6" width="32" height="40" rx="14" fill="${fuerte}"/><rect x="30" y="44" width="40" height="112" rx="10" fill="${claro}"/>`,
  };
  return `<svg viewBox="0 0 100 160" aria-hidden="true">${f[forma] || f.jar}</svg>`;
}
const miniatura = (p) => (p.imagen_url
  ? `<img class="miniatura" src="${esc(p.imagen_url)}" alt="">`
  : `<div class="miniatura-svg" style="background:${esc(p.colores?.[0])}">${envase(p.forma, p.colores)}</div>`);

// ---------- API ----------
async function api(metodo, url, body) {
  const opt = { method: metodo, headers: { 'X-Panel': '1' } };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(`/api/admin${url}`, opt);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/login') { mostrarLogin(); throw new Error(data.error || 'Inicia sesión'); }
  if (!r.ok) throw new Error(data.error || 'Algo falló, intenta de nuevo');
  return data;
}
function toast(msg, mal = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('mal', mal); t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), mal ? 4000 : 2200);
}
// Ejecuta una acción mostrando el error si falla
async function intentar(fn, boton) {
  if (boton) boton.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); return undefined; } finally { if (boton) boton.disabled = false; }
}

// ---------- Diálogo ----------
const dlg = $('#dialogo');
function abrirDialogo(titulo, cuerpo, pie = '') {
  $('#dialogoBody').innerHTML = `
    <div class="dlg-head"><h2 style="margin:0">${titulo}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></div>
    <div class="dlg-body">${cuerpo}</div>${pie ? `<div class="dlg-foot">${pie}</div>` : ''}`;
  if (!dlg.open) dlg.showModal();
  return $('#dialogoBody');
}
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-cerrar]')) dlg.close(); });

// ---------- Sesión ----------
function mostrarLogin() { $('#app').hidden = true; $('#login').hidden = false; dlg.open && dlg.close(); $('[name=email]').focus(); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#loginError').textContent = '';
  const btn = $('button', e.target); btn.disabled = true;
  try {
    await api('POST', '/login', Object.fromEntries(new FormData(e.target)));
    e.target.reset(); iniciar();
  } catch (err) { $('#loginError').textContent = err.message; } finally { btn.disabled = false; }
});
$('#salir').onclick = async () => { await api('POST', '/logout').catch(() => {}); mostrarLogin(); };

async function iniciar() {
  let yo;
  try { yo = await api('GET', '/yo'); } catch { return; }
  $('#login').hidden = true; $('#app').hidden = false;
  $('#usuario').textContent = yo.nombre;
  const aj = await api('GET', '/ajustes').catch(() => ({}));
  $('#tiendaNombre').textContent = aj.marca?.nombre || 'Tienda';
  document.title = `Panel · ${aj.marca?.nombre || 'Tienda'}`;
  navegar();
}

// ---------- Navegación ----------
const VISTAS = { resumen: vistaResumen, pedidos: vistaPedidos, productos: vistaProductos, categorias: vistaCategorias, resenas: vistaResenas, tienda: vistaTienda };
function navegar() {
  if ($('#app').hidden) return;
  const [nombre, query] = (location.hash.slice(1) || 'resumen').split('?');
  const vista = VISTAS[nombre] ? nombre : 'resumen';
  $$('#nav a').forEach((a) => {
    if (a.getAttribute('href') === `#${vista}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#vista').innerHTML = '<p class="muted">Cargando…</p>';
  VISTAS[vista](new URLSearchParams(query)).catch((e) => { $('#vista').innerHTML = `<p class="error">${esc(e.message)}</p>`; });
  actualizarPills();
}
window.addEventListener('hashchange', navegar);

async function actualizarPills() {
  const r = await api('GET', '/resumen').catch(() => null); if (!r) return;
  const porDespachar = r.por_estado.pagado || 0;
  $('#pillPedidos').hidden = !porDespachar; $('#pillPedidos').textContent = porDespachar;
  const resenas = await api('GET', '/resenas').catch(() => []);
  const pend = resenas.filter((x) => !x.aprobada).length;
  $('#pillResenas').hidden = !pend; $('#pillResenas').textContent = pend;
}

// =========================================================
// RESUMEN
// =========================================================
async function vistaResumen() {
  const r = await api('GET', '/resumen');
  const max = Math.max(1, ...r.serie.map((d) => d.total));
  const W = 600, H = 160, bw = W / r.serie.length;
  const barras = r.serie.map((d, i) => {
    const h = d.total ? Math.max(3, (d.total / max) * (H - 24)) : 2;
    return `<rect class="${d.total ? '' : 'cero'}" x="${i * bw + 2}" y="${H - 18 - h}" width="${bw - 4}" height="${h}" rx="2"><title>${d.dia.split('-').reverse().join('-')}: ${clp(d.total)}</title></rect>`;
  }).join('');
  const etq = (i) => { const [, m, d] = r.serie[i].dia.split('-'); return `${d}/${m}`; };
  const porDespachar = r.por_estado.pagado || 0;

  $('#vista').innerHTML = `
    <div class="cabecera"><h1>Resumen</h1></div>
    <div class="metricas">
      <div class="tarjeta metrica"><div class="etq">Ventas de hoy</div><div class="valor num">${clp(r.hoy)}</div></div>
      <div class="tarjeta metrica"><div class="etq">Ventas del mes</div><div class="valor num">${clp(r.mes)}</div></div>
      <div class="tarjeta metrica"><div class="etq">Pedidos pagados este mes</div><div class="valor num">${r.pedidos_mes}</div></div>
      <a class="tarjeta metrica" href="#pedidos?estado=pagado" style="text-decoration:none"><div class="etq">Por despachar</div><div class="valor num" style="color:${porDespachar ? 'var(--accent)' : 'inherit'}">${porDespachar}</div></a>
    </div>
    <div class="dos">
      <div class="tarjeta"><h2>Ventas de los últimos 30 días</h2>
        <svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas diarias de los últimos 30 días">${barras}
          <text x="2" y="${H - 2}">${etq(0)}</text><text x="${W / 2}" y="${H - 2}" text-anchor="middle">${etq(15)}</text><text x="${W - 2}" y="${H - 2}" text-anchor="end">${etq(29)}</text></svg>
      </div>
      <div class="tarjeta"><h2>Stock bajo (5 o menos)</h2>
        ${r.stock_bajo.length ? `<ul class="alerta-lista">${r.stock_bajo.map((p) => `<li><span>${esc(p.nombre)}</span><span class="${p.stock ? '' : 'stock-bajo'}">${p.stock ? `${p.stock} u.` : 'Agotado'}</span></li>`).join('')}</ul>`
          : '<p class="muted">Todos los productos tienen stock suficiente.</p>'}
      </div>
    </div>`;
}

// =========================================================
// PEDIDOS
// =========================================================
async function vistaPedidos(qs) {
  const estado = qs.get('estado') || '', q = qs.get('q') || '', pagina = Number(qs.get('pagina')) || 1;
  const params = new URLSearchParams({ ...(estado && { estado }), ...(q && { q }), pagina });
  const r = await api('GET', `/pedidos?${params}`);
  const paginas = Math.max(1, Math.ceil(r.total / r.por_pagina));
  const ir = (cambios) => { const p = new URLSearchParams({ ...(estado && { estado }), ...(q && { q }), ...cambios }); location.hash = `pedidos?${p}`; };

  $('#vista').innerHTML = `
    <div class="cabecera"><h1>Pedidos</h1>
      <div class="acciones"><a class="btn btn--sec" href="/api/admin/pedidos.csv?${new URLSearchParams({ ...(estado && { estado }), ...(q && { q }) })}">Descargar Excel (CSV)</a></div></div>
    <form class="filtros" id="filtros">
      <input name="q" type="search" placeholder="Buscar por número, nombre o correo" value="${esc(q)}">
      <select name="estado"><option value="">Activos (sin anulados ni rechazados)</option><option value="todos" ${estado === 'todos' ? 'selected' : ''}>Todos, incluidos anulados</option>${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${k === estado ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn btn--sec">Filtrar</button>
    </form>
    <div class="tabla-wrap"><table>
      <thead><tr><th>Pedido</th><th class="ocultar-movil">Fecha</th><th>Cliente</th><th class="ocultar-movil">Entrega</th><th>Estado</th><th class="der">Total</th></tr></thead>
      <tbody>${r.pedidos.map((p) => `
        <tr class="clic" data-id="${p.id}"><td><b>${esc(p.codigo)}</b></td><td class="num ocultar-movil">${fecha(p.creado_en)}</td>
        <td>${esc(p.nombre)}<br><span class="muted">${esc(p.email)}</span></td><td class="ocultar-movil">${esc(p.comuna)}</td>
        <td>${etiquetaEstado(p.estado, p.retiro)}</td><td class="der num">${clp(p.total)}</td></tr>`).join('')}</tbody>
    </table>${r.pedidos.length ? '' : '<div class="vacio">No hay pedidos con estos filtros.</div>'}</div>
    <div class="paginas"><span>${r.total} pedidos</span>
      <span class="acciones"><button class="btn btn--sec btn--sm" id="ant" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
      <span style="align-self:center">Página ${pagina} de ${paginas}</span>
      <button class="btn btn--sec btn--sm" id="sig" ${pagina >= paginas ? 'disabled' : ''}>Siguiente</button></span></div>`;

  $('#filtros').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); location.hash = `pedidos?${new URLSearchParams({ ...(f.get('estado') && { estado: f.get('estado') }), ...(f.get('q') && { q: f.get('q') }) })}`; };
  $('#ant').onclick = () => ir({ pagina: pagina - 1 });
  $('#sig').onclick = () => ir({ pagina: pagina + 1 });
  $('tbody').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) detallePedido(tr.dataset.id); };
}

const ACCIONES = {
  pagado: [['despachado', 'Marcar como despachado', 'btn']],
  despachado: [['entregado', 'Marcar como entregado', 'btn'], ['pagado', 'Volver a "pagado"', 'btn btn--sec']],
  entregado: [['despachado', 'Volver a "despachado"', 'btn btn--sec']],
  pendiente: [['anulado', 'Anular pedido', 'btn btn--peligro']],
};

const CORREOS = { confirmacion: 'Confirmación de compra a la clienta', aviso_venta: 'Aviso de venta a la tienda', despacho: 'Aviso de entrega en camino / listo para retiro' };
function seccionCorreos(p) {
  const pagado = ['pagado', 'despachado', 'entregado'].includes(p.estado);
  if (!pagado) return '';
  const posibles = ['confirmacion', 'aviso_venta', ...(['despachado', 'entregado'].includes(p.estado) ? ['despacho'] : [])];
  const fila = (tipo) => {
    const c = p.correos.find((x) => x.tipo === tipo);
    let estado = '<span class="muted">No enviado</span>';
    if (c?.estado === 'enviado') estado = `<span class="estado e-entregado">Enviado</span> <span class="muted">${fecha(c.enviado_en)}${c.error ? ' · ' + esc(c.error) : ''}</span>`;
    else if (c?.estado === 'pendiente') estado = `<span class="estado e-pendiente">En cola</span>${c.error ? ` <span class="muted">reintento ${c.intentos}: ${esc(c.error)}</span>` : ''}`;
    else if (c?.estado === 'fallido') estado = `<span class="estado e-rechazado">Falló</span> <span class="muted">${esc(c.error || '')}</span>`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid var(--line);flex-wrap:wrap">
      <span><b style="font-weight:500">${CORREOS[tipo]}</b>${c ? `<br><span class="muted" style="font-size:.85rem">${esc(c.destinatario)}</span>` : ''}<br>${estado}</span>
      <button class="btn btn--sec btn--sm" data-reenviar="${tipo}">${c ? 'Reenviar' : 'Enviar'}</button></div>`;
  };
  return `<div class="seccion"><h2 style="font-size:1rem;margin-bottom:.2rem">Correos</h2>${posibles.map(fila).join('')}</div>`;
}

async function detallePedido(id) {
  const p = await intentar(() => api('GET', `/pedidos/${id}`)); if (!p) return;
  const tel = p.telefono.replace(/\D/g, '');
  const enviable = ['pagado', 'despachado', 'entregado'].includes(p.estado);
  const body = abrirDialogo(`Pedido ${esc(p.codigo)} ${etiquetaEstado(p.estado, p.retiro)}`, `
    <dl class="datos">
      <dt>Cliente</dt><dd>${esc(p.nombre)}${p.rut ? ` · RUT ${esc(p.rut)}` : ''}</dd>
      <dt>Correo</dt><dd><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd>
      <dt>Teléfono</dt><dd>${esc(p.telefono)} · <a href="https://wa.me/${tel.length === 9 ? '56' + tel : tel}" target="_blank" rel="noopener">WhatsApp</a></dd>
      <dt>Entrega</dt><dd>${p.retiro ? '<b>Retiro</b> (coordinar lugar y hora)' : `${esc(p.direccion)}, <b>${esc(p.comuna)}</b>`}</dd>
      ${p.notas ? `<dt>Indicaciones</dt><dd>${esc(p.notas)}</dd>` : ''}
      <dt>Creado</dt><dd>${fecha(p.creado_en)}</dd>
      ${p.pagado_en ? `<dt>Pagado</dt><dd>${fecha(p.pagado_en)} con ${esc(PASARELAS[p.pasarela] || p.pasarela)}</dd>` : `<dt>Medio de pago</dt><dd>${esc(PASARELAS[p.pasarela] || p.pasarela)}</dd>`}
      ${p.despachado_en ? `<dt>${p.retiro ? 'Listo para retiro' : 'Despachado'}</dt><dd>${fecha(p.despachado_en)}</dd>` : ''}
    </dl>
    <div class="items">
      ${p.items.map((i) => `<div><span>${esc(i.nombre)} × ${i.cantidad}</span><span class="num">${clp(i.precio * i.cantidad)}</span></div>`).join('')}
      <div><span class="muted">${p.retiro ? 'Retiro' : `Entrega en ${esc(p.comuna)}`}</span><span class="num">${p.envio ? clp(p.envio) : 'Gratis'}</span></div>
      <div class="total"><span>Total</span><span class="num">${clp(p.total)}</span></div>
    </div>
    ${enviable ? `<label>Detalle ${p.retiro ? 'del retiro' : 'de la entrega'} para la clienta <span class="ayuda">Opcional. Va en el correo.</span><span class="acciones" style="flex-wrap:nowrap"><input id="seguimiento" maxlength="100" value="${esc(p.seguimiento || '')}" placeholder="${p.retiro ? 'Ej: Retiro en Av. Héroes de la Concepción 2500, hoy desde las 18 h' : 'Ej: Lo lleva Pedro hoy entre 18 y 20 h'}"><button class="btn btn--sec" id="guardarSeg">Guardar</button></span></label>` : ''}
    ${p.estado === 'pagado' ? `<p class="ayuda" style="margin:.4rem 0 0">Al marcarlo como ${p.retiro ? 'listo para retiro' : 'despachado'}, la clienta recibe un correo. Si escribes el detalle antes, va incluido.</p>` : ''}
    ${seccionCorreos(p)}
    ${p.estado === 'anulado' && p.pasarela_resp?.motivo === 'expirado' ? '<p class="ayuda">Se anuló solo porque no se pagó a tiempo (la clienta no completó el pago).</p>' : ''}
    ${p.pasarela_resp?.alerta ? `<p class="error">Atención: ${esc(p.pasarela_resp.alerta)}. Revisa este pago en el portal de ${esc(PASARELAS[p.pasarela] || p.pasarela)}.</p>` : ''}`,
  (ACCIONES[p.estado] || []).map(([e, t, c]) => `<button class="${c}" data-estado="${e}">${p.retiro ? t.replace('despachado', 'listo para retiro').replace('entregado', 'retirado') : t}</button>`).join('') || '<span class="muted">Este pedido no admite cambios.</span>');

  const cambiar = async (cambios, btn) => {
    const ok = await intentar(() => api('PATCH', `/pedidos/${id}`, cambios), btn);
    if (ok) { toast('Pedido actualizado'); navegar(); detallePedido(id); }
  };
  $$('[data-estado]', body).forEach((b) => { b.onclick = () => {
    if (b.dataset.estado === 'anulado' && !confirm('¿Anular este pedido? No se podrá deshacer.')) return;
    cambiar({ estado: b.dataset.estado, ...($('#seguimiento') && { seguimiento: $('#seguimiento').value }) }, b);
  }; });
  $$('[data-reenviar]', body).forEach((b) => { b.onclick = async () => {
    const r = await intentar(() => api('POST', `/pedidos/${id}/correos/${b.dataset.reenviar}`), b);
    if (r) { toast(`Correo en camino a ${r.destinatario}`); setTimeout(() => detallePedido(id), 1500); }
  }; });
  if ($('#guardarSeg')) $('#guardarSeg').onclick = (e) => cambiar({ seguimiento: $('#seguimiento').value }, e.target);
}

// =========================================================
// PRODUCTOS
// =========================================================
let CATEGORIAS = [];
const stockTotal = (p) => (p.variantes?.some((v) => v.activo) ? p.stock_variantes : p.stock);
async function vistaProductos() {
  const [prods, cats] = await Promise.all([api('GET', '/productos'), api('GET', '/categorias')]);
  CATEGORIAS = cats;
  $('#vista').innerHTML = `
    <div class="cabecera"><h1>Productos</h1><div class="acciones"><button class="btn" id="nuevo">Nuevo producto</button></div></div>
    <div class="tabla-wrap"><table>
      <thead><tr><th></th><th>Producto</th><th class="ocultar-movil">Categoría</th><th class="der">Precio</th><th class="der">Stock</th><th class="der ocultar-movil">Vendidos</th><th class="ocultar-movil">Visible</th></tr></thead>
      <tbody>${prods.map((p) => {
        const st = stockTotal(p); const nv = p.variantes.filter((v) => v.activo).length;
        return `
        <tr class="clic" data-id="${p.id}"><td style="width:60px">${miniatura(p)}</td>
        <td><b>${esc(p.nombre)}</b>${p.activo ? '' : ' <span class="muted">(oculto)</span>'}
          ${nv ? `<br><span class="muted">${nv} ${esc((p.variante_etiqueta || 'opción').toLowerCase())}${nv === 1 ? '' : (/[aeiou]$/i.test(p.variante_etiqueta || 'opción') ? 's' : 'es')}</span>` : `<br><span class="muted ocultar-movil">${esc(p.descripcion).slice(0, 70)}</span>`}</td>
        <td class="ocultar-movil">${esc(p.categoria || '—')}</td>
        <td class="der num">${clp(p.precio)}${p.precio_antes ? `<br><s class="muted">${clp(p.precio_antes)}</s>` : ''}</td>
        <td class="der num ${st <= 5 ? 'stock-bajo' : ''}">${st}</td>
        <td class="der num ocultar-movil">${p.vendidos}</td>
        <td class="ocultar-movil">${p.activo ? 'Sí' : '<span class="muted">Oculto</span>'}</td></tr>`;
      }).join('')}</tbody>
    </table>${prods.length ? '' : '<div class="vacio">Aún no hay productos. Crea el primero.</div>'}</div>`;
  $('#nuevo').onclick = () => editarProducto(null);
  $('tbody').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) editarProducto(prods.find((p) => p.id === Number(tr.dataset.id))); };
}

function filaVariante(v = {}) {
  const conColor = Boolean(v.color);
  return `<div class="var-fila" data-vid="${v.id ?? ''}">
    <input class="v-nombre" value="${esc(v.nombre || '')}" placeholder="Ej: Arena / 50 ml" maxlength="60" aria-label="Nombre de la opción">
    <span class="v-color"><input type="checkbox" class="v-usa-color" ${conColor ? 'checked' : ''} aria-label="Mostrar color"><input type="color" class="v-hex" value="${esc(v.color || '#E2BE98')}" ${conColor ? '' : 'disabled'} aria-label="Color"></span>
    <input class="v-precio" type="number" min="1" step="1" value="${esc(v.precio ?? '')}" placeholder="Mismo" aria-label="Precio (opcional)">
    <input class="v-stock" type="number" min="0" step="1" value="${esc(v.stock ?? 0)}" aria-label="Stock">
    <label class="check"><input type="checkbox" class="v-activo" ${v.activo === false ? '' : 'checked'}> Activa</label>
    <span class="v-mover"><button type="button" class="link" data-subir aria-label="Subir">↑</button><button type="button" class="link" data-bajar aria-label="Bajar">↓</button></span>
    <button type="button" class="btn btn--peligro btn--sm" data-quitar-var>Quitar</button>
  </div>`;
}

function editarProducto(p) {
  const nuevo = !p;
  p = p || { nombre: '', descripcion: '', detalle: '', ingredientes: '', modo_uso: '', precio: '', precio_antes: null, stock: 0,
    categoria_id: CATEGORIAS[0]?.id, forma: 'jar', colores: ['#EED6E4', '#9C4F7E'], activo: true, orden: 0, imagenes: [], variantes: [], variante_etiqueta: '' };
  let fotos = (p.imagenes?.length ? p.imagenes : (p.imagen_url ? [p.imagen_url] : [])).slice();
  const body = abrirDialogo(nuevo ? 'Nuevo producto' : 'Editar producto', `
    <form id="fProd" class="campos" novalidate>
      <div class="full">
        <div class="fotos-grid" id="fotos"></div>
        <div class="acciones" style="margin-top:.5rem;align-items:center">
          <label class="btn btn--sec btn--sm" style="flex-direction:row;cursor:pointer">Agregar fotos<input type="file" id="foto" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
          <span class="ayuda">Hasta 8. La primera es la principal. JPG, PNG o WEBP de hasta 3 MB, ideal cuadradas y con fondo claro.</span>
        </div>
      </div>
      <label class="full">Nombre<input name="nombre" value="${esc(p.nombre)}" required maxlength="120"></label>
      <label class="full">Descripción corta <span class="ayuda">Se ve en la tarjeta de la portada</span><textarea name="descripcion" rows="2" maxlength="600">${esc(p.descripcion)}</textarea></label>
      <label>Precio (CLP, con IVA)<input name="precio" type="number" min="1" step="1" value="${esc(p.precio)}" required></label>
      <label>Precio anterior <span class="ayuda">Opcional. Muestra "Ahorra X%"</span><input name="precio_antes" type="number" min="1" step="1" value="${esc(p.precio_antes ?? '')}"></label>
      <label id="campoStock">Stock<input name="stock" type="number" min="0" step="1" value="${esc(p.stock)}"></label>
      <label>Categoría<select name="categoria_id"><option value="">Sin categoría</option>${CATEGORIAS.map((c) => `<option value="${c.id}" ${c.id === p.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      <label>Orden en la tienda <span class="ayuda">Menor aparece primero</span><input name="orden" type="number" min="0" step="1" value="${esc(p.orden)}"></label>
      <label class="check" style="align-self:end"><input name="activo" type="checkbox" ${p.activo ? 'checked' : ''}> Visible en la tienda</label>

      <section class="full bloque">
        <h3>Opciones (tonos, tamaños…)</h3>
        <p class="ayuda" style="margin:.1rem 0 .7rem">Úsalas si el producto viene en varios tonos o tamaños. Cada opción tiene su propio stock; el precio es opcional (vacío = precio del producto).</p>
        <label style="max-width:240px">Nombre de la opción<input name="variante_etiqueta" list="etiquetas" value="${esc(p.variante_etiqueta || '')}" placeholder="Tono, Tamaño, Color…" maxlength="30"></label>
        <datalist id="etiquetas"><option value="Tono"><option value="Tamaño"><option value="Color"><option value="Aroma"></datalist>
        <div class="var-cab ayuda" ${p.variantes?.length ? '' : 'hidden'}><span>Nombre</span><span>Color</span><span>Precio</span><span>Stock</span><span></span><span></span><span></span></div>
        <div id="variantes">${(p.variantes || []).map(filaVariante).join('')}</div>
        <button type="button" class="btn btn--sec btn--sm" id="agregarVar" style="margin-top:.6rem">Agregar opción</button>
      </section>

      <details class="full bloque" ${p.detalle || p.ingredientes || p.modo_uso ? 'open' : ''}>
        <summary><h3 style="display:inline">Página del producto</h3> <span class="ayuda">Descripción larga, ingredientes y modo de uso</span></summary>
        <div class="campos" style="margin-top:.8rem">
          <label class="full">Descripción completa<textarea name="detalle" rows="4" maxlength="4000" placeholder="Para qué sirve, para qué tipo de piel, qué resultados esperar…">${esc(p.detalle)}</textarea></label>
          <label class="full">Ingredientes<textarea name="ingredientes" rows="3" maxlength="3000">${esc(p.ingredientes)}</textarea></label>
          <label class="full">Modo de uso<textarea name="modo_uso" rows="3" maxlength="3000">${esc(p.modo_uso)}</textarea></label>
        </div>
      </details>

      <details class="full bloque" id="sinFoto">
        <summary><h3 style="display:inline">Dibujo cuando no hay foto</h3></summary>
        <div class="campos" style="margin-top:.8rem">
          <div class="foto-prev" id="dibujoPrev"></div>
          <label>Envase<select name="forma">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}" ${k === p.forma ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>Color claro<input name="c0" type="color" value="${esc(p.colores[0])}"></label>
          <label>Color fuerte<input name="c1" type="color" value="${esc(p.colores[1])}"></label>
        </div>
      </details>
      <p class="error full" id="errProd"></p>
    </form>`,
  `${nuevo ? '<span></span>' : '<button class="btn btn--peligro" id="borrar">Eliminar</button>'}
   <span class="acciones"><button class="btn btn--sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">${nuevo ? 'Crear producto' : 'Guardar cambios'}</button></span>`);

  const f = $('#fProd', body);
  // ---- fotos ----
  const pintarFotos = () => {
    $('#fotos').innerHTML = fotos.map((u, i) => `<figure class="foto-item"><img src="${esc(u)}" alt="">
      ${i === 0 ? '<span class="principal">Principal</span>' : `<button type="button" class="foto-btn" data-principal="${i}">Hacer principal</button>`}
      <button type="button" class="foto-quitar" data-quitar-foto="${i}" aria-label="Quitar foto">×</button></figure>`).join('')
      || '<div class="foto-vacia ayuda">Sin fotos: se mostrará el dibujo del envase.</div>';
    $('#sinFoto').hidden = fotos.length > 0;
  };
  const pintarDibujo = () => { $('#dibujoPrev').innerHTML = envase(f.forma.value, [f.c0.value, f.c1.value]); $('#dibujoPrev').style.background = f.c0.value + '66'; };
  pintarFotos(); pintarDibujo();
  ['forma', 'c0', 'c1'].forEach((n) => f[n].addEventListener('input', pintarDibujo));
  $('#fotos').onclick = (e) => {
    const q = e.target.closest('[data-quitar-foto]'); if (q) { fotos.splice(Number(q.dataset.quitarFoto), 1); return pintarFotos(); }
    const pr = e.target.closest('[data-principal]'); if (pr) { const [x] = fotos.splice(Number(pr.dataset.principal), 1); fotos.unshift(x); pintarFotos(); }
  };
  $('#foto').onchange = async (e) => {
    const archivos = [...e.target.files].slice(0, 8 - fotos.length);
    if (e.target.files.length > archivos.length) toast('Máximo 8 fotos por producto', true);
    for (const archivo of archivos) {
      if (archivo.size > 3 * 1024 * 1024) { toast(`${archivo.name} pesa más de 3 MB`, true); continue; }
      const fd = new FormData(); fd.append('imagen', archivo);
      const r = await intentar(() => api('POST', '/subir', fd));
      if (r) { fotos.push(r.url); pintarFotos(); }
    }
    e.target.value = '';
  };
  // ---- variantes ----
  const cont = $('#variantes');
  const actualizarVar = () => {
    const hay = cont.children.length > 0;
    $('.var-cab', body).hidden = !hay;
    $('#campoStock').hidden = hay;          // con opciones, el stock va en cada una
  };
  actualizarVar();
  $('#agregarVar').onclick = () => { cont.insertAdjacentHTML('beforeend', filaVariante()); actualizarVar(); $('.var-fila:last-child .v-nombre', cont).focus(); };
  cont.addEventListener('click', (e) => {
    const fila = e.target.closest('.var-fila'); if (!fila) return;
    if (e.target.closest('[data-quitar-var]')) { fila.remove(); actualizarVar(); }
    if (e.target.closest('[data-subir]') && fila.previousElementSibling) fila.parentNode.insertBefore(fila, fila.previousElementSibling);
    if (e.target.closest('[data-bajar]') && fila.nextElementSibling) fila.parentNode.insertBefore(fila.nextElementSibling, fila);
  });
  cont.addEventListener('change', (e) => { if (e.target.matches('.v-usa-color')) $('.v-hex', e.target.closest('.var-fila')).disabled = !e.target.checked; });

  $('#guardar').onclick = async (e) => {
    $('#errProd').textContent = '';
    const d = Object.fromEntries(new FormData(f));
    const variantes = $$('.var-fila', cont).map((r) => ({
      ...(r.dataset.vid ? { id: Number(r.dataset.vid) } : {}),
      nombre: $('.v-nombre', r).value,
      color: $('.v-usa-color', r).checked ? $('.v-hex', r).value : null,
      precio: $('.v-precio', r).value ? Number($('.v-precio', r).value) : null,
      stock: Number($('.v-stock', r).value || 0),
      activo: $('.v-activo', r).checked,
    }));
    if (variantes.length && !d.variante_etiqueta.trim()) { $('#errProd').textContent = 'Escribe el nombre de la opción (por ejemplo "Tono" o "Tamaño")'; return; }
    const datos = {
      nombre: d.nombre, descripcion: d.descripcion, detalle: d.detalle, ingredientes: d.ingredientes, modo_uso: d.modo_uso,
      precio: Number(d.precio), precio_antes: d.precio_antes ? Number(d.precio_antes) : null, stock: Number(d.stock || 0),
      categoria_id: d.categoria_id ? Number(d.categoria_id) : null, orden: Number(d.orden || 0),
      activo: f.activo.checked, forma: d.forma, colores: [d.c0, d.c1], imagenes: fotos,
      variante_etiqueta: d.variante_etiqueta, variantes,
      ...(nuevo ? {} : { slug: p.slug }),
    };
    e.target.disabled = true;
    try {
      await api(nuevo ? 'POST' : 'PUT', nuevo ? '/productos' : `/productos/${p.id}`, datos);
      dlg.close(); toast(nuevo ? 'Producto creado' : 'Cambios guardados'); navegar();
    } catch (err) { $('#errProd').textContent = err.message; } finally { e.target.disabled = false; }
  };
  if ($('#borrar')) $('#borrar').onclick = async (e) => {
    if (!confirm(`¿Eliminar "${p.nombre}"? Los pedidos anteriores no se ven afectados.\n\nSi solo quieres ocultarlo, desmarca "Visible en la tienda".`)) return;
    if (await intentar(() => api('DELETE', `/productos/${p.id}`), e.target)) { dlg.close(); toast('Producto eliminado'); navegar(); }
  };
}

// =========================================================
// CATEGORÍAS
// =========================================================
async function vistaCategorias() {
  const cats = await api('GET', '/categorias');
  $('#vista').innerHTML = `
    <div class="cabecera"><h1>Categorías</h1></div>
    <p class="muted" style="margin-top:-.6rem">Son los filtros que aparecen sobre los productos en la tienda.</p>
    <div class="tabla-wrap"><table style="min-width:520px">
      <thead><tr><th>Nombre</th><th style="width:110px">Orden</th><th class="der">Productos</th><th style="width:200px"></th></tr></thead>
      <tbody>${cats.map((c) => `
        <tr data-id="${c.id}"><td><input name="nombre" value="${esc(c.nombre)}" maxlength="60"></td>
        <td><input name="orden" type="number" min="0" value="${c.orden}"></td>
        <td class="der num">${c.productos}</td>
        <td class="der"><span class="acciones" style="justify-content:flex-end"><button class="btn btn--sec btn--sm" data-acc="guardar">Guardar</button><button class="btn btn--peligro btn--sm" data-acc="borrar">Eliminar</button></span></td></tr>`).join('')}
        <tr><td><input id="nuevaCat" placeholder="Nueva categoría" maxlength="60"></td><td><input id="nuevaOrden" type="number" min="0" value="${cats.length + 1}"></td><td></td>
        <td class="der"><button class="btn btn--sm" id="agregarCat">Agregar</button></td></tr>
      </tbody></table></div>`;
  $('#agregarCat').onclick = async (e) => {
    if (await intentar(() => api('POST', '/categorias', { nombre: $('#nuevaCat').value, orden: Number($('#nuevaOrden').value || 0) }), e.target)) { toast('Categoría creada'); navegar(); }
  };
  $('tbody').onclick = async (e) => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const tr = b.closest('tr'); const id = tr.dataset.id;
    if (b.dataset.acc === 'guardar') {
      if (await intentar(() => api('PUT', `/categorias/${id}`, { nombre: $('[name=nombre]', tr).value, orden: Number($('[name=orden]', tr).value || 0) }), b)) toast('Categoría guardada');
    } else if (confirm('¿Eliminar esta categoría? Sus productos quedarán "sin categoría".')) {
      if (await intentar(() => api('DELETE', `/categorias/${id}`), b)) { toast('Categoría eliminada'); navegar(); }
    }
  };
}

// =========================================================
// RESEÑAS
// =========================================================
async function vistaResenas() {
  const [res, prods] = await Promise.all([api('GET', '/resenas'), api('GET', '/productos')]);
  const tarjeta = (r) => `
    <div class="tarjeta" data-id="${r.id}" style="display:grid;gap:.4rem">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
        <span><b>${esc(r.nombre)}</b> <span class="estrellas" aria-label="${r.estrellas} de 5">${'★'.repeat(r.estrellas)}${'☆'.repeat(5 - r.estrellas)}</span>${r.verificada ? ' <span class="estado e-entregado">Compra verificada</span>' : ''}</span>
        <span class="muted">${esc(r.producto || 'General')} · ${fecha(r.creado_en)}</span></div>
      <p style="margin:0">${esc(r.texto)}</p>
      <div class="acciones">${r.aprobada
        ? '<button class="btn btn--sec btn--sm" data-acc="ocultar">Ocultar de la tienda</button>'
        : '<button class="btn btn--sm" data-acc="aprobar">Publicar</button>'}<button class="btn btn--peligro btn--sm" data-acc="borrar">Eliminar</button></div>
    </div>`;
  const pend = res.filter((r) => !r.aprobada), pub = res.filter((r) => r.aprobada);
  $('#vista').innerHTML = `
    <div class="cabecera"><h1>Reseñas</h1><button class="btn" id="nuevaRes">Agregar reseña</button></div>
    ${pend.length ? `<h2>Por revisar (${pend.length})</h2><div style="display:grid;gap:.8rem;margin-bottom:1.6rem">${pend.map(tarjeta).join('')}</div>` : ''}
    <h2>Publicadas (${pub.length})</h2>
    <div style="display:grid;gap:.8rem">${pub.map(tarjeta).join('') || '<div class="tarjeta vacio">Todavía no hay reseñas publicadas.</div>'}</div>`;

  $('#vista').onclick = async (e) => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    if (b.dataset.acc === 'borrar') {
      if (!confirm('¿Eliminar esta reseña?')) return;
      if (await intentar(() => api('DELETE', `/resenas/${id}`), b)) { toast('Reseña eliminada'); navegar(); }
    } else if (await intentar(() => api('PATCH', `/resenas/${id}`, { aprobada: b.dataset.acc === 'aprobar' }), b)) {
      toast(b.dataset.acc === 'aprobar' ? 'Reseña publicada' : 'Reseña oculta'); navegar();
    }
  };
  $('#nuevaRes').onclick = () => {
    const body = abrirDialogo('Agregar reseña', `
      <p class="muted" style="margin-top:0">Para cargar opiniones reales que te llegaron por WhatsApp, Instagram o correo. No publiques reseñas inventadas.</p>
      <form id="fRes" class="campos">
        <label>Nombre de la clienta<input name="nombre" placeholder="Ej: Camila R." maxlength="60" required></label>
        <label>Estrellas<select name="estrellas">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
        <label class="full">Producto<select name="producto_id"><option value="">General (sin producto)</option>${prods.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></label>
        <label class="full">Texto<textarea name="texto" rows="3" maxlength="800" required></textarea></label>
        <label class="check full"><input name="verificada" type="checkbox"> Compró en la tienda (muestra "Compra verificada")</label>
        <p class="error full" id="errRes"></p>
      </form>`, '<span></span><span class="acciones"><button class="btn btn--sec" data-cerrar>Cancelar</button><button class="btn" id="guardarRes">Publicar reseña</button></span>');
    $('#guardarRes', body).onclick = async (e) => {
      const f = $('#fRes'); const d = Object.fromEntries(new FormData(f));
      e.target.disabled = true;
      try {
        await api('POST', '/resenas', { nombre: d.nombre, texto: d.texto, estrellas: Number(d.estrellas), producto_id: d.producto_id ? Number(d.producto_id) : null, verificada: f.verificada.checked });
        dlg.close(); toast('Reseña publicada'); navegar();
      } catch (err) { $('#errRes').textContent = err.message; } finally { e.target.disabled = false; }
    };
  };
}

// =========================================================
// DATOS DE LA TIENDA (ajustes)
// =========================================================
async function vistaTienda() {
  const a = await api('GET', '/ajustes');
  const m = a.marca || {}, env = a.envio || {}, col = a.colores || {};
  const NOMBRES_COLOR = { bg: 'Fondo', ink: 'Texto', muted: 'Texto secundario', brand: 'Color de marca (botones)', sage: 'Acento (sellos)', sale: 'Ofertas y descuentos' };

  $('#vista').innerHTML = `
    <div class="cabecera"><h1>Datos de la tienda</h1></div>
    <div style="display:grid;gap:1rem;max-width:880px">

    <form class="tarjeta" data-clave="imagenes"><h2>Imágenes de la tienda</h2>
      <div class="imgs-tienda">
        ${[['logo', 'Logo', 'PNG con fondo transparente, horizontal o cuadrado. Reemplaza el nombre en el menú.'],
           ['portada', 'Foto de portada', 'La foto grande de la portada. También es la que aparece al compartir la tienda por WhatsApp (ideal: horizontal, menos de 500 KB).'],
           ['icono', 'Ícono de la pestaña', 'Opcional. Cuadrado. Si no subes uno, se usa la inicial de la tienda con tu color.']]
          .map(([k, t, ayuda]) => `<div class="img-slot" data-slot="${k}">
            <div class="img-prev ${k}">${a.imagenes?.[k] ? `<img src="${esc(a.imagenes[k])}" alt="">` : '<span class="ayuda">Sin imagen</span>'}</div>
            <div><b>${t}</b><p class="ayuda" style="margin:.2rem 0 .5rem">${ayuda}</p>
              <span class="acciones"><label class="btn btn--sec btn--sm" style="flex-direction:row;cursor:pointer">Subir<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
              <button type="button" class="link" data-quitar-img ${a.imagenes?.[k] ? '' : 'hidden'}>Quitar</button></span>
              <input type="hidden" name="${k}" value="${esc(a.imagenes?.[k] || '')}"></div>
          </div>`).join('')}
      </div><p><button class="btn">Guardar imágenes</button></p></form>

    <form class="tarjeta" data-clave="marca"><h2>Marca y contacto</h2><div class="campos">
      <label>Nombre de la tienda<input name="nombre" value="${esc(m.nombre)}" required maxlength="60"></label>
      <label>Razón social<input name="nombre_legal" value="${esc(m.nombre_legal)}" maxlength="120"></label>
      <label class="full">Título de la portada<input name="titulo" value="${esc(m.titulo)}" maxlength="160"></label>
      <label class="full">Texto bajo el título<textarea name="bajada" rows="2" maxlength="400">${esc(m.bajada)}</textarea></label>
      <label>Correo de contacto<input name="email" type="email" value="${esc(m.email)}"></label>
      <label>WhatsApp<input name="whatsapp" value="${esc(m.whatsapp)}" placeholder="+56912345678"></label>
      <label>Instagram<input name="instagram" value="${esc(m.instagram)}" placeholder="https://instagram.com/…"></label>
      <label>TikTok<input name="tiktok" value="${esc(m.tiktok)}" placeholder="https://tiktok.com/@…"></label>
    </div><p><button class="btn">Guardar marca</button></p></form>

    <form class="tarjeta" data-clave="envio" data-tipo="zona"><h2>Entregas</h2>
      <p class="ayuda" style="margin-top:-.4rem">Las localidades donde entregas y cuánto cobras en cada una. La clienta elige una al pagar. Desmarca "Activa" para dejar de ofrecerla sin borrarla.</p>
      <div class="fila-edit zona ayuda" style="margin-bottom:-.3rem"><span>Localidad</span><span>Costo</span><span></span><span></span></div>
      <div class="lista-edit"></div>
      <p class="acciones"><button type="button" class="btn btn--sec btn--sm" data-agregar>Agregar localidad</button></p>
      <div class="campos" style="margin-top:1rem">
        <label>Región <span class="ayuda">Se muestra en el pie de la tienda</span><input name="region" value="${esc(env.region || '')}" maxlength="60"></label>
        <label>Entrega gratis desde <span class="ayuda">0 = nunca gratis</span><input name="gratis_desde" type="number" min="0" step="1" value="${env.gratis_desde ?? 0}"></label>
        <label class="check full"><input name="retiro_activo" type="checkbox" ${env.retiro?.activo ? 'checked' : ''}> Ofrecer retiro sin costo</label>
        <label class="full">Mensaje para quien elige retiro<input name="retiro_texto" value="${esc(env.retiro?.texto || '')}" maxlength="300"></label>
      </div>
      <p><button class="btn">Guardar entregas</button></p></form>

    <form class="tarjeta" data-clave="colores"><h2>Colores</h2><div class="colores">
      ${Object.entries(NOMBRES_COLOR).map(([k, v]) => `<label><input type="color" name="${k}" value="${esc(col[k] || '#000000')}"> ${v}</label>`).join('')}
    </div><p class="ayuda">Mantén buen contraste entre fondo y texto para que se lea bien en el celular.</p><p><button class="btn">Guardar colores</button></p></form>

    <form class="tarjeta" data-clave="anuncios" data-tipo="lista"><h2>Barra de anuncios</h2>
      <p class="ayuda" style="margin-top:-.4rem">Los mensajes van rotando en la franja superior de la tienda.</p>
      <div class="lista-edit"></div>
      <p class="acciones"><button type="button" class="btn btn--sec btn--sm" data-agregar>Agregar anuncio</button><button class="btn">Guardar anuncios</button></p></form>

    <form class="tarjeta" data-clave="faq" data-tipo="faq"><h2>Preguntas frecuentes</h2>
      <div class="lista-edit"></div>
      <p class="acciones"><button type="button" class="btn btn--sec btn--sm" data-agregar>Agregar pregunta</button><button class="btn">Guardar preguntas</button></p></form>

    <form class="tarjeta" data-clave="terminos" data-tipo="seccion"><h2>Términos y condiciones</h2>
      <p class="ayuda" style="margin-top:-.4rem">Se muestran en la página "Términos y condiciones"; las secciones 2 a 4 aparecen también como enlaces en el pie de la tienda. Puedes escribir {tienda}, {razon_social}, {correo} o {whatsapp} y se reemplazan por tus datos. Deja una línea en blanco entre párrafos. <b>Revísalos con tu contador o abogado antes de publicar.</b></p>
      <div class="lista-edit"></div>
      <p class="acciones"><button type="button" class="btn btn--sec btn--sm" data-agregar>Agregar sección</button><button class="btn">Guardar términos</button> <a class="btn btn--sec btn--sm" href="/terminos.html" target="_blank" rel="noopener">Ver página</a></p></form>

    <form class="tarjeta" data-clave="comparacion" data-tipo="comp"><h2>Tabla "Por qué ${esc(m.nombre)}"</h2>
      <p class="ayuda" style="margin-top:-.4rem">Marca qué cumple tu tienda y qué cumplen otras marcas. Si la dejas vacía, la sección no aparece.</p>
      <div class="lista-edit"></div>
      <p class="acciones"><button type="button" class="btn btn--sec btn--sm" data-agregar>Agregar fila</button><button class="btn">Guardar tabla</button></p></form>
    </div>`;

  const filas = {
    lista: (v = '') => `<div class="fila-edit"><input value="${esc(v)}" maxlength="120"><button type="button" class="btn btn--peligro btn--sm" data-quitar>Quitar</button></div>`,
    faq: ([q, r] = ['', '']) => `<div class="fila-edit faq"><input value="${esc(q)}" placeholder="Pregunta" maxlength="200"><textarea rows="2" placeholder="Respuesta" maxlength="1000">${esc(r)}</textarea><button type="button" class="btn btn--peligro btn--sm" data-quitar>Quitar</button></div>`,
    seccion: ({ titulo = '', texto = '' } = {}) => `<div class="fila-edit seccion"><div style="display:grid;gap:.4rem"><input value="${esc(titulo)}" placeholder="Título, ej: Cambios y devoluciones" maxlength="100" aria-label="Título"><textarea rows="5" maxlength="8000" aria-label="Texto">${esc(texto)}</textarea></div><div style="display:grid;gap:.3rem;align-content:start"><button type="button" class="btn btn--sec btn--sm" data-arriba aria-label="Subir">↑</button><button type="button" class="btn btn--sec btn--sm" data-abajo aria-label="Bajar">↓</button><button type="button" class="btn btn--peligro btn--sm" data-quitar>Quitar</button></div></div>`,
    zona: ({ nombre = '', costo = 0, activo = true } = {}) => `<div class="fila-edit zona"><input value="${esc(nombre)}" placeholder="Ej: Pozo Almonte" maxlength="60" aria-label="Localidad"><input type="number" min="0" step="1" value="${esc(costo)}" aria-label="Costo"><label class="check"><input type="checkbox" ${activo ? 'checked' : ''}> Activa</label><button type="button" class="btn btn--peligro btn--sm" data-quitar>Quitar</button></div>`,
    comp: ([t, s, o] = ['', true, false]) => `<div class="fila-edit comp"><input value="${esc(t)}" maxlength="120"><label class="check"><input type="checkbox" ${s ? 'checked' : ''}> Nosotros</label><label class="check"><input type="checkbox" ${o ? 'checked' : ''}> Otras</label><button type="button" class="btn btn--peligro btn--sm" data-quitar>Quitar</button></div>`,
  };
  const iniciales = { anuncios: a.anuncios || [], faq: a.faq || [], comparacion: a.comparacion || [], envio: env.zonas || [], terminos: a.terminos?.secciones || [] };
  $$('form[data-tipo]').forEach((f) => {
    const t = f.dataset.tipo; const cont = $('.lista-edit', f);
    cont.innerHTML = iniciales[f.dataset.clave].map(filas[t]).join('');
    f.addEventListener('click', (e) => {
      if (e.target.closest('[data-quitar]')) e.target.closest('.fila-edit').remove();
      const fila = e.target.closest('.fila-edit');
      if (e.target.closest('[data-arriba]') && fila.previousElementSibling) fila.parentNode.insertBefore(fila, fila.previousElementSibling);
      if (e.target.closest('[data-abajo]') && fila.nextElementSibling) fila.parentNode.insertBefore(fila.nextElementSibling, fila);
      if (e.target.closest('[data-agregar]')) { cont.insertAdjacentHTML('beforeend', filas[t]()); $('.fila-edit:last-child input', cont).focus(); }
    });
  });

  const leer = {
    marca: (f) => Object.fromEntries(new FormData(f)),
    imagenes: (f) => Object.fromEntries(new FormData(f)),
    terminos: (f) => ({ secciones: $$('.fila-edit.seccion', f).map((r) => ({ titulo: $('input', r).value, texto: $('textarea', r).value })) }),
    envio: (f) => ({
      region: f.region.value, gratis_desde: Number(f.gratis_desde.value || 0),
      zonas: $$('.fila-edit.zona', $('.lista-edit', f)).map((r) => { const [n, c, act] = $$('input', r); return { nombre: n.value, costo: Number(c.value || 0), activo: act.checked }; }),
      retiro: { activo: f.retiro_activo.checked, texto: f.retiro_texto.value },
    }),
    colores: (f) => Object.fromEntries(new FormData(f)),
    anuncios: (f) => $$('.fila-edit input', f).map((i) => i.value),
    faq: (f) => $$('.fila-edit', f).map((r) => [$('input', r).value, $('textarea', r).value]),
    comparacion: (f) => $$('.fila-edit', f).map((r) => { const [t, s, o] = $$('input', r); return [t.value, s.checked, o.checked]; }),
  };
  // Subida de logo / portada / ícono
  $$('.img-slot').forEach((slot) => {
    const campo = $('input[type=hidden]', slot), prev = $('.img-prev', slot), quitar = $('[data-quitar-img]', slot);
    $('input[type=file]', slot).onchange = async (e) => {
      const archivo = e.target.files[0]; if (!archivo) return;
      if (archivo.size > 3 * 1024 * 1024) return toast('La imagen pesa más de 3 MB', true);
      const fd = new FormData(); fd.append('imagen', archivo);
      prev.innerHTML = '<span class="ayuda">Subiendo…</span>';
      const r = await intentar(() => api('POST', '/subir', fd));
      if (r) { campo.value = r.url; quitar.hidden = false; toast('Imagen lista. Toca "Guardar imágenes" para publicarla.'); }
      prev.innerHTML = campo.value ? `<img src="${esc(campo.value)}" alt="">` : '<span class="ayuda">Sin imagen</span>';
      e.target.value = '';
    };
    quitar.onclick = () => { campo.value = ''; quitar.hidden = true; prev.innerHTML = '<span class="ayuda">Sin imagen</span>'; };
  });

  $$('form[data-clave]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await intentar(() => api('PUT', `/ajustes/${f.dataset.clave}`, { valor: leer[f.dataset.clave](f) }), e.submitter);
    if (ok) {
      toast('Guardado. La tienda se actualiza en unos segundos.');
      if (f.dataset.clave === 'marca') $('#tiendaNombre').textContent = ok.valor.nombre;
    }
  }));
}

// ---------- Arranque ----------
iniciar();
