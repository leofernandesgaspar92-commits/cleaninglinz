import pg from 'pg';

const { Pool } = pg;

// Nutzt dieselbe Postgres-Instanz wie die Leco-App.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://leco:leco@localhost:5432/leco',
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}
export async function one(text, params) {
  return (await query(text, params))[0] || null;
}
