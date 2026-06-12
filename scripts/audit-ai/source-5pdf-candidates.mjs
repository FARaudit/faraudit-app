// One-shot: source candidates for 5-PDF QA run (STEP 1).
// Queries sam.gov live search per NAICS, filters to future-deadline notices
// with at least one resourceLink, prints compact candidate list as JSON lines.
// Rule 32: never prints the API key.
import { config } from "dotenv";
config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });

const KEY = process.env.SAM_API_KEY;
if (!KEY) { console.error("SAM_API_KEY absent"); process.exit(1); }

const NAICS = ["336413", "332710", "332721", "334511", "541330", "336412", "332999", "541519", "336415"];

function fmt(d) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
const to = new Date();
const from = new Date(to.getTime() - 12 * 86400_000);

const out = [];
for (const n of NAICS) {
  const params = new URLSearchParams({
    api_key: KEY,
    ncode: n,
    postedFrom: fmt(from),
    postedTo: fmt(to),
    limit: "60",
    offset: "0",
    ptype: "o,k", // solicitation + combined synopsis/solicitation only
  });
  const url = `https://sam.gov/api/prod/opportunities/v2/search?${params}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) { console.error(`NAICS ${n}: HTTP ${res.status}`); continue; }
    const data = await res.json();
    const opps = data.opportunitiesData || [];
    for (const o of opps) {
      const dl = o.responseDeadLine ? new Date(o.responseDeadLine) : null;
      if (!dl || dl.getTime() < Date.now()) continue;
      const links = Array.isArray(o.resourceLinks) ? o.resourceLinks : [];
      if (links.length === 0) continue;
      out.push({
        naics: n,
        noticeId: o.noticeId,
        sol: o.solicitationNumber ?? null,
        title: (o.title || "").slice(0, 90),
        agency: o.fullParentPathName ?? o.department ?? null,
        type: o.type ?? null,
        setAside: o.typeOfSetAsideDescription ?? null,
        posted: o.postedDate ?? null,
        deadline: o.responseDeadLine ?? null,
        nLinks: links.length,
        link0: links[0],
      });
    }
    console.error(`NAICS ${n}: ${opps.length} returned, ${out.filter((x) => x.naics === n).length} kept`);
  } catch (e) {
    console.error(`NAICS ${n}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

console.log(JSON.stringify(out, null, 1));
