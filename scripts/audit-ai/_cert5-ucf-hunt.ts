// $0 — hunt a UCF (§A–M) CERT-5 target. Stage 1: dedup biddable pending_audits, rank by UCF-likelihood PROXIES
// (RFP-type sol# · services/construction/professional/R&D NAICS · award ceiling · non-commercial notice). Stage 2:
// pull source for the top N and classify with detectDocumentClass + ucfHeaderCount (the ground truth). Library paths.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { fetchSolicitationByNoticeId } from "../../src/lib/sam";
import { resolveSamDescription } from "../../src/lib/sam-description";
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText } from "../../src/lib/pdf-text-extractor";
import { detectDocumentClass, ucfHeaderCount } from "../../src/lib/panel-doc-class";

const nowIso = "2026-07-24T00:00:00Z";
// UCF-likely NAICS prefixes: construction(23), prof/tech services(54), admin/facility services(561..), R&D(5417), IT(5415)
const ucfNaics = (n: string) => /^(23|54|561[12]|5415|5417|561210)/.test(n || "");

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin
    .from("pending_audits")
    .select("solicitation_number, notice_id, title, agency, naics_code, set_aside, document_type, award_ceiling, response_deadline")
    .gte("response_deadline", nowIso)
    .limit(400);
  const rows = data || [];

  // dedup by sol#
  const seen = new Map<string, any>();
  for (const r of rows) { if (r.solicitation_number && !seen.has(r.solicitation_number)) seen.set(r.solicitation_number, r); }
  const uniq = [...seen.values()];
  console.log(`distinct biddable solicitations: ${uniq.length}`);

  const score = (r: any) => {
    let s = 0;
    if (/R-?\d|R\d/.test(r.solicitation_number || "")) s += 2;         // RFP-type
    if (ucfNaics(r.naics_code)) s += 3;                                 // services/construction/prof NAICS
    if (r.award_ceiling) s += 1;                                       // dollar magnitude present
    if (!/DEFENSE LOGISTICS|DLA/i.test(r.agency || "")) s += 1;         // DLA = commercial hardware bias
    return s;
  };
  const ranked = uniq.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s);
  console.log(`\n── top UCF-likely candidates (proxy score) ──`);
  for (const { r, s } of ranked.slice(0, 12)) {
    console.log(`  [${s}] ${r.solicitation_number} | ${(r.title||"").slice(0,46)} | naics=${r.naics_code} setaside=${r.set_aside||"-"} due=${(r.response_deadline||"").slice(0,10)} agency=${(r.agency||"").slice(0,28)}`);
  }

  // Stage 2: classify the top 8 by REAL source
  console.log(`\n── ground-truth classification (top 8, real SAM source) ──`);
  for (const { r } of ranked.slice(0, 8)) {
    const s = await fetchSolicitationByNoticeId(r.notice_id);
    if (!s) { console.log(`  ${r.solicitation_number}: SAM resolve FAILED`); continue; }
    const resolved = await resolveSamDescription(s.noticeId, s.description);
    let text = resolved.fetched ? resolved.text : "";
    const set = await assembleSamDocumentSet(s.noticeId, r.solicitation_number);
    const bufs = set ? ([set.primary, ...set.attachments].filter(Boolean) as Array<{name:string;buffer:Buffer}>) : [];
    for (const d of bufs.slice(0, 10)) { try { const ex = await extractText(d.buffer); text += "\n" + (ex?.rawText ?? ""); } catch {} }
    const hdrs = ucfHeaderCount(text), klass = detectDocumentClass(text);
    const far15 = /source selection|tradeoff|best value|factors? .{0,10}(will be|are) evaluated|section M|evaluation factors for award/i.test(text);
    console.log(`  ${r.solicitation_number}: class=${klass.toUpperCase()} ucfHeaders=${hdrs} chars=${text.length} far15-signals=${far15 ? "YES" : "no"} docs=${bufs.length} active=${s.active}`);
  }
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
