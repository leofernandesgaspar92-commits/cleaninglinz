import pg from 'pg';

const { Pool } = pg;

// Ein einziger Connection-Pool für die ganze App.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://leco:leco@localhost:5432/leco',
});

// Kleiner Helfer: query(sql, params) -> rows
export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}
