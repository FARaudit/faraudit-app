// $0 read-only. For EVERY declined site, print which of the three gates said no. A residue I cannot explain
// gate-by-gate is a recogniser I do not understand, and "(l) . The Government reserves the right to" looks by
// eye like it carries an origin scar — so either the scar test is wrong or my reading of the line is.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";
const MAX_RUN_WORDS = 14, MAX_RUN_CHARS = 100;
const ORIGIN_SCAR = /(?:^|\S)\s+[.,;:]\s|\(\s*[,;]|\s[-–—]\s*$/;

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await db.from("audits").select("raw_pdf_text").eq("id", AUDIT).single();
  const full = (data as any).raw_pdf_text as string;
  const lines = full.split("\n");

  console.log("site | cand? words chars ownSentence | scar? lower? | verdict");
  for (let i = 0; i + 2 < lines.length; i++) {
    if (!lines[i].endsWith("\t")) continue;
    const opening = lines[i], run = lines[i + 1], cont = lines[i + 2];
    const t = run.trim();
    const words = t.split(/\s+/).filter(Boolean).length;
    const ownSentence = /\.\s+[A-Z]/.test(t);
    const cand = !!t && t.length <= MAX_RUN_CHARS && /[A-Za-z]/.test(t) && words <= MAX_RUN_WORDS && !ownSentence;
    const scar = ORIGIN_SCAR.test(opening.slice(0, -1));
    const lower = /^\s*[a-z]/.test(cont);
    const fires = cand && (scar || lower);
    if (fires) continue; // only explain the declines
    console.log(
      `\nDECLINED @${i}\n  opening : ${JSON.stringify(opening.slice(-70))}\n  run     : ${JSON.stringify(run.slice(0, 80))}\n  cont    : ${JSON.stringify(cont.slice(0, 80))}\n` +
      `  cand=${cand} (words=${words} chars=${t.length} ownSentence=${ownSentence})  scar=${scar}  lower=${lower}`
    );
  }
})();
