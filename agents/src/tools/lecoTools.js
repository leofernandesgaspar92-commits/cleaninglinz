// ============================================================================
//  Werkzeuge der Agenten. Jedes Tool hat ein JSON-Schema (für den LLM-Tool-Use)
//  und eine run(input, ctx)-Funktion. ctx = { agentKey }.
//
//  Sicherheit:
//   - Datei-Zugriff ist auf das Leco-Repo beschränkt (kein Ausbruch via '..').
//   - Kein Tool schreibt Produktionscode oder löst Unumkehrbares aus. Code- und
//     Übernahme-Vorschläge landen als Approval für den Menschen.
// ============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../core/db.js';
import { TaskBoard, MessageQueue, Knowledge, EventBus, Approvals } from '../core/comms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo-Wurzel = zwei Ebenen über agents/src/tools
const REPO_ROOT = resolve(__dirname, '../../..');

// Pfad sicher innerhalb des Repos auflösen.
function safePath(p) {
  const full = resolve(REPO_ROOT, p || '.');
  const rel = relative(REPO_ROOT, full);
  if (rel.startsWith('..')) throw new Error(`Zugriff außerhalb des Repos verweigert: ${p}`);
  return full;
}

const IGNORE = new Set(['node_modules', '.git', 'dist', '.vite']);

