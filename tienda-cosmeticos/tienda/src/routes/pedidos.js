const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const pagos = require('../payments');
const pedidos = require('../lib/pedidos');

const limite = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' } });

// Crea el pedido y devuelve a dónde mandar a la clienta para pagar
router.post('/', limite, async (req, res, next) => {
  try {
    const pasarela = pagos.activa();
    const pedido = await pedidos.crear(req.body, pagos.nombre());
    let destino;
    try {
      destino = await pasarela.crear(pedido);
    } catch (e) {
      await pedidos.anular(pedido.id, { error: e.message });
      console.error('[pago] error al crear transacción:', e.message);
      return res.status(502).json({ error: 'No pudimos conectar con el medio de pago. Intenta de nuevo en un momento.' });
    }
    await db.query('UPDATE pedidos SET pasarela_ref = $2 WHERE id = $1', [pedido.id, destino.ref]);
    res.status(201).json({ pedido: { id: pedido.id, codigo: pedido.codigo, total: pedido.total },
      pago: { url: destino.url, metodo: destino.metodo, campos: destino.campos || null } });
  } catch (e) {
    if (e instanceof pedidos.ErrorValidacion) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Estado de un pedido (se consulta por su id interno, que no es adivinable)
router.get('/:id', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'Pedido no encontrado' });
    const p = await pedidos.detalle(req.params.id);
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(p);
  } catch (e) { next(e); }
});

module.exports = router;
