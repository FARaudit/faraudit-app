// $0 regression lock for REPORT-TRUTH #6 — the export gate must say WHAT is missing and what to do instead.
// Run: npx tsx src/lib/gate-reason.test.ts
//
// WHAT BROKE. The gate banner was V1-era copy for a TRANSIENT V2 timeout. REPORT-TRUTH #1 began routing a
// DETERMINISTIC, NAMED coverage gap into it, and on live run 583df921 every clause was wrong:
//   "Deep analysis unavailable for this run"        — the analysis ran fine
//   "The core report below is complete and accurate" — the engine had just set documents_complete=false and NAMED
//                                                      an unanalyzed document; the banner contradicts its own gate
//   "re-run to try again"                            — deterministic gap; the re-run repeats it, at the customer's cost
// A gate that withholds the report while calling it complete is worse than saying nothing.
export {};
process.env.AUDIT_GATE_REASON_NAMED = "true";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  ✗ ${l}`); } };

const row = (docs: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  compliance_json: { engine: "agentic_v3", documents_complete: false, ...extra, v3: { documents: docs } },
});

(async () => {
  const { gateCause } = await import("../app/audit/[id]/route");

  // ---- 1. THE LIVE CASE (run 583df921, verbatim payload) -------------------------------------------------------
  const live = gateCause(row({ read: 3, analyzed: 2, analyzed_of: 3, complete: false, missing: [],
    unanalyzed: [{ name: "WAGE DETERMINATIONS - 20260513.pdf", reason: "read in full, but no finding was grounded in it — content NOT analyzed" }] }))!;
  const all = `${live.head} ${live.body}`;
  ok("names the actual document", all.includes("WAGE DETERMINATIONS - 20260513.pdf"));
  ok("head states the real cause — read but not analyzed", /read but not analyzed/i.test(live.head));
  ok("does NOT claim the report is complete and accurate", !/complete and accurate/i.test(all));
  ok("does NOT say deep analysis was unavailable", !/deep analysis unavailable/i.test(all));
  ok("does NOT advise a re-run", !/re-run to try again/i.test(all));
  ok("says plainly that re-running will not help", /re-?running will not change this/i.test(all));
  ok("tells the reader what to do instead", /read that document directly/i.test(all));
  ok("explains why the export is withheld", /export is held back/i.test(all));
  ok("warns the findings do not reflect that document", /nothing below reflects/i.test(all));

  // ---- 2. THE HARDER FAILURE OUTRANKS IT -----------------------------------------------------------------------
  // An UNRETRIEVED document is worse than a retrieved-but-unanalyzed one and must be named first.
  const both = gateCause(row({ missing: [{ name: "Attachment 3 - Drawings.pdf" }],
    unanalyzed: [{ name: "WAGE DETERMINATIONS - 20260513.pdf" }] }))!;
  ok("unretrieved outranks unanalyzed", /not retrieved/i.test(both.head) && both.body.includes("Attachment 3 - Drawings.pdf"));

  // ---- 3. PLURALS READ CORRECTLY -------------------------------------------------------------------------------
  const two = gateCause(row({ missing: [], unanalyzed: [{ name: "A.pdf" }, { name: "B.pdf" }] }))!;
  ok("two documents → plural phrasing", /2 documents read but not analyzed/i.test(two.head) && /were retrieved/i.test(two.body));

  // ---- 4. HONEST-FAIL FALLBACK ---------------------------------------------------------------------------------
  const hf = gateCause(row({ missing: [], unanalyzed: [] }, { honest_fail: true }))!;
  ok("honest-fail names itself and does not claim completeness", /did not reach a confident verdict/i.test(hf.head) && !/complete and accurate/i.test(hf.body));

  // ---- 5. FALSIFICATION: it must DECLINE when it has nothing to say ---------------------------------------------
  // Returning null is what preserves the legacy banner for V1 rows — a gate cause invented from no data would be
  // the same fabrication class this arc removed.
  ok("no named cause ⇒ null (legacy copy preserved)", gateCause(row({ missing: [], unanalyzed: [] })) === null);
  ok("non-agentic row ⇒ null", gateCause({ compliance_json: { engine: "v1", v2_error: true } }) === null);
  ok("empty row ⇒ null, never a crash", gateCause({}) === null);

  // ---- 6. FLAG-OFF IS INERT ------------------------------------------------------------------------------------
  process.env.AUDIT_GATE_REASON_NAMED = "false";
  ok("flag-OFF ⇒ null ⇒ legacy banner byte-identical", gateCause(row({ missing: [], unanalyzed: [{ name: "X.pdf" }] })) === null);
  process.env.AUDIT_GATE_REASON_NAMED = "true";

  // ---- 7. THE DOCUMENT NAME IS ESCAPED -------------------------------------------------------------------------
  // Document names are attacker-influenceable (upload / SAM attachment) and land in innerHTML.
  const xss = gateCause(row({ missing: [], unanalyzed: [{ name: `<img src=x onerror="alert(1)">.pdf` }] }))!;
  ok("a hostile document name is HTML-escaped", !/<img/.test(xss.body) && xss.body.includes("&lt;img"));

  console.log(`\nREPORT-TRUTH #6 · named gate reason: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
