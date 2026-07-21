// ============================================================================
//  Auto-Freigabe-Policy – entscheidet, welche Vorschläge die Schleife OHNE
//  Menschen genehmigen darf. Bewusst sehr konservativ:
//    - Nur Code-Releases auf einer engen Allowlist (Doku/Notizen) sind auto-ok.
//    - Alles an echtem Quellcode, Budget, Übernahmen, Strategie -> IMMER Mensch.
//  Standard: AUS (AGI_AUTOAPPROVE=true schaltet ein).
// ============================================================================
import { Approvals, Knowledge } from './comms.js';

// Pfade, deren Änderung als ungefährlich gilt (reine Dokumentation/Notizen).
const SAFE_PATHS = [
  /^agents\/IMPROVEMENTS\.md$/,
  /^docs\/.*\.md$/,
  /NOTES\.md$/,
];
const MAX_CONTENT = 20000;

export function isAutoApprove() {
  return process.env.AGI_AUTOAPPROVE === 'true';
}

// Bewertet eine offene Freigabe: darf sie automatisch genehmigt werden?
export function evaluate(approval) {
  if (approval.category !== 'code_release')
    return { auto: false, reason: `Kategorie "${approval.category}" braucht immer den Menschen.` };

  const d = approval.detail || {};
  const path = d.path;
  const content = d.new_content;
  if (!path) return { auto: false, reason: 'kein Pfad angegeben.' };
  if (!content || content === '(kein Volltext übergeben)')
    return { auto: false, reason: 'kein ausführbarer Volltext – Mensch muss prüfen.' };
  if (content.length > MAX_CONTENT)
    return { auto: false, reason: 'Änderung zu groß für Auto-Freigabe.' };
  if (!SAFE_PATHS.some((re) => re.test(path)))
    return { auto: false, reason: `Pfad "${path}" nicht in der Sicherheits-Allowlist.` };

  return { auto: true, reason: 'sichere Dokumentations-/Notizdatei innerhalb der Allowlist.' };
}

// Genehmigt alle qualifizierenden offenen Freigaben (wenn eingeschaltet).
export async function applyPolicy({ enabled = isAutoApprove() } = {}) {
  if (!enabled) return [];
  const open = await Approvals.list('offen');
  const approved = [];
  for (const appr of open) {
    const verdict = evaluate(appr);
    if (!verdict.auto) continue;
    await Approvals.decide(appr.id, true, 'policy');
    approved.push({ id: appr.id, path: appr.detail?.path, reason: verdict.reason });
    await Knowledge.write({
      author: 'policy',
      topic: 'improvement_loop',
      title: `Auto-genehmigt: ${appr.detail?.path}`,
      content: `Freigabe ${appr.id} automatisch genehmigt (${verdict.reason}). `
        + `Kategorien Budget/Übernahme/Strategie und echter Quellcode bleiben ausgeschlossen.`,
      tags: ['auto-freigabe', 'policy'],
    });
  }
  return approved;
}
