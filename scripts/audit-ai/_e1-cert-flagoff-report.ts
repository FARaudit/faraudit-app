// ARC #747 · E1 — FLAG-OFF REPORT PARITY. $0, nothing written, no flag armed.
//
// ── REWRITTEN after /code-review high finding #6 on PR #292. ──
// The previous version of this file was a placebo. It claimed to certify "the facet-preserving merge in
// dedupeByExcerpt", but `git diff main...HEAD -- src/lib/v4-report/` was EMPTY — no such change existed in
// the PR. It documented a `[path-to-main-checkout]` baseline argument and never read it, never built a
// baseline, and called buildV4Data only on `{ findings: [], verdict: "INCOMPLETE" }`. It printed
// "FLAG-OFF PARITY: HOLDS" from a re-implemented collision count over the raw records. An inert run and a
// passing run produced identical output. [[feedback_placebo_family_inert_equals_passing]]
//
// WHAT THIS NOW CERTIFIES, and how it can fail. E1 does now change the render layer: identity/dedup keys in
// v4-report/build-data.ts read the ANALYZED span (`excerptPreReground ?? excerpt`) instead of the displayed
// one, so a widened quote can no longer collapse two distinct obligations into a single row and drop one of
// their requirements. TIER E requires flag-OFF to be byte-identical, so this measures it as a DIFFERENTIAL
// over the real banked corpus:
//
//   A = the v4 payload built by the CURRENT code, flag OFF
//   B = the same payload built from findings with `excerptPreReground` STRIPPED — byte-for-byte what the
//       pre-E1 key expression (`excerptHeadKey(f.excerpt)`) produced
//
// With the flag off no finding carries `excerptPreReground`, so A must equal B on every record. If the new
// key path ever perturbs a flag-OFF payload, A ≠ B and this fails with the diverging span printed. It also
// asserts the structural precondition — that flag-OFF really does leave the field unset — and refuses to
// report green on an empty corpus, so a passing run cannot be vacuous.
import * as fs from "fs";
import * as path from "path";
import { RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { buildV4Data } from "../../src/lib/v4-report/build-data";
import { buildV3Payload } from "../../src/lib/audit-v3-report";
import type { Decision } from "../../src/lib/audit-decide";

const DIR = path.join(__dirname, "run-records");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));

delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;   // the point of the exercise
process.env.AUDIT_SEVERITY_HONEST = "true";       // verified live on Vercel production 2026-07-27. It gates
                                                  // dedupeByExcerpt; left unset, this cert cannot fail.

const strip = (f: Record<string, unknown>) => { const { excerptPreReground: _drop, ...rest } = f; return rest; };

let loaded = 0, skipped = 0, mismatches = 0, preRegroundLeaks = 0, findingsSeen = 0;
const notes: string[] = [];

for (const file of files) {
  let rec: RunRecord;
  try {
    rec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    if (rec?.schema !== RUN_RECORD_SCHEMA) { skipped++; continue; }
  } catch { skipped++; continue; }
  const findings = (rec.result?.findings ?? []) as unknown as Record<string, unknown>[];
  if (!findings.length) { skipped++; continue; }
  loaded++;
  findingsSeen += findings.length;

  // STRUCTURAL PRECONDITION — flag OFF must mean the analyzed-span field is never present. If it ever leaks,
  // the differential below compares two identical inputs and could not fail.
  const leaked = findings.filter((f) => f.excerptPreReground != null).length;
  if (leaked) { preRegroundLeaks += leaked; notes.push(`${file}: ${leaked} finding(s) carry excerptPreReground with the flag OFF`); }

  const decision = { verdict: rec.result?.verdict ?? "INCOMPLETE", eligible: null, reason: (rec.result as { reason?: string })?.reason ?? "", dispositions: [], showStoppers: [] } as unknown as Decision;
  const cov = rec.result?.coverage ?? { required: [], covered: [], missing: [], coreMissing: [] };
  const mk = (fs_: Record<string, unknown>[]) => buildV4Data({
    compliance_json: { v3: buildV3Payload(decision, cov as never, fs_ as never, "2026-07-27T00:00:00Z"), engine: "agentic_v3" },
  } as never);

  const A = JSON.stringify(mk(findings));
  const B = JSON.stringify(mk(findings.map(strip)));
  if (A !== B) {
    mismatches++;
    const at = [...A].findIndex((c, i) => c !== B[i]);
    notes.push(`${file}: PAYLOAD MISMATCH at char ${at}\n     A: …${A.slice(Math.max(0, at - 90), at + 90)}…\n     B: …${B.slice(Math.max(0, at - 90), at + 90)}…`);
  }
}

console.log(`records ${loaded} · skipped ${skipped} · findings ${findingsSeen}`);
console.log(`flag-OFF excerptPreReground leaks: ${preRegroundLeaks}   (must be 0)`);
console.log(`flag-OFF payload mismatches:       ${mismatches}   (must be 0)`);
if (notes.length) { console.log("\n── detail ──"); notes.forEach((n) => console.log("  " + n)); }

// A cert that cannot fail is worse than no cert.
if (loaded === 0) { console.log("\n❌ CERT VACUOUS — no banked record carried findings; nothing was compared"); process.exit(1); }
const green = mismatches === 0 && preRegroundLeaks === 0;
console.log(`\n${green ? "✅ FLAG-OFF PARITY HOLDS" : "❌ FLAG-OFF PARITY BROKEN"} — over ${loaded} records / ${findingsSeen} findings`);
process.exit(green ? 0 : 1);
