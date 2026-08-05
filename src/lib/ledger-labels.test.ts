// LEDGER IDENTITY — CI gate (src/lib/*.test.ts is the glob CI actually runs).
// Run: npx tsx src/lib/ledger-labels.test.ts
//
// THE DEFECT: every expert call landed in the cost ledger as the literal string "expert". audit-package.ts
// constructs ONE makeAnthropicCallModel and hands the same instance to all five lenses, so the construction-time
// `label` option could not vary by lens — the capability shipped and its only caller had no way to use it.
// Consequence, measured on live run e5f177aa: 46 sonnet calls, 992,418 cache writes against 630,562 reads, and
// no way to attribute any of it. Every open cost question about that run is answerable from data already banked
// on disk; the calls simply could not be told apart.
//
// WHAT IS ASSERTED: the label is per-CALL, distinct per lens AND per turn, the max_tokens retry is
// distinguishable from the attempt it replaces, and an unlabelled call still reports exactly what it does today.
//
// Drives the REAL makeAnthropicCallModel and runAgenticExpert, stubbing only the SDK leaf — so it asserts on the
// usage rows production emits, not on a mirror of them.

import assert from "node:assert";
import { makeAnthropicCallModel, type ExpertUsage } from "./audit-expert";

let passed = 0;
const ok = (label: string, cond: boolean) => { assert.ok(cond, `FAIL — ${label}`); console.log(`  ✓ ${label}`); passed++; };

const USAGE = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 50 };

/** Stub SDK. `stopReasons` is consumed one per call so a max_tokens attempt can be followed by a clean retry. */
function stubClient(stopReasons: string[] = ["end_turn"]) {
  let i = 0;
  return {
    messages: {
      create: async () => ({ content: [], stop_reason: stopReasons[Math.min(i++, stopReasons.length - 1)], usage: USAGE }),
    },
  };
}

async function labelsFrom(
  stopReasons: string[],
  callArgs: { label?: string },
  ctorOpts?: { label?: string },
): Promise<string[]> {
  const seen: ExpertUsage[] = [];
  const onUsage = (u: ExpertUsage) => { seen.push(u); };
  const callModel = makeAnthropicCallModel(stubClient(stopReasons) as never, "claude-sonnet-4-6", { onUsage, ...ctorOpts });
  await callModel({ system: "s", userTask: "t", priorToolResults: [], forceSubmit: false, ...callArgs });
  // `label` is optional on ExpertUsage. An ABSENT label is a distinct failure from a wrong one, so surface it
  // as its own token rather than coercing to "" — otherwise a regression that drops the field entirely would
  // read as an empty-string mismatch and the gate's message would point at the wrong defect.
  return seen.map((u) => u.label ?? "<no-label-emitted>");
}

async function main() {
console.log("── ledger identity ──");

// ── THE CORE ASSERTION: the per-call label wins ───────────────────────────────────────────────
ok("a per-call label reaches the usage row",
  (await labelsFrom(["end_turn"], { label: "pricing_analyst#3" }))[0] === "pricing_analyst#3");

// ── DEFAULT UNCHANGED — an unlabelled call reports exactly what it does today ──────────────────
ok('no label anywhere ⇒ still "expert" (byte-identical to production today)',
  (await labelsFrom(["end_turn"], {}))[0] === "expert");
ok("a construction-time label still works when no per-call label is given (existing callers unaffected)",
  (await labelsFrom(["end_turn"], {}, { label: "panel:verifier" }))[0] === "panel:verifier");
ok("the per-call label OVERRIDES the construction-time one — that is the whole point",
  (await labelsFrom(["end_turn"], { label: "former_ko#2" }, { label: "expert" }))[0] === "former_ko#2");

// ── THE RETRY MUST BE COUNTABLE ───────────────────────────────────────────────────────────────
// A max_tokens stop fires a SECOND paid generation. Tallying it under the same label as the attempt
// it replaces is why "how often does the retry fire" has never been answerable from the ledger.
const retried = await labelsFrom(["max_tokens", "end_turn"], { label: "contracts_attorney#5" });
ok("a max_tokens retry emits TWO usage rows, not one", retried.length === 2);
ok("the retry row is distinguishable from the attempt it replaces",
  retried[0] === "contracts_attorney#5" && retried[1] === "contracts_attorney#5+retry");
ok("an unlabelled retry is still distinguishable (falls back without collapsing into the attempt)",
  JSON.stringify(await labelsFrom(["max_tokens", "end_turn"], {})) === JSON.stringify(["expert", "expert+retry"]));

// ── DISTINCTNESS IS THE PROPERTY THAT MAKES THE LEDGER READABLE ────────────────────────────────
// Five lenses x eight turns must produce forty distinct labels. If any two collide, per-turn cache
// behaviour — the thing the 992,418/630,562 inversion needs — stays unattributable.
const LENSES = ["capture_strategist", "contracts_attorney", "pricing_analyst", "former_ko", "proposal_manager"];
const all: string[] = [];
for (const lens of LENSES) {
  for (let turn = 1; turn <= 8; turn++) all.push(...(await labelsFrom(["end_turn"], { label: `${lens}#${turn}` })));
}
ok(`5 lenses x 8 turns produce 40 DISTINCT labels (got ${new Set(all).size})`,
  all.length === 40 && new Set(all).size === 40);
ok("every label names both its lens and its turn", all.every((l) => /^[a-z_]+#[1-8]$/.test(l)));

// ── THE ROW STILL CARRIES ITS COST FIELDS ─────────────────────────────────────────────────────
// A label is worthless if it arrived at the cost of the numbers it labels.
const rows: ExpertUsage[] = [];
const cm = makeAnthropicCallModel(stubClient() as never, "claude-sonnet-4-6", { onUsage: (u) => rows.push(u) });
await cm({ system: "s", userTask: "t", priorToolResults: [], label: "x#1" });
ok("the labelled row still carries cache_write / cache_read / tokens / model",
  rows[0].cache_write === 100 && rows[0].cache_read === 50 && rows[0].input_tokens === 10 && rows[0].model === "claude-sonnet-4-6");

console.log(`\n✓ ${passed}/${passed} passed — ledger identity`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
