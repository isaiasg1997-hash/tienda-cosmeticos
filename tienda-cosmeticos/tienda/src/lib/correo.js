// =========================================================
// Cola de correos con reintentos.
// - encolar() se llama DENTRO de la misma transacción que cambia el pedido:
//   si el pedido se guarda, el correo queda en cola; si no, tampoco.
// - Un proceso revisa la cola cada 20 s y envía. Si el SMTP falla, reintenta
//   más tarde (1, 5, 15, 60 y 240 min) antes de marcarlo como fallido.
// =========================================================
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('../db');
const config = require('../config');
const plantillas = require('./plantillas');

const ESPERAS_MIN = [1, 5, 15, 60, 240];
const PREVIEW_DIR = path.join(__dirname, '../../correos-preview');
const usaApi = () => ['brevo', 'resend'].includes(config.mailApi.proveedor) && config.mailApi.key;
const modoPreview = () => !usaApi() && !config.smtp.host;

// "Nombre <correo@x.cl>" → { nombre, email }
function separarRemitente(txt) {
  const m = String(txt || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { nombre: m[1].trim(), email: m[2].trim() } : { nombre: '', email: String(txt || '').trim() };
}

// Envío por API HTTP (Brevo o Resend): no usa los puertos SMTP
async function enviarPorApi({ from, to, replyTo, subject, html, text }) {
  const { proveedor, key, url } = config.mailApi;
  const r = separarRemitente(from);
  let destino, cuerpo, headers;
  if (proveedor === 'brevo') {
    destino = url || 'https://api.brevo.com/v3/smtp/email';
    headers = { 'api-key': key };
    cuerpo = {
      sender: { email: r.email, ...(r.nombre ? { name: r.nombre } : {}) },
      to: [{ email: to }], subject, htmlContent: html, textContent: text,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    };
  } else {
    destino = url || 'https://api.resend.com/emails';
    headers = { Authorization: `Bearer ${key}` };
    cuerpo = { from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) };
  }
  const res = await fetch(destino, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const det = await res.text().catch(() => '');
    throw new Error(`${proveedor} respondió ${res.status}: ${det.slice(0, 200)}`);
  }
}

let transporte;
function smtp() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,          // 465 = SSL directo; 587 = STARTTLS
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
    });
  }
  return transporte;
}

// Agrega un correo a la cola. Usa el cliente de la transacción si se lo pasan.
async function encolar(c, pedidoId, tipo, destinatario) {
  if (!destinatario) return;
  await (c || db).query(
    `INSERT INTO correos (pedido_id, tipo, destinatario) VALUES ($1, $2, $3)
     ON CONFLICT (pedido_id, tipo) DO NOTHING`,
    [pedidoId, tipo, destinatario],
  );
}

// Correos que se generan cuando un pedido queda pagado
async function encolarPagado(c, pedido) {
  await encolar(c, pedido.id, 'confirmacion', pedido.email);
  const { rows: [m] } = await c.query("SELECT valor->>'email' AS email FROM ajustes WHERE clave = 'marca'");
  await encolar(c, pedido.id, 'aviso_venta', config.avisoVentasA || m?.email);
}

// Reenvío manual desde el panel: vuelve a poner en cola un correo existente
async function reenviar(pedidoId, tipo, destinatario) {
  await db.query(
    `INSERT INTO correos (pedido_id, tipo, destinatario) VALUES ($1, $2, $3)
     ON CONFLICT (pedido_id, tipo) DO UPDATE
       SET estado = 'pendiente', intentos = 0, proximo = now(), error = NULL, destinatario = EXCLUDED.destinatario`,
    [pedidoId, tipo, destinatario],
  );
  procesar().catch(() => {});
}

async function enviarUno(correo) {
  const msg = await plantillas.armar(correo.tipo, correo.pedido_id);
  if (!msg) throw new Error('Pedido no encontrado');
  if (modoPreview()) {
    await fs.promises.mkdir(PREVIEW_DIR, { recursive: true });
    const archivo = path.join(PREVIEW_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}_${correo.tipo}.html`);
    await fs.promises.writeFile(archivo, `<!-- Para: ${correo.destinatario} | Asunto: ${msg.asunto} -->\n${msg.html}`);
    console.log(`[correo] vista previa (sin SMTP): ${path.basename(archivo)} → ${correo.destinatario}`);
    return 'vista previa: SMTP no configurado';
  }
  const datos = {
    from: config.smtp.from || msg.remitente,
    to: correo.destinatario,
    replyTo: msg.responderA || undefined,
    subject: msg.asunto,
    html: msg.html,
    text: msg.texto,
  };
  if (usaApi()) await enviarPorApi(datos);
  else await smtp().sendMail(datos);
  return null;
}

let procesando = false;
async function procesar() {
  if (procesando) return;
  procesando = true;
  try {
    // "Reserva" hasta 10 correos por 5 minutos para que dos procesos no envíen el mismo
    const { rows } = await db.query(
      `UPDATE correos SET proximo = now() + interval '5 minutes'
       WHERE id IN (SELECT id FROM correos WHERE estado = 'pendiente' AND proximo <= now()
                    ORDER BY proximo LIMIT 10 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
    );
    for (const c of rows) {
      try {
        const nota = await enviarUno(c);
        await db.query(`UPDATE correos SET estado = 'enviado', enviado_en = now(), intentos = intentos + 1, error = $2 WHERE id = $1`, [c.id, nota]);
      } catch (e) {
        const espera = ESPERAS_MIN[c.intentos];
        await db.query(
          `UPDATE correos SET intentos = intentos + 1, error = $2,
             estado = CASE WHEN $3::int IS NULL THEN 'fallido' ELSE 'pendiente' END,
             proximo = now() + make_interval(mins => COALESCE($3::int, 0))
           WHERE id = $1`,
          [c.id, String(e.message).slice(0, 500), espera ?? null],
        );
        console.error(`[correo] ${c.tipo} a ${c.destinatario} falló (intento ${c.intentos + 1}): ${e.message}`);
      }
    }
  } finally {
    procesando = false;
  }
}

function iniciar() {
  if (modoPreview()) console.log('[correo] Sin correo configurado: los correos se guardan en correos-preview/');
  else console.log(`[correo] Envío por ${usaApi() ? `API de ${config.mailApi.proveedor}` : `SMTP ${config.smtp.host}`}`);
  setInterval(() => procesar().catch((e) => console.error('[correo]', e.message)), 20000).unref();
  setTimeout(() => procesar().catch(() => {}), 2000).unref();
}

module.exports = { encolar, encolarPagado, reenviar, procesar, iniciar };
