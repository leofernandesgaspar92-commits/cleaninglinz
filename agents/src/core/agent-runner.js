// ============================================================================
//  Führt einen einzelnen Agenten aus – inkl. Kontext aus der Message Queue,
//  Selbstreflexion und Audit-Log (agi.agent_runs).
// ============================================================================
import { getAgent } from '../config/agents.js';
import { MessageQueue, RunLog } from './comms.js';
import { runAgentTurn, isLive } from './llm.js';

export async function runAgent(agentKey, { task, workflow, taskId } = {}) {
  const agent = getAgent(agentKey);
  const ctx = { agentKey };
  const mode = isLive() ? 'live' : 'simuliert';

  // 1) Eingehende Nachrichten (Handoffs, Requests) als Kontext einsammeln.
  const inbox = await MessageQueue.drain(agentKey);
  const inboxText = inbox.length
    ? '\n\nEingegangene Nachrichten:\n' + inbox.map((m) => `- von ${m.from_agent} (${m.kind}): ${m.content}`).join('\n')
    : '';

  const userPrompt =
    `Aufgabe: ${task}\n` +
    inboxText +
    `\n\nNutze deine Werkzeuge, um echte Leco-Daten/Code zu prüfen. ` +
    `Schließe deine Antwort mit einer Zeile:\nREFLEXION: <was lief gut/schlecht, nächster Schritt>`;

  const run = await RunLog.start({ agentKey, taskId, workflow, mode, input: task });

  const result = await runAgentTurn({ agent, userPrompt, ctx });

  // Reflexion aus der Antwort extrahieren (Meta-Architektur: Selbstoptimierung).
  const reflMatch = result.text.match(/REFLEXION:\s*([\s\S]*)$/i);
  const reflection = reflMatch
    ? reflMatch[1].trim()
    : deriveReflection(result.toolCalls);
  const output = result.text.replace(/REFLEXION:[\s\S]*$/i, '').trim();

  await RunLog.finish(run.id, {
    output, reflection,
    tokensIn: result.tokensIn, tokensOut: result.tokensOut, toolCalls: result.toolCalls,
  });

  return { agentKey, title: agent.title, output, reflection, toolCalls: result.toolCalls, mode };
}

function deriveReflection(toolCalls = []) {
  const used = toolCalls.map((t) => t.tool);
  return `Genutzte Werkzeuge: ${used.join(', ') || 'keine'}. `
    + `Nächster Schritt: Ergebnis an den nächsten Agenten übergeben.`;
}
