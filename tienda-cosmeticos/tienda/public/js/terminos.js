// Términos y condiciones (se editan en el panel → Datos de la tienda)
(async () => {
  await cargarTienda();
  pintarHeaderFooter();
  const cont = $('#secciones');
  if (!cont) return;                         // la página 404 reutiliza este script
  cont.innerHTML = (TIENDA.terminos?.secciones || []).map((s) => `
    <section id="${slugTitulo(s.titulo)}"><h2>${esc(s.titulo)}</h2>${parrafosConMarca(s.texto)}</section>`).join('');
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();
