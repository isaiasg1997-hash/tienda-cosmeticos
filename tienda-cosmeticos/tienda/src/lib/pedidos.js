const db = require('../db');
const { resolverEntrega } = require('./ajustes');
const correo = require('./correo');

class ErrorValidacion extends Error {}

function validarCliente(c = {}) {
  const t = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const datos = {
    nombre: t(c.nombre), email: t(c.email).toLowerCase(), telefono: t(c.telefono, 30),
    rut: t(c.rut, 15) || null, entrega: t(c.entrega, 80),
    direccion: t(c.direccion, 250), notas: t(c.notas, 500) || null,
  };
  if (datos.nombre.length < 3) throw new ErrorValidacion('Escribe tu nombre completo');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) throw new ErrorValidacion('El correo no es válido');
  if (datos.telefono.replace(/\D/g, '').length < 8) throw new ErrorValidacion('El teléfono no es válido');
  if (!datos.entrega) throw new ErrorValidacion('Elige dónde te entregamos el pedido');
  return datos;
}

// Crea el pedido. Los precios SIEMPRE salen de la base de datos, nunca del navegador.
// Cada línea es un producto, o un producto + variante (tono, tamaño).
let ultimaLimpieza = 0;
async function crear({ cliente, items }, pasarela) {
  const datos = validarCliente(cliente);
  // Antes de reservar, libera el stock de pedidos abandonados. Así funciona aunque el
  // servidor haya estado dormido (Render gratis) y no haya corrido la limpieza periódica.
  if (Date.now() - ultimaLimpieza > 60 * 1000) {
    ultimaLimpieza = Date.now();
    await anularAbandonados(require('../config').anularPendientesMinutos).catch((e) => console.error('[pedidos]', e.message));
  }
  if (!Array.isArray(items) || !items.length) throw new ErrorValidacion('El carrito está vacío');

  // Agrupa líneas iguales y limpia cantidades
  const lineas = new Map();
  for (const it of items.slice(0, 50)) {
    const id = Number(it.id), q = Math.floor(Number(it.cantidad));
    const vid = it.variante == null || it.variante === '' ? null : Number(it.variante);
    if (!Number.isInteger(id) || (vid !== null && !Number.isInteger(vid)) || !(q > 0 && q <= 99)) {
      throw new ErrorValidacion('Cantidad inválida en el carrito');
    }
    const k = `${id}:${vid ?? ''}`;
    lineas.set(k, { id, vid, q: (lineas.get(k)?.q || 0) + q });
  }

  return db.tx(async (c) => {
    const ids = [...new Set([...lineas.values()].map((l) => l.id))];
    // FOR UPDATE bloquea estas filas hasta terminar: si dos personas compran la última
    // unidad al mismo tiempo, la segunda espera y luego ve que ya no queda.
    const { rows: prods } = await c.query(
      'SELECT id, nombre, precio, stock FROM productos WHERE activo AND id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
    const { rows: vars } = await c.query(
      'SELECT id, producto_id, nombre, precio, stock FROM variantes WHERE activo AND producto_id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
    if (prods.length !== ids.length) throw new ErrorValidacion('Algún producto del carrito ya no está disponible');

    const detalle = [];
    for (const l of lineas.values()) {
      const p = prods.find((x) => x.id === l.id);
      const propias = vars.filter((v) => v.producto_id === p.id);
      if (propias.length && l.vid === null) throw new ErrorValidacion(`Elige una opción de ${p.nombre}`);
      if (l.vid !== null) {
        const v = propias.find((x) => x.id === l.vid);
        if (!v) throw new ErrorValidacion(`Una opción de ${p.nombre} ya no está disponible`);
        if (v.stock < l.q) throw new ErrorValidacion(`Solo quedan ${v.stock} unidades de ${p.nombre} (${v.nombre})`);
        detalle.push({ producto_id: p.id, variante_id: v.id, variante: v.nombre, nombre: `${p.nombre} · ${v.nombre}`, precio: v.precio ?? p.precio, cantidad: l.q });
      } else {
        if (p.stock < l.q) throw new ErrorValidacion(`Solo quedan ${p.stock} unidades de ${p.nombre}`);
        detalle.push({ producto_id: p.id, variante_id: null, variante: null, nombre: p.nombre, precio: p.precio, cantidad: l.q });
      }
    }

    const subtotal = detalle.reduce((s, d) => s + d.precio * d.cantidad, 0);
    const ent = await resolverEntrega(datos.entrega, subtotal);
    if (!ent) throw new ErrorValidacion('Esa opción de entrega ya no está disponible. Elige otra.');
    if (!ent.retiro && datos.direccion.length < 5) throw new ErrorValidacion('Escribe tu dirección');
    const envio = ent.costo;
    const total = subtotal + envio;
    const { rows: [{ n }] } = await c.query("SELECT nextval('pedido_numero') AS n");
    const codigo = `P-${String(n).padStart(6, '0')}`;

    const { rows: [pedido] } = await c.query(
      `INSERT INTO pedidos (codigo, nombre, email, telefono, rut, region, comuna, direccion, retiro, notas, subtotal, envio, total, pasarela, stock_estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'reservado') RETURNING *`,
      [codigo, datos.nombre, datos.email, datos.telefono, datos.rut, ent.region, ent.zona,
        ent.retiro ? '' : datos.direccion, ent.retiro, datos.notas, subtotal, envio, total, pasarela],
    );
    for (const d of detalle) {
      await c.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, variante_id, variante, nombre, precio, cantidad)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [pedido.id, d.producto_id, d.variante_id, d.variante, d.nombre, d.precio, d.cantidad],
      );
      // Reserva: el stock se aparta ahora (ya se verificó arriba con las filas bloqueadas)
      if (d.variante_id) await c.query('UPDATE variantes SET stock = stock - $2 WHERE id = $1', [d.variante_id, d.cantidad]);
      else await c.query('UPDATE productos SET stock = stock - $2 WHERE id = $1', [d.producto_id, d.cantidad]);
    }
    return pedido;
  });
}

