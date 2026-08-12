// MONEY-UNIT GATE — the invariant is enforced by the COMPILER, so the gate has to run the compiler.
//
// The defect this exists for was an addition across units: raw dollars summed into a millions total,
// printing $90.76B beside a $30.06B headline. A runtime test cannot see that — both values are just
// numbers at runtime and the wrong sum is a perfectly valid one. So the assertions below are about
// which programs tsc REFUSES.
//
// ⛔ THE NEGATIVE CONTROL IS THE LOAD-BEARING PART. A gate that only checks "the bad program fails"
// passes just as well when tsc fails on EVERYTHING — a broken import path, a missing tsconfig, a typo
// in the fixture header. So the correct program must compile clean in the same run, and the bad ones
// must fail with the specific error, not merely fail.
//
// Run: npx tsx src/lib/bd-os/money.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  dollars, millions, toMillions, addD, addM, sumD, sumM, maxD,
  pctOfD, pctOfM, gtD, cmpD, wire, wireOrNull
} from "./money";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

// ── R1 · RUNTIME BEHAVIOUR ───────────────────────────────────────────────────
console.log("\nR1  THE HELPERS COMPUTE WHAT THEY SAY");
ok(wire(toMillions(dollars(90_760_000_000))) === 90_760, "toMillions: $90.76B → 90760 (millions)");
ok(wire(sumD([dollars(1), dollars(2), dollars(3)])) === 6, "sumD adds");
ok(wire(sumM([])) === 0, "sumM of nothing is 0, not NaN");
ok(wire(addM(millions(1.5), millions(2.25))) === 3.75, "addM adds");
ok(wire(maxD(dollars(5), dollars(9))) === 9, "maxD picks the larger");
ok(pctOfD(dollars(25), dollars(100)) === 25, "pctOfD is a percentage");
ok(pctOfD(dollars(1), dollars(0)) === null, "a share of ZERO is null, never 0%");
ok(pctOfD(dollars(1), dollars(-5)) === null, "a share of a NEGATIVE whole is null");
ok(pctOfM(millions(1), millions(4)) === 25, "pctOfM is a percentage");
ok(gtD(dollars(2), dollars(1)) && !gtD(dollars(1), dollars(2)), "gtD compares");
ok(cmpD(dollars(1), dollars(2)) > 0, "cmpD sorts descending");
ok(wireOrNull(null) === null, "wireOrNull passes null through");
// NaN in a total is worse than a wrong number: it renders as blank or "$NaN" and
// looks like an absent measurement rather than a bug.
ok(wire(dollars(NaN)) === 0, "NaN becomes 0, not NaN");
ok(wire(dollars(Infinity)) === 0, "Infinity becomes 0");
ok(wire(sumD([dollars(5), dollars(NaN)])) === 5, "one bad input does not poison a sum");

// ── R2 · WHAT THE COMPILER MUST REFUSE ───────────────────────────────────────
console.log("\nR2  THE COMPILER REFUSES A CROSS-UNIT PROGRAM");

const MONEY = resolve(process.cwd(), "src/lib/bd-os/money");
const dir = mkdtempSync(join(tmpdir(), "money-gate-"));
const header = `import { dollars, millions, toMillions, addD, addM, sumD, pctOfD, wire } from ${JSON.stringify(MONEY)};\n`;

/** name → [source, mustCompile] */
const CASES: Array<{ name: string; body: string; mustCompile: boolean; why: string }> = [
  {
    name: "ok-correct", mustCompile: true,
    why: "THE NEGATIVE CONTROL — correct code must compile, or every result below is meaningless",
    body: `const total = toMillions(sumD([dollars(1e9), dollars(2e9)]));
           const more = addM(total, millions(5));
           export const out: number = wire(more);
           export const share = pctOfD(dollars(1), dollars(4));`
  },
  {
    name: "bad-plus", mustCompile: false,
    why: "THE ACTUAL DEFECT — a raw-dollar amount added to a millions total",
    body: `export const x = dollars(90_760_000_000) + millions(30_060);`
  },
  {
    name: "bad-addD-mixed", mustCompile: false,
    why: "the same addition through the typed helper",
    body: `export const x = addD(dollars(1), millions(2));`
  },
  {
    name: "bad-assign", mustCompile: false,
    why: "a dollar amount stored in a millions slot",
    body: `const m: import(${JSON.stringify(MONEY)}).Millions = dollars(1);
           export const x = wire(m);`
  },
  {
    name: "bad-ratio-mixed", mustCompile: false,
    why: "a percentage of two different units — the shape that invents a 300x error",
    body: `export const x = pctOfD(dollars(1), millions(2));`
  },
  {
    name: "bad-raw-number", mustCompile: false,
    why: "a bare number handed to a money helper, bypassing the units entirely",
    body: `export const x = addD(dollars(1), 2 as unknown as number);`
  },
  {
    name: "bad-sum-mixed", mustCompile: false,
    why: "a mixed array — the sum that hides inside a .reduce()",
    body: `export const x = sumD([dollars(1), millions(2)]);`
  }
];

for (const c of CASES) writeFileSync(join(dir, `${c.name}.ts`), header + c.body + "\n");

// One tsc run over the whole fixture set: per-file runs would multiply a ~4s
// compile by seven and tell us nothing extra.
mkdirSync(join(dir, "out"), { recursive: true });
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    strict: true, noEmit: true, target: "ES2020", module: "ESNext",
    moduleResolution: "bundler", skipLibCheck: true, types: []
  },
  files: CASES.map((c) => `${c.name}.ts`)
}, null, 2));

let raw = "";
try {
  execFileSync("npx", ["tsc", "-p", join(dir, "tsconfig.json")],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  const err = e as { stdout?: string; stderr?: string };
  raw = `${err.stdout || ""}${err.stderr || ""}`;
}

const erroredIn = (name: string) =>
  raw.split("\n").some((l) => l.includes(`${name}.ts(`) && l.includes("error TS"));

ok(raw.length > 0, "tsc reported at least one error across the fixture set",
  raw.length ? "" : "tsc was silent — the fixtures may not have compiled at all");

for (const c of CASES) {
  const errored = erroredIn(c.name);
  if (c.mustCompile) {
    ok(!errored, `COMPILES: ${c.name} — ${c.why}`,
      errored ? raw.split("\n").filter((l) => l.includes(`${c.name}.ts(`)).slice(0, 2).join(" | ") : "");
  } else {
    ok(errored, `REJECTED: ${c.name} — ${c.why}`,
      errored ? "" : "tsc accepted a cross-unit program");
  }
}

// The `+` case must fail for the RIGHT reason. "error TS2365: Operator '+' cannot be applied" is the
// property being claimed; a fixture that failed on a bad import would also be "rejected" and would
// prove nothing about units.
const plusLine = raw.split("\n").find((l) => l.includes("bad-plus.ts(")) || "";
ok(/TS2365|cannot be applied/i.test(plusLine),
  "the `+` rejection is an OPERATOR error, not an incidental one", plusLine.trim().slice(0, 140));

rmSync(dir, { recursive: true, force: true });

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
