# Guía: publicar la tienda en Render (gratis) y actualizarla con GitHub

Pensada para **Windows con PowerShell**. Lo que está entre `<...>` se reemplaza con tus datos.

Vas a usar tres servicios gratuitos:

| Servicio | Para qué |
|---|---|
| **GitHub** | Guardar el código. Cada vez que subes un cambio, la tienda se actualiza sola |
| **Neon** | La base de datos PostgreSQL (gratis y no expira) |
| **Render** | Donde corre la tienda (la página que ven las clientas y el panel) |
| **Brevo** (opcional) | Enviar los correos de confirmación |

> **No necesitas instalar PostgreSQL en tu PC.** Al arrancar, la tienda crea sola las tablas, los datos de ejemplo y tu usuario del panel.

---

## Paso 1 · Instalar Git (una sola vez)

1. Descarga **Git for Windows** desde git-scm.com e instálalo con las opciones por defecto.
2. Abre una PowerShell **nueva** y verifica:

```powershell
git --version
```

3. Dile a Git quién eres:

```powershell
git config --global user.name "<Tu Nombre>"
git config --global user.email "<tu-correo-de-github>"
```

---

## Paso 2 · Subir el código a GitHub

### 2.1 Preparar la carpeta

Descomprime el zip. Adentro hay una carpeta `tienda`: renómbrala a `tienda-cosmeticos` y déjala, por ejemplo, en `C:\proyectos\tienda-cosmeticos`.

### 2.2 Crear el repositorio

En **github.com** → botón **New** →
- Repository name: `tienda-cosmeticos`
- Marca **Private** (es el código de tus clientes)
- **No** marques "Add a README"
- **Create repository**

### 2.3 Subir

```powershell
cd C:\proyectos\tienda-cosmeticos
git init
git add .
git status
```

En la lista de `git status` **no** debe aparecer ningún archivo `.env` ni la carpeta `node_modules` (el `.gitignore` ya los excluye). Luego:

```powershell
git commit -m "Primera versión de la tienda"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/tienda-cosmeticos.git
git push -u origin main
```

La primera vez se abre una ventana para iniciar sesión en GitHub. Al terminar, recarga la página del repositorio: deberías ver los archivos.

---

## Paso 3 · Crear la base de datos en Neon

1. Entra a **neon.com** → *Sign up* (puedes entrar con tu cuenta de GitHub). No pide tarjeta.
2. Crea un proyecto:
   - **Project name:** `tienda-cosmeticos`
   - **Region:** **AWS US East (N. Virginia)**. Es la más cercana a los servidores de Render, y eso hace que la tienda responda más rápido (lo que importa es la distancia entre la tienda y su base de datos).
3. En el panel del proyecto, botón **Connect**. Copia la **connection string**. Se ve así:

```
postgresql://neondb_owner:xxxxxxxx@ep-xxxx-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

Guárdala en un lugar seguro (es la "llave" de tu base de datos). Si al final trae `&channel_binding=require` y más adelante Render muestra un error de conexión, bórrale esa parte.

---

## Paso 4 · Correo con Brevo (opcional, pero recomendado)

Render gratis **bloquea el envío de correos por SMTP**, así que la tienda los envía por la API de Brevo. Si te saltas este paso, la tienda funciona igual, solo que no salen los correos.

1. Crea una cuenta en **brevo.com**.
2. Verifica el correo que usarás como remitente: menú **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**. Te llega un correo de confirmación.
   - Para probar puedes usar tu Gmail.
   - Para la tienda real, usa un correo con el dominio del cliente (`ventas@sudominio.cl`), así los correos no caen en spam.
3. Crea la clave: menú de tu cuenta → **SMTP & API** → pestaña **API Keys** → **Generate a new API key**. Copia la clave (empieza con `xkeysib-`). **Se muestra una sola vez.**

---

## Paso 5 · Publicar en Render

1. Entra a **render.com** → *Get Started* → entra **con tu cuenta de GitHub**.
2. **New +** → **Web Service** → elige el repositorio `tienda-cosmeticos`. Si no aparece, toca *Configure account* y dale acceso a Render.
3. Completa:

| Campo | Valor |
|---|---|
| Name | `tienda-cosmeticos` (será parte de la dirección: `tienda-cosmeticos.onrender.com`) |
| Region | **Virginia (US East)**, la misma zona que elegiste en Neon |
| Branch | `main` |
| Language / Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

4. Más abajo, en **Environment Variables**, agrega estas variables (botón *Add Environment Variable*):

| Variable | Valor | Nota |
|---|---|---|
| `DATABASE_URL` | la connection string de Neon | Obligatoria |
| `ADMIN_EMAIL` | tu correo | Usuario del panel |
| `ADMIN_CLAVE` | una contraseña de **mínimo 10 caracteres** | Contraseña del panel |
| `ADMIN_NOMBRE` | tu nombre | Opcional |
| `DEMO_DATOS` | `si` | Carga los productos de ejemplo (solo si la base está vacía) |
| `PASARELA` | `mock` | Pago simulado: no cobra nada |
| `AMBIENTE` | `pruebas` | |

   Si hiciste el paso 4 (Brevo), agrega también:

| Variable | Valor |
|---|---|
| `MAIL_API` | `brevo` |
| `MAIL_API_KEY` | la clave de Brevo (`xkeysib-...`) |
| `MAIL_FROM` | `Nombre de la tienda <el-correo-que-verificaste@...>` |
| `AVISO_VENTAS_A` | el correo que recibe el aviso de "¡Vendiste!" |

   **No** necesitas `PUBLIC_URL`: en Render la tienda la detecta sola.

5. Abre **Advanced** y en **Health Check Path** escribe `/api/salud`.
6. Toca **Create Web Service** (o *Deploy Web Service*).

Render instala y arranca la tienda (tarda unos 2 a 4 minutos). En la pestaña **Logs** deberías ver:

```
[arranque] Tablas al día
[arranque] Datos de ejemplo cargados (DEMO_DATOS)
[arranque] Usuario del panel creado: tu@correo.cl
Tienda en https://tienda-cosmeticos.onrender.com ...
```

¡Listo! Arriba a la izquierda aparece la dirección de tu tienda:

- Tienda: `https://tienda-cosmeticos.onrender.com`
- Panel: `https://tienda-cosmeticos.onrender.com/admin`

