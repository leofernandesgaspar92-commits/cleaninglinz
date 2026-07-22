// Pre-Pack-Schritt: baut das Frontend, bevor electron-builder das Image schnürt.
// So landet immer ein frischer `frontend/dist`-Build in der App (extraResources).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const frontend = resolve(root, 'frontend');
const backend = resolve(root, 'backend');

function run(cmd, cwd) {
  console.log(`\n> ${cmd}   (in ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// 1) Frontend-Abhängigkeiten sicherstellen und bauen.
if (!existsSync(resolve(frontend, 'node_modules'))) run('npm install', frontend);
run('npm run build', frontend);

// 2) Backend-Produktionsabhängigkeiten installieren (werden mitgepackt).
run('npm install --omit=dev', backend);

console.log('\nPrepack fertig: frontend/dist gebaut, backend-Abhängigkeiten installiert.');
