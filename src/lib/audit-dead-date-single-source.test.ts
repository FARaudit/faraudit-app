// $0 regression lock — ONE recognizer for "is this date DEAD?", not four.
// Run: npx tsx src/lib/audit-dead-date-single-source.test.ts
//
// FOUND BY the engine line-by-line audit (CEO queue #4), pass 1: `_engine-01-duplicated-rules.ts` asks where the
// engine decides the same thing in more than one place. Its first pass reported ZERO repeated regexes across 112
// modules — from a recognizer carrying a typo that could not match anything. A self-test now guards each recognizer,
// and with it fixed the same sweep found 33. This is the worst of them.
//
// "Is this date dead?" was decided in FOUR places with THREE different definitions:
//
//   src/app/audit/[id]/_view-model.ts:573   /superseded|prior\s+proposal|previous|cancell?ed|replaced\s+by/i
//   src/lib/audit-engine.ts:2407            (identical to the above)
//   src/lib/audit-deadline-extract.ts:39    ...|prior\s+offer|...|\bvoid(?:ed)?\b   ← the careful one
//   src/lib/v4-report/build-data.ts:505     /superseded|prior|previous|cancell?ed|replaced|void/i  ← no boundaries
//
// audit-engine.ts:2406 states the invariant in a comment — "MUST mirror _view-model.ts DEADLINE_DEAD_DATE_RE" — and
// a comment cannot enforce anything. It mirrors that one file and has drifted from the other two.
//
// BOTH DIRECTIONS ARE LIVE, and this is the deadline path, which is disqualifier class:
//
//   UNDER-classify — "VOIDED - offer due date" is NOT dead to the engine and view-model, so a dead date stays in the
//   controlling-deadline pool. That is the exact P0 the comment at audit-engine.ts:2401-2405 describes as already
//   fixed: as the lone parseable survivor it "reported a live solicitation CLOSED."
//
//   OVER-classify — bare `void` matches inside "aVOID" and bare `prior` inside "PRIORity", so the v4 report drops a
//   LIVE deadline as dead. Federal text is adversarial to token matching and this copy has no word boundaries at all.
//
// The fix is not "make the four agree" — that is the same defect with a fresh timestamp. There is now ONE exported
// recognizer and three importers.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { DEADLINE_DEAD_DATE_RE, isDeadDateLabel } = await import("./audit-deadline-extract");

  // ── The labels that separated the three definitions ─────────────────────────────────────────────────────────────
  const DEAD = [
    "Prior offer due date (superseded by Amendment 0003)",
    "VOIDED - offer due date",
    "Voided offer due date",
    "Prior proposal due date (superseded by Amendment 0005)",
    "Cancelled offer due date",
    "Replaced by Amendment 0002",
  ];
  const LIVE = [
    "Offer Due Date",
    "Offers due date - avoid late submission",   // "aVOID" — over-classified by v4-report today
    "Priority handling - offers due date",        // "PRIORity" — over-classified by v4-report today
    "Provide voiding instructions in Volume II",  // contains "void" as ordinary prose, not a dead-date marker
  ];
  for (const l of DEAD) ok(`DEAD: ${l}`, isDeadDateLabel(l));
  for (const l of LIVE) ok(`LIVE: ${l}`, !isDeadDateLabel(l));

  // ── Word boundaries are the whole point — token collision is how this engine has been bitten before ─────────────
  ok("'void' does not match inside 'avoid'", !isDeadDateLabel("avoid"));
  ok("'prior' alone does not match inside 'priority'", !isDeadDateLabel("priority"));
  ok("but 'voided' on its own IS dead", isDeadDateLabel("voided"));

  // ── SINGLE SOURCE — assert there is exactly ONE definition left in the tree ──────────────────────────────────────
  // This is the assertion that actually prevents the regression. The four copies were each internally fine; the
  // defect was that they existed. A test that only checks behaviour would pass again the moment someone re-inlines a
  // fourth copy, which is exactly how this arrived.
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const walk = (d: string, out: string[] = []): string[] => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (e === "node_modules" || e === ".next") continue;
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
    }
    return out;
  };
  const inlined = walk("src").filter((p) => {
    const body = readFileSync(p, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    // A REGEX LITERAL listing DEAD-DATE markers, anywhere other than the one home. Deliberately narrower than
    // "mentions superseded": the first version of this check flagged /near-duplicate|duplicate|superseded/i in
    // _v2-render-surfaces.ts and _view-model.ts, which classifies a DOCUMENT as a duplicate copy — a different
    // question with a different answer. A checker that cannot tell two recognizers apart reports the wrong one.
    // The dead-DATE shape is "superseded" co-occurring with at least one of its sibling markers.
    const lits = body.match(/\/[^/\n]{4,}\/[gimsuy]*/g) || [];
    return lits.some((L) => /superseded/i.test(L) && /(cancell|replaced|prior\\s|previous)/i.test(L))
      && !p.endsWith("audit-deadline-extract.ts");
  });
  ok(`exactly ONE definition in the tree — found inline copies in: ${inlined.join(", ") || "(none)"}`, inlined.length === 0);
  ok("the one home exports it so the others can import rather than re-declare", DEADLINE_DEAD_DATE_RE instanceof RegExp);

  console.log(`\naudit-dead-date-single-source: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
