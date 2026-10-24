// Crea un usuario del panel (o le cambia la contraseña si ya existe).
// Uso:  npm run admin -- correo@cliente.cl "Nombre Apellido"
// La contraseña se pide por consola y no queda en el historial.
const readline = require('readline');
const db = require('../src/db');
const { hashear } = require('../src/lib/auth');

function preguntarOculto(texto) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); ok(r); });
  });
}

(async () => {
  const [email, nombre = 'Administrador'] = process.argv.slice(2);
  if (!email || !email.includes('@')) {
    console.log('Uso: npm run admin -- correo@cliente.cl "Nombre Apellido"');
    process.exit(1);
  }
  const clave = process.env.ADMIN_CLAVE || await preguntarOculto('Contraseña (mín. 10 caracteres): ');
  if (clave.length < 10) { console.log('La contraseña debe tener al menos 10 caracteres'); process.exit(1); }

  await db.query(
    `INSERT INTO admins (email, nombre, hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET hash = EXCLUDED.hash, nombre = EXCLUDED.nombre, activo = TRUE`,
    [email.toLowerCase().trim(), nombre, await hashear(clave)],
  );
  await db.query('DELETE FROM sesiones WHERE admin_id = (SELECT id FROM admins WHERE email = $1)', [email.toLowerCase().trim()]);
  console.log(`✓ Usuario ${email} listo. Entra en /admin`);
  await db.pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
