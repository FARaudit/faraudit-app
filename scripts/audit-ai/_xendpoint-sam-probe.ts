// $0 CROSS-ENDPOINT SAM DIAGNOSIS — settle whether this session's "API errors" are (a) endpoint/auth divergence,
// (b) a stale internal index, or (c) genuine not-found data. Probes the SAME key against BOTH hosts.
//   HOST A (what the codebase uses): https://sam.gov/api/prod/...  — the website's INTERNAL api (no date window)
//   HOST B (official developer gateway): https://api.sam.gov/...   — rate-governed, REQUIRES postedFrom/postedTo
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const KEY = process.env.SAM_API_KEY!;
const A = "https://sam.gov/api/prod/opportunities/v2/search";
const B = "https://api.sam.gov/opportunities/v2/search";
const SOLS = ["FA813726R0033" /*control*/, "1240LP26Q0067", "SPRDL125Q0030"];
// ≤1yr window for the official host (357 days).
const win = "&postedFrom=08/01/2025&postedTo=07/24/2026";

async function hit(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let n = -1, active = "";
    try { const j = JSON.parse(text); n = (j.opportunitiesData || []).length; active = (j.opportunitiesData || []).map((o: any) => o.active).join(","); }
    catch { /* non-json (html/error) */ }
    const rl = res.headers.get("x-ratelimit-remaining");
    return `HTTP ${res.status}${rl ? ` rl-remain=${rl}` : ""} matches=${n}${active ? ` active=${active}` : ""}${!res.ok ? ` · ${text.slice(0, 90).replace(/\s+/g, " ")}` : ""}`;
  } catch (e) { return `THREW ${e instanceof Error ? e.message : e}`; }
}

(async () => {
  console.log(`SAM_API_KEY len=${KEY?.length ?? 0}\n`);
  for (const sol of SOLS) {
    console.log(`=== ${sol} ===`);
    console.log(`  A internal  solnum : ${await hit(`${A}?api_key=${KEY}&solnum=${sol}&limit=3`)}`);
    console.log(`  B official  solnum : ${await hit(`${B}?api_key=${KEY}&solnum=${sol}&limit=3${win}`)}`);
    console.log("");
  }
})();

// archived-inclusive internal search (window surfaces past-deadline notices the website still lists)
(async () => {
  console.log("\n### INTERNAL endpoint, archived-inclusive (357d window) — typo vs expired ###");
  const w = "&postedFrom=08/01/2025&postedTo=07/24/2026";
  for (const sol of ["1240LP26Q0067","SPRDL125Q0030","FA813726R0033"]) {
    console.log(`  ${sol}: ${await hit(`${A}?api_key=${KEY}&solnum=${sol}&limit=5${w}`)}`);
  }
})();
