// Flow.cl
// Flujo: payment/create (firmado con HMAC) -> redirigir a url?token= ->
// Flow avisa a urlConfirmation y devuelve a urlReturn con token -> payment/getStatus.
// Docs: https://www.flow.cl/docs/api.html
const crypto = require('crypto');
const config = require('../config');

const host = () => (config.ambiente === 'produccion' ? 'https://www.flow.cl/api' : 'https://sandbox.flow.cl/api');

function firmar(params) {
  if (!config.flow.apiKey || !config.flow.secretKey) throw new Error('Faltan FLOW_API_KEY y FLOW_SECRET_KEY en el .env');
  const p = { ...params, apiKey: config.flow.apiKey };
  const cadena = Object.keys(p).sort().map((k) => k + p[k]).join('');
  p.s = crypto.createHmac('sha256', config.flow.secretKey).update(cadena).digest('hex');
  return new URLSearchParams(p);
}

async function api(metodo, ruta, params) {
  const qs = firmar(params);
  const res = metodo === 'GET'
    ? await fetch(`${host()}${ruta}?${qs}`)
    : await fetch(`${host()}${ruta}`, { method: 'POST', body: qs, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Flow ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function estado(token) {
  const r = await api('GET', '/payment/getStatus', { token });
  // status: 1 pendiente, 2 pagado, 3 rechazado, 4 anulado
  return {
    buscar: { codigo: r.commerceOrder },
    aprobado: r.status === 2,
    cancelado: r.status === 4,
    monto: Math.round(Number(r.amount)),
    respuesta: { flowOrder: r.flowOrder, status: r.status, paymentData: r.paymentData },
  };
}

module.exports = {
  async crear(pedido) {
    const r = await api('POST', '/payment/create', {
      commerceOrder: pedido.codigo,
      subject: `Pedido ${pedido.codigo}`,
      currency: 'CLP',
      amount: String(pedido.total),
      email: pedido.email,
      urlConfirmation: `${config.publicUrl}/api/pagos/notificacion/flow`,
      urlReturn: `${config.publicUrl}/api/pagos/retorno/flow`,
    });
    return { ref: r.token, url: `${r.url}?token=${r.token}`, metodo: 'GET' };
  },
  retorno: (req) => estado(req.body?.token || req.query.token),
  notificacion: (req) => estado(req.body?.token || req.query.token),
};
