// $0 fetch of the NO_BID base package FA860126Q00260001 (Brain card-72 ratified base).
// Free SAM API (source of record). Pulls the notice + description + resourceLinks, downloads
// each attachment to scripts/audit-ai/gold-sets/_nobid-base-raw/. Rule 32: never prints the key.
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });

const KEY = process.env.SAM_API_KEY;
if (!KEY) { console.error("SAM_API_KEY absent"); process.exit(1); }

const SOL = "FA860126Q00260001";
const OUT = new URL("./gold-sets/_nobid-base-raw/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const SEARCH = "https://sam.gov/api/prod/opportunities/v2/search";
async function tryQuery(param, value) {
  const params = new URLSearchParams({ api_key: KEY, [param]: value, limit: "25", offset: "0" });
  const res = await fetch(`${SEARCH}?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) { console.error(`${param}=${value}: HTTP ${res.status}`); return []; }
  const data = await res.json();
  return data.opportunitiesData || [];
}

let opps = await tryQuery("solnum", SOL);
if (!opps.length) opps = await tryQuery("noticeid", SOL);
if (!opps.length) { console.error(`No notice for ${SOL} via solnum/noticeid`); process.exit(2); }

const o = opps[0];
const meta = {
  noticeId: o.noticeId, sol: o.solicitationNumber, title: o.title,
  agency: o.fullParentPathName ?? o.department, naics: o.naicsCode ?? o.naics,
  type: o.type, setAside: o.typeOfSetAsideDescription ?? null,
  posted: o.postedDate, deadline: o.responseDeadLine,
  descriptionLink: o.description ?? null,
  resourceLinks: Array.isArray(o.resourceLinks) ? o.resourceLinks : [],
};
console.error(JSON.stringify(meta, null, 1));
writeFileSync(`${OUT}_meta.json`, JSON.stringify(o, null, 1));

// description is a LINK to the noticedesc API on SAM v2
if (typeof o.description === "string" && o.description.startsWith("http")) {
  try {
    const r = await fetch(`${o.description}${o.description.includes("?") ? "&" : "?"}api_key=${KEY}`, { signal: AbortSignal.timeout(30000) });
    if (r.ok) { const j = await r.json(); writeFileSync(`${OUT}_description.txt`, j.description ?? JSON.stringify(j)); console.error(`description: ${(j.description ?? "").length} chars`); }
    else console.error(`description fetch HTTP ${r.status}`);
  } catch (e) { console.error(`description: ${e.message}`); }
}

let i = 0;
for (const link of meta.resourceLinks) {
  i++;
  try {
    const url = `${link}${link.includes("?") ? "&" : "?"}api_key=${KEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) { console.error(`link${i}: HTTP ${r.status}`); continue; }
    const cd = r.headers.get("content-disposition") || "";
    const nm = (cd.match(/filename="?([^"]+)"?/) || [])[1] || `attachment-${i}`;
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(`${OUT}${String(i).padStart(2, "0")}-${nm}`, buf);
    console.error(`link${i}: ${nm} (${buf.length} bytes)`);
  } catch (e) { console.error(`link${i}: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 800));
}
console.error("DONE");
