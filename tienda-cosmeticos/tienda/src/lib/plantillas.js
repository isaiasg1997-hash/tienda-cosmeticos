// =========================================================
// Plantillas de correo. HTML con tablas y estilos en línea (lo único que
// Gmail, Outlook y Apple Mail muestran igual) + versión en texto plano.
// Usan el nombre y los colores de cada tienda.
// =========================================================
const db = require('../db');
const config = require('../config');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const PASARELAS = { webpay: 'Webpay', mercadopago: 'Mercado Pago', flow: 'Flow', mock: 'pago simulado' };
const nombrePasarela = (k) => PASARELAS[k] || k;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

// Elige texto blanco o negro según qué se lee mejor sobre el color del botón
function textoSobre(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1A1A1A' : '#FFFFFF';
}

async function datos(pedidoId) {
  const { rows: [p] } = await db.query('SELECT * FROM pedidos WHERE id = $1', [pedidoId]);
  if (!p) return null;
  const [{ rows: items }, { rows: aj }] = await Promise.all([
    db.query('SELECT nombre, precio, cantidad FROM pedido_items WHERE pedido_id = $1 ORDER BY id', [p.id]),
    db.query("SELECT clave, valor FROM ajustes WHERE clave IN ('marca','colores')"),
  ]);
  const a = Object.fromEntries(aj.map((r) => [r.clave, r.valor]));
  const c = { bg: '#F6F1F3', ink: '#2E1A2B', muted: '#6E5868', brand: '#9C4F7E', ...(a.colores || {}) };
  return { p, items, marca: a.marca || { nombre: 'Tienda' }, c };
}

// ---------- piezas comunes ----------
function boton(texto, url, c) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px"><tr>
    <td bgcolor="${c.brand}" style="border-radius:999px">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:bold;color:${textoSobre(c.brand)};text-decoration:none;border-radius:999px">${esc(texto)}</a>
    </td></tr></table>`;
}

function tablaItems(d) {
  const { p, items, c } = d;
  const fila = (izq, der, estilo = '') => `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #EEE4E9;font-family:${SANS};font-size:15px;color:${c.ink};${estilo}">${izq}</td>
    <td align="right" style="padding:10px 0;border-bottom:1px solid #EEE4E9;font-family:${SANS};font-size:15px;color:${c.ink};white-space:nowrap;${estilo}">${der}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
    ${items.map((i) => fila(`${esc(i.nombre)} <span style="color:${c.muted}">× ${i.cantidad}</span>`, clp(i.precio * i.cantidad))).join('')}
    ${fila(`<span style="color:${c.muted}">${p.retiro ? 'Retiro' : 'Entrega'}</span>`, p.envio ? clp(p.envio) : 'Gratis')}
    ${fila('<b>Total</b>', `<b>${clp(p.total)}</b>`, 'border-bottom:0;font-size:17px')}
  </table>`;
}

function caja(titulo, contenido, c) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>
    <td style="background:${c.bg};border-radius:12px;padding:16px 18px;font-family:${SANS};font-size:14px;line-height:1.6;color:${c.ink}">
      <div style="font-weight:bold;margin-bottom:4px">${titulo}</div>${contenido}</td></tr></table>`;
}

