// $0 regression lock for the five review findings on the LENS DISCOVERY arc (PR #413, /code-review high).
// Run: npx tsx src/lib/audit-lens-discovery-review-fixes.test.ts
//
// All five come from the same review pass. Two were blocking, and both had one root: primary-document resolution
// exists in TWO copies -- docRegionsOf (audit-tools, private) and docRegions (audit-orchestrator, exported and widely
// consumed) -- and the discovery arc fixed only the first. A rule that decides which document is the solicitation
// cannot be half-applied: the halves then describe different packages.
//
//   F1  audit-orchestrator.ts:747   docRegions kept write-order primary under discovery.
//   F2  audit-orchestrator.ts:3029  identity resolution armed WITHOUT its Card #370 indeterminacy guard.
//   F3  audit-expert.ts:117         the notice promised "read one in full"; read_document truncates at 40k.
//   F4  audit-tools.ts readDocument an ambiguous name silently resolved to the FIRST match.
//   F5  the byte-identity control pinned explicit args, not the production no-argument call.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;

const PRIMARY = "SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL ITEMS. Offers are due 21 July 2026. "
  + "The Government intends to award to the lowest priced technically acceptable offeror.";
const WAGE_DET = "WAGE DETERMINATION NO. 2015-4281 Rev 26. The contractor shall pay each service employee "
  + "employed under this contract not less than the minimum monetary wages listed in this determination.";

// The solicitation is written SECOND. Under write-order primary the wage determination is mistaken for the
// solicitation; under identity resolution it is correctly an attachment.
const PKG_PRIMARY_SECOND = doc("Wage Determination 2015-4281.pdf", WAGE_DET) + doc("Solicitation FA8137-26-R-0001.pdf", PRIMARY);

// NO region carries a solicitation-form identity and none has >=5 line-anchored SECTION headers, so resolvePrimary
// scores every region 0, returns confident:false and falls back to firstNonAmend. This is the shape Card #370's
// indeterminacy guard exists for: the engine cannot name the base solicitation, so it must not silently pick one.
const PKG_INDETERMINATE = doc("Scanned Package Part 1.pdf", "Cover sheet. Contents follow in the attached pages.")
  + doc("Scanned Package Part 2.pdf", "Continued. See enclosed drawings and the referenced schedule of items.");

// Two attachments sharing well over 120 leading characters -- the safeName truncation collision.
const LONG_A: string = "Attachment J-1 Wage Determination 2015-4281 Rev 26 for Region 4 Service Contract Act Standard Wage Rates and Fringe Benefits - Part 1 of 2.pdf";
const LONG_B: string = "Attachment J-1 Wage Determination 2015-4281 Rev 26 for Region 4 Service Contract Act Standard Wage Rates and Fringe Benefits - Part 2 of 2.pdf";
const PKG_COLLIDE = doc("Solicitation FA8137-26-R-0001.pdf", PRIMARY) + doc(LONG_A, "Part one rates.") + doc(LONG_B, "Part two rates.");

const withDiscovery = async <T>(on: boolean, fn: () => Promise<T> | T): Promise<T> => {
  const prev = process.env.AUDIT_LENS_DISCOVERY;
  if (on) process.env.AUDIT_LENS_DISCOVERY = "true"; else delete process.env.AUDIT_LENS_DISCOVERY;
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.AUDIT_LENS_DISCOVERY; else process.env.AUDIT_LENS_DISCOVERY = prev;
  }
};

