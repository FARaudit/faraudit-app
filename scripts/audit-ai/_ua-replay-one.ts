// U-A corpus sweep · per-record runner — replays ONE banked record under ITS OWN flagEnv (faithful base,
// import-time consts included since env is injected before the engine import), derives the verdict with
// AUDIT_COVERAGE_CAP_NOT_MUTE OFF then ON (call-time flag), prints one JSON line. Spawned per record by
// _ua-corpus-sweep.sh so each record gets its own process env.
import { readFileSync } from "fs";

const file = process.argv[2];
const rec = JSON.parse(readFileSync(file, "utf8"));
const inputs = rec?.result?.inputs;
const fe: Record<string, string> = rec?.meta?.flagEnv ?? {};
if (!inputs) { console.log(JSON.stringify({ file, skip: "no result.inputs" })); process.exit(0); }
for (const [k, v] of Object.entries(fe)) if (v !== undefined) process.env[k] = v;

(async () => {
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "false";
  const off = deriveVerdict(inputs);
  process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "true";
  const on = deriveVerdict(inputs);
  console.log(JSON.stringify({
    file: file.split("/").pop(),
    sol: rec.meta?.sol ?? null,
    recorded: rec.result?.verdict ?? null,
    off: { v: off.verdict, r: (off.reason ?? "").slice(0, 110) },
    on: { v: on.verdict, r: (on.reason ?? "").slice(0, 110) },
    flipped: off.verdict !== on.verdict,
  }));
})();