function marco(d, { preheader, titulo, cuerpo, pie = true }) {
  const { marca, c } = d;
  const contacto = [
    marca.email && `<a href="mailto:${esc(marca.email)}" style="color:${c.muted}">${esc(marca.email)}</a>`,
    marca.whatsapp && `<a href="https://wa.me/${esc(marca.whatsapp.replace(/\D/g, ''))}" style="color:${c.muted}">WhatsApp</a>`,
    marca.instagram && `<a href="${esc(marca.instagram)}" style="color:${c.muted}">Instagram</a>`,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${c.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.bg}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 20px;font-family:${SERIF};font-size:28px;color:${c.ink}">${esc(marca.nombre)}</td></tr>
    <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:20px;padding:32px 28px">
      <h1 style="margin:0 0 14px;font-family:${SERIF};font-weight:normal;font-size:28px;line-height:1.2;color:${c.ink}">${titulo}</h1>
      ${cuerpo}
    </td></tr>
    ${pie ? `<tr><td align="center" style="padding:22px 12px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${c.muted}">
      ¿Dudas con tu pedido? Responde este correo o escríbenos.<br>${contacto}<br>
      <span style="color:${c.muted}">${esc(marca.nombre_legal || marca.nombre)}</span></td></tr>` : ''}
  </table>
</td></tr></table></body></html>`;
}

const parrafo = (t, c) => `<p style="margin:0 0 12px;font-family:${SANS};font-size:16px;line-height:1.6;color:${c.ink}">${t}</p>`;
const textoItems = ({ p, items }) => [
  ...items.map((i) => `  ${i.nombre} x${i.cantidad} ...... ${clp(i.precio * i.cantidad)}`),
  `  ${p.retiro ? 'Retiro' : 'Entrega'} ...... ${p.envio ? clp(p.envio) : 'Gratis'}`,
  `  TOTAL ...... ${clp(p.total)}`,
].join('\n');
const direccion = (p) => (p.retiro ? 'Retiro (se coordina por WhatsApp)' : `${p.direccion}, ${p.comuna}`);
const urlPedido = (p) => `${config.publicUrl}/pedido.html?id=${p.id}`;
const primerNombre = (p) => p.nombre.split(' ')[0];

// ---------- los tres correos ----------
const TIPOS = {
  confirmacion(d) {
    const { p, c, marca } = d;
    return {
      asunto: `Tu pedido ${p.codigo} está confirmado`,
      responderA: marca.email,
      html: marco(d, {
        preheader: `Recibimos tu pago de ${clp(p.total)}. Te escribiremos por WhatsApp para coordinar ${p.retiro ? 'el retiro' : 'la entrega'}.`,
        titulo: `¡Gracias por tu compra, ${esc(primerNombre(p))}!`,
        cuerpo: `${parrafo(`Recibimos tu pago y ya estamos preparando tu pedido <b>${esc(p.codigo)}</b>. Te escribiremos por WhatsApp al ${esc(p.telefono)} para coordinar ${p.retiro ? 'dónde y cuándo retirarlo' : 'el día y la hora de entrega'}.`, c)}
          ${tablaItems(d)}
          ${p.retiro
            ? caja('Retiro', `${esc(p.nombre)}<br>Sin costo. Te contactamos para acordar el lugar y la hora.`, c)
            : caja('Entregamos en', `${esc(p.nombre)}<br>${esc(direccion(p))}${p.notas ? `<br><span style="color:${c.muted}">${esc(p.notas)}</span>` : ''}`, c)}
          ${boton('Ver mi pedido', urlPedido(p), c)}`,
      }),
      texto: `¡Gracias por tu compra, ${primerNombre(p)}!\n\nRecibimos tu pago y estamos preparando tu pedido ${p.codigo}. Te escribiremos por WhatsApp para coordinar ${p.retiro ? 'el retiro' : 'la entrega'}.\n\n${textoItems(d)}\n\n${p.retiro ? 'Retiro' : 'Entregamos en'}: ${direccion(p)}\n\nVer tu pedido: ${urlPedido(p)}\n\n${marca.nombre}${marca.email ? ` · ${marca.email}` : ''}`,
    };
  },

  aviso_venta(d) {
    const { p, c } = d;
    const urlPanel = `${config.publicUrl}/admin/#pedidos?q=${encodeURIComponent(p.codigo)}`;
    const tel = p.telefono.replace(/\D/g, '');
    return {
      asunto: `Nueva venta ${p.codigo} · ${clp(p.total)}`,
      responderA: p.email,          // responder este correo le escribe directo a la clienta
      html: marco(d, {
        preheader: `${p.nombre} compró ${d.items.reduce((s, i) => s + i.cantidad, 0)} productos por ${clp(p.total)}`,
        titulo: `¡Vendiste ${clp(p.total)}!`,
        pie: false,
        cuerpo: `${parrafo(`Entró el pedido <b>${esc(p.codigo)}</b>, pagado con ${esc(nombrePasarela(p.pasarela))}. ${p.retiro ? 'La clienta eligió <b>retiro</b>: escríbele para acordar lugar y hora.' : `Hay que entregarlo en <b>${esc(p.comuna)}</b>: escríbele para coordinar.`} ${p.retiro ? 'Cuando esté listo, márcalo como listo para retiro' : 'Cuando salga, márcalo como despachado'} en el panel y le llega un correo.`, c)}
          ${tablaItems(d)}
          ${caja(p.retiro ? 'Clienta · retiro' : `Clienta · entrega en ${esc(p.comuna)}`, `${esc(p.nombre)}${p.rut ? ` · RUT ${esc(p.rut)}` : ''}<br>
            <a href="mailto:${esc(p.email)}" style="color:${c.ink}">${esc(p.email)}</a> · ${esc(p.telefono)}
            (<a href="https://wa.me/${tel.length === 9 ? '56' + tel : tel}" style="color:${c.ink}">WhatsApp</a>)<br>
            ${esc(direccion(p))}${p.notas ? `<br><b>Indicaciones:</b> ${esc(p.notas)}` : ''}`, c)}
          ${boton('Ver en el panel', urlPanel, c)}`,
      }),
      texto: `¡Vendiste ${clp(p.total)}!\n\nPedido ${p.codigo} (${p.pasarela})\n\n${textoItems(d)}\n\nClienta: ${p.nombre}${p.rut ? ` · RUT ${p.rut}` : ''}\n${p.email} · ${p.telefono}\n${direccion(p)}${p.notas ? `\nIndicaciones: ${p.notas}` : ''}\n\nPanel: ${urlPanel}`,
    };
  },

  despacho(d) {
    const { p, c, marca } = d;
    return {
      asunto: p.retiro ? `Tu pedido ${p.codigo} está listo para retirar` : `Tu pedido ${p.codigo} va en camino`,
      responderA: marca.email,
      html: marco(d, {
        preheader: p.seguimiento || (p.retiro ? 'Tu pedido ya está listo.' : 'Tu pedido ya salió.'),
        titulo: p.retiro ? `Tu pedido está listo, ${esc(primerNombre(p))}` : `Tu pedido va en camino, ${esc(primerNombre(p))}`,
        cuerpo: `${parrafo(p.retiro
            ? `Tu pedido <b>${esc(p.codigo)}</b> ya está listo para retirar.`
            : `Tu pedido <b>${esc(p.codigo)}</b> ya salió y va rumbo a ${esc(p.comuna)}.`, c)}
          ${p.seguimiento ? caja(p.retiro ? 'Detalle del retiro' : 'Detalle de la entrega', `<span style="font-size:17px">${esc(p.seguimiento)}</span>`, c) : ''}
          ${p.retiro ? '' : caja('Dirección de entrega', `${esc(p.nombre)}<br>${esc(direccion(p))}`, c)}
          ${boton('Ver mi pedido', urlPedido(p), c)}`,
      }),
      texto: `${p.retiro ? `Tu pedido ${p.codigo} está listo para retirar` : `Tu pedido ${p.codigo} va en camino a ${p.comuna}`}, ${primerNombre(p)}.\n${p.seguimiento ? `\n${p.seguimiento}\n` : ''}${p.retiro ? '' : `\nDirección: ${direccion(p)}`}\n\nVer tu pedido: ${urlPedido(p)}\n\n${marca.nombre}`,
    };
  },
};

async function armar(tipo, pedidoId) {
  if (!TIPOS[tipo]) throw new Error(`Tipo de correo desconocido: ${tipo}`);
  const d = await datos(pedidoId);
  if (!d) return null;
  const msg = TIPOS[tipo](d);
  return { ...msg, remitente: `"${d.marca.nombre}" <${d.marca.email}>` };
}

module.exports = { armar, TIPOS: Object.keys(TIPOS) };
