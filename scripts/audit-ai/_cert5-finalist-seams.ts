// $0 — confirm the CERT-5 finalists' deep seams from REAL SAM source (library path: resolveSamDescription +
// assembleSamDocumentSet). Scans for the uncontrollable-bar / clearable-clause signals that make each a stress test.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { fetchSolicitationByNoticeId } from "../../src/lib/sam";
import { resolveSamDescription } from "../../src/lib/sam-description";
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText } from "../../src/lib/pdf-text-extractor";

const FINALISTS = ["SPRRA2-26-R-0034", "SPRTA1-26-R-0081", "SPRRA226R0071", "36C24126Q0569", "N4008526R0065"];

const SIG: Record<string, RegExp> = {
  soleSource: /sole\s*source|only\s+(one\s+)?responsible\s+source|6\.302|justification and approval|J&A/i,
  sourceApproval: /source approval|approved source|AMSC|AMC\s*[:=]|qualified\s+(products|suppliers)|QPL|QSL|qualification requirement|engineering source approval|SAR\b/i,
  brandNameEqual: /brand\s*name\s*or\s*equal|salient characteristics|"or equal"|or-equal/i,
  incumbentLock: /incumbent|current contractor|predecessor contract|continuity of services/i,
  sdvosb: /service-disabled|SDVOSB|VOSB|VetCert|verified.{0,20}veteran|852\.219-73|852\.219-75/i,
  eightA: /8\(a\)|8a\b|SBA.{0,20}business development|section 8\(a\)/i,
  cyberCUI: /CUI|controlled unclassified|252\.204-70(12|19|20|21)|CMMC|NIST SP 800-171|SPRS/i,
  wageDBA: /Davis-?Bacon|wage determination|SCA|service contract act|prevailing wage/i,
  selfCert: /SAM\.gov registration|System for Award Management|represent(ations)? and certifications|52\.212-3|active registration/i,
};

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const sol of FINALISTS) {
    const { data } = await admin.from("pending_audits").select("notice_id, title, set_aside, agency, response_deadline").eq("solicitation_number", sol).limit(1);
    const meta = data?.[0];
    if (!meta) { console.log(`\n### ${sol} — no pending_audits row`); continue; }
    console.log(`\n### ${sol} — ${(meta.title||"").slice(0,60)} · setaside=${meta.set_aside} · due=${(meta.response_deadline||"").slice(0,10)}`);
    const s = await fetchSolicitationByNoticeId(meta.notice_id);
    if (!s) { console.log("   SAM resolve FAILED (notice may be archived)"); continue; }
    const resolved = await resolveSamDescription(s.noticeId, s.description);
    let text = resolved.fetched ? resolved.text : "";
    const set = await assembleSamDocumentSet(s.noticeId, sol);
    const bufs = set ? ([set.primary, ...set.attachments].filter(Boolean) as Array<{name:string;buffer:Buffer}>) : [];
    for (const d of bufs.slice(0, 8)) { try { const ex = await extractText(d.buffer); text += "\n" + (ex?.rawText ?? ""); } catch {} }
    console.log(`   source chars=${text.length} · attachments=${bufs.length} · SAM active=${s.active}`);
    const hits = Object.entries(SIG).filter(([, re]) => re.test(text)).map(([k]) => k);
    console.log(`   SEAM SIGNALS: ${hits.join(" · ") || "(none detected)"}`);
  }
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
