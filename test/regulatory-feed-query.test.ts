// REGULATORY FEED QUERY — the calc-rates class, on /api/regulatory-updates.
//
// Run: npx tsx test/regulatory-feed-query.test.ts
//
// A wrong query parameter that yields HTTP 200 with an empty result set is
// indistinguishable from "nothing was published", forever. src/lib/calc-rates.ts
// documents the identical failure. Measured 2026-08-03, all three feeds behind this
// route were dead and the page fell back to an invented FAR/DFARS clause-change mock:
//   acquisition.gov/rss-feed/farsite-update                        -> HTTP 504
//   acq.osd.mil/dpap/rss-dfars.xml                                 -> HTTP 404
//   federalregister.gov ...topics[]=federal-acquisition-regulation -> HTTP 200, 0 items
//
// The third was the dangerous one: it is not an empty feed, it is an HTML "Request
// Access" interstitial served with status 200 from a bot-blocked endpoint. Nothing
// downstream could tell.
//
// So this gate does NOT assert the URL string — a gate that reads the constant it is
// checking proves only that someone typed it. It executes the real query against the
// live API and asserts the SHAPE of what comes back. Part C plants known-bad inputs so
// a vacuous pass is impossible.
export {};
import {
  federalRegisterUrl,
  parseFederalRegister,
  classifySource,
  extractClauses,
} from "../src/lib/federal-register";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const NET = process.env.SKIP_NETWORK !== "1";

