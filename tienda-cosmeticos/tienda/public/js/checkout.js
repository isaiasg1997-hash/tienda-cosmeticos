// Checkout: muestra el resumen, calcula envío (solo referencial: el servidor
// recalcula todo) y envía a la clienta a la pasarela configurada.
(async () => {
  await cargarTienda();
  pintarHeaderFooter();
  const T = TIENDA;
  const E = T.envio;
  const RETIRO = '__retiro';
  $('#entrega').insertAdjacentHTML('beforeend',
    E.zonas.map((z) => `<option value="${esc(z.nombre)}">${esc(z.nombre)} · ${z.costo ? clp(z.costo) : 'gratis'}</option>`).join('')
    + (E.retiro?.activo ? `<option value="${RETIRO}">Retiro sin costo (coordinamos por WhatsApp)</option>` : ''));

  function envio() {
    const op = $('#entrega').value; const sub = Carrito.subtotal();
    if (!op) return null;
    if (op === RETIRO) return 0;
    if (E.gratis_desde && sub >= E.gratis_desde) return 0;
    return E.zonas.find((z) => z.nombre === op)?.costo ?? null;
  }
  function pintarEntrega() {
    const retiro = $('#entrega').value === RETIRO;
    $('#campoDireccion').hidden = retiro;
    $('#direccion').required = !retiro;
    $('#entregaAyuda').textContent = retiro ? E.retiro.texto : (E.gratis_desde ? `Entrega gratis en compras desde ${clp(E.gratis_desde)}.` : '');
    $('#envioEtq').textContent = retiro ? 'Retiro' : 'Entrega';
    pintar();
  }
  function pintar() {
    const lineas = Carrito.lineas();
    if (!lineas.length) { location.href = '/#productos'; return; }
    $('#items').innerHTML = lineas.map(({ p, nombre, precio, cantidad }) => `
      <div class="res-item"><div class="thumb" style="background:${esc(p.colores[0])}">${imagenProducto(p)}</div>
      <div>${esc(nombre)}<br><small>Cantidad: ${cantidad}</small></div><strong>${clp(precio * cantidad)}</strong></div>`).join('');
    const sub = Carrito.subtotal(); const env = envio();
    $('#subtotal').textContent = clp(sub);
    $('#envio').textContent = env === null ? 'Elige tu localidad' : env === 0 ? 'Gratis' : clp(env);
    $('#total').textContent = clp(sub + (env || 0));
    $('#pagar').textContent = `Pagar ${clp(sub + (env || 0))}`;
  }
  $('#entrega').addEventListener('change', pintarEntrega);
  document.addEventListener('carrito', pintar);
  pintar();

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#error').textContent = '';
    const cliente = Object.fromEntries(new FormData($('#form')));
    const items = Carrito.lineas().map(({ p, v, cantidad }) => ({ id: p.id, variante: v?.id ?? null, cantidad }));
    $('#pagar').disabled = true; $('#pagar').textContent = 'Conectando con el medio de pago…';
    try {
      const r = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente, items }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No pudimos crear tu pedido');
      sessionStorage.setItem('ultimo-pedido', data.pedido.id);
      irAPagar(data.pago);
    } catch (err) {
      $('#error').textContent = err.message;
      $('#pagar').disabled = false; pintar();
    }
  });

  // GET: redirección simple. POST: formulario auto-enviado (Webpay)
  function irAPagar(pago) {
    if (pago.metodo === 'POST') {
      const f = document.createElement('form');
      f.method = 'POST'; f.action = pago.url;
      for (const [k, v] of Object.entries(pago.campos || {})) {
        const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i);
      }
      document.body.appendChild(f); f.submit();
    } else {
      location.href = pago.url;
    }
  }
})();
