// $0. Reconcile the backlog against REAL PR state.
//
// Four P0 items describe PR #346 as open. It merged 2026-07-30. A backlog that argues from a merged PR is a
// backlog whose other 23 P0s cannot be trusted either — the stale entries are indistinguishable from the live
// ones until each is checked.
//
// This does NOT close anything. It emits the evidence a ruling needs: for every action item that names a PR,
// the PR's real state, and whether the item's own text asserts that PR is still open. Closing a P0 the CEO
// believes is live would be a worse failure than leaving it stale, and only he knows which items carry work
// beyond the PR they cite.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface Item {
  id?: string; tier?: string; title?: string; purpose?: string; eng_title?: string;
  blocker_reason?: string; status_normalized?: string; owner?: string; ready_state?: string;
}

const prState = (n: string): { state: string; mergedAt: string | null } => {
  try {
    const out = execFileSync("gh", ["pr", "view", n, "--json", "state,mergedAt"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const j = JSON.parse(out) as { state: string; mergedAt: string | null };
    return { state: j.state, mergedAt: j.mergedAt ?? null };
  } catch {
    return { state: "UNKNOWN", mergedAt: null };
  }
};

/** Does the item's own prose ASSERT the PR is open? That is the difference between a stale instruction and a
 *  harmless historical reference. "PR #346 open" is stale; "shipped in #346" is provenance and is fine.
 *
 *  THE THIRD PATTERN WAS DELETED after it produced this sweep's only false positive. It matched any of
 *  unmerged|not merged|open within 30 chars AFTER a PR number, and fired on
 *  "everything it asked for shipped in #346; its last OPEN question was answered" — a sentence saying the
 *  opposite of what it was read as. A word near a number is not a claim about that number, which is the same
 *  correction this repo has made to a heading recogniser and a bar-vocabulary matcher. The two surviving
 *  patterns require the assertion to be ADJACENT to the reference or to govern it grammatically. */
const ASSERTS_OPEN = (text: string, pr: string) =>
  new RegExp(`(?:PR\\s*)?#${pr}\\s+(?:is\\s+)?(?:still\\s+)?(?:OPEN|open)\\b`).test(text) ||
  new RegExp(`\\b(?:awaiting|pending|blocked\\s+on|waiting\\s+on)\\b[^.]{0,40}#${pr}\\b`, "i").test(text);

/** An item may DECLARE its PR state reconciled as of a date. That declaration is reported as its own category —
 *  never silently dropped. A suppression you cannot see is how a real finding hides behind an old exemption. */
const RECONCILED = /^PR STATE RECONCILED (\d{4}-\d{2}-\d{2})/;

(async () => {
  const d = JSON.parse(readFileSync("ceo/digest-data.json", "utf8")) as { action_items: Item[] };
  const items = d.action_items ?? [];

  const refs = new Map<string, Item[]>();
  for (const it of items) {
    const text = [it.title, it.purpose, it.eng_title, it.blocker_reason].filter(Boolean).join(" ");
    for (const n of new Set([...text.matchAll(/#(\d{2,4})\b/g)].map((m) => m[1]))) {
      // Card numbers share the # sigil with PRs. Cards run 100–800 in this repo and PRs currently run 300–420,
      // so the ranges OVERLAP and a number alone cannot disambiguate. Require the literal "PR #" for at least
      // one mention in the item, or a card reference is queried as a PR and comes back UNKNOWN as noise.
      if (!new RegExp(`PR\\s*#${n}\\b`).test(text) && !new RegExp(`#${n}\\b[^.]{0,20}\\b(merged|open|unmerged)\\b`, "i").test(text)) continue;
      refs.set(n, [...(refs.get(n) ?? []), it]);
    }
  }

  const prs = [...refs.keys()].sort((a, b) => Number(a) - Number(b));
  console.log(`action items: ${items.length} · items referencing a PR: ${new Set([...refs.values()].flat()).size} · distinct PRs: ${prs.length}\n`);

  const states = new Map<string, { state: string; mergedAt: string | null }>();
  for (const n of prs) states.set(n, prState(n));

  const stale: Array<{ pr: string; it: Item }> = [];
  const reconciled: Array<{ pr: string; it: Item; on: string }> = [];
  const fine: Array<{ pr: string; it: Item }> = [];

  console.log("=== PR state ===");
  for (const n of prs) {
    const s = states.get(n)!;
    console.log(`  PR #${n.padEnd(4)} ${s.state.padEnd(8)} ${s.mergedAt ? `merged ${s.mergedAt.slice(0, 10)}` : ""}  → ${refs.get(n)!.length} item(s)`);
  }

  for (const n of prs) {
    const s = states.get(n)!;
    for (const it of refs.get(n)!) {
      const text = [it.title, it.purpose, it.eng_title, it.blocker_reason].filter(Boolean).join(" ");
      const stamp = RECONCILED.exec(it.eng_title ?? "");
      if (s.state === "MERGED" && ASSERTS_OPEN(text, n)) {
        if (stamp) reconciled.push({ pr: n, it, on: stamp[1] });
        else stale.push({ pr: n, it });
      } else fine.push({ pr: n, it });
    }
  }

  console.log(`\n=== STALE — the item asserts the PR is OPEN, but it MERGED (${stale.length}) ===`);
  for (const { pr, it } of stale) {
    const s = states.get(pr)!;
    console.log(`\n  ${it.tier}  ${it.id}   [${it.status_normalized}] owner=${it.owner} ready=${it.ready_state}`);
    console.log(`     ${(it.title ?? "").slice(0, 96)}`);
    console.log(`     cites PR #${pr}, merged ${s.mergedAt?.slice(0, 10)}`);
  }

  console.log(`\n=== RECONCILED — the item still reads as "open" but DECLARES its PR state settled (${reconciled.length}) ===`);
  for (const { pr, it, on } of reconciled) console.log(`  ${String(it.tier).padEnd(3)} ${String(it.id).padEnd(30)} #${pr} — declared reconciled ${on}`);
  if (!reconciled.length) console.log("  (none)");

  console.log(`\n=== CONSISTENT — PR reference is provenance or the PR is genuinely open (${fine.length}) ===`);
  for (const { pr, it } of fine) {
    const s = states.get(pr)!;
    console.log(`  ${String(it.tier).padEnd(3)} ${String(it.id).padEnd(30)} #${pr} ${s.state}`);
  }
})();
