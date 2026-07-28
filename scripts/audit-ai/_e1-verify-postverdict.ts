// /verify probe: E1's whole round-2 claim is that moving the pass past deriveVerdict makes it structurally
// unable to reach a classifier. Assert that on real stored audits, not on a fixture.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  const { repairHeadClippedExcerpts, analyzedExcerptOf } = await import("../../src/lib/audit-excerpt-repair");
  const D = await import("../../src/lib/audit-decide");
  const sig = (f: any) => [D.isPositiveSetAside(f), D.isInquiryDeadlineBenign(f), D.hasOperativeEligibilityLanguage(f.excerpt ?? "")].join("|");
  let rows = 0, widened = 0, moved = 0;
  for (const row of ((data ?? []) as Record<string, any>[])) {
    const src: string = row.raw_pdf_text ?? "";
    const fs_ = JSON.parse(JSON.stringify([...(row.compliance_json?.findings ?? []), ...(row.compliance_json?.v3?.findings ?? [])]));
    if (!src || !fs_.length) continue;
    rows++;
    const before = fs_.map(sig);
    process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";
    const res = repairHeadClippedExcerpts(fs_, src, { rejectIfClassificationMoves: (b: any, a: any) => sig(b) !== sig(a) });
    delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
    widened += res.repaired;
    const after = fs_.map(sig);
    const diffs = before.filter((s: string, i: number) => s !== after[i]).length;
    moved += diffs;
    console.log(`  ${String(row.id).slice(0,8)} ${row.solicitation_number}: widened ${res.repaired} · classification moved on ${diffs} · refused ${res.skipped.filter((s:any)=>/classifies/.test(s.reason)).length}`);
    for (const f of fs_) if (f.excerptPreReground && analyzedExcerptOf(f) !== f.excerptPreReground) console.log("    ❌ analyzed span not preserved");
  }
  console.log(`\nrows ${rows} · excerpts widened ${widened} · classifications moved ${moved}`);
  console.log(moved === 0 ? "✅ no classification moved on any real record" : "❌ a classification moved");
  process.exit(moved === 0 ? 0 : 1);
})();
