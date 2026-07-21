// Generische CRUD-Router-Fabrik für eine Tabelle mit Whitelist an Spalten.
// Hält die einzelnen Routen-Dateien klein und einheitlich.
import { Router } from 'express';
import { query, one } from './db.js';

export function makeCrudRouter({ table, columns, orderBy = 'created_at DESC' }) {
  const router = Router();

  const pick = (body) => {
    const data = {};
    for (const col of columns) {
      if (body[col] !== undefined) data[col] = body[col];
    }
    return data;
  };

  // LIST
  router.get('/', async (req, res, next) => {
    try {
      const rows = await query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      res.json(rows);
    } catch (e) { next(e); }
  });

  // READ
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await one(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'nicht gefunden' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // CREATE
  router.post('/', async (req, res, next) => {
    try {
      const data = pick(req.body);
      const keys = Object.keys(data);
      if (keys.length === 0) return res.status(400).json({ error: 'keine gültigen Felder' });
      const vals = keys.map((k) => data[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const row = await one(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
        vals
      );
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  // UPDATE (partiell)
  router.patch('/:id', async (req, res, next) => {
    try {
      const data = pick(req.body);
      const keys = Object.keys(data);
      if (keys.length === 0) return res.status(400).json({ error: 'keine gültigen Felder' });
      const set = keys.map((k, i) => `${k} = $${i + 1}`);
      const vals = keys.map((k) => data[k]);
      vals.push(req.params.id);
      const row = await one(
        `UPDATE ${table} SET ${set.join(',')} WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (!row) return res.status(404).json({ error: 'nicht gefunden' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // DELETE
  router.delete('/:id', async (req, res, next) => {
    try {
      const row = await one(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'nicht gefunden' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}
