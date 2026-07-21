// ============================================================================
//  Executor – wendet NUR vom Menschen freigegebene Code-Änderungen an.
//  Dies ist der einzige Ort, der auf die Platte schreibt. Agenten haben darauf
//  keinen Zugriff (kein Tool) – die menschliche Freigabe ist das Tor.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Approvals, Knowledge } from './comms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const ALLOWED_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.sql', '.json', '.md', '.css']);
const BACKUP_DIR = resolve(REPO_ROOT, 'agents/.applied-backups');

function safeRepoPath(p) {
  const full = resolve(REPO_ROOT, p || '');
  if (relative(REPO_ROOT, full).startsWith('..')) throw new Error(`Pfad außerhalb des Repos: ${p}`);
  const ext = full.slice(full.lastIndexOf('.'));
  if (!ALLOWED_EXT.has(ext)) throw new Error(`Dateityp nicht erlaubt: ${ext}`);
  return full;
}

// Wendet alle genehmigten, noch nicht ausgeführten Code-Freigaben an.
// Erstellt vor dem Überschreiben ein Backup. Gibt die angewendeten Änderungen zurück.
export async function applyApprovedChanges() {
  const pending = await Approvals.approvedUnappliedCode();
  const applied = [];

  for (const appr of pending) {
    const { path, new_content } = appr.detail || {};
    try {
      const full = safeRepoPath(path);
      // Backup der bisherigen Version (falls vorhanden).
      if (existsSync(full)) {
        mkdirSync(BACKUP_DIR, { recursive: true });
        const backup = resolve(BACKUP_DIR, `${appr.id}__${path.replace(/[\/]/g, '__')}`);
        writeFileSync(backup, readFileSync(full));
      }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, new_content, 'utf8');
      await Approvals.markApplied(appr.id);
      applied.push({ path, approvalId: appr.id });

      await Knowledge.write({
        author: 'executor',
        topic: 'improvement_loop',
        title: `Angewendet: ${path}`,
        content: `Freigegebene Code-Änderung an ${path} wurde geschrieben (Backup unter agents/.applied-backups). Grund: ${appr.detail?.rationale || '-'}`,
        tags: ['ausgeführt', 'code'],
      });
    } catch (e) {
      await Knowledge.write({
        author: 'executor',
        topic: 'improvement_loop',
        title: `Anwendung fehlgeschlagen: ${path}`,
        content: `Freigabe ${appr.id} konnte nicht angewendet werden: ${e.message}`,
        tags: ['fehler'],
      });
    }
  }
  return applied;
}
