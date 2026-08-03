// $0. LEDGER RECONCILER — check every open action item's CITED EXTERNAL STATE against reality.
//
// WHY THIS EXISTS. A backlog that cites external state ROTS: three P0s once told the CEO for four days to merge a PR
// that was already merged, and a sweep found 17 of 17 cited PRs merged or closed with none open. Today's session found
// three more stale rows by hand (RAILWAY-MALFORMED-VAR, SESS-RULES-49-53, most of SESS-DOCTRINE-BATCH). Three is a
// pattern, and hand-checking does not scale to 107 items.
//
// THE RECONCILER NEEDS ITS OWN FALSE-POSITIVE CONTROL. A previous sweep of mine produced a false positive, and a
// checker nobody checks is worse than no checker — it launders a guess into a finding. So this runs CONTROLS first
// (below) and REFUSES TO REPORT if they do not hold: a known-merged PR must read merged, a known-absent flag must read
// absent, and a deliberately bogus PR number must NOT read merged. If any control fails, the run is DISCARDED.
//
// IT PROPOSES, IT DOES NOT APPLY. Especially for CEO-owned rows: "present, never presume" — a row whose blocker is a
// decision the CEO has not made is not stale just because the mechanical work behind it is done.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DIGEST = "ceo/digest-data.json";
const sh = (cmd: string, args: string[]): string => {
  try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
};

type Item = Record<string, unknown> & { id?: string; tier?: string; status_normalized?: string; owner?: string; title?: string };

const prState = (() => {
  const cache = new Map<string, string>();
  return (n: string): string => {
    if (!cache.has(n)) cache.set(n, sh("gh", ["pr", "view", n, "--json", "state", "-q", ".state"]) || "UNKNOWN");
    return cache.get(n)!;
  };
})();

const railwayFlags = (() => {
  const out = sh("railway", ["variables", "--service", "audit-worker", "--kv"]);
  const m = new Map<string, string>();
  for (const line of out.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) m.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return m;
})();

// ── CONTROLS — if these do not hold, this instrument is not measuring what it claims ──────────────────────────────
const controls: Array<[string, boolean]> = [
  ["a known-MERGED PR reads MERGED (#413)", prState("413") === "MERGED"],
  ["a bogus PR number does NOT read MERGED (#99999)", prState("99999") !== "MERGED"],
  ["railway returned a real variable set (>50 keys)", railwayFlags.size > 50],
  ["a known-ABSENT flag reads absent (AUDIT_LENS_DISCOVERY)", !railwayFlags.has("AUDIT_LENS_DISCOVERY")],
  ["a known-PRESENT flag reads present (AUDIT_ATTACHMENT_COVERAGE)", railwayFlags.has("AUDIT_ATTACHMENT_COVERAGE")],
];
const failed = controls.filter(([, ok]) => !ok);
console.log("── CONTROLS ──");
for (const [label, ok] of controls) console.log(`  ${ok ? "✓" : "✗"} ${label}`);
if (failed.length) {
  console.log(`\n⛔ ${failed.length} CONTROL(S) FAILED — RUN DISCARDED. Not reporting findings from an instrument that cannot tell true from false.`);
  process.exit(1);
}

// ── THE SWEEP ─────────────────────────────────────────────────────────────────────────────────────────────────────
const items: Item[] = JSON.parse(readFileSync(DIGEST, "utf8")).action_items;
const OPEN = new Set(["actionable_now", "today", "blocked_chain", "blocked_external", "customer_blocker", "monitor"]);

type Flag = { id: string; tier: string; owner: string; status: string; title: string; why: string[] };
const flagged: Flag[] = [];

for (const it of items) {
  if (!OPEN.has(String(it.status_normalized))) continue;
  const blob = JSON.stringify(it);
  const why: string[] = [];

  // (a) every PR this row cites is merged/closed → the work it points at is not outstanding
  const prs = [...new Set([...blob.matchAll(/#(\d{3})\b/g)].map((m) => m[1]))];
  if (prs.length) {
    const states = prs.map((n) => [n, prState(n)] as const);
    const live = states.filter(([, s]) => s === "OPEN");
    const known = states.filter(([, s]) => s !== "UNKNOWN");
    // Only meaningful when we could actually resolve them — an all-UNKNOWN row proves nothing (these are often Brain
    // CARD numbers, not PRs, which is exactly the false positive a naive version of this check would produce).
    // A MERGED PR IS NOT EVIDENCE THE ROW IS DONE. Measured on the first real run: 6 of 13 flags were false
    // positives, because a row can cite the PR that CAUSED its defect ("honest regression from PR #346") or an
    // explicit precondition ("#300 is INERT by design and is a precondition, not a remedy"). Those rows say so in
    // their own text, so read it before flagging. This does not make the rule sound — it makes it less wrong; the
    // output is a SHORTLIST that still needs per-row evidence, never a close list.
    const causal = /regression from|precondition|not a remedy|INERT by design|caused by|introduced (?:in|by)/i.test(blob);
    if (known.length && !live.length && !causal) why.push(`every resolvable PR it cites is closed: ${known.map(([n, s]) => `#${n}=${s}`).join(", ")}`);
  }

  // (b) the row's blocker is "needs a flag armed" but the flag is already live
  for (const f of [...new Set([...blob.matchAll(/\b(AUDIT_[A-Z0-9_]+)\b/g)].map((m) => m[1]))]) {
    const v = railwayFlags.get(f);
    if (v === "true" && /\barm|enable|turn on\b/i.test(String(it.title) + String(it.blocker_reason ?? ""))) {
      why.push(`asks to arm ${f}, which already reads true on the worker`);
    }
  }

  if (why.length) flagged.push({
    id: String(it.id), tier: String(it.tier), owner: String(it.owner), status: String(it.status_normalized),
    title: String(it.title).slice(0, 74), why,
  });
}

console.log(`\n── SWEEP: ${items.length} items, ${items.filter((i) => OPEN.has(String(i.status_normalized))).length} open, ${flagged.length} with drift ──\n`);
const ceoOwned = flagged.filter((f) => f.owner.includes("ceo"));
const codeOwned = flagged.filter((f) => !f.owner.includes("ceo"));

const show = (list: Flag[], heading: string) => {
  if (!list.length) return;
  console.log(heading);
  for (const f of list) {
    console.log(`  ${f.tier} ${f.id} [${f.status}] owner=${f.owner}`);
    console.log(`     ${f.title}`);
    for (const w of f.why) console.log(`     → ${w}`);
  }
  console.log("");
};
show(codeOwned, "CODE-OWNED SHORTLIST — each still needs its own evidence, this is not a close list:");
show(ceoOwned, "CEO-OWNED — PRESENT, NEVER PRESUME (a decision is not done because the code is):");
console.log("Nothing was modified. This proposes; the CEO disposes.");
