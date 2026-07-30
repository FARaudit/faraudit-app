// SEQ-4 CANDIDATE FINDER ($0) — source-rich set-aside solicitations for the INELIGIBLE/NHR pathway (Brain #642).
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_seq4-candidate-finder.ts
// Sweeps SAM for ACTIVE set-aside RFPs (any program), keeps those with ≥1 real attachment, censuses the top few
// (chars, routing class, item-6 doc listing), ranks UCF-preferred + comfortably above the machine-readable floor.
// NO Claude calls (SAM search + attachment fetch + pdf-parse only). Selection per Brain #642: real attachment ·
// above floor · UCF routing preferred (decouples from #271) · census + item-6 reconcile · fallback-mult projection.
import { fetchSolicitationByNoticeId } from "../../src/lib/sam";
import { resolveSamDescription } from "../../src/lib/sam-description";
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText, meaningfulCharCount } from "../../src/lib/pdf-text-extractor";
import { detectDocumentClass, ucfHeaderCount } from "../../src/lib/panel-doc-class";

const SAM_KEY = process.env.SAM_API_KEY || "";
const SAM_SEARCH = "https://sam.gov/api/prod/opportunities/v2/search";
const FLOOR_CHARS = 2000, RICH_CHARS = 20000;

// UCF-likely, attachment-heavy families: services / construction / facilities RFPs (§A–M structure + real docs).
// (Set-aside codes: SDVOSBC=SDVOSB · 8A=8(a) · HZC=HUBZone · WOSB=WOSB.)
const PROBES: Array<{ setAside: string; naics: string; label: string }> = [
  { setAside: "SDVOSBC", naics: "236220", label: "SDVOSB · commercial construction" },
  { setAside: "SDVOSBC", naics: "561210", label: "SDVOSB · facilities support" },
  { setAside: "8A", naics: "541330", label: "8(a) · engineering services" },
  { setAside: "8A", naics: "561210", label: "8(a) · facilities support" },
  { setAside: "HZC", naics: "561720", label: "HUBZone · janitorial" },
  { setAside: "WOSB", naics: "541611", label: "WOSB · admin consulting" },
];

function fmt(d: Date) { return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`; }

async function search(setAside: string, naics: string) {
  const to = new Date(), from = new Date(to.getTime() - 45*86400_000);
  const p = new URLSearchParams({ api_key: SAM_KEY, naicsCode: naics, typeOfSetAside: setAside, postedFrom: fmt(from), postedTo: fmt(to), limit: "20", offset: "0", ptype: "o,k,r" });
  try {
    const res = await fetch(`${SAM_SEARCH}?${p.toString()}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.opportunitiesData || []) as any[];
  } catch { return []; }
}

(async () => {
  if (!SAM_KEY) { console.log("❌ SAM_API_KEY not set"); process.exit(1); }
  console.log(`=== SEQ-4 CANDIDATE FINDER — source-rich set-asides (Brain #642) ===`);
  const now = Date.now();
  const seen = new Set<string>();
  const withDocs: Array<{ notice: string; sol: string; title: string; setAside: string; naics: string; deadline: string | null; links: number; label: string }> = [];

  for (const probe of PROBES) {
    const opps = await search(probe.setAside, probe.naics);
    let kept = 0;
    for (const o of opps) {
      const nid = o.noticeId as string; if (!nid || seen.has(nid)) continue;
      const links = Array.isArray(o.resourceLinks) ? o.resourceLinks.length : 0;
      const deadline = o.responseDeadLine as string | null;
      const active = !deadline || new Date(deadline).getTime() > now;
      if (links < 1 || !active) continue;
      seen.add(nid); kept++;
      withDocs.push({ notice: nid, sol: o.solicitationNumber ?? "?", title: (o.title||"").slice(0,60), setAside: o.typeOfSetAside ?? probe.setAside, naics: o.naicsCode ?? probe.naics, deadline, links, label: probe.label });
      if (kept >= 4) break;
    }
    console.log(`  probe [${probe.label}] setAside=${probe.setAside} naics=${probe.naics} → ${opps.length} hits, ${kept} active-with-docs`);
  }

  console.log(`\n--- ${withDocs.length} candidates with ≥1 attachment + active deadline. Censusing top ${Math.min(6, withDocs.length)} ---`);
  const ranked: Array<any> = [];
  for (const c of withDocs.slice(0, 6)) {
    const sol = await fetchSolicitationByNoticeId(c.notice);
    const resolved = sol ? await resolveSamDescription(sol.noticeId, sol.description) : null;
    const body = resolved?.fetched ? resolved.text : "";
    const set = await assembleSamDocumentSet(c.notice, c.sol).catch(() => null);
    const bufs = set ? ([set.primary, ...set.attachments].filter(Boolean) as Array<{ name: string; buffer: Buffer }>) : [];
    let chars = body.trim().length, assembled = "\n" + body;
    const listing: string[] = body.trim().length ? [`[NOTICE BODY] ${body.length}c`] : [];
    for (const d of bufs) {
      let text = ""; try { const ex = await extractText(d.buffer); text = ex?.rawText ?? ""; } catch {}
      const n = text.trim().length; chars += n; assembled += "\n" + text;
      listing.push(`${d.name.slice(0,36)} ${n}c`);
    }
    const hdrs = ucfHeaderCount(assembled);
    const klass = detectDocumentClass(assembled);
    const score = (klass === "ucf" ? 100 : 0) + Math.min(50, chars / 1000) + (chars >= RICH_CHARS ? 30 : 0);
    ranked.push({ ...c, chars, docs: bufs.length + (body.trim().length?1:0), hdrs, klass, listing, score, aboveFloor: chars >= FLOOR_CHARS });
    console.log(`\n  ${c.sol} · ${c.setAside} · NAICS ${c.naics} · ${c.title}`);
    console.log(`    notice=${c.notice} · deadline=${c.deadline} · docs=${bufs.length + (body.trim().length?1:0)} · chars=${chars.toLocaleString()} · UCFhdrs=${hdrs} · route=${klass.toUpperCase()} · ${chars>=FLOOR_CHARS?"✓above floor":"✗THIN"}`);
    console.log(`    docs: ${listing.join(" · ")}`);
  }

  ranked.sort((a,b) => b.score - a.score);
  console.log(`\n=== RANKED (UCF + source-rich first) ===`);
  ranked.forEach((r,i) => console.log(`  ${i+1}. ${r.sol} · ${r.setAside} · route=${r.klass.toUpperCase()} · ${r.chars.toLocaleString()}c · ${r.aboveFloor?"OK":"THIN"} · score=${r.score.toFixed(0)}`));
  process.exit(0);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
