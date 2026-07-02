// Part-15 UCF socioeconomic NEGATIVE-ANCHOR recon (path C; card-193 PART-2 spec; upgraded card 200).
// $0 model cost, READ-ONLY vs SAM, AUTHORS NOTHING (no fixtures/registry/freezes/gold-set writes). Rule 32:
// never prints the key. Searches SAM v2 for competitive socioeconomic set-asides in STAGED windows
// (120d → 240d → 365d, stop at the first stage with ≥1 viable), downloads top candidates to an EPHEMERAL
// scratch dir (/tmp), and applies the full gate battery per candidate:
//   a) TRUE UCF Part-15 structure — detectSections => formatDetected==="UCF" AND real §B/§C/§L/§M headers (verbatim cites)
//   b) NOT an SF-1449 / SF-18 / 52.212-1 commercial form (the SP3300 failure mode)
//   c) body-prose set-aside confirmation — SOCIOECONOMIC_SETASIDE_RE in the BODY (not just metadata; the 1240LP rule)
//   d) operative 52.219-x set-aside clause present
//   e) CONSTRUCTION / OUT-OF-SCOPE gate — reject NAICS ^23 AND run the REAL detectConstructionOutOfScope over the
//      retrieved text (every OOS tier honored, not a NAICS-only proxy) — an anchor that trips OOS never reaches NHR
//   f) zero coexisting structural bars (sole-source/brand-name/QPL/clearance/no-substitution/proprietary)
//   g) size/token estimate + response-deadline note (past-deadline is FINE for a static fixture — annotate, don't reject)
// Prints stage reached · viable SHORTLIST (full gate evidence) · DISQUALIFIED (one-line reasons). HOLDS.
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { detectSections, detectConstructionOutOfScope } from "@/lib/section-boundary-detector";
config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });

const KEY = process.env.SAM_API_KEY;
if (!KEY) { console.error("SAM_API_KEY absent"); process.exit(1); }

// Mirror of audit-decide's patterns (const, not exported there) — recon-local copies.
const SOCIOECONOMIC_SETASIDE_RE = /8\(a\)|\bHUBZone\b|\bSDVOSB\b|service.?disabled.?veteran|\bWOSB\b|\bEDWOSB\b|women.?owned|economically disadvantaged/i;
const CLAUSE_52219_RE = /\b52\.219-(?:3|6|7|14|27|29|30)\b/;               // operative set-aside clauses
const STRUCTURAL_BAR_RE = /sole.?source|brand.?name|named (?:oem|manufacturer|source|dealer|firm|awardee)|single (?:source|approved|authorized)|non.?competit|directed award|\bQPL\b|\bQML\b|qualified (?:products?|manufacturers?) list|approved (?:source|manufactur)|no substitut|proprietary|security clearance|facility (?:clearance|certification|security)/i;
const SF1449_RE = /SF\s*1449|SOLICITATION\/CONTRACT\/ORDER\s+FOR\s+COMMERCIAL/i;
const SF18_RE = /\bSF[-\s]?18\b|REQUEST\s+FOR\s+QUOTATION/i;
const COMMERCIAL_INSTR_RE = /\b52\.212-1\b/;
const UCF_HEADER = (L: string) => new RegExp(`^\\s*SECTION\\s+${L}\\b|^\\s*Section\\s+${L}\\s*[-–—:]`, "im");
const SETASIDE_CITE_RE = /(?:100%?\s*set.?aside[^.\n]{0,60}|set.?aside[^.\n]{0,40}(?:8\(a\)|HUBZone|SDVOSB|WOSB|EDWOSB|women.?owned|service.?disabled)[^.\n]{0,40})/i;

const SETASIDES: [string, string][] = [["8A", "8(a)"], ["SDVOSBC", "SDVOSB"], ["WOSB", "WOSB"], ["EDWOSB", "EDWOSB"], ["HZC", "HUBZone"]];
const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
const SEARCH = "https://sam.gov/api/prod/opportunities/v2/search";
const SCRATCH = "/tmp/card200-recon";
const TOPN = 30;              // per-stage gate budget
const VIABLE_CAP = 5;        // stop gating a stage once this many viable found (bounds downloads)
mkdirSync(SCRATCH, { recursive: true });

