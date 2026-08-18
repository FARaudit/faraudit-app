// U-A.2 corpus sweep · per-record runner. Replays ONE banked record under ITS OWN flagEnv (faithful base;
// env is injected before the engine import so import-time consts are captured correctly), with cap-not-mute
// ON in both legs, and derives the verdict with AUDIT_UA_BOND_NOT_FIRM_FACT OFF then ON. Prints one JSON line.
// One process per record — spawned by _ua2-bond-sweep.sh.
//
// This measures the VERDICT, not the `kind`. Releasing the mute only removes ONE cap; every bar / honest-fail
// pole below it still runs at full force, so a released record may still legitimately land on NHR or INCOMPLETE
// for its own separate reason. That distinction is the whole point of the sweep.
import { readFileSync } from "fs";

const file = process.argv[2];
const rec = JSON.parse(readFileSync(file, "utf8"));
const inputs = rec?.result?.inputs;
const fe: Record<string, string> = rec?.meta?.flagEnv ?? {};
if (!inputs) { console.log(JSON.stringify({ file: file.split("/").pop(), skip: "no result.inputs" })); process.exit(0); }
for (const [k, v] of Object.entries(fe)) if (v !== undefined) process.env[k] = v;

(async () => {
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  // Cap-not-mute is the regime under which U-A.2 has any effect at all; hold it ON in both legs so the only
  // variable is the bond token itself.
  process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "true";
  process.env.AUDIT_UA_BOND_NOT_FIRM_FACT = "false";
  const off = deriveVerdict(inputs);
  process.env.AUDIT_UA_BOND_NOT_FIRM_FACT = "true";
  const on = deriveVerdict(inputs);
  console.log(JSON.stringify({
    file: file.split("/").pop(),
    sol: rec.meta?.sol ?? null,
    recorded: rec.result?.verdict ?? null,
    bucket: (inputs?.coverageV2?.disqualifierUncovered ?? []).length,
    off: { v: off.verdict, r: (off.reason ?? "").slice(0, 150) },
    on: { v: on.verdict, r: (on.reason ?? "").slice(0, 150) },
    flipped: off.verdict !== on.verdict,
  }));
})();
