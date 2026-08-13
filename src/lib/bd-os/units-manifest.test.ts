// UNITS-MANIFEST GATE — every money branch on the wire must declare its unit.
//
// WHY. This payload carries money in two units: derived totals in MILLIONS, award-level figures in RAW
// DOLLARS. Both are correct. Carrying both with nothing saying which is what printed $90.76B beside a
// $30.06B headline — a lifetime award value run through a formatter that assumes millions.
//
// The SERVER is now unit-safe by construction: `./money` makes the two types objects, so mixing them is
// a compile error (see money.test.ts). The BROWSER is plain JavaScript and gets none of that. So the
// payload declares itself, and this gate is what keeps the declaration honest — the failure mode it
// exists for is somebody adding a money branch and not adding it to the manifest, which would ship a
// silent third unit into a file whose whole subject is that ambiguity.
//
// ⛔ IT READS THE TYPE, NOT A LIST OF MY OWN. A gate whose expected set is hand-written next to the
// thing it checks passes by construction. The branch set is parsed out of `SpendingPayload`; the
// non-money branches are named explicitly and each is asserted to still EXIST, so a rename cannot
// silently shrink what is being checked.
//
// Run: npx tsx src/lib/bd-os/units-manifest.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { PAYLOAD_UNITS } from "./defense-spending";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const SRC_PATH = join(process.cwd(), "src/lib/bd-os/defense-spending.ts");
const SRC = readFileSync(SRC_PATH, "utf8");
const sf = ts.createSourceFile(SRC_PATH, SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** Top-level property names of `interface SpendingPayload`. */
function payloadBranches(): string[] {
  let out: string[] = [];
  sf.forEachChild((n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === "SpendingPayload") {
      out = n.members
        .filter(ts.isPropertySignature)
        .map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : ""))
        .filter(Boolean);
    }
  });
  return out;
}

// Branches that carry no money. Each is asserted to exist below: if one is renamed, this list stops
// covering it and the gate says so rather than quietly treating a money branch as exempt.
const NON_MONEY = [
  "state",                 // literal "ok"
  "as_of",                 // timestamp
  "window_note",           // prose
  "coverage",              // code lists and a display cap
  "FYS",                   // year labels
  "RECOMPETES_MEASURED",   // boolean
  "RECOMPETES_AT_CAP",     // NAICS codes pinned at our own collection limit
  "RECOMPETE_STORE_LIMIT", // a ROW count — recompetes stored per code, not money
  "unsupported",           // panel names
  "units"                  // the manifest itself
];

// ── R1 · THE PARSE FOUND THE REAL TYPE ───────────────────────────────────────
console.log("\nR1  THE BRANCH SET COMES FROM THE TYPE");
const branches = payloadBranches();
ok(branches.length > 8, "SpendingPayload parsed", `${branches.length} top-level branches`);
ok(branches.includes("BY_FY") && branches.includes("AWARD_ANALYTICS"),
  "the parse found the two branches that carry the two different units");

const missingExempt = NON_MONEY.filter((k) => !branches.includes(k));
ok(missingExempt.length === 0,
  "every branch named non-money still exists on the type",
  missingExempt.length ? `renamed or removed: ${missingExempt.join(", ")}` : "");

// ── R2 · EVERY MONEY BRANCH DECLARES ITS UNIT ────────────────────────────────
console.log("\nR2  EVERY MONEY BRANCH DECLARES ITS UNIT");
const money = branches.filter((b) => !NON_MONEY.includes(b)).sort();
const declared = Object.keys(PAYLOAD_UNITS).sort();
ok(money.length > 0, "there are money branches to check", money.join(", "));

const undeclared = money.filter((b) => !declared.includes(b));
ok(undeclared.length === 0,
  "no money branch ships without a declared unit",
  undeclared.length ? `ADD TO PAYLOAD_UNITS: ${undeclared.join(", ")}` : `${money.length} declared`);

const orphaned = declared.filter((b) => !money.includes(b));
ok(orphaned.length === 0,
  "the manifest declares nothing that is not on the payload",
  orphaned.length ? `stale entries: ${orphaned.join(", ")}` : "");

// ── R3 · THE VALUES ARE REAL UNITS, AND BOTH ARE PRESENT ─────────────────────
console.log("\nR3  THE DECLARED VALUES ARE UNITS");
const VALID = new Set(["dollars", "millions"]);
const badValue = Object.entries(PAYLOAD_UNITS).filter(([, v]) => !VALID.has(v));
ok(badValue.length === 0, "every declared value is a known unit",
  badValue.map(([k, v]) => `${k}=${v}`).join(", "));

const values = new Set(Object.values(PAYLOAD_UNITS));
// If this ever became single-unit the manifest would be pointless — and the fix
// would be to normalise the wire, not to delete the gate. Stated so a future
// reader knows which of the two changes they are making.
ok(values.has("dollars") && values.has("millions"),
  "BOTH units are still on the wire — the manifest is load-bearing, not decoration",
  [...values].join(" + "));
ok(PAYLOAD_UNITS.BY_FY === "millions", "BY_FY is millions — toM() converts it");
ok(PAYLOAD_UNITS.AWARD_ANALYTICS === "dollars",
  "AWARD_ANALYTICS is raw dollars — lifetime award value, passed through");

// ── R4 · PLANTED POSITIVE — the gate must go red on a new undeclared branch ──
console.log("\nR4  PLANTED POSITIVE — an undeclared money branch is caught");
// The check is re-run against a branch list with one extra name, exactly as adding a field to the
// interface would produce. An assertion that only ever sees the passing set proves nothing.
const withNew = [...branches, "SUBAWARD_FLOW"];
const wouldFail = withNew.filter((b) => !NON_MONEY.includes(b)).filter((b) => !declared.includes(b));
ok(wouldFail.includes("SUBAWARD_FLOW"),
  "adding a money branch without a unit is reported", `caught: ${wouldFail.join(", ")}`);
// And the mirror: a new EXEMPT branch must not be reported, or every prose field would fail the gate.
const withProse = [...branches, "note_2"];
const proseFails = withProse
  .filter((b) => !NON_MONEY.concat("note_2").includes(b))
  .filter((b) => !declared.includes(b));
ok(!proseFails.includes("note_2"), "NEGATIVE CONTROL: a branch named non-money is not reported");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
