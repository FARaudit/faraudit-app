// $0 offline probe: replicate the Run-Audit front-door coverage check on a live
// solicitation to find WHY §C/§L/§M show "missing" — scanned/image-only vs slow
// vs genuinely absent. Read-only, no DB, no paid model calls. Usage:
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/probe-coverage.ts 1240LP26Q0067
import { fetchSolicitationByNoticeId } from "@/lib/sam";
import { fetchAttachmentManifest, planDocumentOrder, classifySectionRoles, type DocumentPlanEntry } from "@/lib/sam-attachments";
import { extractText } from "@/lib/pdf-text-extractor";
import { detectSections } from "@/lib/section-boundary-detector";

const SF30_COVER_RE = /sf[\s-]?30|amendment of solicitation|amendment\/modification of contract|\bamd\b|\bamendment\b/i;
const REAL_SOL_BODY_RE = /\bsolicitation\b|\brf[qp]\b|sf[\s-]?1449|sf[\s-]?1442|sf[\s-]?33\b|sf[\s-]?0?18\b/i;
function pickContentPrimary(plan: DocumentPlanEntry[]): DocumentPlanEntry | null {
  const forms = plan.filter((e) => e.role === "form");
  const pool = forms.length > 0 ? forms : plan;
  if (pool.length === 0) return null;
  const score = (e: DocumentPlanEntry): number => {
    const isCover = SF30_COVER_RE.test(e.name);
    const isBody = REAL_SOL_BODY_RE.test(e.name);
    if (isBody && !isCover) return 2;
    if (isBody) return 1;
    return 0;
  };
  return [...pool].sort((a, b) =>
    score(b) - score(a) || (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1) || a.name.localeCompare(b.name)
  )[0];
}

async function main() {
  const ref = process.argv[2] || "1240LP26Q0067";
  const apiKey = process.env.SAM_API_KEY;
  console.log(`\n=== PROBE ${ref} ===  SAM key: ${apiKey ? "present" : "MISSING"}`);

  const sol = await fetchSolicitationByNoticeId(ref);
  if (!sol?.noticeId) { console.log("RESULT: not resolvable (no noticeId)"); return; }
  console.log(`sol#: ${sol.solicitationNumber}  notice: ${sol.noticeId}  title: ${sol.title}`);

  const manifest = await fetchAttachmentManifest(sol.noticeId);
  if (!manifest?.length) { console.log("RESULT: no documents in manifest"); return; }
  const plan = planDocumentOrder(manifest, sol.solicitationNumber);
  console.log(`\n--- posted package (${plan.length} docs) ---`);
  for (const e of plan) {
    const roles = classifySectionRoles(e.name);
    const mb = e.sizeBytes != null ? (e.sizeBytes / 1024 / 1024).toFixed(2) + "MB" : "?";
    console.log(`  [${e.role}] ${e.name}  (${mb})  nameRoles=${roles.join(",") || "-"}`);
  }

  const primary = pickContentPrimary(plan);
  console.log(`\n--- content read (the combined body) ---`);
  if (!primary) { console.log("no primary form to read"); return; }
  console.log(`picked: ${primary.name}`);

  const t0 = Date.now();
  const url = primary.url.includes("api_key=") ? primary.url
    : `${primary.url}${primary.url.includes("?") ? "&" : "?"}api_key=${apiKey}`;
  let buf: Buffer;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60000) });
    if (!res.ok) { console.log(`download HTTP ${res.status} -> would be null (name-only fallback)`); return; }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) { console.log(`download FAILED (${(e as Error).message}) -> null fallback`); return; }
  const dlMs = Date.now() - t0;
  console.log(`downloaded ${(buf.length/1024/1024).toFixed(2)}MB in ${dlMs}ms  (front-door budget = 13000ms)`);
  console.log(`magic: ${buf.subarray(0,4).toString("latin1")}`);

  const te0 = Date.now();
  let doc;
  try { doc = await extractText(buf); }
  catch (e) { console.log(`extractText THREW (${(e as Error).message}) -> null fallback`); return; }
  const { meaningfulCharCount, MIN_TEXT_CHARS_FOR_TEXT_BLOCK } = await import("@/lib/pdf-text-extractor");
  const meaningful = meaningfulCharCount(doc.rawText || "");
  console.log(`extractText: method=${doc.extractionMethod}  rawChars=${doc.rawText?.length ?? 0}  meaningfulChars=${meaningful}  pageCount=${doc.pageCount}  in ${Date.now()-te0}ms`);
  console.log(`warnings: ${doc.warnings.join(" | ") || "none"}`);
  console.log(`text sample (first 300): ${JSON.stringify((doc.rawText||"").slice(0,300))}`);

  const imageOnly = doc.extractionMethod === "fallback" || meaningful < MIN_TEXT_CHARS_FOR_TEXT_BLOCK || doc.warnings.some((w) => w.startsWith("LOW_TEXT_YIELD"));
  console.log(`\n>>> READABLE BY TEXT-EXTRACT? ${imageOnly ? "NO (scanned/image-only or low-text -> resolve returns NULL -> name-only -> false 'missing')" : "YES"}`);

  const bag = detectSections(doc);
  const s = bag.sections;
  console.log(`\n--- detectSections (with deployed §L/§M commercial fix) ---`);
  console.log(`  C=${!!s["C"]}  L=${!!s["L"]}  M=${!!s["M"]}  I=${!!s["I"]}`);
  console.log(`  all detected headings: ${Object.keys(s).join(", ") || "none"}`);

  const wouldBeContent = !imageOnly;
  console.log(`\n=== VERDICT ===`);
  console.log(`coverageBasis the front door would use: ${wouldBeContent ? "content" : "name_only"}`);
  if (wouldBeContent) {
    console.log(`§L present in body: ${!!s["L"]}   §M present in body: ${!!s["M"]}   §C present in body: ${!!s["C"]}`);
    console.log(dlMs > 13000 ? "BUT download exceeded the 13s budget -> front door TIMED OUT -> name-only -> false missing" : "and within the 13s budget -> sections SHOULD now show present");
  }
}
main().catch((e) => { console.error("PROBE ERROR:", e); process.exit(1); });
