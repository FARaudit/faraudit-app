// Run: npx tsx src/lib/defense-news-dedup.test.ts
//
// Cross-request same-event collapse. The dangerous direction is OVER-collapsing:
// every link this returns is a story the reader never sees, so a malformed reply
// must drop nothing rather than drop something. Parts C and D are the negative
// controls — a group naming a position that does not exist, and a call that fails
// outright, both have to leave the page alone.

import { judgeDuplicatesAcrossRequest, type CrossItem, type ChunkUsage } from "./defense-news-judge";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// Transcribed from the live feed, 2026-08-11. 1 and 4 are one Boeing announcement
// carried by two outlets — the pair that reached the page in different chunks.
const ITEMS: CrossItem[] = [
  { link: "a", title: "Boeing, Northrop unveil low-cost intercept tech", source: "Breaking Defense" },
  { link: "b", title: "Army subbing Polaris MRZR unmanned trucks for ISVs: Official", source: "Breaking Defense" },
  { link: "c", title: "'No such thing as a regional conflict anymore,' STRATCOM chief says", source: "Breaking Defense" },
  { link: "d", title: "Boeing unveils cheap radar seeker built from off-the-shelf parts", source: "Defense News" },
];

/** Stands in for the Anthropic client. `reply` is returned verbatim as the model's
 *  text, so the parser is exercised on the shapes a model actually produces. */
function fakeClient(reply: string, opts: { throws?: boolean } = {}) {
  let calls = 0;
  const client = {
    messages: {
      create() {
        calls++;
        if (opts.throws) return Promise.reject(new Error("overloaded_error"));
        return Promise.resolve({
          content: [{ type: "text", text: reply }],
          usage: { input_tokens: 420, output_tokens: 30 },
        });
      },
    },
  };
  return { client: client as never, calls: () => calls };
}

async function main() {
  // ── A · the pair that shipped ──
  console.log("\n── A · two outlets, one announcement ──");
  {
    const { client } = fakeClient("[[1,4]]");
    const drop = await judgeDuplicatesAcrossRequest(client, ITEMS);
    check("one link is dropped", drop.size === 1, String(drop.size));
    check("the LOWEST-numbered survives", !drop.has("a") && drop.has("d"),
      [...drop].join(","));
    check("unrelated stories are untouched", !drop.has("b") && !drop.has("c"));
  }

  // ── B · usage is reported so the extra call is not invisible ──
  console.log("\n── B · the pass pays for itself visibly ──");
  {
    const usage: ChunkUsage[] = [];
    const { client } = fakeClient("[[1,4]]");
    await judgeDuplicatesAcrossRequest(client, ITEMS, usage);
    check("the call's tokens are recorded", usage.length === 1 && usage[0].input_tokens === 420);
    check("so it lands in the same spend total the ledger writes", usage[0].stories === 4);
  }

  // ── C · negative control · a reply we cannot fully read drops NOTHING ──
  console.log("\n── C · malformed replies ──");
  {
    const cases: Array<[string, string]> = [
      ["[]", "no duplicates found"],
      ["[[1]]", "a group of one is not a duplicate"],
      ["[[1,99]]", "a position that does not exist"],
      ["[[0,2]]", "a zero index is not 1-based"],
      ["[[1,\"4\"]]", "a string where a number belongs"],
      ["not json at all", "prose instead of an array"],
      ["[[-1,3]]", "a negative index"],
      // The discriminating case for the all-or-nothing rule: TWO valid positions
      // alongside one that does not exist. Every other malformed reply above leaves
      // fewer than two readable indices, so a relaxed guard that honoured the
      // readable part of a group would still drop nothing and look correct.
      ["[[1,3,99]]", "two real positions and one that does not exist"],
    ];
    for (const [reply, why] of cases) {
      const { client } = fakeClient(reply);
      const drop = await judgeDuplicatesAcrossRequest(client, ITEMS);
      check(`drops nothing on ${why}`, drop.size === 0, `dropped ${[...drop].join(",")}`);
    }
  }

  // ── D · negative control · a failed call leaves the page alone ──
  console.log("\n── D · the call fails ──");
  {
    const { client } = fakeClient("", { throws: true });
    let threw = false;
    let drop = new Set<string>();
    try { drop = await judgeDuplicatesAcrossRequest(client, ITEMS); } catch { threw = true; }
    check("it does not throw", !threw);
    check("and collapses nothing", drop.size === 0,
      "showing two takes on one event is strictly better than dropping real stories");
  }

  // ── E · no call is made when there is nothing to compare ──
  console.log("\n── E · the pass is skipped when it cannot help ──");
  {
    const { client, calls } = fakeClient("[[1,2]]");
    const drop = await judgeDuplicatesAcrossRequest(client, [ITEMS[0]]);
    check("a single story costs no call", calls() === 0 && drop.size === 0, String(calls()));
    const { client: c2, calls: n2 } = fakeClient("[[1,2]]");
    await judgeDuplicatesAcrossRequest(c2, []);
    check("an empty list costs no call", n2() === 0);
  }

  // ── F · a three-way pile-up keeps exactly one ──
  console.log("\n── F · more than two outlets ──");
  {
    const { client } = fakeClient("[[1,2,4]]");
    const drop = await judgeDuplicatesAcrossRequest(client, ITEMS);
    check("two of three are dropped", drop.size === 2, String(drop.size));
    check("and the first is the one kept", !drop.has("a"));
  }

  // ── G · the harness can record a failure ──
  console.log("\n── G · self-arm ──");
  {
    const before = fail;
    const realLog = console.log;
    console.log = () => {};
    check("(self-arm)", false, "deliberate");
    console.log = realLog;
    const armed = fail === before + 1;
    fail = before;
    pass++;
    if (!armed) {
      console.log("✗ FAIL  the harness cannot record a failure — every result above is meaningless");
      process.exit(1);
    }
    console.log("✓ PASS  a deliberate false assertion was counted as a failure, then retracted");
  }
}

main().then(function () {
  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.log("✗ FAIL  the suite itself threw — no result above can be trusted:", e && e.message);
  process.exit(1);
});
