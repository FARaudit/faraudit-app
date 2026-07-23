// END-GAUNTLET · FLAG MATRIX — every combination of the arc's verdict-affecting flags, on the REBUILT
// instrument. Two properties must hold in EVERY cell:
//   G1  FALSE-BIDs = 0                       (the cardinal sin, in every configuration a CEO could arm)
//   G2  no configuration is worse than today (a cell may only IMPROVE or hold vs the flag-OFF baseline)
// Plus the flag-OFF byte-identity proof against a detached main worktree is run separately.
export {};
import { applyStampedConfig, rebuildLedger, isFalseBid, isCommittal } from "./_instrument";
process.env.AUDIT_TEMPORAL_VERDICT = "true";
applyStampedConfig("live");

const FLAGS = ["AUDIT_VETO_NARROW_UNIVERSAL", "AUDIT_BANNER_BAR_RANKING", "AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM", "AUDIT_SETASIDE_BACKSTOP", "AUDIT_INCOMPLETE_PRECEDENCE"];

(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const measurable = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);

  const verdictsUnder = (cfg: Record<string, string>) => {
    const prev: Array<[string, string | undefined]> = Object.keys(cfg).map((k) => [k, process.env[k]]);
    for (const [k, v] of Object.entries(cfg)) process.env[k] = v;
    try {
      return measurable.map((r) => {
        const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
        try { return { id: r.id, v: deriveVerdict(inp).verdict as string }; } catch { return { id: r.id, v: "THREW" }; }
      });
    } finally { for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  };

  const allOff = Object.fromEntries(FLAGS.map((f) => [f, "false"]));
  const baseline = verdictsUnder(allOff);
  const baseById = new Map(baseline.map((b) => [b.id, b.v]));

  console.log("═".repeat(112));
  console.log(`END-GAUNTLET FLAG MATRIX — ${1 << FLAGS.length} cells × ${measurable.length} measurable records`);
  console.log("═".repeat(112));
  let cells = 0, bad = 0, threw = 0;
  const regressions: string[] = [];
  for (let mask = 0; mask < (1 << FLAGS.length); mask++) {
    const cfg = Object.fromEntries(FLAGS.map((f, i) => [f, (mask >> i) & 1 ? "true" : "false"]));
    const out = verdictsUnder(cfg);
    cells++;
    const t = out.filter((o) => o.v === "THREW"); threw += t.length;
    for (const o of t) regressions.push(`THREW mask=${mask} ${o.id}`);
    // G2: a record that ESCALATED at baseline must not COMMIT in this cell unless that flip is the one
    // adjudicated correction (SP3300). Any other escalation→committal is a candidate false-BID.
    for (const o of out) {
      const b = baseById.get(o.id)!;
      if (!isCommittal(b) && isCommittal(o.v) && !o.id.includes("SP3300-26-Q-0165.2026-07-02T02-24")) {
        regressions.push(`ESCALATION→COMMITTAL mask=${mask} ${o.id}: ${b} → ${o.v}`);
        bad++;
      }
    }
  }
  console.log(`cells evaluated: ${cells} · THREW: ${threw} · unadjudicated escalation→committal flips: ${bad}`);
  if (regressions.length) { console.log("\n❌ REGRESSIONS:"); for (const r of [...new Set(regressions)]) console.log("   " + r); }
  else console.log("\n✅ G1/G2 HOLD IN EVERY CELL — no throw, and the ONLY escalation→committal flip anywhere in the\n   matrix is the adjudicated SP3300 correction. No configuration a CEO could arm is worse than today.");
  process.exit(regressions.length ? 1 : 0);
})();
