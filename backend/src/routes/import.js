import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { query, one } from '../lib/db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Feld-Mapping je Entität: CSV-Spalte -> DB-Spalte (tolerant ggü. Groß/Kleinschreibung)
const MAPPINGS = {
  customers: {
    table: 'customers',
    fields: {
      name: 'name', firma: 'name',
      building_type: 'building_type', typ: 'building_type', gebaeudetyp: 'building_type',
      address: 'address', adresse: 'address',
      city: 'city', stadt: 'city', ort: 'city',
      postal_code: 'postal_code', plz: 'postal_code',
      district: 'district', bezirk: 'district', stadtteil: 'district',
      area_sqm: 'area_sqm', flaeche: 'area_sqm', quadratmeter: 'area_sqm',
      contact_name: 'contact_name', kontakt: 'contact_name',
      contact_email: 'contact_email', email: 'contact_email',
      contact_phone: 'contact_phone', telefon: 'contact_phone',
      owner_name: 'owner_name', eigentuemer: 'owner_name',
    },
    numeric: ['area_sqm'],
  },
  employees: {
    table: 'employees',
    fields: {
      first_name: 'first_name', vorname: 'first_name',
      last_name: 'last_name', nachname: 'last_name', name: 'last_name',
      role: 'role', rolle: 'role', funktion: 'role',
      email: 'email',
      phone: 'phone', telefon: 'phone',
      hire_date: 'hire_date', eintritt: 'hire_date', eintrittsdatum: 'hire_date',
      hourly_wage: 'hourly_wage', stundenlohn: 'hourly_wage',
      qualifications: 'qualifications', qualifikationen: 'qualifications',
    },
    numeric: ['hourly_wage'],
    jsonArray: ['qualifications'],
  },
};

// Duplikaterkennung Kunden: gleiche Adresse UND ähnlicher Name => Duplikat.
// Beide Kriterien, damit unterschiedliche Kunden in derselben Straße nicht
// fälschlich zusammengeführt werden.
async function findDuplicateCustomer(address, name) {
  if (!address || !name) return null;
  return one(
    `SELECT id, name FROM customers
     WHERE similarity(lower(address), lower($1)) > 0.6
       AND similarity(lower(name), lower($2)) > 0.5
     ORDER BY similarity(lower(address), lower($1)) DESC LIMIT 1`,
    [address, name]
  );
}

router.post('/:entity', upload.single('file'), async (req, res, next) => {
  try {
    const { entity } = req.params;
    const cfg = MAPPINGS[entity];
    if (!cfg) return res.status(400).json({ error: `Unbekannte Entität: ${entity}` });
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen (Feld "file")' });

    // company_id / source_company_id für die Zuordnung zur Übernahme
    const companyId = req.body.company_id || null;

    const records = parse(req.file.buffer, {
      columns: (header) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter: [',', ';'],
      relax_column_count: true,
    });

    const result = { inserted: 0, duplicates: 0, skipped: 0, errors: [] };

    for (const [i, rec] of records.entries()) {
      const data = {};
      for (const [csvCol, val] of Object.entries(rec)) {
        const dbCol = cfg.fields[csvCol];
        if (dbCol && val !== '') data[dbCol] = val;
      }
      // Typkonvertierung
      for (const col of cfg.numeric || []) {
        if (data[col] !== undefined) data[col] = Number(String(data[col]).replace(',', '.'));
      }
      for (const col of cfg.jsonArray || []) {
        if (data[col] !== undefined) {
          data[col] = JSON.stringify(String(data[col]).split(/[;|]/).map((s) => s.trim()).filter(Boolean));
        }
      }
      if (companyId) {
        data.company_id = companyId;
        data.source_company_id = companyId;
      }

      // Mindestanforderung
      const hasName = data.name || data.last_name;
      if (!hasName) { result.skipped++; result.errors.push(`Zeile ${i + 2}: kein Name`); continue; }

      // Duplikaterkennung (nur Kunden)
      if (entity === 'customers') {
        const dup = await findDuplicateCustomer(data.address, data.name);
        if (dup) { result.duplicates++; continue; }
      }

      try {
        const keys = Object.keys(data);
        const vals = keys.map((k) => data[k]);
        const placeholders = keys.map((_, idx) => `$${idx + 1}`);
        await query(
          `INSERT INTO ${cfg.table} (${keys.join(',')}) VALUES (${placeholders.join(',')})`,
          vals
        );
        result.inserted++;
      } catch (e) {
        result.skipped++;
        result.errors.push(`Zeile ${i + 2}: ${e.message}`);
      }
    }

    res.json(result);
  } catch (e) { next(e); }
});

export default router;
