// =========================================================
// Capa de pagos enchufable.
// Cada pasarela implementa la misma interfaz:
//
//   crear(pedido)          -> { ref, url, metodo: 'GET'|'POST', campos? }
//                             A dónde mandar a la clienta para pagar.
//   retorno(req)           -> Resultado   (la clienta vuelve al sitio)
//   notificacion(req)      -> Resultado   (aviso servidor a servidor, opcional)
//
//   Resultado = { buscar: {ref}|{id}|{codigo}, aprobado, monto, respuesta, cancelado? }
//
// Para elegir la pasarela de un cliente basta con PASARELA=... en su .env.
// =========================================================
const config = require('../config');

const pasarelas = {
  mock: require('./mock'),
  webpay: require('./webpay'),
  mercadopago: require('./mercadopago'),
  flow: require('./flow'),
};

function activa() {
  const p = pasarelas[config.pasarela];
  if (!p) throw new Error(`Pasarela desconocida: ${config.pasarela}. Usa: ${Object.keys(pasarelas).join(', ')}`);
  return p;
}

module.exports = { pasarelas, activa, nombre: () => config.pasarela };
