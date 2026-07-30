// $0 SAM solnum probe — raw HTTP status + match count for control + the 2 targets, to distinguish
// "endpoint/key broken" from "genuinely no SAM record". Read-only.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const KEY = process.env.SAM_API_KEY!;
const SAM = "https://sam.gov/api/prod/opportunities/v2/search";
const SOLS = ["FA813726R0033" /*control — known to exist*/, "1240LP26Q0067", "SPRDL125Q0030"];

async function probe(sol: string) {
  for (const p of ["solnum", "noticeid"] as const) {
    const url = `${SAM}?api_key=${KEY}&${p}=${encodeURIComponent(sol)}&limit=3`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const body = await res.text();
      let n = -1, titles: string[] = [];
      try { const j = JSON.parse(body); n = (j.opportunitiesData || []).length; titles = (j.opportunitiesData || []).map((o: any) => `${o.solicitationNumber ?? o.solNumber ?? "?"}|active=${o.active}`); } catch {}
      console.log(`  ${sol} [${p}] HTTP ${res.status} matches=${n} ${titles.join(" , ") || (res.ok ? "" : body.slice(0, 120))}`);
    } catch (e) { console.log(`  ${sol} [${p}] THREW ${e instanceof Error ? e.message : e}`); }
  }
}
(async () => { for (const s of SOLS) { console.log(`\n=== ${s} ===`); await probe(s); } })();

// windowed probe (archived notices need postedFrom/postedTo)
(async () => {
  console.log("\n\n### WINDOWED (2025-01-01..2026-12-31, catches archived) ###");
  for (const sol of ["1240LP26Q0067","SPRDL125Q0030"]) {
    const url = `${SAM}?api_key=${KEY}&solnum=${encodeURIComponent(sol)}&postedFrom=01/01/2025&postedTo=12/31/2026&limit=5`;
    try { const res = await fetch(url,{signal:AbortSignal.timeout(15000)}); const b = await res.text();
      let n=-1, info:string[]=[]; try{const j=JSON.parse(b); n=(j.opportunitiesData||[]).length; info=(j.opportunitiesData||[]).map((o:any)=>`${o.solicitationNumber}|active=${o.active}|posted=${o.postedDate}|arch=${o.archiveDate??"?"}`);}catch{}
      console.log(`  ${sol} HTTP ${res.status} matches=${n} ${info.join(" , ")||b.slice(0,120)}`);
    } catch(e){ console.log(`  ${sol} THREW ${e instanceof Error?e.message:e}`);} }
})();
