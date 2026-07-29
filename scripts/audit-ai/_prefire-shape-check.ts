// $0 PRE-FIRE PACKAGE-SHAPE CHECK (root-b b0 stub-primary defect, 2026-07-29). For each CERT-5 target:
// assemble the doc set the way the executor does, then ask: which doc is REGION #1 (the section detector's
// primary), is it a stub, and does the production section derivation come back empty? Library paths only.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const { fetchSolicitationByNoticeId } = await import("../../src/lib/sam");
  const { assembleSamDocumentSet } = await import("../../src/lib/sam-attachments");
  const { extractText } = await import("../../src/lib/pdf-text-extractor");
  const tools = await import("../../src/lib/audit-tools");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  for (const sol of ["SPRRA2-26-R-0034", "36C24126Q0569"]) {
    console.log(`\n════ SHAPE ${sol} ════`);
    const { data } = await admin.from("pending_audits").select("notice_id").eq("solicitation_number", sol).limit(1);
    const s = await fetchSolicitationByNoticeId(data![0].notice_id);
    if (!s) { console.log("  resolve failed"); continue; }
    const set = await assembleSamDocumentSet(s.noticeId, sol);
    const docs: Array<{ name: string; text: string }> = [];
    for (const d of [set?.primary, ...(set?.attachments ?? [])].filter(Boolean) as Array<{name:string;buffer:Buffer}>) {
      let text = ""; try { text = (await extractText(d.buffer))?.rawText ?? ""; } catch {}
      docs.push({ name: d.name, text });
    }
    // assembleFullSource shape: delimiter per doc when >1
    const full = docs.length > 1
      ? docs.map((d) => `\n\n==== DOCUMENT: ${d.name} ====\n\n${d.text}`).join("")
      : (docs[0]?.text ?? "");
    docs.forEach((d, i) => console.log(`  doc#${i + 1} ${d.name.slice(0, 44).padEnd(44)} ${d.text.trim().length.toLocaleString()}c`));
    const region1 = docs[0]?.text.trim().length ?? 0;
    const largest = Math.max(...docs.map((d) => d.text.trim().length));
    const { parseDocRegions, resolvePrimary } = await import("../../src/lib/primary-doc-resolve");
    const regs = parseDocRegions(full);
    const pick = resolvePrimary(regs);
    console.log(`  flag=${process.env.AUDIT_PRIMARY_DOC_ELECTION} · parseDocRegions=${regs.length} regions · resolvePrimary → index=${pick.index} ("${regs[pick.index]?.name ?? "?"}") confident=${pick.confident}`);
    const secs = (tools as any).materializeSections({ fullSource: full });
    const keys = Object.keys(secs);
    console.log(`  region#1(primary) = ${region1.toLocaleString()}c · largest doc = ${largest.toLocaleString()}c · primary IS largest: ${region1 === largest}`);
    console.log(`  sections from PRODUCTION derivation: ${keys.length ? keys.join(",") : "EMPTY"} · has L=${keys.includes("L")} · has M=${keys.includes("M")}`);
    const stub = docs.length > 1 && region1 < 0.1 * largest;
    const electionOn = process.env.AUDIT_PRIMARY_DOC_ELECTION === "true";
    const verdict = docs.length === 1 ? "single-doc — CLEAN of b0 by construction"
      : electionOn && pick.confident ? `✅ election CONFIDENT — primary = "${regs[pick.index]?.name}" (positional doc#1 ${pick.index === 0 ? "confirmed" : "OVERRIDDEN"}); sections are whatever the real doc genuinely carries`
      : electionOn ? "⚠ election NOT CONFIDENT — positional primary retained; NHR routing owns the escalation"
      : stub ? "❌ STUB PRIMARY — firing rides the known aperture defect (arm AUDIT_PRIMARY_DOC_ELECTION to correct)"
      : keys.length === 0 ? "⚠ multi-doc, primary not a stub, but section map EMPTY — aperture risk present"
      : "✅ multi-doc, primary credible, sections detected";
    console.log(`  b0 VERDICT: ${verdict}`);
  }
})();
