// ITEM 3 (Brain ruling 2026-07-23) — SWEEP the corpus for the SAME internal inconsistency the 999e909b
// re-adjudication exposed: any specimen expecting NEEDS_HUMAN_REVIEW whose escalation is driven by a
// **purely bidder-knowable** status (socioeconomic set-aside the firm resolves itself). Itemized flips only —
// no silent absorption. A specimen that escalates for ANY OTHER reason is left alone and reported as such.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
process.env.AUDIT_TEMPORAL_VERDICT = "true";
applyStampedConfig("live");

// ⚠ CLASSIFIER DEFECT FOUND + FIXED ON FIRST EXECUTION (2026-07-23). v1 tested socioeconomic VOCABULARY against
// the whole requirement/excerpt text and produced a FALSE POSITIVE on FA442726Q1068.bf388766: that record's hard
// bar is the FAR 52.219-33 **nonmanufacturer rule** (the supplier must be a small-business manufacturer or the
// firm must obtain an SBA waiver) and its escalation is a **set-aside CONFLICT** (the document marks Total Small
// Business AND HUBZone; only the Contracting Officer can say which governs). Neither is bidder-knowable — the
// words "small business" and "HUBZone" merely APPEAR in the text. This is the ratified token-collision doctrine:
// a token's presence is not its operative meaning.
//
// v2 keys on the STRUCTURED field instead of prose — `requiredAttribute` must be a socioeconomic PROGRAM-STATUS
// attribute (`setaside:<program>`), which is the machine-checkable mark of "a status the bidder knows about
// itself", and the record must not be escalating on a set-aside conflict (a KO-resolvable ambiguity, never
// bidder-knowable).
const SOCIO_ATTR = /^setaside:\s*(?:hubzone|sdvosb|wosb|edwosb|8\s?\(?a\)?|service[\s-]?disabled|women[\s-]?owned|veteran[\s-]?owned|economically[\s-]?disadvantaged|small[\s-]?business|total[\s-]?small)/i;
const isBidderKnowableBar = (b: any) => SOCIO_ATTR.test(String(b.requiredAttribute || ""));

(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  // Every banked record the corpus draws NHR-expected specimens from, plus the whole measurable set so a
  // specimen cannot hide by not being currently cited.
  const rows: any[] = [];
  for (const r of led) {
    if (r.measurable === "NOT MEASURABLE") { rows.push({ id: r.id, verdict: "—", cls: "NOT MEASURABLE", note: r.why.slice(0, 60) }); continue; }
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let d: any; try { d = deriveVerdict(inp); } catch (e) { rows.push({ id: r.id, verdict: "THREW", cls: "-", note: String(e).slice(0, 60) }); continue; }
    if (d.verdict !== "NEEDS_HUMAN_REVIEW") { rows.push({ id: r.id, verdict: d.verdict, cls: "not-NHR", note: "" }); continue; }
    // It escalates. Is the escalation driven ONLY by bidder-knowable socioeconomic status?
    const bars = (inp.findings as any[]).filter((f) => f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move");
    const socioBars = bars.filter(isBidderKnowableBar);
    const otherBars = bars.filter((b) => !isBidderKnowableBar(b));
    // A set-aside CONFLICT is never bidder-knowable: two mutually-exclusive programs are marked and only the
    // Contracting Officer can say which governs. Such a record escalates CORRECTLY regardless of its bars.
    const conflictDriven = /set-aside conflict|mutually-exclusive set-aside|confirm the governing set-aside/i.test(d.reason || "");
    const cov = (r.inputs.coverageV2?.disqualifierUncovered ?? []).length;
    const cls = conflictDriven ? "NHR / set-aside CONFLICT — KO-resolvable, never bidder-knowable — CORRECT"
      : bars.length === 0 ? "NHR / no hard bar (coverage or typing driven)"
      : otherBars.length === 0 && socioBars.length > 0 ? "⚠ CANDIDATE FLIP — every hard bar is bidder-knowable socioeconomic"
      : `NHR / ${otherBars.length} non-socio bar(s) — CORRECT, leave alone`;
    rows.push({ id: r.id, verdict: d.verdict, cls, note: `bars=${bars.length} socio=${socioBars.length} other=${otherBars.length} covDisq=${cov} · ${(d.reason||"").slice(0,58)}` });
  }

  console.log("═".repeat(140));
  console.log("ITEM 3 SWEEP — set-aside/NHR internal-consistency audit on the REBUILT instrument");
  console.log("═".repeat(140));
  const nhr = rows.filter((r) => r.verdict === "NEEDS_HUMAN_REVIEW");
  console.log(`\n${nhr.length} records currently escalate to NHR (of ${rows.length} banked):\n`);
  for (const r of nhr) console.log(`  ${r.id.slice(0,50).padEnd(52)} ${r.cls}\n       ${r.note}`);
  const cands = nhr.filter((r) => String(r.cls).startsWith("⚠"));
  console.log("\n" + "─".repeat(140));
  console.log(`CANDIDATE FLIPS (every hard bar bidder-knowable ⇒ same class as 999e909b): ${cands.length}`);
  if (cands.length === 0) {
    console.log("  ✅ NONE. 999e909b was the ONLY specimen carrying the inconsistency — the ruling's re-label");
    console.log("     closes it completely; no further itemized flips are owed.");
  } else for (const c of cands) console.log(`  · ${c.id}`);
  console.log("─".repeat(140));
  const other = nhr.filter((r) => !String(r.cls).startsWith("⚠"));
  console.log(`LEFT ALONE (escalate for a reason that is NOT purely bidder-knowable status): ${other.length} — itemized above, none silently absorbed.`);
})();