// Devuelve al stock lo que un pedido tenía reservado (solo una vez)
async function liberarStock(c, pedidoId) {
  const { rowCount } = await c.query(
    "UPDATE pedidos SET stock_estado = 'liberado' WHERE id = $1 AND stock_estado = 'reservado'", [pedidoId]);
  if (!rowCount) return;
  await c.query(
    `UPDATE productos pr SET stock = pr.stock + i.cantidad
     FROM pedido_items i WHERE i.pedido_id = $1 AND i.producto_id = pr.id AND i.variante_id IS NULL`, [pedidoId]);
  await c.query(
    `UPDATE variantes v SET stock = v.stock + i.cantidad
     FROM pedido_items i WHERE i.pedido_id = $1 AND i.variante_id = v.id`, [pedidoId]);
}

// Anula un pedido pendiente y libera su stock (falla de la pasarela, anulación manual)
async function anular(pedidoId, extra = {}) {
  return db.tx(async (c) => {
    const { rows: [p] } = await c.query('SELECT estado FROM pedidos WHERE id = $1 FOR UPDATE', [pedidoId]);
    if (!p || p.estado !== 'pendiente') return false;
    await c.query(
      `UPDATE pedidos SET estado = 'anulado', pasarela_resp = COALESCE(pasarela_resp, '{}'::jsonb) || $2 WHERE id = $1`,
      [pedidoId, extra]);
    await liberarStock(c, pedidoId);
    return true;
  });
}

async function buscar(pasarela, b) {
  let r;
  if (b.id) r = await db.query('SELECT * FROM pedidos WHERE id::text = $1', [b.id]);
  else if (b.codigo) r = await db.query('SELECT * FROM pedidos WHERE codigo = $1', [b.codigo]);
  else if (b.ref) r = await db.query('SELECT * FROM pedidos WHERE pasarela = $1 AND pasarela_ref = $2', [pasarela, b.ref]);
  return r?.rows[0] || null;
}

