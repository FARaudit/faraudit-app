// GATE — the L3 finder caches the document prefix ONLY when a second call can read it back.
//
// THE DEFECT, measured on live paid run 3b5bba30 (W911SG27BA002, 2026-08-06). The caching in
// makeSectionFinderCaller was written for "§L then §M" — two locates sharing one document prefix, the first
// writing and the second reading. But `targetKeys` is filtered to the keys the DETERMINISTIC slicer did not
// already find, so it is routinely ONE. On that run §L was found deterministically, only §M was targeted, and
// the single finder call cache-wrote 752,793 tokens — the entire 2,876,257-char source — for an 11-token
// "not located" that nothing ever read.
//
// THE ECONOMICS ARE THE WHOLE POINT, so this gate asserts them rather than trusting the comment. A cache write
// costs 1.25x base input; a read costs 0.1x. One write with no read is a flat 1.25x LOSS. Break-even is TWO
// calls. Leg 1 proves the arithmetic in both directions, so a future "let's just always cache" cannot pass.
//
// ⚠ WHAT THIS DOES NOT FIX. Not caching saves the 0.25x premium — $0.94 on that run. The 752,793 input tokens
// themselves ($2.26 uncached) are untouched: the finder still ships the whole solicitation to locate one
// section. That is a larger, separate decision and is deliberately NOT made here.
//
// PLANTED-POSITIVE PROOF — three plants, each restored, each turning its named leg red:
//   A  finderCacheWouldPay returns true for 1        → leg 2 (a lone call caches again)
//   B  drop targetKeyCount from the dispatch site    → leg 3 (the count never reaches the caller)
//   C  invert the break-even to >=3                  → leg 1 + leg 4 (two shared calls stop caching)
//
//   npx tsx src/lib/finder-cache-shape.test.ts

import { finderCacheWouldPay, makeSectionFinderCaller, runSectionFinder, type SectionFinderCall } from "./audit-section-finder";

let failures = 0;
const fail = (leg: string, msg: string) => { failures++; console.error(`  ✗ ${leg} — ${msg}`); };
const pass = (leg: string, msg: string) => console.log(`  ✓ ${leg} — ${msg}`);

/** Anthropic prompt-cache pricing, as multiples of base input price. */
const WRITE = 1.25, READ = 0.10;
/** Cost in base-input-equivalents of N calls over the same prefix, cached vs not. */
const cached = (n: number, tok: number) => tok * WRITE + tok * READ * (n - 1);
const uncached = (n: number, tok: number) => tok * n;

async function main() {
  console.log("GATE — L3 finder cache shape\n");

  // ── LEG 1 · THE ARITHMETIC — caching must lose at 1 call and win at 2 ──
  {
    const T = 752_793; // the tokens actually written on run 3b5bba30
    const one = { c: cached(1, T), u: uncached(1, T) };
    const two = { c: cached(2, T), u: uncached(2, T) };
    if (!(one.c > one.u)) fail("1 economics", `caching one call should COST more (cached ${one.c} vs ${one.u})`);
    else if (!(two.c < two.u)) fail("1 economics", `caching two calls should SAVE (cached ${two.c} vs ${two.u})`);
    else if (finderCacheWouldPay(1)) fail("1 economics", "predicate says cache at 1 call, but the arithmetic says that loses");
    else if (!finderCacheWouldPay(2)) fail("1 economics", "predicate refuses to cache at 2 calls, but the arithmetic says that wins");
    else pass("1 economics", `1 call: cached ${(one.c / one.u).toFixed(2)}x worse · 2 calls: cached ${(two.c / two.u).toFixed(2)}x better — predicate agrees with both`);
  }

  // ── LEG 2 · ONE TARGET KEY ⇒ NO cachedSystemPrefix, and the document rides the user turn ──
  // The live defect exactly: §L already found deterministically, §M the only target.
  {
    interface Seen { cachedSystemPrefix?: string; user: string }
    const box: { v: Seen | null } = { v: null };
    const call = makeSectionFinderCaller(async (a) => { box.v = { cachedSystemPrefix: a.cachedSystemPrefix, user: a.user }; return JSON.stringify({ located: false, anchor: null }); }, "claude-sonnet-4-6");
    process.env.AUDIT_PROMPT_CACHE = "true";
    await call({ fullSource: "DOC BODY HERE", sectionKey: "M", sectionIntent: "evaluation factors", targetKeyCount: 1 });
    const seen = box.v;
    if (!seen) fail("2 one-key", "the finder never called through");
    else if (seen.cachedSystemPrefix !== undefined) fail("2 one-key", "A LONE CALL STILL WRITES A CACHE NOBODY CAN READ — the live 752,793-token loss");
    else if (!seen.user.includes("DOC BODY HERE")) fail("2 one-key", "cache skipped but the document was dropped from the prompt — the finder would be blind");
    else pass("2 one-key", "no cachedSystemPrefix, document carried in the user turn (uncached path, prompt intact)");
  }

  // ── LEG 3 · runSectionFinder must PASS the real count through ──
  // The count is only knowable inside runSectionFinder; if it does not reach the caller the fix is inert.
  {
    const seenCounts: Array<number | undefined> = [];
    const stub: SectionFinderCall = async ({ targetKeyCount }) => { seenCounts.push(targetKeyCount); return { located: false, anchor: null }; };
    await runSectionFinder({ fullSource: "x".repeat(200), targetKeys: ["M"], finder: stub });
    await runSectionFinder({ fullSource: "x".repeat(200), targetKeys: ["L", "M"], finder: stub });
    if (seenCounts[0] !== 1) fail("3 threading", `single-key run reported targetKeyCount=${seenCounts[0]} (expected 1) — the fix never reaches the caller`);
    else if (seenCounts[1] !== 2) fail("3 threading", `two-key run reported targetKeyCount=${seenCounts[1]} (expected 2)`);
    else pass("3 threading", "runSectionFinder reports the real key count (1 and 2) to the caller");
  }

  // ── LEG 4 · TWO TARGET KEYS ⇒ caching still applies (no regression on the shape it was built for) ──
  {
    let prefix: string | undefined;
    const call = makeSectionFinderCaller(async (a) => { prefix = a.cachedSystemPrefix; return JSON.stringify({ located: false, anchor: null }); }, "claude-sonnet-4-6");
    process.env.AUDIT_PROMPT_CACHE = "true";
    await call({ fullSource: "DOC BODY HERE", sectionKey: "L", sectionIntent: "instructions", targetKeyCount: 2 });
    if (prefix === undefined) fail("4 two-key", "caching was dropped for a TWO-key run — that is the shape it pays on");
    else if (!prefix.includes("DOC BODY HERE")) fail("4 two-key", "cached prefix does not carry the document");
    else pass("4 two-key", "two keys ⇒ cachedSystemPrefix still set (byte-identical to prior behaviour)");
  }

  // ── LEG 5 · FLAG OFF ⇒ never cached, whatever the count ──
  {
    delete process.env.AUDIT_PROMPT_CACHE;
    let prefix: string | undefined = "sentinel";
    const call = makeSectionFinderCaller(async (a) => { prefix = a.cachedSystemPrefix; return JSON.stringify({ located: false, anchor: null }); }, "claude-sonnet-4-6");
    await call({ fullSource: "DOC", sectionKey: "L", sectionIntent: "i", targetKeyCount: 2 });
    if (prefix !== undefined) fail("5 flag-off", "AUDIT_PROMPT_CACHE unset but a cached prefix was still sent");
    else pass("5 flag-off", "flag off ⇒ no caching at any key count");
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
