// ============================================================================
//  Asynchrone Job-Queue – persistiert in Postgres (job_queue), verarbeitet
//  zeitaufwändige Aufgaben im Hintergrund (z.B. Exporte), ohne den Request zu
//  blockieren. Fortschritt & Status pollbar. Überlebt Neustarts (offene Jobs
//  werden beim Start erneut aufgenommen).
// ============================================================================
import { query, one } from './db.js';
import { notify } from './notify.js';

const handlers = new Map();
export function register(type, fn) { handlers.set(type, fn); }

let running = false;

export async function enqueue(type, params = {}, createdBy = null) {
  if (!handlers.has(type)) throw new Error(`Unbekannter Job-Typ: ${type}`);
  const job = await one(
    `INSERT INTO job_queue (type, params, created_by) VALUES ($1,$2,$3) RETURNING *`,
    [type, JSON.stringify(params), createdBy]
  );
  setImmediate(processNext); // sofort anstoßen, ohne den Request zu blockieren
  return job;
}

export const getJob = (id) => one('SELECT * FROM job_queue WHERE id = $1', [id]);
export const recentJobs = (limit = 20) =>
  query('SELECT id, type, status, progress, result, error, created_at, finished_at FROM job_queue ORDER BY created_at DESC LIMIT $1', [limit]);

async function processNext() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = await one(
        `UPDATE job_queue SET status='laeuft', started_at=now()
         WHERE id = (SELECT id FROM job_queue WHERE status='wartend' ORDER BY created_at LIMIT 1)
         RETURNING *`);
      if (!job) break;

      const handler = handlers.get(job.type);
      const setProgress = (p) => query('UPDATE job_queue SET progress=$2 WHERE id=$1', [job.id, p]);
      try {
        const result = await handler(job.params || {}, setProgress);
        await query(`UPDATE job_queue SET status='fertig', progress=100, result=$2, finished_at=now() WHERE id=$1`,
          [job.id, JSON.stringify(result ?? {})]);
        notify({ level: 'success', title: `Job fertig: ${job.type}`, message: JSON.stringify(result ?? {}).slice(0, 200) });
      } catch (e) {
        await query(`UPDATE job_queue SET status='fehler', error=$2, finished_at=now() WHERE id=$1`,
          [job.id, e.message]);
        notify({ level: 'error', title: `Job fehlgeschlagen: ${job.type}`, message: e.message });
      }
    }
  } finally { running = false; }
}

// Beim Start unterbrochene Jobs (laeuft) zurücksetzen und Queue anstoßen.
export async function startWorker() {
  await query(`UPDATE job_queue SET status='wartend' WHERE status='laeuft'`);
  setInterval(processNext, 5000); // Sicherheitsnetz-Poller
  processNext();
}