async function main(): Promise<void> {
// ── Part A · the live query returns real, recent documents ──────────────────────
// This is the assertion the old URL could never have satisfied.
console.log("── Part A · live Federal Register query ──");

async function livePart(): Promise<void> {
  if (!NET) {
    console.log("   SKIPPED (SKIP_NETWORK=1) — this is a NAMED skip, not a pass.");
    return;
  }
  const url = federalRegisterUrl();
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  check("live · HTTP 200", res.status === 200, `got HTTP ${res.status}`);

  // The exact trap: the blocked RSS endpoint answers 200 with text/html.
  const ct = res.headers.get("content-type") || "";
  check("live · content-type is JSON, not an HTML interstitial", ct.includes("json"), `content-type was "${ct}"`);

  const body = await res.text();
  check("live · body is not an HTML document", !body.trimStart().startsWith("<"), "body starts with '<' — served HTML");

  // An API that rejects a condition says so. The old topics[] value produced exactly
  // this shape on the JSON path while the .rss path silently 200'd.
  let errs: unknown;
  try { errs = (JSON.parse(body) as { errors?: unknown }).errors; } catch { /* asserted below */ }
  check("live · API reports no condition errors", errs === undefined, `API returned errors: ${JSON.stringify(errs)}`);

  const rows = parseFederalRegister(body);
  check("live · parses to a NON-ZERO document count", rows.length > 0,
    "zero rows — the query no longer matches, which is the defect this gate exists to catch");

  // Recency. 48 CFR rulemaking is continuous; a year of silence means a broken filter,
  // not a quiet docket.
  const dated = rows.filter((r) => r.published_at);
  check("live · documents carry publication dates", dated.length > 0, "no row had published_at");
  if (dated.length > 0) {
    const newest = Math.max(...dated.map((r) => new Date(r.published_at as string).getTime()));
    const ageDays = (Date.now() - newest) / 86_400_000;
    check(`live · newest document is recent (${Math.round(ageDays)}d old)`, ageDays < 365,
      `newest is ${Math.round(ageDays)} days old — filter is likely stale`);
  }

  // Both regimes must actually be reachable through the one query, or this silently
  // became a DFARS-only feed and the FAR half of the page goes permanently empty.
  const kinds = new Set(rows.map((r) => r.source));
  console.log(`   sources present: ${[...kinds].join(", ") || "(none)"} across ${rows.length} rows`);
  check("live · rows classify into far and/or dfars", rows.every((r) => r.source === "far" || r.source === "dfars"),
    `unexpected source label: ${[...kinds].join(", ")}`);

  check("live · every row has a usable link", rows.every((r) => /^https?:\/\//.test(r.link)), "a row had no absolute URL");

  // The live checks above pass on ANY non-empty corpus: classifySource falls back to
  // "far", so pointing this query at, say, CFR title 21 returns 40 FDA rules that all
  // look like valid rows. Found by planting exactly that. So assert the corpus is
  // actually about acquisition — a wrong-but-populated axis is the failure mode a
  // count alone cannot see.
  const onTopic = rows.filter((r) =>
    /acquisition|procurement|contract|federal acquisition regulation|dfars/i.test(r.title + " " + (r.summary || "")),
  );
  check(
    `live · corpus is acquisition rulemaking (${onTopic.length}/${rows.length} on topic)`,
    onTopic.length >= rows.length / 2,
    `only ${onTopic.length} of ${rows.length} rows mention acquisition — wrong corpus, not an empty one`,
  );
}

await livePart();

// ── Part B · the rejected alternatives stay rejected ────────────────────────────
// Both were measured wrong on 2026-08-03. If a future edit swaps the axis to either,
// the page goes quiet in exactly the way that caused this incident.
console.log("\n── Part B · the query uses the CFR-title axis ──");
const built = federalRegisterUrl();
const decoded = decodeURIComponent(built);
check("query · filters on CFR title 48", decoded.includes("conditions[cfr][title]=48"), built);
check("query · does NOT use the dead FAR agency slug (returns count=2, newest 2019)",
  !decoded.includes("federal-acquisition-regulation-system"), built);
check("query · does NOT use a full-text term match (matched a Medicare rule)",
  !decoded.includes("conditions[term]"), built);
check("query · targets the JSON API, not the bot-blocked .rss endpoint",
  decoded.includes("/api/v1/documents.json") && !decoded.includes("search.rss"), built);

// ── Part C · planted positives and negatives: prove each probe can fail ─────────
console.log("\n── Part C · planted inputs (each probe must catch a known bad) ──");

// C1: the actual bytes the blocked endpoint returns must not parse as documents.
const HTML_INTERSTITIAL = "<!DOCTYPE html>\n<html><head><title>Federal Register :: Request Access</title></head></html>";
let threwOnHtml = false;
try { parseFederalRegister(HTML_INTERSTITIAL); } catch { threwOnHtml = true; }
check("C1 · HTML interstitial does not parse into rows", threwOnHtml, "HTML was accepted as a document payload");

// C2: an empty result set must produce zero rows — the route treats that as NOT ok.
check("C2 · empty results yield zero rows", parseFederalRegister('{"results":[]}').length === 0);

// C3/C4: classification, both directions.
check("C3 · DFARS agency classifies as dfars",
  classifySource({ title: "X", agencies: [{ name: "Defense Acquisition Regulations System" }] }) === "dfars");
check("C4 · a FAR Council rule classifies as far",
  classifySource({ title: "Federal Acquisition Regulation: Small Business", agencies: [{ name: "General Services Administration" }] }) === "far");

// C5: the token-collision control. "FAR" lives inside "DFARS"; a classifier without
// word boundaries reports far for a DFARS rule. NEGATIVE control — must not fire.
check("C5 · 'DFARS' in a title does not fall through to far",
  classifySource({ title: "Defense Federal Acquisition Regulation Supplement: Modifications" }) === "dfars");

// C6: clause extraction must find real citations and invent none.
check("C6 · extracts a real clause citation", extractClauses("amends DFARS 252.204-7012 and FAR 52.204-21").length === 2);
check("C7 · extracts nothing from clause-free prose", extractClauses("A notice about paperwork burden.").length === 0);

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
}

// An unawaited main() that rejects must not exit 0. Node's default is a non-zero
// exit on unhandled rejection, but "the default is currently right" is not a gate.
main().catch((err) => { console.error("✗ FAIL  gate threw:", err); process.exit(1); });
