// Crea las tablas. Uso: npm run migrar   (con --seed carga datos de ejemplo)
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const dir = path.join(__dirname, '../src/db');
  await db.query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
  console.log('✓ Tablas listas');
  if (process.argv.includes('--seed')) {
    await db.query(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8'));
    console.log('✓ Datos de ejemplo cargados');
  }
  await db.pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