// Aplica el resultado de la pasarela. Es idempotente: si llega dos veces
// (retorno + notificación) solo cuenta la primera.
async function aplicarResultado(pasarela, res) {
  let recienPagado = false;
  const pedido = await db.tx(async (c) => {
    const p = await buscar(pasarela, res.buscar);
    if (!p) return null;
    const { rows: [actual] } = await c.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [p.id]);
    // Un pedido anulado por abandono se reactiva si el pago llega aprobado igual (la plata ya se cobró)
    const expiradoPeroPagado = actual.estado === 'anulado' && actual.pasarela_resp?.motivo === 'expirado' && res.aprobado;
    if (actual.estado !== 'pendiente' && !expiradoPeroPagado) return actual;

    const montoOk = res.monto === actual.total;
    const aprobado = res.aprobado && montoOk;
    const estado = aprobado ? 'pagado' : res.cancelado ? 'anulado' : 'rechazado';
    const respuesta = { ...res.respuesta, ...(res.aprobado && !montoOk ? { alerta: 'monto no coincide' } : {}) };

    const { rows: [upd] } = await c.query(
      `UPDATE pedidos SET estado = $2, pasarela_resp = $3, pagado_en = CASE WHEN $2 = 'pagado' THEN now() END
       WHERE id = $1 RETURNING *`,
      [actual.id, estado, respuesta],
    );
    if (!aprobado) await liberarStock(c, actual.id);
    if (aprobado && actual.stock_estado === 'reservado') {
      // El stock ya se apartó al crear el pedido: solo se marca como descontado
      await c.query("UPDATE pedidos SET stock_estado = 'descontado' WHERE id = $1", [actual.id]);
    } else if (aprobado) {
      // Pedido antiguo o anulado por abandono que se pagó tarde: su reserva ya se había
      // devuelto, así que se descuenta ahora. Si ya no alcanza, queda pagado igual
      // (ya se cobró) pero con una alerta para la administradora.
      const { rows: faltan } = await c.query(
        `SELECT i.nombre FROM pedido_items i
           LEFT JOIN productos pr ON pr.id = i.producto_id AND i.variante_id IS NULL
           LEFT JOIN variantes v ON v.id = i.variante_id
         WHERE i.pedido_id = $1 AND COALESCE(v.stock, pr.stock, 0) < i.cantidad`, [actual.id]);
      await c.query(
        `UPDATE productos pr SET stock = GREATEST(0, pr.stock - i.cantidad)
         FROM pedido_items i WHERE i.pedido_id = $1 AND i.producto_id = pr.id AND i.variante_id IS NULL`, [actual.id]);
      await c.query(
        `UPDATE variantes v SET stock = GREATEST(0, v.stock - i.cantidad)
         FROM pedido_items i WHERE i.pedido_id = $1 AND i.variante_id = v.id`, [actual.id]);
      if (faltan.length) {
        await c.query(`UPDATE pedidos SET pasarela_resp = pasarela_resp || $2 WHERE id = $1`,
          [actual.id, { alerta: `stock insuficiente al pagar: ${faltan.map((f) => f.nombre).join(', ')}` }]);
        upd.pasarela_resp = { ...upd.pasarela_resp, alerta: `stock insuficiente: ${faltan.map((f) => f.nombre).join(', ')}` };
      }
      await c.query("UPDATE pedidos SET stock_estado = 'descontado' WHERE id = $1", [actual.id]);
    }
    if (aprobado) {
      await correo.encolarPagado(c, upd);   // si la transacción falla, tampoco se encolan
      recienPagado = true;
    }
    return upd;
  });
  if (recienPagado) setImmediate(() => correo.procesar().catch(() => {}));
  return pedido;
}

async function detalle(id) {
  const { rows: [p] } = await db.query(
    `SELECT id, codigo, estado, nombre, email, region, comuna, direccion, retiro, seguimiento, subtotal, envio, total, creado_en, pagado_en
     FROM pedidos WHERE id::text = $1`, [id],
  );
  if (!p) return null;
  const { rows: items } = await db.query('SELECT nombre, precio, cantidad FROM pedido_items WHERE pedido_id = $1', [p.id]);
  return { ...p, items };
}

// Anula los pedidos que quedaron "pendiente de pago" (la clienta cerró la ventana
// de la pasarela) y devuelve su stock reservado para que otra persona pueda comprarlo.
// Si después llega el pago aprobado igual, aplicarResultado() lo reactiva.
async function anularAbandonados(minutos) {
  const { rows } = await db.query(
    `SELECT id, codigo FROM pedidos WHERE estado = 'pendiente' AND creado_en < now() - make_interval(mins => $1)
     ORDER BY creado_en LIMIT 200`, [minutos]);
  const anulados = [];
  for (const p of rows) {
    if (await anular(p.id, { motivo: 'expirado' })) anulados.push(p.codigo);
  }
  if (anulados.length) console.log(`[pedidos] anulados por abandono (stock devuelto): ${anulados.join(', ')}`);
  return anulados.length;
}

function iniciarLimpieza(minutos) {
  const tarea = () => anularAbandonados(minutos).catch((e) => console.error('[pedidos]', e.message));
  setTimeout(tarea, 5000).unref();
  setInterval(tarea, 2 * 60 * 1000).unref();      // cada 2 minutos
}

module.exports = { ErrorValidacion, crear, aplicarResultado, detalle, anular, anularAbandonados, iniciarLimpieza };
