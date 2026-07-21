// ============================================================================
//  Event-Reaktor – macht die Schleife reaktiv: kritische Ereignisse auf dem
//  Event Bus lösen sofort eine gezielte Agenten-Reaktion aus (nicht erst nach
//  Timer). Bildet den "Bug Bounty"-Echtzeit-Gedanken systemweit ab.
// ============================================================================
import { EventBus } from './core/comms.js';
import { runAgent } from './core/agent-runner.js';
import { pool } from './core/db.js';
import { isLive } from './core/llm.js';

// Ereignis-Typ -> welche Agenten reagieren und mit welcher Aufgabe.
const TRIGGERS = {
  bug_detected: [
    { agent: 'developer', task: (e) => `Sofort-Reaktion auf gemeldeten Bug: ${JSON.stringify(e.payload)}. Erzeuge einen Fix-Vorschlag.` },
    { agent: 'security', task: (e) => `Prüfe die Sicherheitsrelevanz des Bugs: ${JSON.stringify(e.payload)}.` },
  ],
  security_issue: [
    { agent: 'security', task: (e) => `Sofort-Reaktion auf Sicherheitsmeldung: ${JSON.stringify(e.payload)}. Bewerte Schwere und empfohlene Gegenmaßnahme.` },
  ],
  new_target: [
    { agent: 'ma', task: (e) => `Neues Übernahmeziel gemeldet: ${JSON.stringify(e.payload)}. Bewerte und lege die Kaufentscheidung dem Menschen vor.` },
  ],
};

// Verarbeitet alle offenen, relevanten Events (max. je Aufruf begrenzt).
export async function reactToEvents({ max = 5 } = {}) {
  const events = await EventBus.pending();
  const relevant = events.filter((e) => TRIGGERS[e.type]).slice(0, max);
  const handled = [];

  for (const e of relevant) {
    const steps = [];
    for (const r of TRIGGERS[e.type]) {
      const res = await runAgent(r.agent, { task: r.task(e), workflow: `reaktion:${e.type}` });
      steps.push({ agent: res.agentKey, output: res.output.slice(0, 200) });
    }
    await EventBus.markHandled(e.id);
    handled.push({ event: e.type, source: e.source, steps });
  }
  return { reacted: handled.length, handled };
}

// Direktaufruf: node src/reactor.js
if (import.meta.url === `file://${process.argv[1]}`) {
  reactToEvents().then((r) => {
    console.log(`Reaktor (${isLive() ? 'LIVE' : 'SIM'}): auf ${r.reacted} Event(s) reagiert.`);
    for (const h of r.handled) console.log(`  ⚡ ${h.event} von ${h.source} → ${h.steps.map((s) => s.agent).join(', ')}`);
    return pool.end();
  }).catch((e) => { console.error(e); pool.end(); process.exit(1); });
}
