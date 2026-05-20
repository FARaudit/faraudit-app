// FA-97 · One-shot backfill — fills pending_audits.title_plain via Haiku 4.5
// for every row where title_plain is NULL and title is non-empty.
//
// Run locally:
//   npx dotenv -e .env.local -- tsx scripts/sam-ingest/backfill-title-plain.ts
//
// Env: ANTHROPIC_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//
// Batches of 10 in parallel (~500ms per call · ≈30s per 600 rows).
// Cost estimate at end of run: ~$0.00018/row (~$0.11 for 600 rows).

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error("[backfill-title-plain] missing env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const BATCH = 10;
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 60;

async function rewrite(raw: string): Promise<{ text: string | null; inTok: number; outTok: number }> {
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: `Rewrite this US government solicitation title in plain English, ≤8 words. Strip jargon, NSN codes, PSC prefixes, contract-speak. Preserve the actual subject. Return ONLY the rewritten title, no explanation.\n\nTitle:\n${raw}\n\nPlain English:`
        }
      ]
    });
    const block = res.content[0];
    if (block.type !== "text") return { text: null, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens };
    const out = block.text.trim().replace(/^["']|["']$/g, "");
    return { text: out || null, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[backfill-title-plain] rewrite failed for "${raw.slice(0, 40)}...": ${msg}`);
    return { text: null, inTok: 0, outTok: 0 };
  }
}

async function main() {
  const { data, error } = await supabase
    .from("pending_audits")
    .select("notice_id, title")
    .is("title_plain", null)
    .not("title", "is", null);
  if (error) { console.error("[backfill-title-plain] fetch failed:", error.message); process.exit(2); }
  if (!data || data.length === 0) { console.log("[backfill-title-plain] no rows to fill"); return; }

  console.log(`[backfill-title-plain] processing ${data.length} row${data.length === 1 ? "" : "s"} in batches of ${BATCH}...`);

  let filled = 0, failed = 0, inTotal = 0, outTotal = 0;
  const startedAt = Date.now();
  for (let i = 0; i < data.length; i += BATCH) {
    const slice = data.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((r) => rewrite(r.title as string)));
    // Persist each result individually so a single failure doesn't block siblings.
    for (let j = 0; j < slice.length; j++) {
      const row = slice[j];
      const r = results[j];
      inTotal += r.inTok;
      outTotal += r.outTok;
      if (!r.text) { failed++; continue; }
      const { error: upErr } = await supabase
        .from("pending_audits")
        .update({ title_plain: r.text })
        .eq("notice_id", row.notice_id);
      if (upErr) { console.warn(`[backfill-title-plain] write failed for ${row.notice_id}: ${upErr.message}`); failed++; continue; }
      filled++;
    }
    const pct = Math.round((Math.min(i + BATCH, data.length) / data.length) * 100);
    process.stdout.write(`\r  progress: ${Math.min(i + BATCH, data.length)}/${data.length} (${pct}%) · filled=${filled} failed=${failed}`);
  }
  process.stdout.write("\n");

  // Cost — Haiku 4.5 pricing per Anthropic public schedule (Jan 2026):
  // $0.80/M input · $4.00/M output
  const costUSD = (inTotal / 1_000_000) * 0.80 + (outTotal / 1_000_000) * 4.00;
  const durationS = (Date.now() - startedAt) / 1000;

  console.log("");
  console.log("[backfill-title-plain] DONE");
  console.log(`  rows filled:    ${filled}`);
  console.log(`  rows failed:    ${failed}`);
  console.log(`  total tokens:   in=${inTotal.toLocaleString()} out=${outTotal.toLocaleString()}`);
  console.log(`  estimated cost: $${costUSD.toFixed(4)}`);
  console.log(`  duration:       ${durationS.toFixed(1)}s`);
}

main().catch((e) => { console.error("[backfill-title-plain] fatal", e); process.exit(1); });