export const TOOLS = {
  // ---- Leco-Datenbank (operativ + Imperium) ----
  read_companies: {
    description: 'Liest alle Unternehmen (eigene + Übernahmeziele) mit Status und Kennzahlen aus der Leco-DB.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => query(
      `SELECT name, status, district, employee_count, annual_revenue, ebitda, purchase_price, is_own
       FROM companies ORDER BY status, name`),
  },

  read_customers: {
    description: 'Liest Kunden mit Gebäudetyp, Fläche und Anzahl aktiver Verträge.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => query(
      `SELECT c.name, c.building_type, c.district, c.area_sqm,
              COUNT(ct.id) FILTER (WHERE ct.status='aktiv') AS aktive_vertraege,
              COALESCE(SUM(ct.value_monthly) FILTER (WHERE ct.status='aktiv'),0) AS mrr
       FROM customers c LEFT JOIN contracts ct ON ct.customer_id = c.id
       GROUP BY c.id ORDER BY mrr DESC`),
  },

  read_finance: {
    description: 'Liefert konsolidierte Finanzkennzahlen des Imperiums: Umsatz, EBITDA, MRR je Unternehmen.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const totals = await query(`
        SELECT COALESCE(SUM(annual_revenue) FILTER (WHERE is_own OR status IN ('uebernommen','integriert')),0) AS revenue,
               COALESCE(SUM(ebitda) FILTER (WHERE is_own OR status IN ('uebernommen','integriert')),0) AS ebitda
        FROM companies`);
      const perCompany = await query('SELECT * FROM v_company_financials ORDER BY ebitda DESC NULLS LAST');
      const mrr = await query('SELECT * FROM v_mrr_by_company ORDER BY mrr DESC');
      return { totals: totals[0], perCompany, mrr };
    },
  },

  // ---- Codebasis ----
  list_code: {
    description: 'Listet Dateien/Ordner in einem Verzeichnis der Leco-Codebasis (relativ zur Repo-Wurzel).',
    input_schema: {
      type: 'object',
      properties: { dir: { type: 'string', description: 'z.B. "backend/src" oder "frontend/src/pages"' } },
      required: ['dir'], additionalProperties: false,
    },
    run: async ({ dir }) => {
      const full = safePath(dir);
      return readdirSync(full).filter((n) => !IGNORE.has(n)).map((n) => {
        const isDir = statSync(join(full, n)).isDirectory();
        return isDir ? `${n}/` : n;
      });
    },
  },

  read_code: {
    description: 'Liest den Inhalt einer Quelldatei aus der Leco-Codebasis (relativ zur Repo-Wurzel).',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'z.B. "backend/src/routes/import.js"' } },
      required: ['path'], additionalProperties: false,
    },
    run: async ({ path }) => {
      const content = readFileSync(safePath(path), 'utf8');
      return content.length > 12000 ? content.slice(0, 12000) + '\n… [gekürzt]' : content;
    },
  },

  // ---- Task Board ----
  read_tasks: {
    description: 'Liest offene Aufgaben vom Task Board (optional nach Status oder zugewiesenem Agenten gefiltert).',
    input_schema: {
      type: 'object',
      properties: { status: { type: 'string' }, assignedTo: { type: 'string' } },
      additionalProperties: false,
    },
    run: async (input) => TaskBoard.list(input),
  },
  create_task: {
    description: 'Erstellt eine neue Aufgabe auf dem Task Board und weist sie einem Agenten zu.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, description: { type: 'string' },
        assignedTo: { type: 'string', description: 'Agent-Key, z.B. "developer"' },
        priority: { type: 'string', enum: ['niedrig', 'normal', 'hoch', 'kritisch'] },
      },
      required: ['title', 'assignedTo'], additionalProperties: false,
    },
    run: async (input, ctx) => TaskBoard.create({ ...input, createdBy: ctx.agentKey }),
  },
  update_task: {
    description: 'Aktualisiert Status/Ergebnis einer Aufgabe.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['backlog','geplant','in_arbeit','review','blockiert','erledigt','abgebrochen'] },
        result: { type: 'object' },
      },
      required: ['id'], additionalProperties: false,
    },
    run: async ({ id, status, result }) => TaskBoard.update(id, { status, result }),
  },

  // ---- Kommunikation ----
  send_message: {
    description: 'Sendet eine Nachricht an einen anderen Agenten (oder "broadcast"). Für Handoffs kind="handoff".',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string' }, content: { type: 'string' },
        kind: { type: 'string', enum: ['info','handoff','request','result','reflection'] },
      },
      required: ['to', 'content'], additionalProperties: false,
    },
    run: async (input, ctx) => MessageQueue.send({ from: ctx.agentKey, ...input }),
  },
  read_knowledge: {
    description: 'Liest Einträge aus der gemeinsamen Knowledge Base (optional nach Thema).',
    input_schema: { type: 'object', properties: { topic: { type: 'string' } }, additionalProperties: false },
    run: async (input) => Knowledge.read(input),
  },
  write_knowledge: {
    description: 'Speichert eine Erkenntnis/Entscheidung in der Knowledge Base (Inter-Agenten-Learning).',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['topic', 'title', 'content'], additionalProperties: false,
    },
    run: async (input, ctx) => Knowledge.write({ author: ctx.agentKey, ...input }),
  },
  emit_event: {
    description: 'Löst ein Ereignis auf dem Event Bus aus (z.B. bug_detected, new_target, security_issue).',
    input_schema: {
      type: 'object',
      properties: { type: { type: 'string' }, payload: { type: 'object' } },
      required: ['type'], additionalProperties: false,
    },
    run: async (input, ctx) => EventBus.emit({ source: ctx.agentKey, ...input }),
  },

  // ---- Human-in-the-Loop ----
  request_approval: {
    description: 'Legt eine Entscheidung dem Menschen (Leo) zur Freigabe vor. Blockiert die Ausführung bis zur Entscheidung.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['code_release','uebernahme','budget','strategie','sonstiges'] },
        summary: { type: 'string' }, detail: { type: 'object' },
      },
      required: ['category', 'summary'], additionalProperties: false,
    },
    run: async (input, ctx) => Approvals.request({ requestedBy: ctx.agentKey, ...input }),
  },
  propose_code_change: {
    description: 'Schlägt eine Code-Änderung vor. Schreibt NICHT auf die Platte – erzeugt einen Approval (code_release) mit Pfad, Begründung und neuem Inhalt für die menschliche Freigabe.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' }, rationale: { type: 'string' }, new_content: { type: 'string' },
      },
      required: ['path', 'rationale'], additionalProperties: false,
    },
    run: async ({ path, rationale, new_content }, ctx) =>
      Approvals.request({
        category: 'code_release',
        requestedBy: ctx.agentKey,
        summary: `Code-Vorschlag für ${path}: ${rationale}`,
        detail: { path, rationale, new_content: new_content ?? '(kein Volltext übergeben)' },
      }),
  },
};

// Baut die Tool-Definitionen (Anthropic-Format) für eine erlaubte Tool-Liste.
export function toolDefsFor(allowedNames) {
  return allowedNames
    .filter((n) => TOOLS[n])
    .map((n) => ({ name: n, description: TOOLS[n].description, input_schema: TOOLS[n].input_schema }));
}

export async function runTool(name, input, ctx) {
  if (!TOOLS[name]) throw new Error(`Unbekanntes Tool: ${name}`);
  return TOOLS[name].run(input || {}, ctx);
}
