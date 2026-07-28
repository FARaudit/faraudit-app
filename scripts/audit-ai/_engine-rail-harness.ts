// ENGINE RAIL HARNESS — run the REAL deterministic rail over REAL solicitation source, at $0.
//   npx tsx scripts/audit-ai/_engine-rail-harness.ts [--record=<substr>] [--verbose]
//
// WHY THIS EXISTS. ARC #747 spent three review rounds and 21 findings on E1/E2 without ever EXECUTING them.
// Every green was static — tsc, unit suites, or a cert that calls a library function directly. The one $0
// harness we had (_replay-harness.ts) stops at `deriveVerdict`, and both E1's head pass and E2's citation gate
// run in the orchestrator AFTER that, so it structurally could not reach the changed code. The only surface
// that could was a live paid run.
//
// It turns out no stub was needed. `runAgenticAudit` already has a PRODUCTION seam — `seedFindings`, the
// judgment-first rail (Brain #276/#279) — that skips the paid expert lenses and runs P1.5→P5 (sweep, temporal,
// dedup, verify, completeness, every re-typing guard, deriveVerdict, and the post-verdict passes E1/E2 added)
// over a supplied finding set. Feed it a banked record's REAL source and REAL findings and the whole rail runs
// with no model in the loop. This is production composition, not a mock: the only thing replaced is the
// proposer, which is itself a supported production entry point.
//
// $0 IS ENFORCED, NOT ASSERTED. `callModel` is a thrower and the API key is cleared before the rail runs. If
// any paid call is ever reached, this harness dies loudly instead of quietly spending money.
export {};
import * as fs from "fs";
import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

const DIR = path.join(__dirname, "run-records");
const argRec = (process.argv.find((a) => a.startsWith("--record=")) || "").split("=")[1];
const VERBOSE = process.argv.includes("--verbose");

// ── $0 ENFORCEMENT ──────────────────────────────────────────────────────────────────────────────────
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL REACHED — the seed rail must never call the model"); }) as never;

// The flags under test. Everything else is cleared so the two runs differ ONLY by these.
const E1 = "AUDIT_EXCERPT_HEAD_REGROUND";
const E2 = "AUDIT_CITATION_FIDELITY";

type Rec = { meta?: { sol?: string; runId?: string; flagEnv?: Record<string, string> }; result?: any };

const load = (): Array<{ file: string; rec: Rec; raw: string }> => {
  const out: Array<{ file: string; rec: Rec; raw: string }> = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
    if (argRec && !f.includes(argRec)) continue;
    try {
      const raw = fs.readFileSync(path.join(DIR, f), "utf8");
      const rec = JSON.parse(raw);
      const src = rec?.result?.inputs?.source;
      const findings = rec?.result?.findings;
      if (typeof src === "string" && src.length > 5000 && Array.isArray(findings) && findings.length) out.push({ file: f, rec, raw });
    } catch { /* unreadable record — skipped, counted below */ }
  }
  return out;
};

/** Run the real rail once, under an exact flag state.
 *
 *  FRESH SEED PER RUN, deliberately. An earlier revision parsed each record once and passed the same
 *  `result.findings` array to both the OFF and the ON run. On one record that produced a reproducible
 *  one-finding delta which the flag provably cannot cause — both reads of AUDIT_CITATION_FIDELITY happen
 *  after `deriveVerdict`, while the id it moved (`keyfact_detector#0`) is assigned hundreds of lines
 *  earlier. A direct check confirmed the rail does NOT mutate its caller's seed, so the cause is still
 *  unexplained and is tracked as an open question rather than papered over. Re-parsing per run removes the
 *  shared object from the experiment entirely, which is the correct methodology regardless of the cause:
 *  a differential harness must vary ONE thing. Until that anomaly is explained, treat single-digit deltas
 *  from this harness as unconfirmed and trust only the large, consistent signals. */
async function runRail(raw: string, flags: Record<string, string>) {
  const rec: Rec = JSON.parse(raw);   // fresh objects every run — see the note above
  for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) delete process.env[k];
  // Replay under the flag env the record itself ran with, so the ONLY delta between the two runs below is
  // E1/E2. Without this the rail would run under whatever the shell happened to carry.
  for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v;
  delete process.env[E1]; delete process.env[E2];
  for (const [k, v] of Object.entries(flags)) process.env[k] = v;

  const source: string = rec.result.inputs.source;
  const ctx: AuditToolContext = { fullSource: source, groundingSource: source } as AuditToolContext;
  return runAgenticAudit({
    ctx, experts: [], callModel,
    seedFindings: rec.result.findings as TypedFinding[],
    bidderProfile: rec.result.inputs.bidderProfile ?? null,
    manifestComplete: rec.result.inputs.manifestComplete,
  } as never);
}

