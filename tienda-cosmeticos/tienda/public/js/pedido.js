// Resultado del pago. Si el pedido sigue "pendiente" (la notificación de la
// pasarela aún no llega) se vuelve a consultar unas veces.
(async () => {
  await cargarTienda();
  pintarHeaderFooter();
  const qs = new URLSearchParams(location.search);
  const id = qs.get('id') || sessionStorage.getItem('ultimo-pedido');
  const caja = $('#estado');

  const contacto = TIENDA.marca.email ? ` Si tienes dudas, escríbenos a <a href="mailto:${esc(TIENDA.marca.email)}">${esc(TIENDA.marca.email)}</a>.` : '';
  const error = (titulo, texto) => {
    caja.innerHTML = `<div class="icono mal">!</div><h1>${titulo}</h1><p class="lead">${texto}${contacto}</p>
      <p><a class="btn" href="/checkout.html">Volver a intentar</a></p>`;
  };

  if (qs.get('error') === 'verificacion' || !id) {
    return error('No pudimos confirmar tu pago', 'Si se realizó un cargo en tu cuenta, no te preocupes: lo revisamos y te contactamos.');
  }

  for (let intento = 0; intento < 6; intento++) {
    const r = await fetch(`/api/pedidos/${encodeURIComponent(id)}`);
    if (!r.ok) return error('No encontramos tu pedido', 'Revisa el enlace del correo de confirmación.');
    const p = await r.json();
    if (p.estado === 'pendiente' && intento < 5) { await new Promise((ok) => setTimeout(ok, 2000)); continue; }

    if (['pagado', 'despachado', 'entregado'].includes(p.estado)) {
      Carrito.vaciar(); pintarCarrito(); sessionStorage.removeItem('ultimo-pedido');
      caja.innerHTML = `
        <div class="icono ok">✓</div>
        <h1>¡Gracias, ${esc(p.nombre.split(' ')[0])}!</h1>
        <p class="lead">Recibimos tu pago. Tu número de pedido es <b>${esc(p.codigo)}</b>. Te escribiremos por WhatsApp para coordinar ${p.retiro ? 'el retiro' : 'la entrega'}, y te enviamos el detalle a ${esc(p.email)}.</p>
        <div class="resumen">
          ${p.items.map((i) => `<div class="res-row" style="color:var(--ink)"><span>${esc(i.nombre)} × ${i.cantidad}</span><span>${clp(i.precio * i.cantidad)}</span></div>`).join('')}
          <div class="res-row"><span>${p.retiro ? 'Retiro' : `Entrega en ${esc(p.comuna)}`}</span><span>${p.envio ? clp(p.envio) : 'Gratis'}</span></div>
          <div class="res-row res-row--total"><span>Total pagado</span><span>${clp(p.total)}</span></div>
        </div>
        <p style="margin-top:2rem"><a class="btn btn--ghost" href="/">Volver a la tienda</a></p>`;
      return;
    }
    if (p.estado === 'pendiente') return error('Tu pago está en revisión', `Tu pedido ${esc(p.codigo)} quedó pendiente. Te avisaremos por correo apenas se confirme.`);
    if (p.estado === 'anulado') return error('Cancelaste el pago', 'Tu carrito sigue guardado, puedes intentarlo de nuevo cuando quieras.');
    return error('El pago fue rechazado', 'No se realizó ningún cargo. Puedes intentar con otro medio de pago o tarjeta.');
  }
})();
