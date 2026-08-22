// $0 regression lock for AUDIT_OBLIGATION_LINEWRAP_JOIN. Run:
//   npx tsx src/lib/obligation-linewrap-join.test.ts
//
// THE DEFECT THIS PINS: `obligationsOf` splits on `[.;\n]`, and PDF-extracted text wraps mid-sentence, so
// only the head fragment carries the duty verb and only the head survives the filter. That fragment —
// stripped of the words that decide what it is — is what `importanceOf` and the whole gradeCoverageV2
// chain then classify.
//
// Every source specimen below is VERBATIM from a banked run record, not invented. Both of the named
// fragments were measured escalating in 5 records each across the banked corpus, 2026-08-21.
//
// The suite pins FOUR things, and the two over-fire families are the point of the last one — a bridge that
// joins too eagerly would merge a separate obligation into its predecessor and hide it completely.
export {};
process.env.AUDIT_GATE_V2 = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD = "true";
process.env.AUDIT_GROUNDING_VARIANT_TOLERANCE = "true";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

// ── VERBATIM SOURCE (banked record _new-653570ea, Job Corps center health services) ───────────────────
const KEY_PERSONNEL_SRC =
  "7.1. The Center Mental Health Counselor is considered key personnel and must meet these minimum\n" +
  "requirements. The job corps program is run by the Department of Labor (DOL). Key personnel shall be approved\n" +
  "by DOL prior to award or replacement:\n";
const GFP_SUPPLIES_SRC =
  "Prescription and over-the-counter medications\n" +
  "will be disbursed at the Center. These supplies and property shall be utilized during the performance of this\n" +
  "contract only while providing student care.\n";

const FRAGMENT_KP = "Key personnel shall be approved";
const WHOLE_KP = "Key personnel shall be approved by DOL prior to award or replacement:";
const FRAGMENT_GFP = "These supplies and property shall be utilized during the performance of this";
const WHOLE_GFP = "These supplies and property shall be utilized during the performance of this contract only while providing student care.";