const clip = (s: string, n = 88) => (s ?? "").replace(/\s+/g, " ").slice(0, n);
const WITHHELD = /\[citation withheld/;

(async () => {
  const recs = load();
  console.log(`records with real source + findings: ${recs.length}\n`);
  if (!recs.length) { console.log("NOTHING TO RUN — no banked record carries both source and findings."); process.exit(1); }

  let paidCalls = 0, ran = 0, failed = 0;
  const agg = { widened: 0, stopperWidened: 0, withheldCites: 0, reasonChanged: 0, verdictMoved: 0, coverageMoved: 0 };

  for (const { file, rec, raw } of recs) {
    let off: any, on: any;
    try {
      off = await runRail(raw, {});
      on = await runRail(raw, { [E1]: "true", [E2]: "true" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("PAID CALL REACHED")) { paidCalls++; console.log(`💸 ${file} — ${msg}`); }
      else { failed++; console.log(`⚠️  ${file} — rail threw: ${clip(msg, 140)}`); }
      continue;
    }
    ran++;

    // ── E1 · excerpts widened, and did the widening reach the SHOW-STOPPER band? ──
    const offF = off.findings ?? [], onF = on.findings ?? [];
    // KEY ON POSITION + IDENTITY, never on id alone. Finding ids are NOT guaranteed unique — the keyfact
    // emitter re-issued `keyfact_detector#0` on replayed records, and an id-keyed Map silently kept the last
    // one, so this harness reported a "widened excerpt" that was really two unrelated findings compared to
    // each other. The engine bug is fixed; the harness must not be able to resurrect the illusion.
    const key = (f: any, i: number) => `${i}|${f.lens}|${f.id ?? ""}|${f.requirement ?? ""}`;
    const byId = new Map(offF.map((f: any, i: number) => [key(f, i), f]));
    const widened = onF.filter((f: any, i: number) => {
      const o = byId.get(key(f, i));
      return o && typeof f.excerpt === "string" && f.excerpt !== o.excerpt;
    });
    const offS = off.decision?.showStoppers ?? [], onS = on.decision?.showStoppers ?? [];
    const byIdS = new Map(offS.map((f: any, i: number) => [key(f, i), f]));
    const stopperWidened = onS.filter((f: any, i: number) => {
      const o = byIdS.get(key(f, i));
      return o && typeof f.excerpt === "string" && f.excerpt !== o.excerpt;
    });

    // ── E2 · citations withheld anywhere the customer reads ──
    const withheld = (on.citationsWithheld ?? []).length;
    const reasonChanged = (off.decision?.reason ?? "") !== (on.decision?.reason ?? "");

    // ── THE SAFETY PROPERTY · neither flag may move a verdict or a coverage grade ──
    const verdictMoved = off.decision?.verdict !== on.decision?.verdict;
    const coverageMoved = JSON.stringify(off.coverage?.missing ?? []) !== JSON.stringify(on.coverage?.missing ?? []);

    agg.widened += widened.length; agg.stopperWidened += stopperWidened.length;
    agg.withheldCites += withheld; agg.reasonChanged += reasonChanged ? 1 : 0;
    agg.verdictMoved += verdictMoved ? 1 : 0; agg.coverageMoved += coverageMoved ? 1 : 0;

    const flag = verdictMoved || coverageMoved ? "❌" : (widened.length || withheld || stopperWidened.length ? "🔶" : "·");
    console.log(`${flag} ${rec.meta?.sol ?? "?"} ${file.slice(0, 34).padEnd(34)} verdict ${off.decision?.verdict}` +
      `${verdictMoved ? ` → ${on.decision?.verdict}  ⚠ MOVED` : ""}` +
      ` · widened ${widened.length}` + (stopperWidened.length ? ` (stoppers ${stopperWidened.length})` : "") +
      ` · cites withheld ${withheld}` + (reasonChanged ? " · reason CHANGED" : ""));

    if (VERBOSE) {
      for (const f of widened.slice(0, 3)) {
        const o = byId.get(key(f, onF.indexOf(f)));
        console.log(`      was: "${clip(o.excerpt)}"\n      now: "${clip(f.excerpt)}"`);
      }
      for (const w of (on.citationsWithheld ?? []).slice(0, 3)) console.log(`      withheld: ${w.raw} (${w.field})`);
      if (reasonChanged && WITHHELD.test(on.decision?.reason ?? "")) console.log(`      reason now: "${clip(on.decision.reason, 130)}"`);
    }
  }

  console.log(`\n${"─".repeat(96)}`);
  console.log(`ran ${ran} · rail failures ${failed} · PAID CALLS ${paidCalls}   (paid calls MUST be 0)`);
  console.log(`E1 excerpts widened ${agg.widened}  (of which reached the show-stopper band: ${agg.stopperWidened})`);
  console.log(`E2 citations withheld ${agg.withheldCites} · reasons rewritten ${agg.reasonChanged}`);
  console.log(`SAFETY — verdicts moved ${agg.verdictMoved} · coverage moved ${agg.coverageMoved}   (both MUST be 0)`);
  const clean = paidCalls === 0 && agg.verdictMoved === 0 && agg.coverageMoved === 0;
  const observed = agg.widened + agg.withheldCites > 0;
  console.log(clean
    ? (observed ? "\n✅ RAN CLEAN — the flags changed what the reader sees and moved no verdict."
                : "\n⚪ RAN CLEAN but the flags changed NOTHING on this corpus — the run observed no effect, so it proves non-interference only.")
    : "\n❌ NOT CLEAN — see above.");
  process.exit(clean ? 0 : 1);
})();
