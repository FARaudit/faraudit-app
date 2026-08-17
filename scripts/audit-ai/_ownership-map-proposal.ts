// OWNERSHIP MAP v0 — deterministic, $0, name-based. Built from the 135 binding-document names actually
// observed across the banked corpus (NOT imagined categories). Allowlist shapes only: an unmatched name
// falls to RESIDUE, never to a silent default.
//
// One document → exactly ONE owner. Division, not duplication: duplicating across five lenses is what blew
// the 270s budget on live runs 6cbabeae / e63a9b2d.

export type LensKey = "capture_strategist" | "contracts_attorney" | "pricing_analyst" | "former_ko" | "proposal_manager";
export type Owner = LensKey | "RESIDUE";

/** Ordered rules. FIRST match wins, so the order encodes precedence between overlapping shapes. */
export const OWNERSHIP_RULES: Array<{ owner: Owner; why: string; re: RegExp }> = [
  // ── pricing_analyst — §B prices, CLINs, labor rates, packaging
  { owner: "pricing_analyst", why: "wage determination / Davis-Bacon labor rates",
    re: /\bwage\s+determination\b|\bdavis\s?b[ae]+con\b|\bwage\s+rate/i },
  { owner: "pricing_analyst", why: "bid schedule / pricing sheet / CLIN pricing",
    re: /\bbid\s+(?:schedule|form|sheet)\b|\bprice\s+bid\b|\bunit\s+price\b|\bpricing\s+(?:spreadsheet|sheet|matrix)\b|\bschedule\s+of\s+prices\b/i },
  { owner: "pricing_analyst", why: "labor category / rate list",
    re: /\blabor\s+categor|\bcategories\s+of\s+labor\b|\becraft\b|\bprofessional\s+categories\b/i },
  { owner: "pricing_analyst", why: "parts list priced by the offeror",
    re: /\bparts\s+list\b/i },

  // ── proposal_manager — §L instructions and submission mechanics
  { owner: "proposal_manager", why: "instructions to bidders/offerors",
    re: /\binstructions?\s+to\s+(?:bidders?|offerors?|quoters?)\b|\bnotices?\s+to\s+offerors?\b/i },
  { owner: "proposal_manager", why: "past-performance submission artifact",
    re: /\bpast\s+performance\s+questionnaire\b|\bcustomer\s+satisfaction\s+survey\b/i },
  { owner: "proposal_manager", why: "submittal register / submittal form",
    re: /\bsubmittal\s+(?:register|form)\b/i },

  // ── contracts_attorney — §I/§H/§K clauses, reps, eligibility, flow-downs
  { owner: "contracts_attorney", why: "provisions and clauses",
    re: /\bprovisions?\s+and\s+clauses?\b|\bsolicitation\s+provisions?\b|\bcontract\s+clauses?\b/i },
  { owner: "contracts_attorney", why: "security / clearance / permit requirements",
    re: /\bsecurity\s+requirements?\b|\bradiation\s+permit\b|\bclearance\s+(?:and\s+line\s+marking\s+)?permit\b|\bdd[\s-]?254\b/i },
  { owner: "contracts_attorney", why: "subcontractor flow-down acknowledgement",
    re: /\bsf\s*1413\b|\bstatement\s+and\s+acknowledgement\b|\bsubcontractors?\b/i },

  // ── capture_strategist — §C scope, §E inspection/acceptance, §F delivery
  { owner: "capture_strategist", why: "statement of work / PWS / SOO",
    re: /\bstatement\s+of\s+work\b|\bsow\b|\bpws\b|\bperformance\s+work\s+statement\b|\bstatement\s+of\s+objectives\b|\bscope\s+of\s+work\b/i },
  { owner: "capture_strategist", why: "technical specification (UFGS / DOT spec / design narrative)",
    re: /\bufgs\b|\b(?:nm|tx|ca|fl)dot\s+spec\b|\bspecification\b|\bdesign\s+narrative\b|\bspec\s+and\s+ti\s+design\b/i },
  { owner: "capture_strategist", why: "inspection / acceptance / quality surveillance",
    re: /\bquality\s+assurance\s+surveillance\b|\bqasp\b|\binspection\s+(?:and\s+acceptance|plan)\b|\bmaterials?\s+test/i },
  { owner: "capture_strategist", why: "test procedure / contractor requirements document",
    re: /\btest\s+(?:procedure|matrix|plan)\b|\brtp[\s-]?\d|\bmtp[\s-]?\d|\bcontractor\s+requirements?\s+document\b|\bas[\s-]?built\b/i },
  { owner: "capture_strategist", why: "drawings / site plans",
    re: /\bdrawings?\b|\bsite\s+plan\b|\bwebgis\b|\bstorm\s+drain/i },

  // ── former_ko — evaluator-enforceable traps: amendments, mandatory forms, Q&A that changes the deal
  { owner: "former_ko", why: "amendment / SF-30 (may move the deadline or the requirement)",
    re: /\bamendment\b|\bamd[\s_]?\d|\bsf\s*30\b/i },
  { owner: "former_ko", why: "Q&A / RFI answers (binding changes hide here)",
    re: /\bquestions?\s+and\s+answers?\b|\bq\s*&\s*a\b|\brequest\s+for\s+information\b|\brfi\b/i },
  { owner: "former_ko", why: "mandatory form the offer is thrown out without",
    re: /\bdd\s?1354\b|\bsf\s?\d{3,4}\b|\bform\b|\bsign[\s-]?in\b|\bfire\s+prevention\b|\biwatch\b|\btraining\s+for\s+contractors\b/i },
];

/** SEPARATOR NORMALIZATION — the single biggest classifier defect found in v0. Real SAM filenames carry
 *  `_` and URL-encoded `+`/%20 in place of spaces, and BOTH defeat `\b` and `\s+`: "ATT12_Submittal
 *  Register" never matched /\bsubmittal\s+register\b/ because `_` is a word character, and
 *  "Statement+of+Work" never matched /\bstatement\s+of\s+work\b/. Same trick `classifySectionRoles`
 *  already uses (sam-attachments.ts:339). Decode first, then flatten every separator to a space. */
export function normalizeDocName(name: string): string {
  let s = name;
  try { s = decodeURIComponent(s.replace(/\+/g, " ")); } catch { s = s.replace(/\+/g, " "); }
  return s.replace(/[_.\-—+%()\[\]]+/g, " ").replace(/\s+/g, " ").trim();
}

export function ownerOf(name: string): { owner: Owner; why: string } {
  const n = normalizeDocName(name);
  for (const r of OWNERSHIP_RULES) if (r.re.test(n)) return { owner: r.owner, why: r.why };
  return { owner: "RESIDUE", why: "no observed shape matched" };
}
