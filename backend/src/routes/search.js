// ============================================================================
//  Globale Volltextsuche über Kunden, Unternehmen und Verträge.
//  PostgreSQL-FTS (deutsch) mit Fuzzy-/Teilwort-Fallback (ILIKE).
//  Upgradepfad: bei Millionen von Dokumenten auf Elasticsearch spiegeln –
//  dieselbe Route bleibt, nur die Datenquelle wechselt.
// ============================================================================
import { Router } from 'express';
import { query } from '../lib/db.js';
import { wrap } from '../lib/cache.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ q, customers: [], companies: [], contracts: [], total: 0 });
    const like = `%${q}%`;

    const result = await wrap(`search:${q.toLowerCase()}`, 15000, async () => {
      const customers = await query(`
        SELECT id, name, address, district,
               ts_rank(to_tsvector('german', coalesce(name,'')||' '||coalesce(address,'')||' '||coalesce(district,'')),
                       websearch_to_tsquery('german',$1)) AS rank
        FROM customers
        WHERE to_tsvector('german', coalesce(name,'')||' '||coalesce(address,'')||' '||coalesce(district,'')||' '||coalesce(owner_name,''))
              @@ websearch_to_tsquery('german',$1)
           OR name ILIKE $2 OR address ILIKE $2
        ORDER BY rank DESC, name LIMIT 8`, [q, like]);

      const companies = await query(`
        SELECT id, name, status, district,
               ts_rank(to_tsvector('german', coalesce(name,'')||' '||coalesce(legal_name,'')),
                       websearch_to_tsquery('german',$1)) AS rank
        FROM companies
        WHERE to_tsvector('german', coalesce(name,'')||' '||coalesce(legal_name,'')||' '||coalesce(district,'')||' '||coalesce(owner_name,''))
              @@ websearch_to_tsquery('german',$1)
           OR name ILIKE $2
        ORDER BY rank DESC, name LIMIT 8`, [q, like]);

      const contracts = await query(`
        SELECT ct.id, ct.title, ct.status, c.name AS customer, c.id AS customer_id
        FROM contracts ct JOIN customers c ON c.id = ct.customer_id
        WHERE to_tsvector('german', coalesce(ct.title,'')||' '||coalesce(ct.notes,'')) @@ websearch_to_tsquery('german',$1)
           OR ct.title ILIKE $2 OR c.name ILIKE $2
        ORDER BY ct.title LIMIT 8`, [q, like]);

      return { customers, companies, contracts, total: customers.length + companies.length + contracts.length };
    });

    res.json({ q, ...result });
  } catch (e) { next(e); }
});

export default router;
