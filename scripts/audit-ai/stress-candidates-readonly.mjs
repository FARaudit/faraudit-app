// STRESS-TEST CANDIDATE FINDER — READ-ONLY. Pulls live from the SAM v2 search API, scores each
// notice for how hard it will be on the engine, and PRINTS a ranked shortlist.
//
// ⛔ IT DOES NOT ENQUEUE AND IT DOES NOT SPEND. The sibling `stress-pull-enqueue.mjs` writes rows to
//    `pending_audits`, which the resident worker claims and RUNS — i.e. it spends money. This file has
//    no Supabase client at all, by construction: G2 says Code never fires a paid run, and the safest
//    way to honour that is to make the capability absent rather than guarded.
//
// Difficulty is SCORED FROM MEASURED BYTES, not guessed from the title. Every attachment is probed
// with a real ranged GET (SAM rejects HEAD on some hosts), so the page/byte volume is what the
// ingest will actually face. No key is ever printed — Rules 32/46.
//
//   npx dotenv -e .env.local -- node scripts/audit-ai/stress-candidates-readonly.mjs

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const KEY = process.env.SAM_API_KEY;
if (!KEY) { console.error("SAM_API_KEY absent from .env.local"); process.exit(2); }

const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
const to = new Date(), from = new Date(to.getTime() - 21 * 86400000);

async function pull(setAside, n) {
  const p = new URLSearchParams({
    api_key: KEY, postedFrom: fmt(from), postedTo: fmt(to),
    limit: String(n), offset: "0", ptype: "o,k,r",
  });
  if (setAside) p.set("typeOfSetAside", setAside);
  const r = await fetch(`https://sam.gov/api/prod/opportunities/v2/search?${p}`, { headers: { Accept: "application/json" } });
  if (!r.ok) { console.error(`  (pull ${setAside || "open"} → HTTP ${r.status})`); return []; }
  return (await r.json()).opportunitiesData || [];
}

// Measure what the ingest will actually have to read.
async function measure(links) {
  let bytes = 0, reachable = 0, unreadable = 0;
  for (const url of links.slice(0, 25)) {
    try {
      const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}api_key=${KEY}`, {
        headers: { Range: "bytes=0-0", Accept: "*/*" }, redirect: "follow",
      });
      const cr = r.headers.get("content-range");
      const n = cr ? parseInt(cr.split("/")[1], 10) : parseInt(r.headers.get("content-length") || "0", 10);
      if (Number.isFinite(n) && n > 0) { bytes += n; reachable++; } else unreadable++;
    } catch { unreadable++; }
  }
  return { bytes, reachable, unreadable };
}

console.log("pulling live from SAM v2 (last 21 days)…\n");
const pools = await Promise.all([pull("", 60), pull("8A", 30), pull("SDVOSBC", 30), pull("WOSB", 20)]);
const byId = new Map();
for (const o of pools.flat()) if (/^[a-f0-9]{32}$/i.test(o.noticeId || "")) byId.set(o.noticeId, o);
const all = [...byId.values()];
console.log(`${all.length} distinct notices with a valid 32-hex notice id\n`);

const docs = (o) => (Array.isArray(o.resourceLinks) ? o.resourceLinks : []);
const isConstruction = (o) => /^23[678]/.test(o.naicsCode || "");
const isCivilian = (o) => !/DEFENSE|DEPT OF DEFENSE|WAR/i.test(o.fullParentPathName || "");
const isAmended = (o) => /amend|sf.?30|modificat/i.test(JSON.stringify(docs(o)) + (o.title || ""));

// Only notices with a real attachment set can stress ingest at all.
const worth = all.filter((o) => docs(o).length >= 3);
console.log(`${worth.length} carry ≥3 attachments — measuring bytes on the top 12 by attachment count…\n`);

const ranked = worth.sort((a, b) => docs(b).length - docs(a).length).slice(0, 12);
const rows = [];
for (const o of ranked) {
  const m = await measure(docs(o));
  // WHY THESE WEIGHTS: each one maps to a stage the engine has actually failed at before.
  const score =
    Math.min(docs(o).length, 30) * 2 +          // cross-document assembly + per-doc coverage
    Math.min(m.bytes / 1_000_000, 25) * 4 +     // the compression boundary (Rule 69)
    (isConstruction(o) ? 25 : 0) +              // part-36 sealed manifest, a separate carrier
    (isAmended(o) ? 20 : 0) +                   // SF-30 supersession — unresolved ⇒ honest INCOMPLETE
    (isCivilian(o) ? 8 : 0) +                   // non-DoD structure, less-exercised path
    m.unreadable * 6;                           // unreachable attachments ⇒ the honest-fail path
  rows.push({ o, m, score });
}
rows.sort((a, b) => b.score - a.score);

console.log("── RANKED BY MEASURED DIFFICULTY ──\n");
for (const [i, { o, m, score }] of rows.entries()) {
  const tags = [
    isConstruction(o) ? "CONSTRUCTION(part-36)" : null,
    isAmended(o) ? "AMENDED" : null,
    isCivilian(o) ? "civilian" : "DoD",
    m.unreadable ? `${m.unreadable} UNREADABLE` : null,
  ].filter(Boolean).join(" · ");
  console.log(`${String(i + 1).padStart(2)}. score ${score.toFixed(0).padStart(3)}  ${o.solicitationNumber || "(no sol#)"}  — ${(o.title || "").slice(0, 68)}`);
  console.log(`      ${docs(o).length} attachments · ${(m.bytes / 1_000_000).toFixed(1)} MB measured · NAICS ${o.naicsCode || "—"} · ${o.typeOfSetAsideDescription || "no set-aside"}`);
  console.log(`      ${o.fullParentPathName || "(no agency path)"}`);
  console.log(`      ${tags}`);
  console.log(`      notice ${o.noticeId}  · due ${o.responseDeadLine || "—"}`);
  console.log();
}
console.log("READ-ONLY — nothing was enqueued and nothing was spent.");
