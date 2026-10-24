const db = require('../db');

// Entrega local por localidades. Cada tienda edita esta lista desde el panel.
const ENVIO_POR_DEFECTO = {
  region: 'Tarapacá',
  gratis_desde: 0,                       // 0 = nunca gratis
  zonas: [
    { nombre: 'Iquique', costo: 2000, activo: true },
    { nombre: 'Alto Hospicio', costo: 2000, activo: true },
    { nombre: 'Pozo Almonte', costo: 4000, activo: true },
    { nombre: 'La Tirana', costo: 4000, activo: true },
    { nombre: 'La Huayca', costo: 4000, activo: true },
    { nombre: 'Huara', costo: 5000, activo: true },
    { nombre: 'Pica', costo: 5000, activo: true },
  ],
  retiro: { activo: true, texto: 'Te escribimos por WhatsApp para coordinar el lugar y la hora de retiro.' },
};
const RETIRO = '__retiro';

// Términos y condiciones por defecto. {tienda}, {razon_social}, {correo} y {whatsapp}
// se reemplazan por los datos de la marca. EL CLIENTE DEBE REVISARLOS antes de publicar.
const TERMINOS_POR_DEFECTO = {
  secciones: [
    { titulo: 'Compras y precios', texto: 'Estos términos regulan las compras realizadas en este sitio de {razon_social}, conforme a la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores.\n\nTodos los precios están en pesos chilenos e incluyen IVA. El pedido se confirma una vez aprobado el pago. Por cada compra se emite boleta electrónica.' },
    { titulo: 'Entregas', texto: 'Entregamos en las localidades que aparecen al finalizar la compra, con el costo indicado para cada una. Después de confirmado el pago te contactamos por WhatsApp para coordinar el día y la hora. También puedes retirar tu pedido sin costo en el lugar que acordemos.' },
    { titulo: 'Cambios y devoluciones', texto: 'Tienes 10 días desde que recibes el producto para retractarte de la compra, siempre que el producto esté sellado y sin uso. Por razones de higiene no aceptamos devoluciones de productos abiertos, salvo falla o defecto.\n\nPara gestionar un cambio o devolución escríbenos a {correo}.' },
    { titulo: 'Datos personales', texto: 'Usamos tus datos solo para procesar y entregar tu pedido, y no los compartimos con terceros. Los datos de tu tarjeta nunca pasan por este sitio: los procesa directamente el medio de pago.' },
  ],
};

// Acepta también el formato antiguo (costo_rm / costo_regiones) y lo convierte
function normalizarEnvio(v) {
  if (!v || !Array.isArray(v.zonas)) {
    return { ...ENVIO_POR_DEFECTO, gratis_desde: Number(v?.gratis_desde) || 0 };
  }
  return {
    region: v.region || ENVIO_POR_DEFECTO.region,
    gratis_desde: Number(v.gratis_desde) || 0,
    zonas: v.zonas,
    retiro: { ...ENVIO_POR_DEFECTO.retiro, ...(v.retiro || {}) },
  };
}

async function todos() {
  const { rows } = await db.query('SELECT clave, valor FROM ajustes');
  const a = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  a.envio = normalizarEnvio(a.envio);
  if (!Array.isArray(a.terminos?.secciones)) a.terminos = TERMINOS_POR_DEFECTO;
  return a;
}

async function uno(clave) {
  const { rows } = await db.query('SELECT valor FROM ajustes WHERE clave = $1', [clave]);
  return clave === 'envio' ? normalizarEnvio(rows[0]?.valor) : rows[0]?.valor;
}

// Resuelve la opción de entrega elegida. Devuelve null si no es válida.
async function resolverEntrega(opcion, subtotal) {
  const e = await uno('envio');
  if (opcion === RETIRO) {
    return e.retiro.activo ? { retiro: true, zona: 'Retiro', region: e.region, costo: 0 } : null;
  }
  const z = e.zonas.find((x) => x.activo && x.nombre === opcion);
  if (!z) return null;
  const gratis = e.gratis_desde && subtotal >= e.gratis_desde;
  return { retiro: false, zona: z.nombre, region: e.region, costo: gratis ? 0 : z.costo };
}

module.exports = { todos, uno, resolverEntrega, normalizarEnvio, ENVIO_POR_DEFECTO, TERMINOS_POR_DEFECTO, RETIRO };
