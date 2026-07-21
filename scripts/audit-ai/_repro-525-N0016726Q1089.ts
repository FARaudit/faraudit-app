/**
 * $0 REPRO — #525 whole-source routing fallback on N0016726Q1089 (Brain card #629 → Option A gauntlet step 1).
 *   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_repro-525-N0016726Q1089.ts
 * Fetches the real doc set, assembles the source, runs routeCommercialSections, and shows routed=false + WHY
 * (which §L/§M markers the RFQ uses that the current anchors miss). NO Claude calls.
 */
import { assembleSamDocumentSet } from "@/lib/sam-attachments";
import { routeCommercialSections, detectDocumentClass, ucfHeaderCount } from "@/lib/panel-doc-class";

const NOTICE = "fc808094a7504061a4539003d21f887c", SOL = "N0016726Q1089";

(async () => {
  const set = await assembleSamDocumentSet(NOTICE, SOL);
  if (!set?.primary) { console.log("❌ manifest fetch failed"); process.exit(1); }
  const docs = [set.primary, ...set.attachments];
  const fullSource = docs.map((d) => `\n\n==== DOCUMENT: ${d.name} ====\n\n${d.text ?? ""}`).join("\n\n").trim();
  console.log(`=== #525 REPRO ${SOL} · ${docs.length} docs · ${fullSource.length} chars ===\n`);

  console.log(`route: detectDocumentClass=${detectDocumentClass(fullSource).toUpperCase()} · ucfHeaders=${ucfHeaderCount(fullSource)}`);
  const routed = routeCommercialSections(fullSource);
  console.log(`routeCommercialSections → routed=${routed.routed} · placed keys=[${Object.keys(routed.sectionText).join(",")}]`);
  for (const [k, v] of Object.entries(routed.sectionText)) console.log(`   §${k}: ${v.length} chars`);
  console.log(`   §L present=${!!routed.sectionText["L"]} · §M present=${!!routed.sectionText["M"]} → routed requires BOTH\n`);

  // WHY: what instruction/evaluation phrasing does this RFQ actually use? (the anchors the fix must add)
  const probe = (label: string, re: RegExp) => {
    const m = [...fullSource.matchAll(new RegExp(re.source, "ig"))].slice(0, 3).map((x) => JSON.stringify(fullSource.slice(x.index, x.index! + 60)));
    console.log(`  ${m.length ? "✓" : "·"} ${label.padEnd(42)} ${m.length} hit(s)${m.length ? " — e.g. " + m[0] : ""}`);
  };
  console.log("── §L (instructions) candidate markers ──");
  probe("current anchor: instructions to offerors", /instructions? to (?:offerors|quoters)/);
  probe("52.212-1 (Instructions—Commercial)", /52\.212-1/);
  probe("provide/submit a quote", /(?:provide|submit)(?:\s+\w+){0,3}\s+quote/);
  probe("quote submission / due", /quote.{0,20}(?:due|submit|shall be)/);
  console.log("── §M (evaluation) candidate markers ──");
  probe("current anchor: evaluation criteria/factors", /evaluation (?:criteria|factors?)/);
  probe("52.212-2 (Evaluation—Commercial)", /52\.212-2/);
  probe("award will be made / basis of award", /award will be made|will be awarded|basis (?:for|of) award/);
  probe("LPTA / lowest price technically acceptable", /lowest[- ]priced?[, ]+technically acceptable|LPTA/);
  console.log("── §B/§C candidate markers ──");
  probe("§C anchor: PWS/SOW", /statement of work|performance work statement/);
  probe("§B anchor: price/schedule", /schedule of (?:items|supplies|prices)|price schedule|CLIN/);

  console.log(`\n⌖ REPRO ${routed.routed ? "FAILED (routed=true — unexpected)" : "CONFIRMED: routed=false → whole-source fallback (#525)"}`);
  process.exit(routed.routed ? 1 : 0);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
