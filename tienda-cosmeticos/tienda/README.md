# Tienda de cosméticos (multi-cliente)

Un solo código, una instalación por cliente. Cada cliente tiene **su propia base de datos, su propio `.env` y su propio dominio**. Lo único que cambia entre uno y otro es la configuración.

> **¿Primera vez?** Sigue [GUIA.md](GUIA.md): subir a GitHub y publicar gratis en Render + Neon, paso a paso y sin instalar PostgreSQL.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 13 o superior

## Instalar un cliente

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
# editar .env: DATABASE_URL, PUBLIC_URL, PASARELA, AMBIENTE y claves
npm run migrar:demo         # crea tablas + datos de ejemplo (o "npm run migrar" sin datos)
npm run admin -- correo@cliente.cl "Nombre Apellido"   # crea el usuario del panel (pide la contraseña)
npm start
```

- Tienda: `http://localhost:3000`
- Panel: `http://localhost:3000/admin`

Con `PASARELA=mock` puedes comprar de punta a punta sin cobrar nada.

> `npm run migrar` se puede correr las veces que quieras: solo agrega lo que falta. Úsalo después de cada actualización del código.

## Panel de administración (`/admin`)

| Sección | Qué hace |
|---|---|
| Resumen | Ventas de hoy y del mes, pedidos por despachar, gráfico de 30 días, productos con stock bajo |
| Pedidos | Buscar y filtrar, ver detalle, WhatsApp directo a la clienta, marcar despachado/entregado, n° de seguimiento, exportar a Excel (CSV) |
| Productos | Crear, editar, ocultar o eliminar; subir foto (JPG/PNG/WEBP, 3 MB); precio anterior para mostrar "Ahorra X%" |
| Categorías | Filtros que aparecen en la tienda |
| Reseñas | Publicar, ocultar, eliminar y cargar reseñas reales recibidas por otros canales |
| Datos de la tienda | Marca, contacto, envíos, colores, anuncios, preguntas frecuentes, tabla comparativa |

