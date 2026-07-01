// Card 185 — freeze the SETASIDE-OVERTYPE NEGATIVE anchor (SP3300-26-Q-0165). $0.
// Imports the REAL keySha256 from ./judgment-score (no reimplementation → zero hash drift) and stamps
// adjudication { sourceSha256, keySha256 } per the existing judgment-freeze convention. Does NOT touch
// any existing frozen artifact. Rule 32: no secrets.
//   npx tsx scripts/audit-ai/card185-stamp-setaside-neg-anchor.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { keySha256, type JudgmentKey } from "./judgment-score";

const GOLD = "scripts/audit-ai/gold-sets";
const NAME = "SP3300-26-Q-0165-setaside-overtype-neg";
const AUTHORED = `${GOLD}/${NAME}.judgment.authored.json`;
const FROZEN = `${GOLD}/${NAME}.judgment.frozen.json`;
const SRC = `${GOLD}/SP3300-26-Q-0165-FULL-SOURCE.txt`;
const fileSha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

const key = JSON.parse(readFileSync(AUTHORED, "utf8")) as JudgmentKey & Record<string, unknown>;
const sourceSha256 = fileSha(SRC);

key.adjudication = {
  authoredBlind: false,
  frozenAt: "2026-07-01",
  adjudicatedBy: ["Brain (card 177 ruling — nhr disposition)", "Brain (card 185 spec)"],
  sourceSha256,
  keySha256: "PENDING",
} as JudgmentKey["adjudication"];
(key.adjudication as Record<string, unknown>).materializedBy = "Code (card 185)";
(key.adjudication as Record<string, unknown>).rulingRef =
  "Brain card 177 (nhr disposition, merged PR#111 8567260) + card 185 (author+freeze from card-183 doc-verified SP3300-26-Q-0165)";

const ksha = keySha256(key);
(key.adjudication as Record<string, unknown>).keySha256 = ksha;
writeFileSync(FROZEN, JSON.stringify(key, null, 2) + "\n");

const reload = JSON.parse(readFileSync(FROZEN, "utf8")) as JudgmentKey;
const ok = keySha256(reload) === reload.adjudication?.keySha256;
console.log(`frozen key written: ${FROZEN}`);
console.log(`  sourceSha256 = ${sourceSha256}`);
console.log(`  keySha256    = ${ksha}`);
console.log(`  recompute==stamped: ${ok ? "✅ YES" : "❌ NO"}`);
process.exit(ok ? 0 : 1);