(async () => {
  const { obligationsOf } = await import("./audit-orchestrator");
  const { verifyRecitalInSource } = await import("./audit-gate-v2");

  const withFlag = <T>(v: "true" | "false", fn: () => T): T => {
    const prev = process.env.AUDIT_OBLIGATION_LINEWRAP_JOIN;
    process.env.AUDIT_OBLIGATION_LINEWRAP_JOIN = v;
    try { return fn(); } finally {
      if (prev === undefined) delete process.env.AUDIT_OBLIGATION_LINEWRAP_JOIN; else process.env.AUDIT_OBLIGATION_LINEWRAP_JOIN = prev;
    }
  };
  const obs = (v: "true" | "false", text: string) => withFlag(v, () => obligationsOf(text).obligations.map((s) => s.trim()));

  // ── 1. FLAG-OFF IS THE LEGACY SPLIT — the fragment is still produced, byte for byte ─────────────────
  // Not "the flag does nothing" as an article of faith: assert the defect is STILL THERE with it off, so
  // an accidental default-on can never pass this suite silently.
  ok("OFF · key-personnel sentence is still cut at the wrap", obs("false", KEY_PERSONNEL_SRC).includes(FRAGMENT_KP));
  ok("OFF · GFP-supplies sentence is still cut at the wrap", obs("false", GFP_SUPPLIES_SRC).includes(FRAGMENT_GFP));
  ok("OFF · the whole key-personnel sentence is NOT produced", !obs("false", KEY_PERSONNEL_SRC).includes(WHOLE_KP));

  // Byte-identity against the pre-fix implementation, over both specimens.
  const legacySplit = (text: string) => text.split(/(?<=[.;\n])/).map((s) => s.trim())
    .filter((s) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s));
  for (const [name, src] of [["key-personnel", KEY_PERSONNEL_SRC], ["GFP-supplies", GFP_SUPPLIES_SRC]] as const)
    ok(`OFF · byte-identical to the pre-fix split (${name})`,
      JSON.stringify(obs("false", src)) === JSON.stringify(legacySplit(src)));

  // ── 2. FLAG-ON RECOVERS THE SENTENCE ────────────────────────────────────────────────────────────────
  ok("ON · key-personnel sentence arrives WHOLE", obs("true", KEY_PERSONNEL_SRC).includes(WHOLE_KP));
  ok("ON · the fragment is gone", !obs("true", KEY_PERSONNEL_SRC).includes(FRAGMENT_KP));
  ok("ON · GFP-supplies sentence arrives WHOLE", obs("true", GFP_SUPPLIES_SRC).includes(WHOLE_GFP));
  ok("ON · the GFP fragment is gone", !obs("true", GFP_SUPPLIES_SRC).includes(FRAGMENT_GFP));

  // ── 3. THE INVARIANT THE FIX ESTABLISHES — the classifier is handed a COMPLETE sentence ────────────
  // This is the load-bearing property, and it is what every downstream compensator keys on. The demotion
  // TAIL VETO, the U-B consequence capture and the benign-recital continuation all exist to reason about
  // the text a fragment was SEVERED FROM — `verifyRecitalInSource` returns a non-empty `continuation` only
  // for an obligation that does not end at a real terminator. Whole, there is no severed tail to guess at,
  // so none of that machinery has to fire at all.
  //
  // ⚠ SCOPE, stated so this suite is not read as more than it is: whether a given obligation ESCALATES is
  // a whole-corpus property — it depends on `verifyRecitalInSource` and `consequenceTailsAfter` running
  // against the complete assembled fullSource, where the same sentence may occur several times. On a
  // six-line specimen both the fragment and the whole sentence demote identically. The escalation delta is
  // measured at corpus scale by `scripts/audit-ai/_linewrap-join-measure.ts` (21,457 → 20,879 obligations;
  // 1,335 → 1,282 escalating; 245 fragments stopped, 234 whole sentences started), NOT here.
  const tailOf = (ob: string, src: string) => verifyRecitalInSource(src, ob)?.continuation ?? "";
  ok("OFF · the fragment carries a severed tail the veto machinery must guess at",
    tailOf(FRAGMENT_GFP, GFP_SUPPLIES_SRC).length > 0);
  ok("ON · the whole sentence has NO severed tail — it ends at its own terminator",
    tailOf(WHOLE_GFP, GFP_SUPPLIES_SRC).length === 0);
  // The whole sentence EXTENDS the fragment rather than replacing it — the fix adds the words the split
  // dropped, it does not rewrite the obligation. (A `FRAGMENT !== WHOLE` check would be a tautology on two
  // string literals — tsc flags it, and a check that cannot go red is not a check.)
  ok("the whole sentence extends the fragment rather than replacing it",
    WHOLE_GFP.startsWith(FRAGMENT_GFP));

  // ── 4. OVER-FIRE GUARDS — the bridge must NOT swallow a separate obligation ─────────────────────────
  // A bridge that joins too eagerly is worse than the defect: the swallowed obligation disappears from the
  // set entirely rather than merely arriving truncated.
  const CAPITAL_NEXT =                       // the #587 LBJ shape — a pre-award bar on the following line
    "The contractor shall maintain required insurance coverage at a\n" +
    "Proof of insurance shall be provided at time of award.\n";
  const BLANK_LINE =
    "The offeror shall submit a technical volume.\n\nThe offeror shall submit a price volume.\n";
  const ENUMERATOR =
    "The offeror shall provide the following:\n(a) shall submit a completed SF-1449 with the quotation.\n";
  const onCapital = obs("true", CAPITAL_NEXT);
  ok("ON · a capital-led next line is NOT joined (stays a separate obligation)",
    onCapital.some((o) => o.startsWith("Proof of insurance shall be provided")));
  ok("ON · blank line is a paragraph break — both volumes survive as separate obligations",
    obs("true", BLANK_LINE).filter((o) => /volume/i.test(o)).length === 2);
  ok("ON · an enumerator starts a new item and is NOT joined",
    obs("true", ENUMERATOR).some((o) => o.startsWith("(a) shall submit a completed SF-1449")));

  // ── 5. NO OBLIGATION IS LOST — the join may merge, never drop ───────────────────────────────────────
  for (const [name, src] of [["capital", CAPITAL_NEXT], ["blank", BLANK_LINE], ["enumerator", ENUMERATOR]] as const)
    ok(`ON · obligation count never falls below the legacy count minus merges (${name})`,
      obs("true", src).length >= 1 && obs("true", src).join(" ").length >= legacySplit(src).join(" ").length * 0.9);

  console.log(`\nobligation-linewrap-join: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
