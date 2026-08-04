// Federal Register API v1 — the query behind /api/regulatory-updates.
//
// This lives in lib/ rather than inside the route so the query and the parser can be
// exercised directly by test/public/_regulatory-feed-query.test.ts. The defect this
// replaces was a URL that could only ever be checked by reading it.
//
// All three RSS feeds the route previously used were measured dead on 2026-08-03, and
// none has a live replacement:
//   acquisition.gov/rss-feed/farsite-update  -> HTTP 504. The ORIGIN is down, not the
//     path: acquisition.gov/ itself 504s, so no path on that host can be substituted.
//   acq.osd.mil/dpap/rss-dfars.xml           -> HTTP 404, and DPC publishes no
//     replacement feed; the DFARS/PGI index is HTML only.
//   federalregister.gov/documents/search.rss -> HTTP 200 serving an HTML
//     "Request Access" interstitial. That endpoint is bot-blocked UNCONDITIONALLY —
//     it returns the same HTML with no query string at all — so this was never a
//     fixable query. `topics[]=federal-acquisition-regulation` was also invalid on its
//     own terms; the JSON API answers that exact condition with
//     {"errors":{"topics":"invalid value"}} while the .rss path just 200s.
//
// The JSON API is not blocked and is the one live source. It carries both FAR and
// DFARS rulemaking, so it replaces all three feeds rather than one.

export interface RegRow {
  source: string;
  clause: string | null;
  title: string;
  summary: string | null;
  effective_date: string | null;
  link: string;
  published_at: string | null;
  affects_clauses: string[];
}

export interface FrDocument {
  title?: string;
  abstract?: string | null;
  publication_date?: string | null;
  effective_on?: string | null;
  html_url?: string;
  agencies?: Array<{ name?: string; raw_name?: string }> | null;
}

export const FR_DOCUMENTS_API = "https://www.federalregister.gov/api/v1/documents.json";

/** Axis is CFR title 48 — which IS the Federal Acquisition Regulations System — not a
 *  text match and not an agency slug. Both alternatives were measured and rejected:
 *    * agencies[]=federal-acquisition-regulation-system is a REAL slug that returns
 *      count=2, newest 2019. FAR rules are issued jointly by DoD/GSA/NASA, so they are
 *      not filed under it. Filtering by it would look precise and return nothing —
 *      the same failure mode being fixed here.
 *    * conditions[term]="Federal Acquisition Regulation" matches the phrase anywhere in
 *      full text and pulled in a Medicare hospital outpatient payment rule.
 *  Measured 2026-08-03: cfr[title]=48 + RULE/PRORULE = 5557 documents, newest
 *  2026-07-08, agency mix DoD / GSA / NASA / OFPP / Defense Acquisition Regulations
 *  System. */
export function federalRegisterUrl(): string {
  const p = new URLSearchParams();
  p.set("per_page", "40");
  p.set("order", "newest");
  p.append("conditions[cfr][title]", "48");
  p.append("conditions[type][]", "RULE");     // final rules
  p.append("conditions[type][]", "PRORULE");  // proposed rules
  for (const f of ["title", "abstract", "publication_date", "effective_on", "html_url", "agencies"]) {
    p.append("fields[]", f);
  }
  return `${FR_DOCUMENTS_API}?${p.toString()}`;
}

export function extractClauses(text: string): string[] {
  const out = new Set<string>();
  const rx = /((?:FAR|DFARS|PGI)\s*\d+\.\d+(?:-\d+)?)/gi;
  for (const m of text.matchAll(rx)) {
    out.add(m[1].toUpperCase().replace(/\s+/g, " "));
  }
  return Array.from(out);
}

/** FAR vs DFARS from the document's OWN agency list, falling back to its title.
 *  One query returns both, so the label is derived per document rather than by running
 *  two overlapping queries — which would emit the same html_url under two `source`
 *  values and render every DFARS rule on the page twice. */
export function classifySource(doc: FrDocument): "far" | "dfars" {
  const agencies = (doc.agencies || [])
    .map((a) => (a.name || a.raw_name || "").toLowerCase())
    .join(" | ");
  if (agencies.includes("defense acquisition regulations system")) return "dfars";
  // \b is deliberate on both sides: "FAR" collides inside "DFARS" without it.
  if (/\bdfars\b|defense federal acquisition regulation|\b252\.\d/i.test(doc.title || "")) return "dfars";
  return "far";
}

export function parseFederalRegister(body: string): RegRow[] {
  const payload = JSON.parse(body) as { results?: FrDocument[] };
  const rows: RegRow[] = [];
  for (const doc of payload.results || []) {
    const title = (doc.title || "").trim();
    const link = (doc.html_url || "").trim();
    if (!title || !link) continue;

    const summary = (doc.abstract || "").trim();
    const affects = extractClauses(title + " " + summary);
    rows.push({
      source: classifySource(doc),
      clause: affects[0] || null,
      title,
      summary: summary.slice(0, 600) || null,
      // The API publishes this; the RSS shape never did, so it was hardcoded null.
      effective_date: doc.effective_on || null,
      link,
      published_at: doc.publication_date ? new Date(doc.publication_date).toISOString() : null,
      affects_clauses: affects
    });
  }
  return rows;
}
