// $0 regression lock for ROUTER PRECEDENCE AT ZERO UCF HEADERS
// (src/lib/panel-adapter.ts, flag AUDIT_ADAPTER_ROUTER_PRECEDENCE).
// Run: npx tsx src/lib/adapter-router-precedence.test.ts
//
// SUBJECT: the production `mergeSectionText` / `ROUTER_PRECEDENCE_ENABLED`, which decide who wins the keys the
// commercial content router and the UCF boundary detector SHARE.
//
// THE RISK THIS LOCKS — three ways this change could be wrong, each silent:
//   • NOT INERT WHEN OFF. The flag ships default-OFF and must be byte-identical to the shipped merge until a CEO
//     arms it. An OFF path that differs by one key is a deploy nobody authorised.
//   • NOT INERT ON A GENUINE UCF PACKAGE. The overlay exists for real reasons — a package that labels its parts
//     "Section L"/"Section M" gets better slices from the detector than from the router's anchors. The inversion
//     is scoped to `ucfHeaders === 0` precisely so it cannot reach that case; if the scope leaks, the fix breaks
//     the thing it was careful not to touch.
//   • KEY LOSS. This is a PRECEDENCE change, not a filter. Whichever way the merge runs, the key SET must be the
//     union — a fix that silently drops a key the detector alone produced would trade 48% of one loss for another.
// The fixture numbers are the REAL banked package FA813726R0033 (ucfHeaderCount=0), not invented magnitudes:
// §C 113,406 → 160 chars and §I 117,134 → 18,307 is what the shipped merge does to it.
import { mergeSectionText, ROUTER_PRECEDENCE_ENABLED } from "./panel-adapter";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

// FA813726R0033, as the two maps actually came out of the adapter (char counts real, text stubbed to that length).
const chars = (n: number, c: string) => c.repeat(n);
const BASE = { A: chars(1972, "a"), B: chars(6311, "b"), C: chars(113406, "c"), I: chars(117134, "i"), L: chars(23926, "l"), M: chars(16061, "m") };
const UCF  = { A: chars(279, "A"),  B: chars(555, "B"),  C: chars(160, "C"),    I: chars(18307, "I"),  L: chars(21871, "L"), M: chars(14363, "M"), H: chars(4000, "H") };
const sum = (m: Record<string, string>) => Object.values(m).reduce((a, s) => a + s.length, 0);
const set = (m: Record<string, string>) => Object.keys(m).sort().join(",");

const withFlag = <T,>(v: string | undefined, fn: () => T): T => {
  const restore = process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE;
  if (v === undefined) delete process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE; else process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE = v;
  try { return fn(); } finally {
    if (restore === undefined) delete process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE; else process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE = restore;
  }
};

console.log("── the flag reads ONLY the exact string \"true\" (absence is OFF, never a truthy accident)");
for (const v of [undefined, "", "false", "TRUE", "True", "1", "yes", "on"])
  withFlag(v, () => ok(`AUDIT_ADAPTER_ROUTER_PRECEDENCE=${JSON.stringify(v)} ⇒ OFF`, ROUTER_PRECEDENCE_ENABLED() === false));
withFlag("true", () => ok('AUDIT_ADAPTER_ROUTER_PRECEDENCE="true" ⇒ ON', ROUTER_PRECEDENCE_ENABLED() === true));

console.log("── FLAG-OFF is the shipped merge, byte-identical, at every header count");
for (const hdrs of [0, 1, 3, 12]) withFlag("false", () => {
  const got = mergeSectionText(BASE, UCF, hdrs);
  const shipped = { ...BASE, ...UCF };                       // panel-adapter.ts as it shipped, verbatim
  ok(`hdrs=${hdrs} · routerWins=false`, got.routerWins === false);
  ok(`hdrs=${hdrs} · byte-identical to the shipped merge`, JSON.stringify(got.sectionText) === JSON.stringify(shipped));
  ok(`hdrs=${hdrs} · §C is still the detector's 160 chars (the defect, intact when OFF)`, got.sectionText.C.length === 160);
});

console.log("── FLAG-ON is INERT on a genuine UCF package (ucfHeaders > 0) — the overlay case is untouched");
for (const hdrs of [1, 2, 3, 7, 13]) withFlag("true", () => {
  const got = mergeSectionText(BASE, UCF, hdrs);
  ok(`hdrs=${hdrs} · routerWins=false`, got.routerWins === false);
  ok(`hdrs=${hdrs} · byte-identical to the shipped merge`, JSON.stringify(got.sectionText) === JSON.stringify({ ...BASE, ...UCF }));
});

console.log("── FLAG-ON at ucfHeaders===0 — the router wins the SHARED keys, and only those");
withFlag("true", () => {
  const got = mergeSectionText(BASE, UCF, 0);
  ok("routerWins=true", got.routerWins === true);
  ok(`§C restored 160 → 113,406 (${got.sectionText.C.length.toLocaleString()})`, got.sectionText.C.length === 113406);
  ok(`§I restored 18,307 → 117,134 (${got.sectionText.I.length.toLocaleString()})`, got.sectionText.I.length === 117134);
  ok("every shared key now carries the ROUTER's text", ["A", "B", "C", "I", "L", "M"].every((k) => got.sectionText[k] === (BASE as any)[k]));
  ok("H — a key ONLY the detector produced — is still present (precedence, not a filter)", got.sectionText.H === UCF.H);
  ok(`key SET is the union either way (${set(got.sectionText)})`, set(got.sectionText) === set({ ...BASE, ...UCF }));
  ok(`total chars 72,182 → 278,810 + H (${sum(got.sectionText).toLocaleString()})`, sum(got.sectionText) === sum(BASE) + UCF.H.length);
});

console.log("── the merge NEVER drops a key, in any state (the property, not one example)");
for (const hdrs of [0, 1]) for (const v of ["true", "false"]) withFlag(v, () => {
  const got = mergeSectionText(BASE, UCF, hdrs);
  ok(`flag=${v} hdrs=${hdrs} · union preserved`, set(got.sectionText) === set({ ...BASE, ...UCF }));
});

console.log("── degenerate inputs do not manufacture keys");
withFlag("true", () => {
  ok("both empty ⇒ {}", set(mergeSectionText({}, {}, 0).sectionText) === "");
  ok("router empty ⇒ detector survives whole", JSON.stringify(mergeSectionText({}, UCF, 0).sectionText) === JSON.stringify(UCF));
  ok("detector empty ⇒ router survives whole", JSON.stringify(mergeSectionText(BASE, {}, 0).sectionText) === JSON.stringify(BASE));
});

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
