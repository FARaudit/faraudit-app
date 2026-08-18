// The suggestion panel must survive the first save. The rule it replaces returned codes
// ONLY while the saved list was empty, so "from contracts you have won" was an
// onboarding-only surface: it vanished on the first save and never came back.
import { suggestedNaics } from "./naics-suggestions";

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL  ${label}\n      got ${g}\n     want ${w}`); }
};

console.log("── the rule ──");
eq("nothing saved → every won code is offered",
  suggestedNaics([], ["541611", "236220"]), ["541611", "236220"]);
// THE REGRESSION THIS FILE EXISTS FOR.
eq("a saved list does NOT suppress the rest — the panel survives the first save",
  suggestedNaics(["332710"], ["332710", "541611"]), ["541611"]);
eq("everything won is already saved → nothing to offer",
  suggestedNaics(["332710", "541611"], ["332710", "541611"]), []);
eq("no wins → nothing to offer, whatever is saved",
  suggestedNaics(["332710"], []), []);

console.log("\n── shape discipline ──");
eq("whitespace does not make a saved code look new",
  suggestedNaics([" 541611 "], ["541611"]), []);
eq("duplicate wins are offered once",
  suggestedNaics([], ["541611", "541611"]), ["541611"]);
eq("blank and null entries are dropped, not offered",
  suggestedNaics([], ["", null, undefined, "  ", "541611"] as unknown[]), ["541611"]);
eq("null inputs are tolerated on both sides", suggestedNaics(null, null), []);

console.log("\n── planted positives — this gate must be able to fail ──");
// P1 · the fixture really does contain a code the customer has NOT saved, so the
// non-empty expectation above is not satisfied by an accidentally-empty input.
eq("P1 the win set genuinely holds an unsaved code",
  ["332710", "541611"].filter((c) => !["332710"].includes(c)), ["541611"]);
// P2 · the OLD rule, reproduced, must disagree with the new one on exactly that case —
// otherwise this file would pass against the behaviour it was written to prevent.
{
  const oldRule = (saved: string[], won: string[]) => (saved.length > 0 ? [] : won.slice());
  const before = oldRule(["332710"], ["332710", "541611"]);
  const after = suggestedNaics(["332710"], ["332710", "541611"]);
  eq("P2 the old suppress-when-saved rule returns nothing here", before, []);
  eq("P2 …and the new rule does not agree with it", after.length > 0, true);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed · ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
