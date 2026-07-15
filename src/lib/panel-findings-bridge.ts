// PANEL WIRING ARC (card #523, P2a) — the BRIDGE: VERIFIED panel findings → TypedFinding[].
//
// Architecture of record (permanent, recon #523): the panel is a FINDINGS PRODUCER, not a decider. Its
// lenses raise claims, the adversarial verifier 3-states each (VERIFIED / UNVERIFIABLE / REFUTED), and
// ONLY the VERIFIED facts cross this seam into `VerdictInputs.findings`. `deriveVerdict` stays the SOLE
// verdict authority and the LAST step — this module produces no verdict, no disposition, no pole; it only
// TYPES grounded facts the way every other producer (candidate-a, the lossless sweep) does.
//
// TWO honesty invariants this seam enforces (Brain doctrine, no exceptions):
//   • 2b — UNVERIFIABLE / REFUTED claims NEVER become facts. They may still feed the chief-judge narrative
//     (that happens in the runner), but they carry NO verdict weight here. Only VERIFIED crosses.
//   • NO BLIND BAR — a VERIFIED *unmet* hard gate is a real bar the panel confirmed, but the panel cannot
//     prove it is universal (no_one_can_move) or that THIS firm fails it (profile check). So it FAILS CLOSED
//     to human review: `bidder_cannot_move` with `curableInWindow` UNDEFINED, which deriveVerdict routes to
//     NEEDS_HUMAN_REVIEW (never a silent caution, never a blind INELIGIBLE/NO_BID). A committal NO_BID still
//     requires the positively-marked universalDefect + verifiedBy shape, which this seam does NOT synthesize.
//
// Pure & deterministic → $0 gate-testable / bankable (a proof driver can replay it without a paid call).
//
// ⚠ TYPING MAP = a Brain-bound semantic (who gets barred). The choices below are the CONSERVATIVE fail-safe;
// they are a REVIEW POINT for the pre-arm Gauntlet + Brain ruling, not a Code-final decision.
import type { TypedFinding } from "./audit-findings";
import type { PanelistOutput } from "./agentic-panel-runner";

export type VerifierState = "VERIFIED" | "UNVERIFIABLE" | "REFUTED";

// ── TWO-ALLOWLIST SHAPE CLASSIFIER (card #526, Brain ruling 2026-07-15) ──────────────────────────────
// A VERIFIED *unmet* named_hard_gate types by SHAPE — the discriminator is HOLD-vs-DO:
//   (a) PROFILE-BAR  → a credential / status / standing the firm must HOLD or BE (held cert, endorsement from a
//       named authority, background-check standing, set-aside category, exclusivity/holder-only). → fail-closed bar.
//   (b) DO-THE-WORK  → an ACTION performable in the bid/performance window (submit / provide / price / register /
//       email / attend / format / comply-with-structure / obtain-in-window). → bidder_controls (curable).
//   (c) NEITHER cleanly → NHR. Escalation is the RESIDUAL — nothing defaults to bidder_controls; only a CLEAN
//       do-the-work shape demotes. Position-checked SHAPE tests only, NO vocab blocklists.
// PROFILE-BAR takes PRIORITY: a credential wrapped in an action verb ("submit proof of NADCAP accreditation") is
// still HOLD-substance → (a). Consistency: SAM registration = (b) (aligned with #516 self-determinable doctrine).
export type GateShape = "profile_bar" | "do_the_work" | "set_aside_caution" | "neither";

// Unambiguous DO-THE-WORK FORMS that carry credential-ish nouns but are fill-out-and-submit ACTIONS — checked
// FIRST so the profile-bar credential nouns don't trip on them. Reps & certs (52.212-3) is the canonical case.
const DO_THE_WORK_OVERRIDE: RegExp[] = [
  /\brepresentations?\s+and\s+certifications?\b|\breps?\s+and\s+certs?\b|\b52\.212-3\b|\b(?:annual|online)\s+representations\b/i,
];

// In-window ACQUIRABLE credential ("become / obtain X certified/certification BEFORE award/performance") — genuinely
// ambiguous (a credential, yet obtainable in-window) → escalate to NEITHER (never demote). Checked before profile-bar.
// NOTE: restricted to CERTS/ACCREDITATION — a facility/security clearance is long-lead + structural (NOT
// in-window-acquirable), so it stays a profile-bar even with "prior to start" language.
const ACQUIRABLE_CERT: RegExp[] = [
  /\b(?:become|obtain|acquire|achieve|attain|get|secure)\b[^.\n]{0,45}\b(?:certif(?:ied|ication)|accredit(?:ed|ation))\w*\b[^.\n]{0,30}\b(?:before|prior\s+to|by|no\s+later\s+than)\b[^.\n]{0,25}\b(?:award|performance|start|contract|commenc)/i,
];

