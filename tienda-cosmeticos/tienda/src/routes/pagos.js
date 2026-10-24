const router = require('express').Router();
const config = require('../config');
const { pasarelas } = require('../payments');
const pedidos = require('../lib/pedidos');

function pasarelaDe(req, res) {
  const nombre = req.params.pasarela;
  // Solo se acepta la pasarela configurada para este cliente
  if (nombre !== config.pasarela || !pasarelas[nombre]) { res.status(404).end(); return null; }
  return { nombre, mod: pasarelas[nombre] };
}

// La clienta vuelve desde la pasarela (GET o POST según la pasarela)
router.all('/retorno/:pasarela', async (req, res) => {
  const p = pasarelaDe(req, res); if (!p) return;
  try {
    const resultado = await p.mod.retorno(req);
    const pedido = await pedidos.aplicarResultado(p.nombre, resultado);
    if (!pedido) return res.redirect(303, '/pedido.html?error=no-encontrado');
    res.redirect(303, `/pedido.html?id=${pedido.id}`);
  } catch (e) {
    console.error(`[pago:${p.nombre}] retorno:`, e.message);
    res.redirect(303, '/pedido.html?error=verificacion');
  }
});

// Aviso servidor a servidor (Mercado Pago, Flow). Debe responder 200 rápido.
router.post('/notificacion/:pasarela', async (req, res) => {
  const p = pasarelaDe(req, res); if (!p) return;
  try {
    if (p.mod.notificacion) {
      const resultado = await p.mod.notificacion(req);
      if (resultado) await pedidos.aplicarResultado(p.nombre, resultado);
    }
    res.status(200).send('OK');
  } catch (e) {
    console.error(`[pago:${p.nombre}] notificación:`, e.message);
    res.status(500).send('ERROR'); // la pasarela reintentará
  }
});

module.exports = router;
