// Card 188 — freeze the FA860126 v3 key (custody repair). $0. Imports the REAL keySha256 from
// ./judgment-score (no reimplementation → zero hash drift) and stamps adjudication { sourceSha256, keySha256 }
// per the existing judgment-freeze convention. Content = the ratified Step-7 BID_WITH_CAUTION judgment
// (captured from the mutated v2 before v2 was restored). Does NOT touch v1/v2. Rule 32: no secrets.
//   npx tsx scripts/audit-ai/card188-stamp-v3.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { keySha256, type JudgmentKey } from "./judgment-score";

const GOLD = "scripts/audit-ai/gold-sets";
const AUTHORED = `${GOLD}/FA860126Q00260001.judgment.v3.authored.json`;
const FROZEN = `${GOLD}/FA860126Q00260001.judgment.frozen.SYNTHETIC.v3.json`;
const SRC = `${GOLD}/FA860126Q00260001-FULL-SOURCE.v2.complete.txt`; // same source as v2 (content identical)
const fileSha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

const key = JSON.parse(readFileSync(AUTHORED, "utf8")) as JudgmentKey & Record<string, unknown>;
const sourceSha256 = fileSha(SRC);

key.adjudication = {
  authoredBlind: false,
  frozenAt: "2026-07-01",
  adjudicatedBy: ["CEO (Step-7 ratify)", "Brain (card 188 custody repair)"],
  sourceSha256,
  keySha256: "PENDING",
} as JudgmentKey["adjudication"];
(key.adjudication as Record<string, unknown>).materializedBy = "Code (card 188)";
(key.adjudication as Record<string, unknown>).rulingRef =
  "Brain cards 141/143 (Option-1 temporal → BID_WITH_CAUTION) + card 188 (custody repair: re-freeze ratified judgment as v3, supersede mutated v2)";
(key.adjudication as Record<string, unknown>).supersedes_note =
  "Supersedes FA860126Q00260001.judgment.frozen.SYNTHETIC.v2.json (restored to its d08c3017-era frozen bytes and retired). Root cause: commit 7974b2c mutated the frozen v2 in place without re-stamping.";

const ksha = keySha256(key);
(key.adjudication as Record<string, unknown>).keySha256 = ksha;
writeFileSync(FROZEN, JSON.stringify(key, null, 2) + "\n");

const reload = JSON.parse(readFileSync(FROZEN, "utf8")) as JudgmentKey;
const ok = keySha256(reload) === reload.adjudication?.keySha256;
console.log(`frozen v3 written: ${FROZEN}`);
console.log(`  verdict      = ${(reload as unknown as { expectedVerdict: { verdict: string } }).expectedVerdict.verdict}`);
console.log(`  sourceSha256 = ${sourceSha256}`);
console.log(`  keySha256    = ${ksha}`);
console.log(`  file bytes sha256 = ${fileSha(FROZEN)}`);
console.log(`  recompute==stamped: ${ok ? "✅ YES" : "❌ NO"}`);
process.exit(ok ? 0 : 1);
