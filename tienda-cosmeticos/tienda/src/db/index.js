const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,          // suelta conexiones inactivas (las bases gratis las cortan igual)
  connectionTimeoutMillis: 15000,    // da tiempo a que una base "dormida" (Neon) despierte
});
// Si la base corta una conexión inactiva (por ejemplo, Neon al suspenderse),
// pg emite un error en el pool. Sin este manejador el proceso se caería.
pool.on('error', (e) => console.error('[db] conexión inactiva cerrada por la base:', e.message));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  // Ejecuta fn dentro de una transacción (BEGIN/COMMIT/ROLLBACK)
  async tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};
