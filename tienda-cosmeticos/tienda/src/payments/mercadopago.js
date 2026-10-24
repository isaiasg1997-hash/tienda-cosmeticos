// Mercado Pago Checkout Pro.
// Flujo: crear "preferencia" -> redirigir a init_point -> la clienta vuelve con
// payment_id -> consultamos el pago a la API (nunca confiamos en la URL).
// Pruebas: usa un Access Token de una cuenta de prueba (empieza con TEST- o de usuario de prueba).
// Docs: https://www.mercadopago.cl/developers/es/docs/checkout-pro
const config = require('../config');

async function api(metodo, ruta, body) {
  if (!config.mercadopago.accessToken) throw new Error('Falta MP_ACCESS_TOKEN en el .env');
  const res = await fetch(`https://api.mercadopago.com${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${config.mercadopago.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function resultadoDePago(paymentId) {
  const pago = await api('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
  return {
    buscar: { id: pago.external_reference },
    aprobado: pago.status === 'approved',
    monto: Math.round(pago.transaction_amount),
    respuesta: { id: pago.id, status: pago.status, status_detail: pago.status_detail },
  };
}

module.exports = {
  async crear(pedido) {
    const retorno = `${config.publicUrl}/api/pagos/retorno/mercadopago`;
    const pref = await api('POST', '/checkout/preferences', {
      // Un solo ítem por el total: evita diferencias de redondeo con el envío
      items: [{ title: `Pedido ${pedido.codigo}`, quantity: 1, unit_price: pedido.total, currency_id: 'CLP' }],
      payer: { email: pedido.email, name: pedido.nombre },
      external_reference: pedido.id,
      back_urls: { success: retorno, failure: retorno, pending: retorno },
      auto_return: 'approved',
      notification_url: `${config.publicUrl}/api/pagos/notificacion/mercadopago`,
      statement_descriptor: pedido.codigo,
    });
    const url = config.ambiente === 'produccion' ? pref.init_point : (pref.sandbox_init_point || pref.init_point);
    return { ref: pref.id, url, metodo: 'GET' };
  },

  async retorno(req) {
    const { payment_id, external_reference, status } = req.query;
    if (!payment_id || payment_id === 'null') {
      // Volvió sin pagar
      return { buscar: { id: external_reference }, aprobado: false, cancelado: true, monto: 0, respuesta: { status } };
    }
    return resultadoDePago(payment_id);
  },

  async notificacion(req) {
    const tipo = req.query.type || req.query.topic || req.body?.type;
    const id = req.query['data.id'] || req.body?.data?.id || req.query.id;
    if (tipo !== 'payment' || !id) return null; // otros avisos no nos interesan
    return resultadoDePago(id);
  },
};
