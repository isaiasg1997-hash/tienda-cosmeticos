// Página de inicio: hero, productos con filtro, comparación, reseñas y FAQ
(async () => {
  try { await cargarTienda(); } catch {
    $('#productGrid').innerHTML = '<p>No pudimos cargar la tienda. Recarga la página.</p>'; return;
  }
  pintarHeaderFooter();
  const T = TIENDA;

  // Hero: tres envases de los primeros productos
  const conEnvase = T.productos.filter((p) => !p.imagen_url).slice(0, 3);
  if (T.imagenes?.portada) {
    $('#heroVessels').classList.add('vessels--foto');
    $('#heroVessels').innerHTML = `<img src="${esc(T.imagenes.portada)}" alt="" fetchpriority="high">`;
  } else {
    $('#heroVessels').innerHTML = conEnvase.map((p, i) => envase(p.forma, p.colores, `v${i + 1}`)).join('');
  }

  const conRes = T.productos.filter((p) => p.num_resenas);
  const totalRes = conRes.reduce((s, p) => s + p.num_resenas, 0);
  const prom = totalRes ? conRes.reduce((s, p) => s + p.rating * p.num_resenas, 0) / totalRes : 0;
  const trust = ['Hecho en Chile', T.envio?.gratis_desde ? `Entrega gratis sobre ${clp(T.envio.gratis_desde)}` : `Entregas en ${T.envio?.zonas?.slice(0, 2).map((z) => z.nombre).join(', ') || 'tu ciudad'} y alrededores`];
  if (totalRes) trust.push(`${prom.toFixed(1).replace('.', ',')} de 5 en ${totalRes} reseñas`);
  $('#trust').innerHTML = trust.map((t) => `<li><span class="dot"></span>${esc(t)}</li>`).join('');
  $('#resumenResenas').textContent = totalRes ? `${prom.toFixed(1).replace('.', ',')} de 5 en ${totalRes} reseñas verificadas.` : '';

  // Productos
  let filtro = 'todos';
  const cats = [{ slug: 'todos', nombre: 'Todos' }, ...T.categorias];
  function pintarProductos() {
    $('#tabs').innerHTML = cats.map((c) => `<button class="tab" aria-pressed="${c.slug === filtro}" data-cat="${esc(c.slug)}">${esc(c.nombre)}</button>`).join('');
    const lista = T.productos.filter((p) => filtro === 'todos' || p.categoria === filtro);
    $('#productGrid').innerHTML = lista.map((p) => {
      const { desde, precio } = precioDesde(p);
      const variantes = p.variantes || [];
      const conStock = variantes.filter((v) => v.stock > 0);
      return `
      <article class="card">
        <a class="card-media" href="${urlProducto(p)}" style="background:${esc(p.colores[0])}55" aria-label="Ver ${esc(p.nombre)}">
          ${pctDescuento(p) ? `<span class="badge">Ahorra ${pctDescuento(p)}%</span>` : ''}
          ${imagenProducto(p)}
        </a>
        <h3><a href="${urlProducto(p)}" class="card-link">${esc(p.nombre)}</a></h3>
        <p class="desc">${esc(p.descripcion)}</p>
        ${p.num_resenas ? `<div class="rating"><span class="stars" aria-hidden="true">${estrellas(p.rating)}</span><span>${String(p.rating).replace('.', ',')} (${p.num_resenas} ${p.num_resenas === 1 ? 'reseña' : 'reseñas'})</span></div>` : ''}
        ${variantes.some((v) => v.color) ? `<div class="mini-tonos" aria-label="${variantes.length} opciones">${variantes.slice(0, 6).map((v) => `<span style="background:${esc(v.color || '#ddd')}" title="${esc(v.nombre)}"></span>`).join('')}${variantes.length > 6 ? `<small>+${variantes.length - 6}</small>` : ''}</div>` : ''}
        <div class="price"><strong>${desde ? 'Desde ' : ''}${clp(precio)}</strong>${p.precio_antes ? `<s>${clp(p.precio_antes)}</s>` : ''}</div>
        ${variantes.length && conStock.length ? `<label class="var-select"><span class="sr-only">${esc(p.variante_etiqueta || 'Opción')}</span>
            <select data-var-for="${p.id}"><option value="">${esc(p.variante_etiqueta || 'Opción')}: elige</option>
            ${variantes.map((v) => `<option value="${v.id}" ${v.stock ? '' : 'disabled'}>${esc(v.nombre)}${desde ? ` · ${clp(v.precio)}` : ''}${v.stock ? '' : ' (agotado)'}</option>`).join('')}</select></label>` : ''}
        ${p.stock > 0 ? `<button class="btn" data-add="${p.id}">Agregar al carrito</button>` : '<button class="btn" disabled>Agotado</button>'}
      </article>`;
    }).join('') || '<p>No hay productos en esta categoría.</p>';
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { filtro = b.dataset.cat; pintarProductos(); } });
  $('#productGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const sel = b.closest('.card').querySelector('[data-var-for]');
    if (sel && !sel.value) { sel.focus(); sel.classList.add('falta'); return toast(`Elige ${(T.productos.find((p) => p.id === Number(b.dataset.add)).variante_etiqueta || 'una opción').toLowerCase()} primero`); }
    Carrito.agregar(Number(b.dataset.add), sel ? Number(sel.value) : null);
  });
  $('#productGrid').addEventListener('change', (e) => { if (e.target.matches('[data-var-for]')) e.target.classList.remove('falta'); });
  pintarProductos();

  // Comparación
  const marca = (v) => (v ? '<span class="yes" aria-label="Sí">✓</span>' : '<span class="no" aria-label="No">–</span>');
  $('#compareBody').innerHTML = T.comparacion.map(([t, a, b]) => `<tr><td>${esc(t)}</td><td class="us">${marca(a)}</td><td>${marca(b)}</td></tr>`).join('');
  if (!T.comparacion.length) $('#nosotras').remove();

  // Reseñas
  $('#reviews').innerHTML = T.resenas.map((r) => `
    <article class="review">
      <span class="stars" aria-label="${r.estrellas} de 5 estrellas">${estrellas(r.estrellas)}</span>
      <p>${esc(r.texto)}</p>
      <footer><span><b>${esc(r.nombre)}</b>${r.verificada ? ' <span class="verified">Compra verificada</span>' : ''}</span><span>${esc(r.producto || '')}</span></footer>
    </article>`).join('');
  if (!T.resenas.length) $('#resenas').remove();

  // FAQ
  $('#faqList').innerHTML = T.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><div class="answer">${esc(a)}</div></details>`).join('');
})();
