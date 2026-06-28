// $0 stamp of the NO_BID synthetic key: writes source_sha256/bytes then keySha256 using the engine's OWN
// hash fn (no drift). Order matters: source fields are inside the hashed canonical key, so they must be
// final BEFORE keySha256 is computed; the adjudication block (incl keySha256) is stripped before hashing.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { keySha256, type JudgmentKey } from "./judgment-score";

const KEY_PATH = "scripts/audit-ai/gold-sets/FA860126Q00260001.judgment.frozen.SYNTHETIC.json";
const SRC_PATH = "scripts/audit-ai/gold-sets/FA860126Q00260001-FULL-SOURCE.complete.txt";

const srcBuf = readFileSync(SRC_PATH);
const sourceSha = createHash("sha256").update(srcBuf).digest("hex");
const sourceBytes = statSync(SRC_PATH).size;

const key = JSON.parse(readFileSync(KEY_PATH, "utf8")) as JudgmentKey & Record<string, unknown>;
key.source_sha256 = sourceSha;
key.source_bytes = sourceBytes;
(key.adjudication as Record<string, unknown>).sourceSha256 = sourceSha;

const ksha = keySha256(key); // canonicalKeyForHash strips adjudication, so keySha256 placeholder is irrelevant
(key.adjudication as Record<string, unknown>).keySha256 = ksha;

writeFileSync(KEY_PATH, JSON.stringify(key, null, 2) + "\n");
console.log(`source_sha256 = ${sourceSha}`);
console.log(`source_bytes  = ${sourceBytes}`);
console.log(`keySha256     = ${ksha}`);
// integrity: recompute == stamped
const reload = JSON.parse(readFileSync(KEY_PATH, "utf8")) as JudgmentKey;
console.log(`recompute==stamped: ${keySha256(reload) === reload.adjudication?.keySha256 ? "✅ YES" : "❌ NO"}`);
