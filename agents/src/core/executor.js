// ============================================================================
//  Executor – wendet NUR vom Menschen (oder Policy) freigegebene Code-Änderungen
//  an. Einziger Schreibpfad; für Agenten nicht erreichbar.
//
//  Selbstkorrektur: nach dem Schreiben wird die Datei verifiziert. Schlägt die
//  Verifikation fehl, wird die Änderung automatisch zurückgerollt (Backup zurück
//  bzw. neue Datei gelöscht) und ein Event 'execute_reverted' ausgelöst.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Approvals, Knowledge, EventBus } from './comms.js';
import { verifyFile } from './verify.js';

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

export async function applyApprovedChanges() {
  const pending = await Approvals.approvedUnappliedCode();
  const applied = [];
  const reverted = [];

  for (const appr of pending) {
    const { path, new_content } = appr.detail || {};
    let full, existed = false, backupPath = null;
    try {
      full = safeRepoPath(path);
      existed = existsSync(full);
      if (existed) {
        mkdirSync(BACKUP_DIR, { recursive: true });
        backupPath = resolve(BACKUP_DIR, `${appr.id}__${path.replace(/[\/]/g, '__')}`);
        writeFileSync(backupPath, readFileSync(full));
      }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, new_content, 'utf8');
    } catch (e) {
      await Approvals.markApplied(appr.id);
      await logKb('Anwendung fehlgeschlagen', `${path}: ${e.message}`, ['fehler']);
      continue;
    }

    // Feedback-Signal: verifizieren.
    const v = verifyFile(full);
    await Approvals.markApplied(appr.id); // verhindert erneuten Versuch in jeder Runde

    if (v.ok) {
      applied.push({ path, approvalId: appr.id });
      await logKb(`Angewendet & verifiziert: ${path}`,
        `Freigegebene Änderung geschrieben und erfolgreich verifiziert. Grund: ${appr.detail?.rationale || '-'}`,
        ['ausgeführt', 'verifiziert']);
    } else {
      // Rollback.
      try {
        if (existed && backupPath) writeFileSync(full, readFileSync(backupPath));
        else if (!existed) unlinkSync(full);
      } catch { /* bestmöglich */ }
      reverted.push({ path, approvalId: appr.id, reason: v.detail });
      await logKb(`Zurückgerollt: ${path}`,
        `Änderung an ${path} fehlgeschlagen bei der Verifikation (${v.detail}) und wurde automatisch zurückgerollt.`,
        ['rollback', 'fehler']);
      await EventBus.emit({ type: 'execute_reverted', source: 'executor',
        payload: { path, reason: v.detail, approvalId: appr.id } });
    }
  }
  return { applied, reverted };
}

function logKb(title, content, tags) {
  return Knowledge.write({ author: 'executor', topic: 'improvement_loop', title, content, tags });
}
