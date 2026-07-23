// ============================================================================
//  AUTONOME VERBESSERUNGS-SCHLEIFE
//
//    analysieren → neue Lösungen finden → verbessern → ausführen → lernen → repeat
//
//  Jede Iteration:
//    1) ANALYZE  – Architect, QA, Security, UX, Analyst prüfen Code & Daten
//    2) IDEATE   – CEO/Architect leiten die wichtigste Verbesserung ab (Task)
//    3) IMPROVE  – Developer erzeugt einen Code-Vorschlag (Freigabe nötig)
//    4) EXECUTE  – vom Menschen freigegebene Änderungen werden geschrieben
//    5) LEARN    – Erkenntnis in die Knowledge Base; nächste Runde baut darauf auf
//
//  Human-in-the-Loop bleibt: ausgeführt wird nur, was freigegeben wurde.
// ============================================================================
import { parallel } from './core/orchestrator.js';
import { runAgent } from './core/agent-runner.js';
import { applyApprovedChanges } from './core/executor.js';
import { applyPolicy, isAutoApprove } from './core/policy.js';
import { reactToEvents } from './reactor.js';
import { scanSignals } from './signals.js';
import { Knowledge, LoopLog, Approvals } from './core/comms.js';
import { isLive } from './core/llm.js';
import { pool } from './core/db.js';

const WF = 'improvement_loop';

export async function iterate(n) {
  const cycle = await LoopLog.start(n);
  const t0 = Date.now();

  // 0a) Reale Leco-Betriebssignale erfassen (Fehler, Verträge, Klumpenrisiko,
  //     unbesetzte Einsätze) und als Events einspeisen …
  const signals = await scanSignals();
  // … dann reaktiv auf offene kritische Events reagieren (inkl. dieser Signale).
  const reaction = await reactToEvents({ max: 8 });

  // 0b) Aus vergangenen Runden lernen (Memory) – damit sich die Schleife verbessert.
  const priorLearnings = await Knowledge.read({ topic: WF, limit: 5 });
  const memory = priorLearnings.length
    ? '\n\nBisherige Learnings der Schleife:\n' + priorLearnings.map((k) => `- ${k.title}: ${k.content.slice(0, 120)}`).join('\n')
    : '';

  // 1) ANALYZE – mehrere Perspektiven parallel.
  const analyze = await parallel([
    { agent: 'architect', task: `Finde die wichtigste architektonische Schwachstelle in Leco.${memory}` },
    { agent: 'qa', task: `Finde den kritischsten Qualitäts-/Testmangel in Leco.${memory}` },
    { agent: 'security', task: `Finde das größte Sicherheits-/DSGVO-Risiko in Leco.${memory}` },
    { agent: 'ux', task: `Finde die störendste UX-Schwäche in Leco.${memory}` },
    { agent: 'analyst', task: `Finde die größte Geschäfts-/Markt-Chance für Leco in Linz.${memory}` },
  ], { workflow: WF });

  const findings = analyze.map((r) => `${r.title}: ${r.output}`).join('\n');

  // 2) IDEATE – CEO priorisiert die eine wichtigste Verbesserung.
  const ideate = await runAgent('ceo', {
    task: `Verbesserungsschleife #${n}. Analyse-Ergebnisse:\n${findings}\n\n`
        + `Wähle die EINE wirkungsvollste Verbesserung und lege eine konkrete Aufgabe für den Developer an.`,
    workflow: WF,
  });

  // 3) IMPROVE – Developer setzt die Idee als Code-Vorschlag um (Freigabe nötig).
  const improve = await runAgent('developer', {
    task: `Setze die vom CEO priorisierte Verbesserung als konkreten Code-Vorschlag um `
        + `(propose_code_change mit Pfad, Begründung und vollständigem neuen Inhalt).\n\nCEO: ${ideate.output}`,
    workflow: WF,
  });

  // 4) EXECUTE – sichere Vorschläge per Policy auto-genehmigen, dann alle
  //    freigegebenen (Mensch + Policy) Änderungen schreiben, verifizieren und
  //    bei Fehler automatisch zurückrollen (Selbstkorrektur).
  const autoApproved = await applyPolicy();
  const { applied, reverted } = await applyApprovedChanges();

  // 5) LEARN – Zyklus-Erkenntnis festhalten (fließt in die nächste Runde ein).
  const learning =
    `Iteration ${n}: ${signals.emitted.length} Betriebssignal(e) (${signals.emitted.join(',') || '—'}), `
    + `${reaction.reacted} Event-Reaktion(en), analysiert (5 Perspektiven), 1 Verbesserung priorisiert, `
    + `${improve.toolCalls.some((t) => t.tool === 'propose_code_change') ? '1 Code-Vorschlag erstellt' : 'kein Vorschlag'}, `
    + `${autoApproved.length} auto-genehmigt, ${applied.length} ausgeführt, ${reverted.length} zurückgerollt.`;
  await Knowledge.write({
    author: 'ceo', topic: WF, title: `Zyklus #${n} abgeschlossen`, content: learning, tags: ['loop'],
  });

  await LoopLog.finish(cycle.id, {
    phaseSummary: {
      react: reaction.handled,
      analyze: analyze.map((r) => r.agentKey),
      ideate: ideate.agentKey,
      improve: improve.agentKey,
      autoApproved,
      execute: applied,
      reverted,
    },
    appliedCount: applied.length,
    learning,
  });

  const open = (await Approvals.list('offen')).length;
  return {
    iteration: n, durationMs: Date.now() - t0,
    reacted: reaction.reacted, autoApproved: autoApproved.length,
    applied: applied.length, reverted: reverted.length, openApprovals: open, learning,
  };
}

// Kontinuierlich laufen: N Iterationen (0 = unendlich) im Abstand intervalSec.
export async function runLoop({ iterations = 3, intervalSec = 0 } = {}) {
  console.log(`▶ Autonome Verbesserungsschleife (${isLive() ? 'LIVE' : 'SIM'}), `
    + `Auto-Freigabe: ${isAutoApprove() ? 'AN (nur sichere Doku/Notizen)' : 'AUS'}, `
    + `${iterations === 0 ? 'unendlich' : iterations} Iteration(en), Intervall ${intervalSec}s.\n`);
  let n = 0;
  while (iterations === 0 || n < iterations) {
    n += 1;
    const r = await iterate(n);
    console.log(`✓ Zyklus #${r.iteration} · ${r.durationMs}ms · ${r.reacted} reagiert · `
      + `${r.autoApproved} auto-genehmigt · ${r.applied} ausgeführt · ${r.reverted} zurückgerollt · ${r.openApprovals} offen`);
    console.log(`  ⤷ ${r.learning}`);
    if (iterations !== 0 && n >= iterations) break;
    if (intervalSec > 0) await new Promise((res) => setTimeout(res, intervalSec * 1000));
  }
  console.log('\n■ Schleife beendet.');
}

// Direktaufruf: node src/loop.js [iterations] [intervalSec]
if (import.meta.url === `file://${process.argv[1]}`) {
  const iterations = Number(process.argv[2] ?? 3);
  const intervalSec = Number(process.argv[3] ?? 0);
  runLoop({ iterations, intervalSec }).then(() => pool.end())
    .catch((e) => { console.error(e); pool.end(); process.exit(1); });
}
