// ============================================================================
//  Orchestrator – koordiniert Agenten in drei Mustern (wie Microsoft Agent
//  Framework): sequenziell, parallel, Handoff. Zentrale Steuerung durch den CEO.
// ============================================================================
import { runAgent } from './agent-runner.js';
import { MessageQueue } from './comms.js';

// --- Sequenziell: Agenten arbeiten nacheinander, jeder erhält das Vorergebnis.
export async function sequential(steps, { workflow } = {}) {
  const results = [];
  let previous = null;
  for (const step of steps) {
    const task = previous
      ? `${step.task}\n\nVorheriges Ergebnis (${previous.title}): ${previous.output}`
      : step.task;
    const r = await runAgent(step.agent, { task, workflow });
    results.push(r);
    previous = r;
  }
  return results;
}

// --- Parallel: mehrere Agenten arbeiten gleichzeitig an derselben Ausgangslage.
export async function parallel(steps, { workflow } = {}) {
  return Promise.all(steps.map((s) => runAgent(s.agent, { task: s.task, workflow })));
}

// --- Handoff: ein Agent kann dynamisch an einen anderen weitergeben.
//  Der erste Agent wird ausgeführt; sendet er eine 'handoff'-Nachricht, wird der
//  Empfänger anschließend ausgeführt (Kette, begrenzt gegen Endlosschleifen).
export async function handoff(startAgent, task, { workflow, maxHops = 3 } = {}) {
  const chain = [];
  let currentAgent = startAgent;
  let currentTask = task;

  for (let hop = 0; hop <= maxHops; hop++) {
    const r = await runAgent(currentAgent, { task: currentTask, workflow });
    chain.push(r);

    // Wurde per Werkzeug eine Handoff-Nachricht erzeugt? Nächsten Empfänger suchen.
    const handoffCall = r.toolCalls.find(
      (t) => t.tool === 'send_message' && t.input?.kind === 'handoff');
    if (!handoffCall) break;

    const next = handoffCall.input.to;
    if (!next || next === currentAgent) break;
    currentAgent = next;
    currentTask = `Übergabe von ${r.title}: ${handoffCall.input.content}`;
  }
  return chain;
}

// Hilfsfunktion: Broadcast an das Team (für Daily Standup etc.).
export async function broadcast(from, content) {
  return MessageQueue.send({ from, to: 'broadcast', kind: 'info', content });
}
