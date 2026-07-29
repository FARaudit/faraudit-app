// NAICS size-standard single-source verification.
//
// Asserts (1) every display value getNaicsSizeStandard() emits matches the SBA
// Table of Size Standards effective 2023-03-17 (primary source, xlsx downloaded
// from sba.gov/document/support-table-size-standards on 2026-07-29), (2) the
// honest-fail contract — unknown NAICS → null from sizeStandardFor(), pointer
// string from the display helper, never a guessed number — and (3) structurally,
// that audit-engine.ts no longer carries its own NAICS table (single source).
//
// RED baseline (pre-fix): 541512/541519 showed "150 employees" (the ITVAR
// exception under 541519 footnote 18, not either code's base standard — SBA says
// $34M receipts for both); 336414 showed 1,250 (SBA: 1,300); 332722 showed 500
// (SBA: 600).
import { readFileSync } from "node:fs";
import { getNaicsSizeStandard } from "../src/lib/audit-engine";
import { sizeStandardFor } from "../src/lib/sba-size-standards";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  →  ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`);
}

// ── Display helper vs SBA primary source (all 11 codes the engine table carried)
check("541512 Computer Systems Design", getNaicsSizeStandard("541512"), "$34M avg annual receipts");
check("541519 Other Computer Related", getNaicsSizeStandard("541519"), "$34M avg annual receipts");
check("336414 Guided Missile & Space Vehicle", getNaicsSizeStandard("336414"), "1,300 employees");
check("332722 Bolt, Nut, Screw Mfg", getNaicsSizeStandard("332722"), "600 employees");
check("336411 Aircraft Mfg", getNaicsSizeStandard("336411"), "1,500 employees");
check("336412 Aircraft Engine Mfg", getNaicsSizeStandard("336412"), "1,500 employees");
check("336413 Other Aircraft Parts", getNaicsSizeStandard("336413"), "1,250 employees");
check("332710 Machine Shops", getNaicsSizeStandard("332710"), "500 employees");
check("332721 Precision Turned Product", getNaicsSizeStandard("332721"), "500 employees");
check("541330 Engineering Services", getNaicsSizeStandard("541330"), "$25.5M avg annual receipts");
check("561210 Facilities Support", getNaicsSizeStandard("561210"), "$47M avg annual receipts");

// ── Honest-fail contract
check("unknown code → pointer string", getNaicsSizeStandard("999999"), "See SBA Table of Size Standards");
check("null → pointer string", getNaicsSizeStandard(null), "See SBA Table of Size Standards");
check("unknown code → null (structured)", sizeStandardFor("999999"), null);
check("malformed code → null (structured)", sizeStandardFor("5415"), null);
check("541512 structured", sizeStandardFor("541512"), { kind: "receipts", maxReceiptsUsd: 34_000_000 });
check("336414 structured", sizeStandardFor("336414"), { kind: "employees", maxEmployees: 1300 });

// ── Single-source structural check: no second NAICS table in audit-engine.ts
const engineSrc = readFileSync(new URL("../src/lib/audit-engine.ts", import.meta.url), "utf8");
check("audit-engine.ts carries no own NAICS table", /NAICS_SIZE_STANDARDS\s*:/.test(engineSrc), false);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed — single source, SBA-verified.");
