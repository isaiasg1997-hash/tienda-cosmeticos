// Toda la configuración que cambia entre un cliente y otro viene del .env
require('dotenv').config();

const req = (k) => {
  if (!process.env[k]) throw new Error(`Falta la variable ${k} en el .env`);
  return process.env[k];
};

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: req('DATABASE_URL'),
  // URL pública del sitio, sin "/" al final. La pasarela devuelve a la clienta aquí.
  // En Render se toma sola desde RENDER_EXTERNAL_URL si no se define PUBLIC_URL.
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || req('PUBLIC_URL')).replace(/\/$/, ''),

  // mock | webpay | mercadopago | flow
  pasarela: (process.env.PASARELA || 'mock').toLowerCase(),
  ambiente: (process.env.AMBIENTE || 'pruebas').toLowerCase(), // pruebas | produccion

  webpay: {
    commerceCode: process.env.WEBPAY_COMMERCE_CODE,
    apiKey: process.env.WEBPAY_API_KEY,
  },
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN,
  },
  flow: {
    apiKey: process.env.FLOW_API_KEY,
    secretKey: process.env.FLOW_SECRET_KEY,
  },

  // Correo saliente. Si SMTP_HOST está vacío, los correos se guardan como
  // archivos .html en la carpeta correos-preview/ (para desarrollo).
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    // "Tienda <ventas@dominio.cl>". Debe ser un remitente autorizado en el servidor SMTP
    from: process.env.MAIL_FROM || '',
  },
  // Correo por API (recomendado en hostings que bloquean SMTP, como Render gratis).
  // MAIL_API = brevo | resend. Si está configurado, se usa en vez de SMTP.
  mailApi: {
    proveedor: (process.env.MAIL_API || '').toLowerCase(),
    key: process.env.MAIL_API_KEY || '',
    url: process.env.MAIL_API_URL || '',     // solo para pruebas; normalmente vacío
  },
  // Quién recibe el aviso de "nueva venta". Si está vacío se usa el correo de la marca.
  avisoVentasA: process.env.AVISO_VENTAS_A || '',
  // Minutos que tiene la clienta para pagar. Mientras tanto el stock queda reservado;
  // después el pedido se anula solo y el stock vuelve a estar disponible.
  anularPendientesMinutos: Math.max(10, Number(process.env.ANULAR_PENDIENTES_MINUTOS
    || (process.env.ANULAR_PENDIENTES_HORAS ? Number(process.env.ANULAR_PENDIENTES_HORAS) * 60 : 30))),
};
