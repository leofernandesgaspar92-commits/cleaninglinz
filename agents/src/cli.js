// ============================================================================
//  CLI – Workflows manuell auslösen und Approvals verwalten.
//
//    node src/cli.js <workflow>          einen Workflow einmal ausführen
//    node src/cli.js list                verfügbare Workflows anzeigen
//    node src/cli.js status              Task Board anzeigen
//    node src/cli.js approvals           offene Freigaben anzeigen
//    node src/cli.js approve <id>        Freigabe genehmigen
//    node src/cli.js reject  <id>        Freigabe ablehnen
// ============================================================================
import { WORKFLOWS, WORKFLOW_KEYS } from './workflows/index.js';
import { TaskBoard, Approvals } from './core/comms.js';
import { isLive } from './core/llm.js';
import { pool } from './core/db.js';

const [cmd, arg] = process.argv.slice(2);

async function main() {
  if (!cmd || cmd === 'list') {
    console.log('Verfügbare Workflows:\n  ' + WORKFLOW_KEYS.join('\n  '));
    console.log('\nModus:', isLive() ? 'LIVE (Claude)' : 'SIMULATION (kein API-Key)');
    return;
  }

  if (cmd === 'status') {
    const tasks = await TaskBoard.list();
    console.log(`Task Board (${tasks.length}):`);
    for (const t of tasks) console.log(`  [${t.status}] (${t.priority}) ${t.title} → ${t.assigned_to || '-'}`);
    return;
  }

  if (cmd === 'approvals') {
    const a = await Approvals.list('offen');
    if (!a.length) return console.log('Keine offenen Freigaben.');
    console.log(`Offene Freigaben (${a.length}):`);
    for (const x of a) console.log(`  ${x.id}\n    [${x.category}] von ${x.requested_by}: ${x.summary}`);
    return;
  }

  if (cmd === 'approve' || cmd === 'reject') {
    if (!arg) return console.log('Bitte Approval-ID angeben.');
    const r = await Approvals.decide(arg, cmd === 'approve');
    console.log(r ? `Freigabe ${r.status}.` : 'Nicht gefunden.');
    return;
  }

  const workflow = WORKFLOWS[cmd];
  if (!workflow) return console.log(`Unbekannter Workflow: ${cmd}\nVerfügbar: ${WORKFLOW_KEYS.join(', ')}`);

  console.log(`▶ Workflow "${cmd}" startet (${isLive() ? 'LIVE' : 'SIM'}) …\n`);
  const res = await workflow();
  for (const step of res.steps) {
    console.log(`── ${step.title} [${step.mode}]`);
    console.log(`   ${step.output.slice(0, 400)}`);
    console.log(`   ⤷ Reflexion: ${step.reflection.slice(0, 200)}`);
    console.log(`   ⤷ Tools: ${step.toolCalls.map((t) => t.tool).join(', ') || '-'}\n`);
  }
  console.log('✓ Workflow abgeschlossen.');

  const open = await Approvals.list('offen');
  if (open.length) console.log(`\n⚠ ${open.length} Freigabe(n) warten auf deine Entscheidung (node src/cli.js approvals).`);
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
