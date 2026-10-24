// Webpay Plus (Transbank), API REST v1.2.
// Flujo: crear transacción -> POST de formulario a Transbank con token_ws ->
// Transbank devuelve a return_url con token_ws -> confirmamos (commit) con PUT.
// Docs: https://www.transbankdevelopers.cl/referencia/webpay
const config = require('../config');

// Credenciales públicas de integración de Transbank (ambiente de pruebas)
const INTEGRACION = {
  commerceCode: '597055555532',
  apiKey: '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C',
};

function cred() {
  if (config.ambiente === 'produccion') {
    if (!config.webpay.commerceCode || !config.webpay.apiKey) {
      throw new Error('Faltan WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY en el .env');
    }
    return { host: 'https://webpay3g.transbank.cl', ...config.webpay };
  }
  return { host: 'https://webpay3gint.transbank.cl', ...INTEGRACION };
}

async function api(metodo, ruta, body) {
  const c = cred();
  const res = await fetch(`${c.host}/rswebpaytransaction/api/webpay/v1.2/transactions${ruta}`, {
    method: metodo,
    headers: {
      'Tbk-Api-Key-Id': c.commerceCode,
      'Tbk-Api-Key-Secret': c.apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Webpay ${res.status}: ${data.error_message || JSON.stringify(data)}`);
  return data;
}

module.exports = {
  async crear(pedido) {
    const data = await api('POST', '', {
      buy_order: pedido.codigo,                 // máx. 26 caracteres
      session_id: pedido.id.slice(0, 61),
      amount: pedido.total,
      return_url: `${config.publicUrl}/api/pagos/retorno/webpay`,
    });
    return { ref: data.token, url: data.url, metodo: 'POST', campos: { token_ws: data.token } };
  },

  async retorno(req) {
    const p = { ...req.query, ...req.body };
    // Si la clienta anula en Webpay llega TBK_TOKEN en vez de token_ws
    if (!p.token_ws) {
      return { buscar: { ref: p.TBK_TOKEN }, aprobado: false, cancelado: true, monto: 0, respuesta: p };
    }
    const r = await api('PUT', `/${p.token_ws}`);
    return {
      buscar: { ref: p.token_ws },
      aprobado: r.status === 'AUTHORIZED' && r.response_code === 0,
      monto: r.amount,
      respuesta: r,
    };
  },
};
