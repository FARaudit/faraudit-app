// GROUNDFIXTURE (c) — backfill groundingSource into the banked RunRecord corpus.
//
//   npx tsx scripts/audit-ai/_groundfixture-backfill.ts            (DRY RUN — default)
//   npx tsx scripts/audit-ai/_groundfixture-backfill.ts --apply    (writes to the bucket)
//
// WHAT groundingSource IS. src/lib/audit-executor-v3.ts:537:
//     const groundingSource = docs.map((d) => d.text).join("\n\n");
// A deterministic join over the extracted per-document text. NO model call anywhere in it.
//
// WHY fullSource CAN STAND IN FOR IT. fullSource is the assembled package the model reads. It
// diverges from groundingSource only when chunked ingest COMPRESSES the package — and that
// compression IS model-produced (agentic-chunked-ingest.ts:344, makeChunkMapCaller). Where
// AUDIT_CHUNKED_INGEST was false, no compression ran, so the banked fullSource is the
// uncompressed assembly and contains everything groundingSource would contain.
//
// KNOWN PROPERTY — CONTENT-EQUIVALENT, NOT BYTE-IDENTICAL. groundingSource is a DELIMITER-LESS
// join; fullSource carries per-doc delimiters (audit-orchestrator.ts:2478-2482). The exact byte
// string is therefore NOT reconstructible. That does not matter for the fixture's purpose: the
// grounding check is a NORMALIZED SUBSTRING search, and the engine says so itself at
// audit-expert.ts:35 — "fall back to fullSource (byte-identical when groundingSource absent).
// Same normalized substring semantics." Content-wise fullSource ⊇ groundingSource on unchunked
// records. This is recorded on every record it touches so no later reader mistakes the
// reconstruction for a banked-at-run-time value.
//
// INTEGRITY. A run record is supposed to say what actually happened. Writing a DERIVED field into
// it without saying so would make the record lie about its own provenance — the exact class of
// defect this arc exists to kill. So every backfilled record carries meta.backfill describing
// what was derived, from what, when, by which commit, and with what caveat. Pre-image of all 55
// records is kept at ceo/run-record-preimage-2026-07-27/ before any write.
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config({ path: ".env.local", quiet: true });

const APPLY = process.argv.includes("--apply");
const BUCKET = "run-records";
const CACHE = path.join(__dirname, ".run-record-cache");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sha = (() => { try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { return "unknown"; } })();

type Rec = {
  schema?: string;
  meta?: { sol?: string; flagEnv?: Record<string, string>; flags?: Record<string, string>; backfill?: unknown };
  input?: { fullSource?: string; groundingSource?: string };
};

async function put(key: string, body: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: "PUT",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", "x-upsert": "true" },
    body,
  });
  if (!r.ok) console.log(`  ⚠ PUT ${key} → ${r.status} ${await r.text()}`);
  return r.ok;
}

(async () => {
  const files = fs.readdirSync(CACHE);
  let chunked = 0, already = 0, noSource = 0, eligible = 0, written = 0, withFlagEnv = 0;
  const targets: Array<{ key: string; rec: Rec; hasFlagEnv: boolean }> = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(CACHE, f), "utf8");
    let rec: Rec;
    try { rec = JSON.parse(raw) as Rec; } catch { continue; }
    const key = f.replace(/__/g, "/");
    const fe = rec.meta?.flagEnv || {};
    const fl = rec.meta?.flags || {};
    const isChunked = String(fl.AUDIT_CHUNKED_INGEST ?? fe.AUDIT_CHUNKED_INGEST ?? "false").toLowerCase() === "true";
    const hasFlagEnv = Object.keys(fe).length > 0;

    if (isChunked) { chunked++; continue; }                       // compression was model-produced → NOT reconstructible
    if (rec.input?.groundingSource) { already++; continue; }
    if (!rec.input?.fullSource) { noSource++; continue; }
    eligible++;
    if (hasFlagEnv) withFlagEnv++;
    targets.push({ key, rec, hasFlagEnv });
  }

  console.log(`\n===== GROUNDFIXTURE BACKFILL — ${APPLY ? "APPLY" : "DRY RUN"} =====`);
  console.log(`cached records            : ${files.length}`);
  console.log(`  ELIGIBLE (unchunked)    : ${eligible}`);
  console.log(`    of which in THE FIXTURE (flagEnv present): ${withFlagEnv}   <-- the only ones with fixture value`);
  console.log(`    of which can never be replayed (no flagEnv): ${eligible - withFlagEnv}`);
  console.log(`  SKIPPED chunked         : ${chunked}   (compression is model-produced → not reconstructible)`);
  console.log(`  SKIPPED already present : ${already}`);
  console.log(`  SKIPPED no fullSource   : ${noSource}`);

  if (!APPLY) { console.log(`\nDRY RUN — nothing written. Re-run with --apply.`); return; }

  for (const { key, rec, hasFlagEnv } of targets) {
    rec.input!.groundingSource = rec.input!.fullSource;
    rec.meta = rec.meta || {};
    (rec.meta as Record<string, unknown>).backfill = {
      field: "input.groundingSource",
      derivedFrom: "input.fullSource",
      at: "2026-07-27",
      byCommit: sha,
      reason: "AUDIT_CHUNKED_INGEST=false ⇒ no model compression ran ⇒ fullSource IS the uncompressed assembly.",
      caveat: "CONTENT-EQUIVALENT, NOT BYTE-IDENTICAL. groundingSource is a delimiter-less docs.join; fullSource carries per-doc delimiters. Grounding is a normalized substring search (audit-expert.ts:35), so the difference is not load-bearing — but this value was NOT banked at run time and must not be read as if it were.",
      fixtureValue: hasFlagEnv ? "IN FIXTURE (flagEnv present)" : "NO FIXTURE VALUE (no flagEnv — can never be faithfully replayed)",
    };
    const body = JSON.stringify(rec);
    try { JSON.parse(body); } catch { console.log(`  ⚠ refusing to write malformed ${key}`); continue; }
    if (await put(key, body)) { written++; fs.writeFileSync(path.join(CACHE, key.replace(/\//g, "__")), body); }
  }
  console.log(`\nWRITTEN: ${written}/${targets.length}`);
  console.log(`Pre-image of all 55 records: ceo/run-record-preimage-2026-07-27/`);
})();
