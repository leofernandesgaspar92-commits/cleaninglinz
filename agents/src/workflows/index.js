// ============================================================================
//  Die fünf autonomen Workflows des Leco AGI Team.
//  Jeder gibt { name, steps: [...] } zurück (steps = Agenten-Ergebnisse).
// ============================================================================
import { sequential, parallel } from '../core/orchestrator.js';
import { runAgent } from '../core/agent-runner.js';
import { EventBus } from '../core/comms.js';

// 1) DAILY STANDUP – tägliche Synchro & Priorisierung durch den CEO.
async function dailyStandup() {
  const wf = 'daily_standup';
  // Parallel: Markt-, Finanz- und Entwicklungsstand einsammeln.
  const inputs = await parallel([
    { agent: 'analyst', task: 'Liefere die wichtigsten Marktbeobachtungen für Linz heute.' },
    { agent: 'finance', task: 'Berichte die aktuelle Finanzlage (Umsatz, EBITDA, MRR).' },
    { agent: 'developer', task: 'Fasse offene Entwicklungsaufgaben und Blockaden zusammen.' },
  ], { workflow: wf });

  // CEO synthetisiert und priorisiert (legt bei Bedarf Aufgaben an).
  const summary = inputs.map((r) => `${r.title}: ${r.output}`).join('\n');
  const ceo = await runAgent('ceo', {
    task: `Daily Standup. Team-Berichte:\n${summary}\n\nPriorisiere die 3 wichtigsten Aufgaben für heute und lege sie auf dem Task Board an.`,
    workflow: wf,
  });
  return { name: wf, steps: [...inputs, ceo] };
}

// 2) CONTINUOUS IMPROVEMENT – Architektur → Code → QA → Security.
async function continuousImprovement() {
  const wf = 'continuous_improvement';
  const steps = await sequential([
    { agent: 'architect', task: 'Analysiere die Leco-Codebasis (backend/frontend) und identifiziere die wichtigste konkrete Verbesserung.' },
    { agent: 'developer', task: 'Setze die vom Architekten empfohlene Verbesserung als Code-Vorschlag um (propose_code_change).' },
    { agent: 'qa', task: 'Prüfe den vorgeschlagenen Code kritisch und gib eine Freigabe-Empfehlung.' },
    { agent: 'security', task: 'Prüfe die Änderung auf Sicherheits- und DSGVO-Risiken.' },
  ], { workflow: wf });
  return { name: wf, steps };
}

// 3) MERGER PIPELINE – Ziel → Bewertung → Finanzierung → Integration.
async function mergerPipeline() {
  const wf = 'merger_pipeline';
  const steps = await sequential([
    { agent: 'analyst', task: 'Scanne den Linzer Markt und benenne das aussichtsreichste Übernahmeziel aus den vorhandenen Unternehmen.' },
    { agent: 'ma', task: 'Bewerte das Ziel (EBITDA-Multiple, Kundenüberschneidung, Risiko) und lege die Kaufentscheidung dem Menschen zur Freigabe vor.' },
    { agent: 'finance', task: 'Prüfe die Finanzierbarkeit der vorgeschlagenen Übernahme.' },
    { agent: 'operations', task: 'Erstelle einen groben Integrationsplan für die Übernahme.' },
  ], { workflow: wf });
  return { name: wf, steps };
}

// 4) BUG BOUNTY – reagiert auf 'bug_detected'-Events (Echtzeit-Fehlerbehebung).
async function bugBounty() {
  const wf = 'bug_bounty';
  const steps = [];
  let bugs = await EventBus.pending('bug_detected');

  if (bugs.length === 0) {
    // Kein offener Bug -> QA scannt zuerst.
    const scan = await runAgent('qa', {
      task: 'Durchsuche die Leco-Codebasis nach Bugs und melde gefundene Probleme als Event bug_detected.',
      workflow: wf,
    });
    steps.push(scan);
    bugs = await EventBus.pending('bug_detected');
  }

  for (const bug of bugs.slice(0, 3)) {
    const fix = await runAgent('developer', {
      task: `Behebe den gemeldeten Bug als Code-Vorschlag: ${JSON.stringify(bug.payload)}`,
      workflow: wf,
    });
    const sec = await runAgent('security', {
      task: `Prüfe die Bug-Fix-Änderung auf Sicherheitsrelevanz: ${bug.type}`,
      workflow: wf,
    });
    steps.push(fix, sec);
    await EventBus.markHandled(bug.id);
  }
  return { name: wf, steps };
}

// 5) MARKET INTELLIGENCE REPORT – wöchentlicher Bericht an den Menschen.
async function marketIntelligence() {
  const wf = 'market_intelligence';
  const gather = await parallel([
    { agent: 'analyst', task: 'Fasse alle Marktdaten der Woche für Linz zusammen.' },
    { agent: 'finance', task: 'Erstelle die Finanzübersicht der Woche.' },
  ], { workflow: wf });

  const summary = gather.map((r) => `${r.title}: ${r.output}`).join('\n');
  const ceo = await runAgent('ceo', {
    task: `Verfasse den wöchentlichen Market-Intelligence-Bericht mit Strategie-Empfehlungen für Leo und speichere ihn in der Knowledge Base.\n\nDatenbasis:\n${summary}`,
    workflow: wf,
  });
  return { name: wf, steps: [...gather, ceo] };
}

export const WORKFLOWS = {
  daily_standup: dailyStandup,
  continuous_improvement: continuousImprovement,
  merger_pipeline: mergerPipeline,
  bug_bounty: bugBounty,
  market_intelligence: marketIntelligence,
};

export const WORKFLOW_KEYS = Object.keys(WORKFLOWS);
