// $0 CALL-SHAPE lock for assembleSamDocumentSet. Run: npx tsx src/lib/sam-attachments-callsite-parity.test.ts
//
// WHY THIS TEST EXISTS, AND WHY IT ASSERTS A CALL RATHER THAN A NUMBER.
//
// Two guards key on the third argument, `resourceLinks` — the v2 opportunity's INDEPENDENT expected-set:
//   • ROOT-2's EXISTS denominator (existsShortfallEntries), built after seq-4 specifically to catch WORKER-side
//     retrieval degradation — "worker got 1 doc, local got 7"
//   • the denominator reconciliation (#395), whose `resourceLinksLen > 0` safety guard makes it a no-op without it
//
// `agents/audit-worker/worker.ts` did not pass it. The worker is the path every QUEUED audit takes, so both guards
// were inert exactly where they mattered, and ROOT-2 had never fired on the path it was written for.
//
// It survived a live verification because that verification passed `sol.resourceLinks` explicitly — a call shape
// production does not use. Flag-OFF reproduced the worker's 10-of-12, which made the instrument LOOK faithful: the
// number matched while the CALL did not. Caught only when live run eab43ada logged `sam-retrieval … 10/12 docs`
// with no reconciliation line — after the money was spent.
//
// So the assertion here is STRUCTURAL: every production caller must pass a third argument. A behavioural test
// cannot catch this, because a test that constructs the call itself supplies the argument the caller omitted.
import { readFileSync } from "node:fs";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

// Every production file that invokes the assembler. A new caller added here without the third argument is the
// regression this locks — add the file to the list when one appears.
const CALLERS = [
  "agents/audit-worker/worker.ts",
  "src/lib/watcher-tick.ts",
  "src/app/api/audit/route.ts",
];

(async () => {
  for (const file of CALLERS) {
    const src = readFileSync(file, "utf8");
    // Match the invocation and capture its argument list up to the closing paren of the call.
    const m = src.match(/assembleSamDocumentSet\(([^)]*)\)/);
    ok(`${file}: calls assembleSamDocumentSet`, !!m);
    if (!m) continue;
    const args = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    ok(`${file}: passes THREE arguments (noticeId, solNumber, resourceLinks)`, args.length >= 3);
    ok(`${file}: the third argument is a resourceLinks expression`, /resourceLinks/.test(args[2] ?? ""));
  }

  // The guard itself must remain the reason the third argument matters — if this stops being true the test above
  // is measuring nothing, which is the failure mode this whole file is about.
  const lib = readFileSync("src/lib/sam-attachments.ts", "utf8");
  ok("supersededManifestEntries still no-ops when resourceLinksLen <= 0", /resourceLinksLen <= 0\) return \[\]/.test(lib));
  ok("existsShortfallEntries still consumes resourceLinksLen", /export function existsShortfallEntries\(manifestLen: number, resourceLinksLen: number\)/.test(lib));

  console.log(`\nassembleSamDocumentSet call-shape parity: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