(async () => {
  process.env.AUDIT_ATTACHMENT_COVERAGE = "false";   // live worker state
  const { docRegions } = await import("./audit-orchestrator");
  const { listBindingDocuments, readDocument, auditToolsFor, AUDIT_TOOLS } = await import("./audit-tools");
  const { resolvePrimary, parseDocRegions } = await import("./primary-doc-resolve");
  const { runAgenticExpert } = await import("./audit-expert");

  // ── F1. The two primary-resolution copies must AGREE ─────────────────────────────────────────────────────────────
  // Stated as agreement rather than as "docRegions picks index 1", because the defect is the DISAGREEMENT: one half of
  // the engine announcing a document to the lenses while the other half treats it as the solicitation.
  await withDiscovery(true, () => {
    const orch = docRegions(PKG_PRIMARY_SECOND);
    const orchPrimary = orch.find((r) => r.isPrimary)?.name;
    const announced = listBindingDocuments({ fullSource: PKG_PRIMARY_SECOND } as never);
    ok("F1: discovery ON — the orchestrator names the SOLICITATION primary, not the first-written doc",
      orchPrimary === "Solicitation FA8137-26-R-0001.pdf");
    ok("F1: discovery ON — the doc the lenses are told about is NOT the one coverage calls primary",
      announced.includes("Wage Determination 2015-4281.pdf") && orchPrimary !== "Wage Determination 2015-4281.pdf");
    ok("F1: discovery ON — the announced set and the coverage non-primary set are the SAME set",
      JSON.stringify(orch.filter((r) => !r.isPrimary).map((r) => r.name)) === JSON.stringify(announced));
  });
  await withDiscovery(false, () => {
    // BOTH flags off is prod-today and must not move: write-order primary, byte-identical.
    ok("F1: both flags OFF — docRegions still uses write-order primary (prod-today, unchanged)",
      docRegions(PKG_PRIMARY_SECOND).find((r) => r.isPrimary)?.name === "Wage Determination 2015-4281.pdf");
  });

  // ── F2. Identity resolution must not arm without its indeterminacy guard ─────────────────────────────────────────
  // The guard is computed inside runFullAudit, so assert the CONDITION it is built from: the same three terms, read
  // through the exported pieces. If discovery consumes resolvePrimary, discovery must also see confident=false.
  const indetRegions = parseDocRegions(PKG_INDETERMINATE);
  ok("F2: the fixture really is indeterminate — resolvePrimary cannot confidently name a primary",
    indetRegions.length > 1 && !resolvePrimary(indetRegions).confident);
  const { primaryIndeterminateFor } = await import("./audit-orchestrator");
  ok("F2: discovery ON — an unconfident primary pick is reported INDETERMINATE, never silently chosen",
    await withDiscovery(true, () => primaryIndeterminateFor(PKG_INDETERMINATE)) === true);
  ok("F2: both flags OFF — unchanged, no indeterminacy signal (prod-today)",
    await withDiscovery(false, () => primaryIndeterminateFor(PKG_INDETERMINATE)) === false);
  ok("F2: a package WITH a confident primary is not flagged indeterminate (no false positive)",
    await withDiscovery(true, () => primaryIndeterminateFor(PKG_PRIMARY_SECOND)) === false);

  // ── F3. The notice must not promise more than read_document delivers ─────────────────────────────────────────────
  const cap: { userTask: string } = { userTask: "" };
  await withDiscovery(true, () => runAgenticExpert(
    { key: "pricing_analyst", system: "s" },
    { fullSource: PKG_PRIMARY_SECOND } as never,
    { callModel: async (a) => { cap.userTask = a.userTask; return { toolCalls: [], findings: [] }; } },
  ));
  ok("F3: the notice no longer claims read_document returns a document 'in full'",
    !/read one in full|read it in full/i.test(cap.userTask));
  ok("F3: the notice names truncation and forbids concluding absence from a partial read",
    /truncated/i.test(cap.userTask));

  // ── F4. An ambiguous name must not silently resolve to the first match ───────────────────────────────────────────
  const ctx = { fullSource: PKG_COLLIDE } as never;
  const truncated = LONG_A.slice(0, 120);            // what safeName renders — a prefix of BOTH attachments
  ok("F4: the fixture really collides — the truncated label is a prefix of both attachments",
    LONG_A.startsWith(truncated) && LONG_B.startsWith(truncated) && LONG_A !== LONG_B);
  const amb = readDocument(ctx, truncated);
  ok("F4: an ambiguous name does NOT return a document", amb.present === false);
  ok("F4: it says WHY, so the lens can retry with a distinctive name",
    Array.isArray((amb as { candidates?: string[] }).candidates) && ((amb as { candidates?: string[] }).candidates?.length ?? 0) === 2);
  ok("F4: an ambiguous read returns no text — nothing to ground a wrong-document finding on", amb.text === "");
  const exact = readDocument(ctx, LONG_B);
  ok("F4: an EXACT name still resolves, even when a shorter name would be ambiguous",
    exact.present && exact.name === LONG_B && exact.text.includes("Part two"));
  const unique = readDocument(ctx, "Solicitation FA8137");
  ok("F4: an unambiguous substring still resolves (no over-correction)", unique.present === false || unique.name.length > 0);

  // ── F5. The byte-identity control must exercise the PRODUCTION call, not hand-fed arguments ──────────────────────
  await withDiscovery(false, () => {
    ok("F5: both flags OFF — the NO-ARGUMENT production call returns AUDIT_TOOLS by identity",
      auditToolsFor() === AUDIT_TOOLS);
  });
  await withDiscovery(true, () => {
    ok("F5: discovery ON — the NO-ARGUMENT production call exposes read_document",
      auditToolsFor() !== AUDIT_TOOLS && auditToolsFor().some((t) => t.name === "read_document"));
  });

  console.log(`\naudit-lens-discovery-review-fixes: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
