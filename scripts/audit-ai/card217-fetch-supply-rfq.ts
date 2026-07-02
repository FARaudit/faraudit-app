// Card 217 Step 4 — pull ONE fresh, never-seen Part-12 SF-1449 TOTAL-SMALL-BUSINESS SUPPLY RFQ from SAM.
// Search typeOfSetAside=SBA (Total Small Business) + SBP (Partial), ptype=o,k; gate for: supply/mfr NAICS
// (sector 31-33/42/44/45), SF-1449 + 52.212-1 (Part-12 commercial), has resource packages; prefer one that
// cites 52.219-33 / nonmanufacturer (exercises the new NMR key-fact). Download docs → pdftotext → assemble
// fullSource → write to gold-sets/ for the paid run. $0 (SAM fetch only; no model).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const KEY = process.env.SAM_API_KEY;
if (!KEY) { console.error("no SAM_API_KEY"); process.exit(2); }
const SEARCH = "https://sam.gov/api/prod/opportunities/v2/search";
const SCRATCH = "/tmp/card217-supply"; mkdirSync(SCRATCH, { recursive: true });
const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pdftotext = (p: string): string => { try { return execFileSync("pdftotext", ["-layout", p, "-"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8"); } catch { return ""; } };
const isSupplyNaics = (n: string | null) => !!n && /^(3[1-3]|42|4[45])\d{4}$/.test(n); // NAICS = 6 digits (sector 31-33 mfg / 42 wholesale / 44-45 retail)

interface Cand { code: string; noticeId: string; sol: string | null; title: string; agency: string; naics: string | null; psc: string | null; posted: string | null; deadline: string | null; }

async function search(): Promise<Cand[]> {
  const to = new Date(); const from = new Date(to.getTime() - 150 * 86400_000);
  const out: Cand[] = [];
  for (const code of ["SBA", "SBP"]) {
    const p = new URLSearchParams({ api_key: KEY!, typeOfSetAside: code, postedFrom: fmt(from), postedTo: fmt(to), limit: "300", offset: "0", ptype: "o,k" });
    try {
      const res = await fetch(`${SEARCH}?${p}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) { console.error(`  ${code}: HTTP ${res.status}`); continue; }
      const opps = (await res.json()).opportunitiesData || [];
      let kept = 0;
      for (const o of opps) {
        if (!Array.isArray(o.resourceLinks) || !o.resourceLinks.length) continue;
        const naics = o.naicsCode ?? o.naics ?? null;
        if (!isSupplyNaics(naics)) continue;                       // supply/manufacturing only
        out.push({ code, noticeId: o.noticeId, sol: o.solicitationNumber ?? null, title: (o.title || "").slice(0, 80),
          agency: o.fullParentPathName ?? o.department ?? "", naics, psc: o.classificationCode ?? null, posted: o.postedDate ?? null, deadline: o.responseDeadLine ?? null });
        kept++;
      }
      console.error(`  ${code}: ${opps.length} returned, ${kept} supply-NAICS w/ packages`);
    } catch (e: any) { console.error(`  ${code}: ${e.message}`); }
    await sleep(1000);
  }
  const seen = new Set<string>();
  const dedup = out.filter((c) => (seen.has(c.noticeId) ? false : (seen.add(c.noticeId), true)));
  // prefer most-recent, DoD (DLA emits many SF-1449 supply set-asides), non-IDIQ
  const isIDIQ = (x: Cand) => /\bIDIQ\b|indefinite delivery|BPA\b|blanket/i.test(x.title);
  const isDoD = (x: Cand) => /DEFENSE|ARMY|NAVY|AIR FORCE|MARINE|DLA|LOGISTICS/i.test(x.agency);
  dedup.sort((a, b) => (isDoD(a) !== isDoD(b)) ? (isDoD(a) ? -1 : 1) : (isIDIQ(a) !== isIDIQ(b)) ? (isIDIQ(a) ? 1 : -1) : String(b.posted).localeCompare(String(a.posted)));
  return dedup;
}

async function assemble(c: Cand): Promise<{ text: string; bytes: number }> {
  const dir = `${SCRATCH}/${(c.sol || c.noticeId).replace(/[^A-Za-z0-9._-]/g, "_")}/`; mkdirSync(dir, { recursive: true });
  const parts: string[] = [];
  const p = new URLSearchParams({ api_key: KEY!, noticeid: c.noticeId, limit: "5", offset: "0" });
  const res = await fetch(`${SEARCH}?${p}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const o = res.ok ? ((await res.json()).opportunitiesData || [])[0] : null;
  if (o?.description && typeof o.description === "string" && o.description.startsWith("http")) {
    try { const r = await fetch(`${o.description}${o.description.includes("?") ? "&" : "?"}api_key=${KEY}`, { signal: AbortSignal.timeout(30000) }); if (r.ok) parts.push((await r.json()).description ?? ""); } catch {}
  }
  const links: string[] = o && Array.isArray(o.resourceLinks) ? o.resourceLinks : [];
  let li = 0;
  for (const link of links) {
    li++;
    try {
      const r = await fetch(`${link}${link.includes("?") ? "&" : "?"}api_key=${KEY}`, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) continue;
      const cd = r.headers.get("content-disposition") || "";
      const nm = (cd.match(/filename="?([^"]+)"?/) || [])[1] || `att-${li}`;
      const buf = Buffer.from(await r.arrayBuffer());
      const fp = `${dir}${String(li).padStart(2, "0")}-${nm.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      writeFileSync(fp, buf);
      if (/\.pdf$/i.test(nm) || buf.slice(0, 4).toString() === "%PDF") parts.push(pdftotext(fp));
      else if (/\.(txt|csv|xml|json)$/i.test(nm)) parts.push(buf.toString("utf8"));
    } catch {}
    await sleep(500);
  }
  const text = parts.filter(Boolean).join("\n\n===== DOC BREAK =====\n\n");
  return { text, bytes: text.length };
}

(async () => {
  console.error("searching SAM (Total/Partial Small Business, supply NAICS, ptype o,k, 150d)…");
  const cands = await search();
  console.error(`\n${cands.length} candidate supply SB set-asides. Gating top 12 for Part-12 SF-1449…\n`);
  let picked: { c: Cand; text: string; hasNmr: boolean } | null = null;
  const gated: string[] = [];
  for (const c of cands.slice(0, 12)) {
    const { text, bytes } = await assemble(c);
    const hasSF1449 = /SF\s*1449|STANDARD FORM 1449|SOLICITATION\/CONTRACT\/ORDER FOR COMMERCIAL/i.test(text);
    const has2121 = /\b52\.212-1\b/.test(text);
    const hasNmr = /non-?manufacturer|52\.219-33/i.test(text);
    const part12 = hasSF1449 && has2121;
    gated.push(`  ${part12 ? "✅" : "⬜"} ${c.sol || c.noticeId} · NAICS ${c.naics} · ${bytes}B · SF1449=${hasSF1449} 212-1=${has2121} NMR=${hasNmr} · ${c.title}`);
    if (part12 && bytes > 4000 && !picked) picked = { c, text, hasNmr };
    if (part12 && bytes > 4000 && hasNmr) { picked = { c, text, hasNmr }; break; } // prefer an NMR doc
    await sleep(300);
  }
  console.error(gated.join("\n"));
  if (!picked) { console.error("\n❌ no Part-12 SF-1449 supply RFQ found in the gated set — widen window/set-asides."); process.exit(1); }
  const label = (picked.c.sol || picked.c.noticeId).replace(/[^A-Za-z0-9._-]/g, "-");
  const outPath = `scripts/audit-ai/gold-sets/${label}-card217-FULL-SOURCE.txt`;
  writeFileSync(outPath, picked.text);
  console.error(`\n▶ PICKED: ${picked.c.sol || picked.c.noticeId} · NAICS ${picked.c.naics} · ${picked.c.agency}`);
  console.error(`  title: ${picked.c.title}`);
  console.error(`  notice: ${picked.c.noticeId} · posted ${picked.c.posted} · deadline ${picked.c.deadline} · NMR-in-doc=${picked.hasNmr}`);
  console.log(JSON.stringify({ sol: picked.c.sol, noticeId: picked.c.noticeId, naics: picked.c.naics, agency: picked.c.agency, title: picked.c.title, hasNmr: picked.hasNmr, bytes: picked.text.length, path: outPath }));
})();
