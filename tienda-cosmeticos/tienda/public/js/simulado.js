const qs = new URLSearchParams(location.search);
const ref = qs.get('ref'), monto = qs.get('monto');
document.getElementById('codigo').textContent = `Pedido ${qs.get('codigo') || ''}`;
document.getElementById('monto').textContent = '$' + Number(monto).toLocaleString('es-CL');
const url = (resultado) => `/api/pagos/retorno/mock?ref=${encodeURIComponent(ref)}&monto=${encodeURIComponent(monto)}&resultado=${resultado}`;
document.getElementById('ok').href = url('aprobado');
document.getElementById('rech').href = url('rechazado');
document.getElementById('canc').href = url('cancelado');