// (a) HOLD/BE a credential-status — the SUBSTANCE is a thing possessed/conferred, not an action. Checked BEFORE
// set-aside, so a set-aside COUPLED to a genuine third-party bar (clearance / QPL / ITAR / site-visit / vehicle
// holder / affiliation) escalates here (card #528 R2). NOTE: bare socioeconomic set-aside eligibility is NOT here
// — it is SET_ASIDE_SHAPE (→ cautionFloor). Vehicle/incumbent holders + affiliation ARE here.
const PROFILE_BAR_SHAPE: RegExp[] = [
  /\b(?:must|shall|required to|only\s+(?:firms?|offerors?|contractors?|entities|bidders?)\s+)?(?:hold(?:ing)?|possess(?:ing)?|already\s+have|currently\s+have|maintain\s+possession)\b/i,
  /\b(?:must|shall)\s+be\s+(?:an?|the)\s+(?:certified|accredited|cleared|licensed|listed|qualified\s+(?:source|holder|supplier)|holder|member|incumbent|eligible\s+(?:holder|concern|entity))\b/i,
  /\bletters?\s+of\s+(?:recommendation|reference|endorsement)\b|\b(?:endorsement|recommendation|attestation|reference)s?\s+from\s+[A-Za-z]/i,
  /\bbackground\s+(?:check|investigation|screening)\b|\b(?:security|facility|secret|top[- ]secret|interim|dod)\b[^.\n]{0,15}\bclearance\b|\bclearance\s+(?:level|eligibility)\b|\bfavorabl[ey]\s+adjudicat/i,
  /\b(?:NADCAP|AS\s?9100|ISO\s?900\d|ISO\/IEC|CMMI\s+(?:level|maturity)|QPL|QML|qualified\s+products?\s+list|approved\s+source\s+list)\b/i,
  // R2 genuine third-party bars that COUPLE-escalate a set-aside: affiliation/ostensible-sub (#517 — NOT self-determinable),
  // ITAR/export-control, mandatory site visit / pre-proposal conference.
  /\b(?:affiliation|ostensible\s+subcontractor|affiliate\s+(?:rule|concern)|undue\s+reliance)\b/i,
  /\bITAR\b|\bexport[- ]control(?:led)?\b|\bDDTC\b|\b22\s?CFR\s?12[0-9]/i,
  /\b(?:mandatory|required)\s+(?:pre[- ]proposal\s+|pre[- ]bid\s+)?(?:site\s+visit|conference)\b|\b(?:site\s+visit|pre[- ]proposal\s+conference)\s+(?:is\s+)?(?:mandatory|required)\b|\battendance\s+(?:at|is)\b[^.\n]{0,25}\b(?:mandatory|required)\b/i,
  /\bGSA\s+(?:schedule|MAS|multiple\s+award\s+schedule)\b|\bschedule\s+contract\s+holder\b|\bcontract\s+holder\s+to\s+(?:compete|respond)|\bincumbent\s+\w+\s+holder\b/i,
  /\b(?:proof|evidence|certificate|documentation|copy)\s+of\s+(?:[\w'’.-]+\s+){0,6}?(?:accreditation|certification|certificate|clearance|licens\w*|professional\s+(?:qualification|registration|license)|membership|listing|registration\s+as)\b/i,
  // possessive + held-credential noun ("your company's certification", "its facility clearance") → HOLD-substance.
  // Bare "the" is EXCLUDED (the reps-and-certs override handles "the representations and certifications").
  /\b(?:your|our|its|their|his|her)\s+(?:[\w'’]+\s+){0,2}(?:accreditation|certification|clearance|licensure|qualification|membership|listing|credential)s?\b/i,
];

// (a2) BARE socioeconomic / set-aside / size-standard eligibility (card #528 R1) — under a null/unknown firm profile,
// this is a VERIFY-ELIGIBILITY caution (tristate eligible=null), NOT a fail-closed bar — aligning the bridge with
// #516/#517. Checked AFTER PROFILE_BAR, so a set-aside coupled to a genuine bar (above) still escalates. Affiliation
// is deliberately NOT here (it lives in PROFILE_BAR — #517: not self-determinable).
const SET_ASIDE_SHAPE: RegExp[] = [
  /\b(?:WOSB|EDWOSB|HUBZone|HUB\s?Zone|SDVOSB|VOSB|SDVO|SDB)\b|\b8\s?\(\s?a\s?\)/i,
  /\b(?:women[- ]owned|service[- ]disabled\s+veteran[- ]owned|veteran[- ]owned|small\s+disadvantaged|economically\s+disadvantaged)\b/i,
  /\b(?:total\s+)?small\s+business\s+set[- ]aside\b|\bset[- ]aside\s+for\s+(?:small|women|veteran|hubzone|8\(a\))/i,
  /\bNAICS\b[^.\n]{0,45}\bsize\s+standard\b|\bsize\s+standard\b|\bsize\s+status\b|\bsmall\s+business\s+(?:size\s+)?(?:standard|status|eligib)/i,
];

/** Extract the set-aside program key (for requiredAttribute → the tristate's eligible=null caution). */
function setAsideAttribute(r: string): string {
  const m = /\b(WOSB|EDWOSB|HUBZone|SDVOSB|VOSB|SDB|8\s?\(\s?a\s?\))\b/i.exec(r);
  if (m) return m[1].toLowerCase().replace(/\s/g, "");
  if (/\bwomen[- ]owned\b/i.test(r)) return "wosb";
  if (/\bservice[- ]disabled\b/i.test(r)) return "sdvosb";
  if (/\bveteran[- ]owned\b/i.test(r)) return "vosb";
  if (/\bsize\s+standard\b|\bNAICS\b/i.test(r)) return "size_standard";
  return "set_aside_eligibility";
}

// (b) DO an in-window action — checked only when NO profile-bar substance is present.
const DO_THE_WORK_SHAPE: RegExp[] = [
  /\b(?:submit|provide|furnish|deliver|include|complete|fill\s+out|propose|quote|upload|attend|acknowledge|sign|address|conform\s+to|comply\s+with|format(?:ted)?)\b/i,
  /\b(?:price|pricing|priced)\b|\bfirm[- ]fixed[- ]price\b|\bFFP\b/i,
  /\b(?:register(?:ed|ing)?|registration)\s+(?:in|with|as)?\s*(?:the\s+)?(?:System\s+for\s+Award\s+Management|SAM)\b|\bSAM(?:\.gov)?\s+registration\b|\bmaintain\s+(?:an?\s+)?active\s+(?:SAM\s+)?registration\b/i,
  /\bobtain\s+(?:a\s+)?(?:CAC|common\s+access\s+card|base\s+(?:access|pass|id|identification)|piv)\b/i,
  /\btechnical(?:ly)?\s+(?:acceptab|criteria|capabilit|qualif)/i,
  /\bdemonstrate\s+(?:successful\s+)?(?:delivery|performance|experience|capability)\b/i,
  /\bemail(?:ed|ing|s)?\b|\belectronic(?:ally)?\b|\bvia\s+email\b/i,
];

/** Classify a VERIFIED unmet hard gate by SHAPE (card #526). Order: do-the-work FORM override → acquirable-cert
 *  escalation → profile-bar (HOLD/BE, priority) → do-the-work → else NEITHER. Escalation is the residual; only a
 *  CLEAN do-the-work shape demotes. Pure → gate-testable. */
export function classifyGateShape(requirement: string): GateShape {
  const r = requirement ?? "";
  // acquirable cert escalates BEFORE profile-bar (an obtainable-in-window cert is not a held bar). PROFILE-BAR is
  // then checked BEFORE the do-the-work override, so a held credential COUPLED with a reps-certs mention
  // ("hold a clearance AND complete the reps & certs") stays profile_bar — the override can never false-demote a
  // real bar (adversarial round 2 finding). The override only reaches a bare reps-certs form with no HOLD substance.
  if (ACQUIRABLE_CERT.some((re) => re.test(r))) return "neither";
  if (PROFILE_BAR_SHAPE.some((re) => re.test(r))) return "profile_bar"; // coupled bar / held credential wins first (R2)
  if (SET_ASIDE_SHAPE.some((re) => re.test(r))) return "set_aside_caution"; // bare socioeconomic/size → verify-caution (R1)
  if (DO_THE_WORK_OVERRIDE.some((re) => re.test(r))) return "do_the_work";
  if (DO_THE_WORK_SHAPE.some((re) => re.test(r))) return "do_the_work";
  return "neither";
}

export interface PanelStructuredInput {
  /** the panelists exactly as runPanelJudge holds them (structured output, null on lens failure). */
  panelists: Array<{ key: string; name: string; output: PanelistOutput | null }>;
  /** ref → verifier verdict, keyed "<lensKey>:G<n>" / "<lensKey>:R<n>" (the same ref scheme the runner
   *  builds its claims with). A ref absent from the map defaults to UNVERIFIABLE → excluded. */
  stateByRef: Map<string, { state: VerifierState; evidence: string }>;
}

/** P2a — map the panel's VERIFIED structured findings to grounded TypedFindings for `VerdictInputs.findings`.
 *  Pure. Emits ONLY VERIFIED facts (2b); an unmet hard gate fails closed to NHR (no blind bar). */
export function panelFindingsToTyped(inp: PanelStructuredInput): TypedFinding[] {
  const findings: TypedFinding[] = [];
  for (const p of inp.panelists) {
    if (!p.output) continue; // a failed lens produced no facts — coverage-honest, never assume clear

    // ── named hard gates (the lens's strongest signal) ──────────────────────────
    (p.output.named_hard_gates ?? []).forEach((g, i) => {
      const ref = `${p.key}:G${i + 1}`;
      if ((inp.stateByRef.get(ref)?.state ?? "UNVERIFIABLE") !== "VERIFIED") return; // 2b — only VERIFIED cross
      const excerpt = (g.excerpt ?? "").trim();
      if (!excerpt) return; // a VERIFIED gate without its grounding span is not a fact we can stand behind
      // MET → structurally satisfied now (already_satisfied, non-blocking). UNMET + VERIFIED → type by SHAPE
      // (card #526 two-allowlist classifier): do-the-work → bidder_controls (curable, in-window action);
      // profile-bar → fail-closed bar; neither → escalate (NHR). Escalation is the residual — nothing defaults
      // to bidder_controls; only a CLEAN do-the-work shape demotes.
      const shape: GateShape | "met" = g.met ? "met" : classifyGateShape(g.gate);
      const f: TypedFinding = {
        id: `panel:${ref}`,
        requirement: g.gate,
        citation: g.citation ?? "",
        excerpt,
        // do-the-work → submission action; set-aside caution → eligibility (but curable-caution, not a bar);
        // profile-bar/neither → eligibility bar (fail-closed).
        kind: shape === "do_the_work" ? "submission" : "eligibility_bar",
        controllability: shape === "met" ? "already_satisfied"
          : (shape === "do_the_work" || shape === "set_aside_caution") ? "bidder_controls"
          : "bidder_cannot_move",
        grounded: true, // VERIFIED ⇒ the excerpt passed the runner's structural grounding pre-filter
        lens: p.name,
      };
      // do-the-work → curable in-window action. set-aside caution (card #528 R1) → cautionFloor + requiredAttribute
      // so deriveVerdict floors to BID_WITH_CAUTION AND (tristate) sets eligible=null "verify eligibility" — never a
      // fail-closed NHR. profile-bar / neither → curableInWindow LEFT UNDEFINED = the fail-closed-to-NHR signal.
      if (shape === "do_the_work") f.curableInWindow = true;
      if (shape === "set_aside_caution") { f.cautionFloor = true; f.requiredAttribute = setAsideAttribute(g.gate); }
      findings.push(f);
    });

    // ── residual risks (advisory materiality — NEVER a bar) ─────────────────────
    (p.output.risks ?? []).forEach((r, i) => {
      const ref = `${p.key}:R${i + 1}`;
      if ((inp.stateByRef.get(ref)?.state ?? "UNVERIFIABLE") !== "VERIFIED") return; // 2b
      const excerpt = (r.excerpt ?? "").trim();
      if (!excerpt) return;
      findings.push({
        id: `panel:${ref}`,
        requirement: r.risk,
        citation: r.citation ?? "",
        excerpt,
        // A residual risk is a do-the-work materiality, never an eligibility bar → bidder_controls (gate-to-
        // clear, can never be disqualifying). Severity carries its materiality to the report / caution floor.
        kind: "other",
        controllability: "bidder_controls",
        grounded: true,
        lens: p.name,
        severity: r.severity,
      });
    });
  }
  return findings;
}

/** P2d (card #523) — chief-judge REASON synthesis. The panel judge is REASON/narrative ONLY (its `.verdict` is
 *  log-only under the wired architecture); `deriveVerdict` already produced the AUTHORITATIVE pole + reason. This
 *  folds the judge's rationale in as SUPPORTING narrative, derived-reason-FIRST, and ONLY the sentences it adds that
 *  are not already present (reason-dedup) — it can NEVER override or contradict the derived reason. Bounded so the
 *  downstream clampToWord can't be blown out. Pure → gate-testable. Caller gates on the panel actually contributing. */
export function foldPanelReason(derivedReason: string, panelRationale: string, maxAdd = 400): string {
  const derived = (derivedReason ?? "").trim();
  const panel = (panelRationale ?? "").trim();
  if (!panel) return derived;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const derivedNorm = norm(derived);
  // keep only panel sentences whose normalized core isn't already carried by the derived reason (dedup)
  const fresh = panel.split(/(?<=[.!?])\s+/).map((s) => s.trim())
    .filter((s) => { const n = norm(s); return n.length >= 12 && !derivedNorm.includes(n); });
  if (!fresh.length) return derived; // the panel adds nothing the derived reason doesn't already say
  let addition = fresh.join(" ");
  if (addition.length > maxAdd) addition = addition.slice(0, maxAdd).replace(/\s+\S*$/, "") + "…";
  return derived ? `${derived} Expert panel: ${addition}` : `Expert panel: ${addition}`;
}