Seguridad del panel: contraseñas con scrypt, sesiones de 12 horas guardadas como hash en la BD, cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` con HTTPS), límite de 10 intentos de login cada 15 minutos y encabezado anti-CSRF en cada cambio. Las fotos se validan por contenido, no solo por extensión.

Para cambiar una contraseña olvidada: `npm run admin -- correo@cliente.cl` de nuevo (cierra las sesiones abiertas de ese usuario).

Las fotos se guardan **en la base de datos** (tabla `archivos`) y se sirven en `/img/...`: sobreviven reinicios y van incluidas en el respaldo de la base. (Las fotos de versiones anteriores en `public/uploads/` siguen funcionando.)

## Personalizar la marca

Todo está en la tabla `ajustes` (después se editará desde el panel de administración):

| clave         | qué contiene |
|---------------|--------------|
| `marca`       | nombre, razón social, título y bajada del hero, correo, WhatsApp, redes |
| `colores`     | `bg`, `ink`, `muted`, `brand`, `sage`, `sale` |
| `envio`       | región, localidades de entrega con su costo, retiro sin costo y monto de entrega gratis |
| `anuncios`    | textos de la barra superior |
| `comparacion` | filas de la tabla "Por qué [marca]" |
| `faq`         | preguntas frecuentes |

Productos, categorías y reseñas van en sus tablas. Si un producto no tiene `imagen_url`, se dibuja un envase con su `forma` y `colores`.

## Pasarelas de pago

Se elige con `PASARELA` en el `.env`. Todas siguen la misma interfaz (`src/payments/`), así que agregar otra es crear un archivo nuevo.

| Pasarela      | `.env` | Pruebas |
|---------------|--------|---------|
| `mock`        | — | Página propia con Aprobar / Rechazar. **Nunca en producción.** |
| `webpay`      | `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY` | Con `AMBIENTE=pruebas` usa las credenciales públicas de integración de Transbank. Tarjeta de prueba en transbankdevelopers.cl |
| `mercadopago` | `MP_ACCESS_TOKEN` | Access Token de un usuario de prueba de Mercado Pago |
| `flow`        | `FLOW_API_KEY`, `FLOW_SECRET_KEY` | Cuenta en sandbox.flow.cl |

URLs que hay que registrar o que la pasarela usará (se arman solas con `PUBLIC_URL`):

- Retorno: `PUBLIC_URL/api/pagos/retorno/<pasarela>`
- Notificación (Mercado Pago y Flow): `PUBLIC_URL/api/pagos/notificacion/<pasarela>`

Para probar notificaciones en local, la pasarela tiene que poder llegar a tu PC: usa un túnel (ngrok o cloudflared) y pon esa URL en `PUBLIC_URL`.

### Reglas de seguridad que ya cumple

- Los precios y el envío **siempre** se calculan en el servidor; lo que mande el navegador se ignora.
- El pago se verifica consultando a la pasarela, nunca confiando en la URL de vuelta.
- Si el monto pagado no coincide con el total del pedido, el pedido queda **rechazado** con una alerta.
- Retorno y notificación pueden llegar los dos: solo cuenta el primero (idempotente).
- Los datos de tarjeta nunca pasan por este servidor.
- El stock se descuenta solo cuando el pago está aprobado.

## Imágenes de la tienda y vista previa al compartir

En **Panel → Datos de la tienda → Imágenes** se suben el logo (reemplaza el nombre en el menú), la foto de portada y, opcionalmente, el ícono de la pestaña (si no hay, se dibuja la inicial con el color de la marca).

La portada y la página de cada producto se arman en el servidor con las etiquetas que leen WhatsApp, Instagram, Facebook y Google: al compartir un enlace aparecen foto, nombre y descripción. La página de producto incluye además datos estructurados (precio, stock, estrellas) para los resultados de Google.

> WhatsApp guarda en caché la vista previa de cada enlace. Si cambias una foto y el enlace ya se había compartido, puede tardar en actualizarse.

## Productos con opciones (tonos, tamaños)

En el formulario del producto, sección **Opciones**: se pone el nombre de la opción ("Tono", "Tamaño"…) y se agregan las opciones, cada una con:
- su **stock** propio (el stock del producto deja de usarse),
- un **color** opcional, para mostrarla como círculo de color (ideal para tonos),
- un **precio** opcional (vacío = precio del producto; útil para tamaños).

En la tienda, la clienta debe elegir la opción antes de agregar al carrito. En el pedido, los correos y el Excel aparece como "Base Luminosa · Arena". El stock se descuenta por opción y el resumen del panel avisa cuando una opción tiene 5 o menos.

## Página de producto

Cada producto tiene su página en `/producto/nombre-del-producto`: galería de hasta 8 fotos, opciones, cantidad, descripción completa, ingredientes, modo de uso, reseñas del producto y productos relacionados. Los textos se cargan en el panel (sección **Página del producto** del formulario). Las tarjetas de la portada llevan a esta página.

## Stock reservado y pedidos abandonados

Cuando la clienta pasa a pagar, el stock de su pedido **queda reservado**: nadie más puede comprar esas unidades mientras paga. Por eso nunca se vende dos veces la última unidad, aunque dos personas compren al mismo tiempo (la segunda recibe "Solo quedan 0 unidades").

- Si **paga**, la reserva pasa a ser venta.
- Si **cancela o la pasarela rechaza el pago**, el stock vuelve al tiro.
- Si **abandona** la página de pago, el pedido se anula solo a los `ANULAR_PENDIENTES_MINUTOS` (30 por defecto) y el stock vuelve.
- Si la administradora **anula** un pedido pendiente desde el panel, el stock vuelve.
- Si después de anulado llega igual el pago aprobado, el pedido se reactiva como pagado y salen sus correos; el stock se vuelve a descontar y, si ya no alcanza, el pedido muestra una alerta para coordinar con la clienta.

En el panel, la lista de pedidos muestra por defecto solo los activos (sin anulados ni rechazados).

## Términos y condiciones

Se editan en **Panel → Datos de la tienda → Términos y condiciones**, por secciones (título + texto), que se pueden agregar, quitar y reordenar. Las secciones 2 a 4 aparecen como enlaces en el pie de la tienda. En el texto se puede escribir `{tienda}`, `{razon_social}`, `{correo}` o `{whatsapp}` y se reemplaza por los datos de la marca. Los textos que vienen de ejemplo **deben revisarse con el contador o abogado del cliente** antes de publicar.

## Entregas locales

La tienda está pensada para entregar en una zona acotada (por defecto Iquique, Alto Hospicio, Pozo Almonte, La Tirana, La Huayca, Huara y Pica), con entregas coordinadas por WhatsApp. No hay integración con couriers.

- En **Panel → Datos de la tienda → Entregas** se agregan, quitan o desactivan localidades y se fija el costo de cada una (los precios iniciales son de ejemplo).
- **Retiro sin costo**: opcional. Si la clienta lo elige, no se le pide dirección.
- **Entrega gratis desde**: monto de compra desde el cual no se cobra la entrega (0 = nunca).
- Al marcar un pedido como **despachado** (o **listo para retiro**), se puede escribir un detalle para la clienta, por ejemplo "Lo lleva Pedro hoy entre 18 y 20 h", que va en el correo.

Flujo de la administradora: llega el correo "¡Vendiste!" → escribe a la clienta por WhatsApp (botón en el pedido) → coordina con quien entrega → marca despachado / listo para retiro → marca entregado / retirado.

## Correos automáticos

| Correo | Cuándo sale | Para quién |
|---|---|---|
| Confirmación de compra | Al aprobarse el pago | Clienta (responder llega a la tienda) |
| Aviso de venta | Al aprobarse el pago | `AVISO_VENTAS_A` o el correo de la marca (responder le escribe a la clienta) |
| Va en camino / Listo para retirar | Al marcar el pedido como despachado o listo para retiro (incluye el detalle de entrega si se escribió) | Clienta |

Se envían de dos formas:
- **Por API** (`MAIL_API=brevo` o `resend` + `MAIL_API_KEY`): recomendado, funciona en hostings que bloquean SMTP (como Render gratis).
- **Por SMTP** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).

En ambos casos se usan `MAIL_FROM` y `AVISO_VENTAS_A`. **Sin ninguno configurado** no se envía nada: los correos se guardan como `.html` en `correos-preview/` para revisarlos.

Cómo funcionan por dentro:
- Se encolan en la tabla `correos` **en la misma transacción** que marca el pedido como pagado: nunca hay pago sin correo ni correo sin pago.
- Cada pedido recibe cada tipo de correo **una sola vez**, aunque el pago se confirme dos veces o el pedido se despache dos veces.
- Si el servidor de correo falla, el pago sigue normal y el correo se reintenta a los 1, 5, 15, 60 y 240 minutos.
- En el detalle del pedido (panel) se ve si cada correo salió, y hay un botón para reenviarlo.

Recomendaciones para que no caigan en spam:
- `MAIL_FROM` con el dominio del cliente (`ventas@sudominio.cl`), no un Gmail personal.
- Configurar SPF y DKIM del dominio con los datos que entrega el proveedor de correo (Google Workspace, Zoho, Brevo, el hosting, etc.).
- Gmail personal sirve para pruebas usando una "contraseña de aplicación", pero tiene límite diario de envíos.

## Instalación automática al arrancar

Al iniciar, el servidor crea o actualiza las tablas (igual que `npm run migrar`), así que **no hay que migrar a mano después de actualizar el código**. Además, con variables de entorno:
- `ADMIN_EMAIL` + `ADMIN_CLAVE` (+ `ADMIN_NOMBRE`): crea ese usuario del panel si no existe.
- `DEMO_DATOS=si`: carga los productos de ejemplo si la base está vacía.

Esto permite instalar la tienda en Render sin abrir una consola.

## Estructura

```
src/
  server.js            servidor Express, seguridad (helmet, CSP)
  config.js            lee el .env
  db/                  conexión, schema.sql, seed.sql
  lib/pedidos.js       crear pedido, aplicar resultado de pago
  lib/ajustes.js       ajustes de marca y cálculo de envío
  payments/            mock, webpay, mercadopago, flow
  routes/              /api/tienda, /api/pedidos, /api/pagos, /api/admin
  lib/auth.js          contraseñas y sesiones del panel
  lib/correo.js        cola de correos, envío por API o SMTP, reintentos
  lib/plantillas.js    diseño y texto de los correos
  lib/catalogo.js      consulta de productos con opciones y valoraciones
  lib/arranque.js      prepara la base al iniciar (tablas, demo, usuario del panel)
  routes/imagenes.js   sirve las fotos guardadas en la base de datos
  routes/paginas.js    portada, página de producto, 404 e ícono (con vista previa para compartir)
public/                tienda (HTML + CSS + JS, sin frameworks)
public/admin/          panel de administración
public/uploads/        fotos subidas desde el panel
scripts/migrar.js      crea/actualiza tablas
scripts/crear-admin.js crea usuarios del panel
```

## Antes de entregar a un cliente

- [ ] `AMBIENTE=produccion` y credenciales reales de **su** cuenta de pagos
- [ ] Borrar las reseñas de ejemplo y cargar productos y fotos reales
- [ ] Revisar los términos y condiciones con el cliente desde el panel (retracto, entregas, devoluciones)
- [ ] HTTPS en el dominio (Let's Encrypt con Nginx, o el SSL del hosting)
- [ ] Crear el usuario del panel del cliente con `npm run admin`
- [ ] SMTP con el dominio del cliente, SPF/DKIM configurados y una compra de prueba para ver que lleguen los 3 correos
- [ ] Respaldo diario de la base de datos (incluye las fotos)

## Siguientes pasos

1. Boleta electrónica (integración con proveedor DTE)
2. Cupones de descuento
