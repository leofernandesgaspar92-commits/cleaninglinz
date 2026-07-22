// ============================================================================
//  Kognitiver Kern der Agenten.
//   - LIVE-Modus  (ANTHROPIC_API_KEY gesetzt): echter Claude-Tool-Use-Loop.
//   - SIM-Modus   (kein Key): deterministische Simulation, die dieselben Tools
//                 real ausführt – so laufen alle Workflows sofort durch und
//                 erzeugen echte DB-/Kommunikations-Effekte.
// ============================================================================
import { toolDefsFor, runTool } from '../tools/lecoTools.js';

const MODEL = 'claude-opus-4-8';

export function isLive() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Führt einen Agenten-Zug aus: LLM plant, ruft Werkzeuge, liefert Ergebnis + Reflexion.
export async function runAgentTurn({ agent, userPrompt, ctx }) {
  return isLive()
    ? runLive({ agent, userPrompt, ctx })
    : runSimulated({ agent, userPrompt, ctx });
}

// ---------------------------------------------------------------------------
//  LIVE: manueller agentischer Tool-Loop (Anthropic SDK)
// ---------------------------------------------------------------------------
async function runLive({ agent, userPrompt, ctx }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic(); // löst Credentials aus der Umgebung auf
  const tools = toolDefsFor(agent.tools);

  const messages = [{ role: 'user', content: userPrompt }];
  const toolCalls = [];
  let tokensIn = 0, tokensOut = 0;

  for (let step = 0; step < 8; step++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: agent.system,
      tools,
      messages,
    });
    tokensIn += res.usage?.input_tokens ?? 0;
    tokensOut += res.usage?.output_tokens ?? 0;

    if (res.stop_reason === 'refusal') {
      return { text: '[Anfrage abgelehnt]', toolCalls, tokensIn, tokensOut };
    }

    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { text, toolCalls, tokensIn, tokensOut };
    }

    const results = [];
    for (const tu of toolUses) {
      let out, isError = false;
      try { out = await runTool(tu.name, tu.input, ctx); }
      catch (e) { out = { error: e.message }; isError = true; }
      toolCalls.push({ tool: tu.name, input: tu.input, ok: !isError });
      results.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(out).slice(0, 8000),
        is_error: isError,
      });
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: '[Maximale Schrittzahl erreicht]', toolCalls, tokensIn, tokensOut };
}

// ---------------------------------------------------------------------------
//  SIM: deterministische Simulation – führt echte Tools aus, kein LLM nötig.
// ---------------------------------------------------------------------------
const READ_FIRST = ['read_finance', 'read_companies', 'read_customers', 'read_code', 'read_tasks', 'read_knowledge'];

async function runSimulated({ agent, userPrompt, ctx }) {
  const toolCalls = [];
  const observations = [];

  // 1) Das erste passende Lese-Tool ausführen, um echte Daten zu ziehen.
  const readTool = READ_FIRST.find((t) => agent.tools.includes(t));
  if (readTool) {
    try {
      const input = readTool === 'read_code' ? { path: 'backend/src/server.js' }
                  : readTool === 'read_tasks' ? {} : {};
      const data = await runTool(readTool, input, ctx);
      toolCalls.push({ tool: readTool, input, ok: true });
      observations.push(`${readTool}: ${summarize(data)}`);
    } catch (e) { observations.push(`${readTool} fehlgeschlagen: ${e.message}`); }
  }

  const text = `[SIM] ${agent.title} hat die Aufgabe bearbeitet. Beobachtungen: `
    + (observations.join(' | ') || 'keine Datenquelle verfügbar')
    + `. (Simulationsmodus – für echte KI-Analyse ANTHROPIC_API_KEY setzen.)`;

  // 2) Erkenntnis in die Knowledge Base schreiben, falls erlaubt.
  if (agent.tools.includes('write_knowledge')) {
    await runTool('write_knowledge', {
      topic: agent.key,
      title: `Sim-Analyse: ${agent.title}`,
      content: text,
      tags: ['simuliert'],
    }, ctx);
    toolCalls.push({ tool: 'write_knowledge', ok: true });
  }

  // 3) Human-in-the-Loop demonstrieren: berechtigte Agenten legen eine
  //    Freigabe / einen Code-Vorschlag an (Mensch entscheidet im Dashboard).
  if (agent.tools.includes('propose_code_change')) {
    // Sicherer Vorschlag: harmlose Notizdatei mit Volltext, damit der
    // Execute-Schritt echt geschrieben werden kann, ohne Quellcode zu überschreiben.
    await runTool('propose_code_change', {
      path: 'agents/IMPROVEMENTS.md',
      rationale: 'Simulierter Verbesserungsvorschlag: Verbesserungs-Notiz aktualisieren.',
      new_content:
        `# Leco – Verbesserungs-Notizen (autogeneriert)\n\n`
        + `Stand: ${new Date().toISOString()}\n\n`
        + `Die autonome Verbesserungsschleife hat diese Datei nach menschlicher Freigabe `
        + `geschrieben und demonstriert damit den Ausführen-Schritt.\n`,
    }, ctx);
    toolCalls.push({ tool: 'propose_code_change', ok: true });
  } else if (agent.tools.includes('request_approval') && agent.approval) {
    await runTool('request_approval', {
      category: agent.approval,
      summary: `${agent.title}: Freigabe erforderlich (Simulation).`,
      detail: { hinweis: 'Vom Menschen zu entscheiden.' },
    }, ctx);
    toolCalls.push({ tool: 'request_approval', ok: true });
  }

  return { text, toolCalls, tokensIn: 0, tokensOut: 0 };
}

function summarize(data) {
  if (Array.isArray(data)) return `${data.length} Datensätze`;
  if (data && typeof data === 'object') {
    if (data.totals) return `Umsatz ${data.totals.revenue}€, EBITDA ${data.totals.ebitda}€`;
    return Object.keys(data).join(', ');
  }
  return String(data).slice(0, 120);
}
