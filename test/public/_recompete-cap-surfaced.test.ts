// A count that is our own loop bound may not be footed as a total.
// Run: npx tsx test/public/_recompete-cap-surfaced.test.ts
//
// The worker collects a code's upcoming recompetes until it holds ten, then
// returns. So a NAICS code sitting on exactly ten is reporting a CEILING, and a
// page that foots those rows states our cap as a market finding. Measured on the
// live account 2026-08-13: two of three codes were pinned at ten, and the
// worker's own recorded measurement found roughly twice as many available in the
// same window.
//
// THE CAP IS SURFACED, NOT REMOVED. Raising it costs USAspending requests, and a
// burst of those IP-blocked this worker on 2026-08-12. A surface that says "at
// least N, the list is capped" is honest today at zero cost.
//
// ⛔ AND IT MAY NEVER SAY "10 of 23". The rows above the cap were never
// collected, so the true total is not knowable from the stored data. Replacing
// our cap with a second invented number is the defect, not the cure — Part D
// fails on any attempt to print one.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECOMPETE_STORE_LIMIT } from "@/lib/bd-os/defense-spending";
import { buildDeskDigest } from "@/lib/bd-os/desk-digest";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = process.cwd();

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part A · the two copies of the limit may not drift ──");
// The value is ENFORCED in the worker and RESTATED in the library, because a
// library under src/ cannot import from agents/. Two copies is two rules until
// something compares them, which is what this does.
{
  const WORKER = readFileSync(join(ROOT, "agents", "defense-spending", "usaspending.ts"), "utf8");
  const m = WORKER.match(/out\.length\s*>=\s*(\d+)/);
  check("A1 · the worker's cap is findable (fails closed if it moves)", !!m,
    "no `out.length >= N` in usaspending.ts");
  const workerLimit = m ? Number(m[1]) : NaN;
  check(`A2 · the library's RECOMPETE_STORE_LIMIT matches the worker (${workerLimit})`,
    workerLimit === RECOMPETE_STORE_LIMIT,
    `worker=${workerLimit} library=${RECOMPETE_STORE_LIMIT}`);
  // Typed as number, not as the literals: `10 !== 12` narrows to two disjoint
  // literal types and tsc rejects the comparison outright (TS2367).
  const drifted: number = 12;
  check("A3 · PLANTED: the comparison rejects a drifted pair",
    (RECOMPETE_STORE_LIMIT as number) !== drifted);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part B · a pinned code is flagged, an unpinned one is not ──");
{
  const LIB = readFileSync(join(ROOT, "src", "lib", "bd-os", "defense-spending.ts"), "utf8");
  check("B1 · the payload carries which codes are pinned", /RECOMPETES_AT_CAP/.test(LIB));
  check("B2 · …derived by comparing the STORED per-code array to the limit",
    /recompetes_upcoming\?\.length\s*\?\?\s*0\)\s*>=\s*RECOMPETE_STORE_LIMIT/.test(LIB),
    "not derived from the stored array");
  // Per CODE, not per deduped payload: the cap is applied per code by the worker,
  // so testing it after the cross-code dedupe would test the wrong unit.
  check("B3 · …before the cross-code dedupe, not after",
    LIB.indexOf("RECOMPETES_AT_CAP") < LIB.indexOf("byAward.values()")
      || /rows\s*\n?\s*\.filter\(\(r\) => \(r\.recompetes_upcoming/.test(LIB),
    "derived from the deduped list");
  check("B4 · the limit itself ships so a surface can name it",
    /RECOMPETE_STORE_LIMIT,/.test(LIB));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part C · the Today card states the cap when one applies ──");
{
  const spending = (atCap: string[]) => ({
    state: "ok" as const,
    RECOMPETES_MEASURED: true,
    RECOMPETES_AT_CAP: atCap,
    RECOMPETE_STORE_LIMIT,
    RECOMPETES: [
      { naics: "336611", expired: false, end_date: "2027-01-01", recipient: "ACME SHIPYARD",
        agency: "Department of the Navy", amount: 1, award_id: "A1" },
    ],
  }) as never;

  const capped = buildDeskDigest(
    { opportunities: [], cmmcAudits: [], regRules: [], pipeline: [], spending: spending(["336611", "336412"]) },
    Date.parse("2026-08-13T12:00:00Z")
  ).find((d) => d.desk === "spend")!;
  check("C1 · a capped list says so in words", /capped/i.test(capped.why || ""), capped.why || "");
  check("C2 · …and the count is hedged, not stated flat",
    /^at least /.test(capped.value || ""), capped.value || "");
  check("C3 · …naming how many codes are pinned", /2 codes/.test(capped.why || ""), capped.why || "");

  const clean = buildDeskDigest(
    { opportunities: [], cmmcAudits: [], regRules: [], pipeline: [], spending: spending([]) },
    Date.parse("2026-08-13T12:00:00Z")
  ).find((d) => d.desk === "spend")!;
  check("C4 · an UNCAPPED list is not hedged", !/at least|capped/i.test((clean.value || "") + (clean.why || "")),
    `${clean.value} / ${clean.why}`);
  check("C5 · …and still states its count plainly", /recompete/.test(clean.value || ""), clean.value || "");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part D · no surface may invent the total above the cap ──");
{
  const DIGEST = readFileSync(join(ROOT, "src", "lib", "bd-os", "desk-digest.ts"), "utf8");
  const LIB = readFileSync(join(ROOT, "src", "lib", "bd-os", "defense-spending.ts"), "utf8");
  /* "N of M" over recompetes would be a second invented number: the rows above
     the cap were never collected, so there is no M.

     THE PROBE READS RENDERED TEXT ONLY, and gets there in two steps because both
     were wrong on the first attempt. Sweeping raw source matched
     `for (const x of r.recompetes_upcoming)` — a loop keyword, not a count.
     Extracting string literals then matched a COMMENT that quotes the forbidden
     phrase in order to forbid it, which would make deleting the documentation
     the way to pass. So comments are stripped first, then literals extracted,
     then a COUNT is required on the left of the "of". */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const literals = (src: string): string =>
    (stripComments(src).match(/`[^`]*`|"[^"\n]*"|'[^'\n]*'/g) || []).join("\n");
  const NOF = /(?:\d+|\.length|\$\{[^}]*\})\s*of\s+(?:\d+|\$\{[^}]*\})/i;
  check("D1 · the digest prints no 'N of M' over recompetes", !NOF.test(literals(DIGEST)));
  check("D2 · the library prints no 'N of M' over recompetes", !NOF.test(literals(LIB)));
  check("D3 · PLANTED: the probe catches an invented total",
    NOF.test(literals("const s = `showing ${live.length} of ${total} recompetes`;")));
  check("D3b · PLANTED: …and does NOT fire on a for-of loop over the column",
    !NOF.test(literals("for (const x of r.recompetes_upcoming || []) {}")));
  check("D3c · PLANTED: …nor on a comment that quotes the forbidden phrase",
    !NOF.test(literals('/* it may NEVER print "10 of 23". */')));
  check("D3d · PLANTED: …but still fires on real code beside that comment",
    NOF.test(literals('/* never print "10 of 23" */ const s = `${a.length} of ${b}`;')));
  check("D4 · the payload does not ship a true-total field to tempt one",
    !/RECOMPETES_TOTAL|recompetes_available/.test(LIB));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
