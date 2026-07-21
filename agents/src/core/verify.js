// ============================================================================
//  Verifikation einer geschriebenen Datei – das Feedback-Signal der Schleife.
//   - .js/.mjs/.cjs : Syntax-Check via `node --check`
//   - .json         : JSON.parse
//   - andere        : kein automatischer Syntax-Check (akzeptiert)
//  Optional zusätzlich: ein projektweiter Testbefehl via AGI_VERIFY_CMD
//  (z.B. "npm test --prefix backend"), der über Erfolg/Fehler entscheidet.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

export function verifyFile(fullPath) {
  const ext = fullPath.slice(fullPath.lastIndexOf('.'));
  try {
    if (['.js', '.mjs', '.cjs'].includes(ext)) {
      const r = spawnSync('node', ['--check', fullPath], { encoding: 'utf8' });
      if (r.status !== 0) return { ok: false, detail: (r.stderr || 'Syntaxfehler').split('\n')[0] };
    } else if (ext === '.json') {
      JSON.parse(readFileSync(fullPath, 'utf8'));
    }
    // .md/.css/.sql/.jsx/.ts/.tsx: kein Auto-Check – gilt als bestanden.
  } catch (e) {
    return { ok: false, detail: e.message };
  }

  // Optionaler projektweiter Testbefehl.
  const cmd = process.env.AGI_VERIFY_CMD;
  if (cmd) {
    const r = spawnSync(cmd, { shell: true, cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000 });
    if (r.status !== 0) return { ok: false, detail: `Testbefehl fehlgeschlagen (${cmd})` };
  }
  return { ok: true };
}