function pdftotext(path: string): string {
  try { return execFileSync("pdftotext", ["-layout", path, "-"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8"); }
  catch { try { return execFileSync("pdftotext", [path, "-"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8"); } catch { return ""; } }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isConstructionNaics = (n: string | null) => !!n && /^23\d{4}$/.test(n);
const isProd = (psc: string | null) => typeof psc === "string" && /^[0-9]/.test(psc);   // supply
const isService = (psc: string | null) => typeof psc === "string" && /^[A-Z]/i.test(psc);

interface Cand { code: string; label: string; noticeId: string; sol: string | null; title: string; agency: string; isDoD: boolean; naics: string | null; psc: string | null; type: string | null; posted: string | null; deadline: string | null; }

async function searchWindow(days: number): Promise<Cand[]> {
  const to = new Date(); const from = new Date(to.getTime() - days * 86400_000);
  const cands: Cand[] = [];
  for (const [code, label] of SETASIDES) {
    const params = new URLSearchParams({ api_key: KEY!, typeOfSetAside: code, postedFrom: fmt(from), postedTo: fmt(to), limit: "200", offset: "0", ptype: "o,k" });
    try {
      const res = await fetch(`${SEARCH}?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) { console.error(`  ${code}: HTTP ${res.status}`); continue; }
      const opps = (await res.json()).opportunitiesData || [];
      let kept = 0;
      for (const o of opps) {
        if (!Array.isArray(o.resourceLinks) || !o.resourceLinks.length) continue;
        const agency = o.fullParentPathName ?? o.department ?? "";
        cands.push({ code, label, noticeId: o.noticeId, sol: o.solicitationNumber ?? null, title: (o.title || "").slice(0, 80), agency,
          isDoD: /DEFENSE|ARMY|NAVY|AIR FORCE|MARINE|DLA|SPACE FORCE|DEPT OF THE/i.test(agency),
          naics: o.naicsCode ?? o.naics ?? null, psc: o.classificationCode ?? null, type: o.type ?? null, posted: o.postedDate ?? null, deadline: o.responseDeadLine ?? null });
        kept++;
      }
      console.error(`  ${code}: ${opps.length} returned, ${kept} with packages`);
    } catch (e: any) { console.error(`  ${code}: ${e.message}`); }
    await sleep(1000);
  }
  // Rank: non-construction NAICS FIRST (construction can't pass gate e — sink it), then DoD, supply/service PSC,
  // non-IDIQ, recent.
  const isIDIQ = (x: Cand) => /\bIDIQ\b|indefinite delivery|BPA\b|blanket purchase/i.test(x.title);
  cands.sort((a, b) =>
    (isConstructionNaics(a.naics) !== isConstructionNaics(b.naics)) ? (isConstructionNaics(a.naics) ? 1 : -1) :
    (a.isDoD !== b.isDoD) ? (a.isDoD ? -1 : 1) :
    ((isProd(a.psc) || isService(a.psc)) !== (isProd(b.psc) || isService(b.psc))) ? ((isProd(a.psc) || isService(a.psc)) ? -1 : 1) :
    (isIDIQ(a) !== isIDIQ(b)) ? (isIDIQ(a) ? 1 : -1) :
    String(b.posted).localeCompare(String(a.posted)));
  // de-dup by noticeId (a sol can appear under multiple set-aside queries)
  const seen = new Set<string>();
  return cands.filter((c) => (seen.has(c.noticeId) ? false : (seen.add(c.noticeId), true)));
}

interface Gated { c: Cand; bytes: number; tokens: number; format: string; ucfHeaders: string[]; cites: Record<string, string>; setAsideCite: string | null; hasSF1449: boolean; hasSF18: boolean; has212_1: boolean; bodySetAside: boolean; clause219: string | null; structuralBar: string | null; oos: string | null; deadlineNote: string; pass: boolean; reasons: string[]; path: string; }

async function gate(c: Cand): Promise<Gated> {
  const dir = `${SCRATCH}/${(c.sol || c.noticeId).replace(/[^A-Za-z0-9._-]/g, "_")}/`;
  mkdirSync(dir, { recursive: true });
  const parts: string[] = [];
  try {
    const p = new URLSearchParams({ api_key: KEY!, noticeid: c.noticeId, limit: "5", offset: "0" });
    const res = await fetch(`${SEARCH}?${p}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    const o = res.ok ? ((await res.json()).opportunitiesData || [])[0] : null;
    const links: string[] = o && Array.isArray(o.resourceLinks) ? o.resourceLinks : [];
    if (o && typeof o.description === "string" && o.description.startsWith("http")) {
      try { const r = await fetch(`${o.description}${o.description.includes("?") ? "&" : "?"}api_key=${KEY}`, { signal: AbortSignal.timeout(30000) }); if (r.ok) parts.push((await r.json()).description ?? ""); } catch {}
    }
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
  } catch (e: any) { console.error(`     fetch error: ${e.message}`); }

  const body = parts.join("\n\n");
  const bytes = Buffer.byteLength(body, "utf8");
  const bag = detectSections({ pages: [{ pageNum: 1, text: body, lines: body.split("\n").map((l) => l.trim()).filter(Boolean) }], rawText: body, pageCount: 1, extractionMethod: "fallback", warnings: [] } as any);
  const cites: Record<string, string> = {}; const ucfHeaders: string[] = [];
  for (const L of ["B", "C", "L", "M"]) { const m = UCF_HEADER(L).exec(body); if (m) { ucfHeaders.push(L); cites[L] = m[0].trim().slice(0, 60); } }
  const hasSF1449 = SF1449_RE.test(body), hasSF18 = SF18_RE.test(body), has212_1 = COMMERCIAL_INSTR_RE.test(body);
  const bodySetAside = SOCIOECONOMIC_SETASIDE_RE.test(body);
  const clause219 = (body.match(CLAUSE_52219_RE) || [])[0] || null;
  const structuralBar = (body.match(STRUCTURAL_BAR_RE) || [])[0] || null;
  const setAsideCite = (body.match(SETASIDE_CITE_RE) || [])[0]?.trim().replace(/\s+/g, " ").slice(0, 120) || null;
  // e) REAL construction/OOS detector over retrieved text (all tiers), plus the NAICS ^23 hard reject.
  const oosDet = detectConstructionOutOfScope({ naicsCode: c.naics, fullText: body });
  const oos = isConstructionNaics(c.naics) ? `NAICS ${c.naics} (sector 23)` : (oosDet ? `${oosDet.tier}: ${oosDet.matchedSignals.join("; ")}` : null);
  const deadlineNote = c.deadline ? `${c.deadline}${new Date(c.deadline) < new Date() ? " (PAST — fine for a static fixture)" : ""}` : "none";

  const reasons: string[] = [];
  if (bag.formatDetected !== "UCF") reasons.push(`a format=${bag.formatDetected} (need UCF)`);
  if (ucfHeaders.length < 4) reasons.push(`a UCF headers [${ucfHeaders.join(",")}] (need B,C,L,M)`);
  if (hasSF1449) reasons.push(`b SF-1449 form`);
  if (hasSF18) reasons.push(`b SF-18 form`);
  if (has212_1) reasons.push(`b 52.212-1 commercial instructions`);
  if (!bodySetAside) reasons.push(`c no set-aside phrase in body`);
  if (!clause219) reasons.push(`d no operative 52.219-x`);
  if (oos) reasons.push(`e OUT_OF_SCOPE ${oos}`);
  if (structuralBar) reasons.push(`f structural bar "${structuralBar}"`);
  if (bytes < 2000) reasons.push(`g body too small (${bytes}B)`);

  return { c, bytes, tokens: Math.round(body.length / 4), format: bag.formatDetected, ucfHeaders, cites, setAsideCite, hasSF1449, hasSF18, has212_1, bodySetAside, clause219, structuralBar, oos, deadlineNote, pass: reasons.length === 0, reasons, path: dir };
}

async function main() {
  const STAGES: [string, number][] = [["A", 120], ["B", 240], ["C", 365]];
  let stageReached = ""; let viable: Gated[] = []; let disq: Gated[] = []; const stageCounts: string[] = [];

  for (const [name, days] of STAGES) {
    console.error(`\n──── STAGE ${name} (posted ≤${days}d) — searching ────`);
    const cands = await searchWindow(days);
    stageReached = name;
    console.error(`  ${cands.length} unique packaged candidates; gating top ${Math.min(TOPN, cands.length)} (stop at ${VIABLE_CAP} viable)`);
    viable = []; disq = [];
    const N = Math.min(TOPN, cands.length);
    for (let i = 0; i < N; i++) {
      const c = cands[i];
      console.error(`  [${name}${i + 1}/${N}] ${c.sol || c.noticeId} (${c.label}) naics=${c.naics} psc=${c.psc} — ${c.title}`);
      const g = await gate(c);
      if (g.pass) viable.push(g); else disq.push(g);
      await sleep(700);
      if (viable.length >= VIABLE_CAP) { console.error(`  reached ${VIABLE_CAP} viable — stopping stage ${name}`); break; }
    }
    stageCounts.push(`Stage ${name} (≤${days}d): ${cands.length} candidates, gated ${viable.length + disq.length}, ${viable.length} viable`);
    if (viable.length >= 1) break;   // stop at first stage with ≥1 viable
  }

  const evidence = (g: Gated) =>
    `${g.c.sol || g.c.noticeId} [${g.c.label}]  "${g.c.title}"\n` +
    `    agency=${g.c.agency}\n` +
    `    NAICS=${g.c.naics} PSC=${g.c.psc} type=${g.c.type} posted=${g.c.posted}\n` +
    `    UCF format=${g.format} headers=[${g.ucfHeaders.join(",")}] cites=${JSON.stringify(g.cites)}\n` +
    `    set-aside(body)=${g.bodySetAside} cite="${g.setAsideCite ?? "—"}" · 52.219=${g.clause219 ?? "none"}\n` +
    `    bar-screen=${g.structuralBar ?? "clean"} · OOS-check=${g.oos ?? "in-scope"} · SF1449=${g.hasSF1449} SF18=${g.hasSF18} 52.212-1=${g.has212_1}\n` +
    `    deadline=${g.deadlineNote} · size=${(g.bytes / 1024).toFixed(0)}KB ~${g.tokens} tok · noticeId=${g.c.noticeId}\n` +
    `    path=${g.path}`;

  console.log(`\n════════════════════ CARD 200 — PART-15 UCF RECON (staged) ════════════════════`);
  stageCounts.forEach((s) => console.log(`  ${s}`));
  console.log(`\nSTAGE REACHED: ${stageReached}`);
  console.log(`\n──────── VIABLE SHORTLIST (a-g all pass) : ${viable.length} ────────`);
  if (!viable.length) console.log("  (none)");
  viable.forEach((g, i) => console.log(`\n${i + 1}. ${evidence(g)}`));
  console.log(`\n──────── DISQUALIFIED (last stage gated) : ${disq.length} ────────`);
  disq.forEach((g) => console.log(`✗ ${g.c.sol || g.c.noticeId} [${g.c.label}] naics=${g.c.naics} — ${g.reasons.join(" · ")}`));

  if (!viable.length && stageReached === "C") {
    console.log(`\n════ EXHAUSTED — all 3 stages (≤120/240/365d) returned ZERO viable non-construction UCF Part-15 socioeconomic negatives.`);
    console.log(`Per Brain's pre-declared fallback: the hunt ENDS (no stage D, no new axes). NHR live-proof shifts to the Part-12`);
    console.log(`grounding track; the deriveVerdict unit-scope record stands. AUTHOR NOTHING.`);
  } else {
    console.log(`\nHOLD — nothing authored/frozen/registered. Sources in ${SCRATCH}/ (ephemeral). Awaiting CEO/Brain selection.`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("recon error:", e?.message || e); process.exit(1); });
