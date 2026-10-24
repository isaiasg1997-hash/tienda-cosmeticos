// Pasarela simulada para desarrollo: muestra una página con "Aprobar" / "Rechazar".
// No cobra nada. NUNCA dejar PASARELA=mock en producción.
const config = require('../config');

module.exports = {
  async crear(pedido) {
    const ref = `mock-${pedido.id}`;
    return {
      ref,
      metodo: 'GET',
      url: `${config.publicUrl}/pago-simulado.html?ref=${encodeURIComponent(ref)}&monto=${pedido.total}&codigo=${pedido.codigo}`,
    };
  },

  async retorno(req) {
    const { ref, resultado } = req.query;
    return {
      buscar: { ref },
      aprobado: resultado === 'aprobado',
      cancelado: resultado === 'cancelado',
      monto: Number(req.query.monto),
      respuesta: { ...req.query },
    };
  },
};