### Primera prueba (5 minutos)

1. Entra al panel con `ADMIN_EMAIL` y `ADMIN_CLAVE`.
2. En **Datos de la tienda**, sube un logo y una foto de portada, y cambia el nombre de la tienda.
3. En **Productos**, súbele una foto a un producto.
4. En la tienda, compra algo y en la página de pago simulado toca **Aprobar pago**.
5. Revisa que el pedido aparezca en el panel y, si configuraste Brevo, que llegue el correo de confirmación.
6. Comparte el link de la tienda por WhatsApp para ver la vista previa con foto.

---

## Paso 6 · El día a día: hacer cambios y publicarlos

1. Edita el código (con VS Code, por ejemplo).
2. Súbelo:

```powershell
cd C:\proyectos\tienda-cosmeticos
git add .
git commit -m "<qué cambiaste, en pocas palabras>"
git push
```

3. Render detecta el cambio y publica la nueva versión sola en 2 o 3 minutos (pestaña **Events**).

Si el cambio agrega tablas o columnas (archivo `src/db/schema.sql`), no tienes que hacer nada más: la tienda actualiza la base sola al arrancar, sin borrar datos.

### Comandos de Git que más vas a usar

| Comando | Qué hace |
|---|---|
| `git status` | Qué archivos cambiaste |
| `git diff` | Qué líneas cambiaste exactamente |
| `git log --oneline` | Lista de versiones guardadas |
| `git restore <archivo>` | Descarta tus cambios en un archivo |
| `git pull` | Trae cambios de GitHub (si trabajas desde otro PC) |

**Volver a una versión anterior en Render:** pestaña **Events** → elige un despliegue anterior → **Rollback**.

---

## Opcional · Correr la tienda en tu PC para probar antes de subir

Instala **Node.js** (versión LTS) desde nodejs.org. Luego, en la carpeta del proyecto:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

En el `.env`, pon en `DATABASE_URL` **la misma connection string de Neon** y agrega `PUBLIC_URL=http://localhost:3000`. Después:

```powershell
npm run dev
```

Abre http://localhost:3000. `npm run dev` se reinicia solo cuando guardas un cambio. Para apagar: `Ctrl + C`.

> Ojo: así tu PC usa **la misma base de datos** que la tienda publicada. Para pruebas está bien; si quieres una base separada, crea una segunda *branch* en Neon (botón **Branches**) y usa su connection string.

---

## Limitaciones del plan gratis de Render

- **Se duerme** tras 15 minutos sin visitas. La primera visita después tarda cerca de un minuto en cargar. Antes de mostrarle la tienda a un cliente, ábrela tú un minuto antes.
- **Uso:** es para pruebas y demostraciones. Para las tiendas reales de tus clientes conviene un plan pagado o un VPS.

Lo que **sí funciona** en el plan gratis: fotos (se guardan en la base de datos), correos (por la API de Brevo), anulación de pedidos abandonados y liberación de stock.

---

## Cambiar la contraseña del panel

La variable `ADMIN_CLAVE` solo se usa para **crear** el usuario la primera vez; cambiarla después no cambia la contraseña. Para cambiarla, desde tu PC, con Node instalado:

```powershell
$env:DATABASE_URL = "<connection-string-de-neon>"
npm run admin -- <tu-correo> "<Tu Nombre>"
Remove-Item Env:DATABASE_URL
```

Te pide la nueva contraseña y cierra las sesiones abiertas de ese usuario.

---

## Si algo falla

| Dónde | Mensaje | Qué hacer |
|---|---|---|
| Logs de Render | `Falta la variable DATABASE_URL` | No agregaste esa variable en Render (paso 5) |
| Logs de Render | `No se pudo preparar la base de datos` | La connection string está mal copiada; vuelve a copiarla desde Neon. Si trae `channel_binding=require`, bórrale esa parte |
| Logs de Render | `ADMIN_CLAVE debe tener al menos 10 caracteres` | Usa una contraseña más larga y vuelve a desplegar (*Manual Deploy → Deploy latest commit*) |
| Panel | "Correo o contraseña incorrectos" | Revisa `ADMIN_EMAIL` y `ADMIN_CLAVE` en Render |
| Panel → pedido → Correos | "Falló" con `brevo respondió 401` | La `MAIL_API_KEY` está mala |
| Panel → pedido → Correos | "Falló" con `brevo respondió 400` | El correo de `MAIL_FROM` no está verificado en Brevo (paso 4.2) |
| Navegador | La tienda tarda en abrir | Estaba dormida (plan gratis); espera un minuto |
| `git push` | `rejected` | Corre `git pull` y luego `git push` de nuevo |
