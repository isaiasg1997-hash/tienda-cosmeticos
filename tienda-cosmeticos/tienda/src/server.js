const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');

const app = express();
app.set('trust proxy', 1); // detrás de Nginx / Railway / Render

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      // Webpay se paga enviando un formulario a Transbank
      formAction: ["'self'", 'https://webpay3gint.transbank.cl', 'https://webpay3g.transbank.cl'],
    },
  },
}));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.use('/api/admin', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, require('./routes/admin'));
app.use('/api', require('./routes/catalogo'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/pagos', require('./routes/pagos'));
app.get('/api/salud', (req, res) => res.json({ ok: true, pasarela: config.pasarela, ambiente: config.ambiente }));

// La página de pago simulado solo existe en modo mock
app.use(require('./routes/imagenes'));
app.use(require('./routes/paginas').router);
app.get(['/admin', '/admin/'], (req, res) => (req.path === '/admin' ? res.redirect(301, '/admin/') : res.sendFile(path.join(__dirname, '../public/admin/index.html'))));
app.get('/pago-simulado.html', (req, res, next) => (config.pasarela === 'mock' ? next() : res.status(404).end()));
app.use(express.static(path.join(__dirname, '../public'), { extensions: ['html'], index: false }));

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use(async (req, res, next) => {
  if (req.method !== 'GET' || !req.accepts('html')) return next();
  try {
    const paginas = require('./routes/paginas');
    paginas.paginaNoEncontrada(res, await paginas.datosMarca());
  } catch (e) { next(e); }
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno. Intenta de nuevo.' });
});

if (config.pasarela === 'mock' && config.ambiente === 'produccion') {
  console.error('⚠ PASARELA=mock con AMBIENTE=produccion: los pedidos NO se cobran. Revisa el .env');
}
// Prepara la base (tablas, datos demo, usuario del panel) y recién ahí abre el puerto
require('./lib/arranque').preparar().then(() => {
  require('./lib/correo').iniciar();
  require('./lib/pedidos').iniciarLimpieza(config.anularPendientesMinutos);
  app.listen(config.port, () => console.log(`Tienda en ${config.publicUrl} (puerto ${config.port}) · pasarela: ${config.pasarela} [${config.ambiente}]`));
}).catch((e) => {
  console.error('[arranque] No se pudo preparar la base de datos:', e.message);
  console.error('Revisa DATABASE_URL. Si usas Neon, copia la cadena de conexión completa desde su panel.');
  process.exit(1);
});
