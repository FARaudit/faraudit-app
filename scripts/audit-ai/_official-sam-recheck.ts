// Definitive: is api.sam.gov (official) usable with OUR key? Prior probe used a fixed window that may have
// excluded the control's posted date (404=no-match, not auth). Here: read the control's REAL postedDate from the
// internal endpoint, then query the official host with a window that brackets it. 401 ⇒ key not registered for
// official; 200/matches ⇒ official works (our key is fine); 404 with a correct window ⇒ genuine divergence.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const KEY = process.env.SAM_API_KEY!;
const A = "https://sam.gov/api/prod/opportunities/v2/search";
const B = "https://api.sam.gov/opportunities/v2/search";

async function get(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let j: any = null; try { j = JSON.parse(text); } catch {}
  return { status: res.status, j, raw: text.slice(0, 140).replace(/\s+/g, " ") };
}
function mmddyyyy(d: Date) { return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`; }

(async () => {
  // 1) control posted date from internal
  const ctl = await get(`${A}?api_key=${KEY}&solnum=FA813726R0033&limit=1`);
  const posted = ctl.j?.opportunitiesData?.[0]?.postedDate;
  console.log(`control FA813726R0033 internal: status=${ctl.status} postedDate=${posted ?? "?"}`);
  if (!posted) { console.log("no posted date; abort"); process.exit(1); }

  // 2) official host, window bracketing posted date ±20 days (well under the 1yr cap)
  const pd = new Date(posted);
  const from = new Date(pd.getTime() - 20 * 864e5), to = new Date(pd.getTime() + 20 * 864e5);
  const win = `&postedFrom=${mmddyyyy(from)}&postedTo=${mmddyyyy(to)}`;
  const off = await get(`${B}?api_key=${KEY}&solnum=FA813726R0033&limit=3${win}`);
  console.log(`official api.sam.gov (window ${mmddyyyy(from)}..${mmddyyyy(to)}): status=${off.status} matches=${off.j?.opportunitiesData?.length ?? "-"}`);
  console.log(`  raw: ${off.raw}`);
  console.log(`\nVERDICT: ${
    off.status === 401 ? "KEY NOT REGISTERED for official api.sam.gov (401) — pipeline is internal-endpoint-only by necessity"
    : off.status === 200 && (off.j?.opportunitiesData?.length ?? 0) >= 1 ? "OFFICIAL WORKS with our key — a real fallback exists; internal-only dependency is a CHOICE not a constraint"
    : off.status === 404 ? "OFFICIAL 404 even with a correct bracketing window — genuine index/access divergence (deeper)"
    : `other: ${off.status}`
  }`);
})();
