// Página de producto: galería, opciones (tonos/tamaños), cantidad,
// descripción, ingredientes, modo de uso, reseñas y relacionados.
(async () => {
  await cargarTienda();
  pintarHeaderFooter();
  const T = TIENDA;
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const p = T.productos.find((x) => x.slug === slug);
  const raiz = $('#pp');
  if (!p) { raiz.innerHTML = '<div class="wrap estado"><h1>Este producto ya no está disponible</h1><p><a class="btn" href="/#productos">Ver productos</a></p></div>'; return; }

  const variantes = p.variantes || [];
  const etiqueta = p.variante_etiqueta || 'Opción';
  const conColor = variantes.some((v) => v.color);
  const fotos = p.imagenes?.length ? p.imagenes : (p.imagen_url ? [p.imagen_url] : []);
  // Si hay una sola opción con stock, queda elegida de entrada
  let elegida = variantes.filter((v) => v.stock > 0).length === 1 ? variantes.find((v) => v.stock > 0) : null;
  let cantidad = 1;
  const cat = T.categorias.find((c) => c.slug === p.categoria);
  const parrafos = (t) => esc(t).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');

  raiz.innerHTML = `<div class="wrap">
    <nav class="migas" aria-label="Ruta"><a href="/">Inicio</a><span aria-hidden="true">/</span>${cat ? `<a href="/#productos" data-cat="${esc(cat.slug)}">${esc(cat.nombre)}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${esc(p.nombre)}</span></nav>
    <div class="pp-grid">
      <div class="galeria">
        <div class="galeria-principal" id="principal" style="background:${esc(p.colores[0])}55">
          ${pctDescuento(p) ? `<span class="badge">Ahorra ${pctDescuento(p)}%</span>` : ''}
          ${fotos.length ? `<img src="${esc(fotos[0])}" alt="${esc(p.nombre)}">` : envase(p.forma, p.colores)}
        </div>
        ${fotos.length > 1 ? `<div class="miniaturas" role="list">${fotos.map((f, i) => `<button class="mini" role="listitem" data-foto="${i}" aria-label="Foto ${i + 1}" aria-pressed="${i === 0}"><img src="${esc(f)}" alt=""></button>`).join('')}</div>` : ''}
      </div>

      <div class="pp-info">
        <h1>${esc(p.nombre)}</h1>
        ${p.num_resenas ? `<a class="rating" href="#opiniones"><span class="stars" aria-hidden="true">${estrellas(p.rating)}</span><span>${String(p.rating).replace('.', ',')} · ${p.num_resenas} ${p.num_resenas === 1 ? 'reseña' : 'reseñas'}</span></a>` : ''}
        <div class="pp-precio"><strong id="precio"></strong>${p.precio_antes ? `<s>${clp(p.precio_antes)}</s>` : ''}</div>
        ${p.descripcion ? `<p class="pp-corta">${esc(p.descripcion)}</p>` : ''}

        ${variantes.length ? `
        <fieldset class="opciones">
          <legend>${esc(etiqueta)}: <b id="elegidaNombre">${elegida ? esc(elegida.nombre) : 'elige una'}</b></legend>
          <div class="${conColor ? 'tonos' : 'pildoras'}">
            ${variantes.map((v) => `<button type="button" class="${conColor ? 'tono' : 'pildora'}" data-v="${v.id}" aria-pressed="${elegida?.id === v.id}" ${v.stock ? '' : 'disabled'}
                title="${esc(v.nombre)}${v.stock ? '' : ' (agotado)'}" ${conColor ? `style="--c:${esc(v.color || '#ddd')}"` : ''}>
                ${conColor ? `<span class="sr-only">${esc(v.nombre)}</span>` : esc(v.nombre)}</button>`).join('')}
          </div>
        </fieldset>` : ''}

        <p class="pp-stock" id="stockNota"></p>
        <div class="pp-comprar">
          <div class="qty qty--lg" aria-label="Cantidad"><button type="button" id="menos" aria-label="Quitar uno">−</button><span id="cant">1</span><button type="button" id="mas" aria-label="Agregar uno">+</button></div>
          <button class="btn" id="agregar">Agregar al carrito</button>
        </div>
        <ul class="pp-confianza">
          <li>${T.envio?.zonas?.length ? `Entrega en ${esc(T.envio.zonas.map((z) => z.nombre).slice(0, 3).join(', '))}${T.envio.zonas.length > 3 ? ' y más' : ''}` : 'Entrega a domicilio'}</li>
          ${T.envio?.retiro?.activo ? '<li>Retiro sin costo</li>' : ''}
          <li>Pago seguro</li>
        </ul>

        <div class="pp-textos">
          ${p.detalle ? `<details open><summary>Descripción</summary><div class="answer">${parrafos(p.detalle)}</div></details>` : ''}
          ${p.ingredientes ? `<details><summary>Ingredientes</summary><div class="answer">${parrafos(p.ingredientes)}</div></details>` : ''}
          ${p.modo_uso ? `<details><summary>Modo de uso</summary><div class="answer">${parrafos(p.modo_uso)}</div></details>` : ''}
        </div>
      </div>
    </div>

    <section class="pp-seccion" id="opiniones" hidden><h2>Lo que dicen de este producto</h2><div class="reviews" id="resenasProducto"></div></section>
    <section class="pp-seccion" id="relacionados" hidden><h2>También te puede gustar</h2><div class="grid" id="relGrid"></div></section>
  </div>`;

  // ---------- galería ----------
  raiz.addEventListener('click', (e) => {
    const m = e.target.closest('[data-foto]'); if (!m) return;
    $('#principal img').src = fotos[Number(m.dataset.foto)];
    raiz.querySelectorAll('[data-foto]').forEach((b) => b.setAttribute('aria-pressed', b === m));
  });

  // ---------- opción, precio, stock y cantidad ----------
  const stockActual = () => (variantes.length ? (elegida?.stock ?? 0) : p.stock);
  function pintarCompra() {
    const { desde, precio } = precioDesde(p);
    $('#precio').textContent = elegida ? clp(elegida.precio) : `${desde ? 'Desde ' : ''}${clp(precio)}`;
    const st = stockActual();
    cantidad = Math.max(1, Math.min(cantidad, st || 1));
    $('#cant').textContent = cantidad;
    $('#menos').disabled = cantidad <= 1; $('#mas').disabled = cantidad >= st;
    const agotado = variantes.length ? variantes.every((v) => !v.stock) : p.stock <= 0;
    $('#agregar').disabled = agotado;
    $('#agregar').textContent = agotado ? 'Agotado' : 'Agregar al carrito';
    $('#stockNota').textContent = variantes.length && !elegida ? '' : st > 0 && st <= 5 ? `¡Quedan solo ${st}!` : '';
  }
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b || b.disabled) return;
    elegida = variantes.find((v) => v.id === Number(b.dataset.v));
    raiz.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('#elegidaNombre').textContent = elegida.nombre;
    $('.opciones').classList.remove('falta');
    pintarCompra();
  });
  $('#menos').onclick = () => { cantidad--; pintarCompra(); };
  $('#mas').onclick = () => { cantidad++; pintarCompra(); };
  $('#agregar').onclick = () => {
    if (variantes.length && !elegida) {
      $('.opciones').classList.add('falta');
      $('.opciones').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast(`Elige ${etiqueta.toLowerCase()} primero`);
    }
    Carrito.agregar(p.id, elegida?.id ?? null, cantidad);
    abrirCarrito();
  };
  pintarCompra();

  // ---------- reseñas del producto ----------
  fetch(`/api/productos/${encodeURIComponent(p.slug)}/resenas`).then((r) => r.json()).then((rs) => {
    if (!rs.length) return;
    $('#opiniones').hidden = false;
    $('#resenasProducto').innerHTML = rs.map((r) => `
      <article class="review">
        <span class="stars" aria-label="${r.estrellas} de 5 estrellas">${estrellas(r.estrellas)}</span>
        <p>${esc(r.texto)}</p>
        <footer><span><b>${esc(r.nombre)}</b>${r.verificada ? ' <span class="verified">Compra verificada</span>' : ''}</span></footer>
      </article>`).join('');
  }).catch(() => {});

  // ---------- relacionados: misma categoría primero ----------
  const rel = [...T.productos.filter((x) => x.id !== p.id && x.categoria === p.categoria),
    ...T.productos.filter((x) => x.id !== p.id && x.categoria !== p.categoria)].slice(0, 4);
  if (rel.length) {
    $('#relacionados').hidden = false;
    $('#relGrid').innerHTML = rel.map((x) => {
      const { desde, precio } = precioDesde(x);
      return `<a class="card card--link" href="${urlProducto(x)}">
        <div class="card-media" style="background:${esc(x.colores[0])}55">${imagenProducto(x)}</div>
        <h3>${esc(x.nombre)}</h3>
        <div class="price"><strong>${desde ? 'Desde ' : ''}${clp(precio)}</strong>${x.precio_antes ? `<s>${clp(x.precio_antes)}</s>` : ''}</div>
      </a>`;
    }).join('');
  }
})();
