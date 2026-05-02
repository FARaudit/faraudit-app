// Regulatory AI — daily Railway cron worker.
//
// Pulls 3 feeds:
//   1. GovInfo CFR RSS (FAR/DFARS rule changes)
//   2. GovInfo GAO LEGAL RSS (bid protests)
//   3. Federal Register documents.json (proposed rules, defense agencies)
//
// For each new item, extracts FAR/DFARS clause references. For each clause
// reference, queries the audits table for past audits whose compliance_json
// cited that clause. Emits a Telegram alert "FAR X.Y just updated — affects
// N of your active solicitations" with notice IDs inline.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { sendAlert } from "./telegram.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("regulatory-ai: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

interface RegItem {
  source: "far" | "dfars" | "federal_register" | "gao_protest";
  title: string;
  summary: string | null;
  link: string;
  published_at: string | null;
  affects_clauses: string[];
}

function stripCdataAndTags(s: string): string { return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/<[^>]+>/g, ""); }
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function extractClauses(t: string): string[] {
  const out = new Set<string>();
  const rx = /((?:FAR|DFARS|PGI)\s*\d+\.\d+(?:-\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(t)) !== null) out.add(m[1].toUpperCase().replace(/\s+/g, " "));
  return Array.from(out);
}

async function fetchRSS(url: string, source: RegItem["source"]): Promise<RegItem[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: RegItem[] = [];
    const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) || [];
    for (const b of blocks.slice(0, 50)) {
      const title = decodeEntities(stripCdataAndTags((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "")).trim();
      const link =
        ((b.match(/<link[^>]*href="([^"]+)"/) || [])[1] ||
         (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] ||
         "").trim();
      const desc = decodeEntities(stripCdataAndTags(
        (b.match(/<description>([\s\S]*?)<\/description>/) || [])[1] ||
        (b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] ||
        ""
      )).trim();
      const pub = ((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] ||
                   (b.match(/<published>([\s\S]*?)<\/published>/) || [])[1] ||
                   "").trim();
      if (!title || !link) continue;
      items.push({
        source,
        title,
        summary: desc.slice(0, 600) || null,
        link,
        published_at: pub ? new Date(pub).toISOString() : null,
        affects_clauses: extractClauses(`${title} ${desc}`)
      });
    }
    return items;
  } catch { return []; }
}

async function fetchFedRegister(): Promise<RegItem[]> {
  const url =
    "https://www.federalregister.gov/api/v1/documents.json" +
    "?conditions[agencies][]=defense-acquisition-regulations-system" +
    "&conditions[agencies][]=defense-department" +
    "&per_page=30&order=newest";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ title: string; abstract?: string; html_url: string; publication_date: string }> };
    return (data.results || []).map((d) => ({
      source: "federal_register" as const,
      title: d.title,
      summary: d.abstract || null,
      link: d.html_url,
      published_at: d.publication_date ? new Date(d.publication_date).toISOString() : null,
      affects_clauses: extractClauses(`${d.title} ${d.abstract || ""}`)
    }));
  } catch { return []; }
}

async function auditsCitingClause(clause: string): Promise<Array<{ id: string; notice_id: string | null; agency: string | null }>> {
  // pattern match against compliance_json::text for the clause string
  const { data } = await supabase
    .from("audits")
    .select("id, notice_id, agency, compliance_json")
    .not("compliance_json", "is", null)
    .limit(500);
  const matches: Array<{ id: string; notice_id: string | null; agency: string | null }> = [];
  for (const a of (data || []) as Array<Record<string, unknown>>) {
    const text = JSON.stringify(a.compliance_json || {}).toUpperCase();
    if (text.includes(clause.toUpperCase())) {
      matches.push({ id: String(a.id), notice_id: (a.notice_id as string) || null, agency: (a.agency as string) || null });
    }
  }
  return matches;
}

async function run() {
  console.log(`[regulatory-ai] starting · DRY_RUN=${DRY_RUN}`);

  const [cfr, gao, fedReg] = await Promise.all([
    fetchRSS("https://www.govinfo.gov/rss/cfr.xml", "far"),
    fetchRSS("https://www.govinfo.gov/rss/GAO-LEGAL.xml", "gao_protest"),
    fetchFedRegister()
  ]);
  const all = [...cfr, ...gao, ...fedReg];
  console.log(`[regulatory-ai] pulled ${all.length} items (cfr=${cfr.length} gao=${gao.length} fr=${fedReg.length})`);

  if (all.length === 0) { console.log("[regulatory-ai] nothing to process"); return; }

  // Persist dedupe via UNIQUE (source, link).
  const upsertRows = all.map((r) => ({
    source: r.source,
    clause: r.affects_clauses[0] || null,
    title: r.title,
    summary: r.summary,
    link: r.link,
    published_at: r.published_at,
    affects_clauses: r.affects_clauses,
    fetched_at: new Date().toISOString()
  }));

  // Diff: find which links are new vs already in cache.
  const links = upsertRows.map((r) => r.link);
  const { data: existing } = await supabase
    .from("regulatory_updates")
    .select("link")
    .in("link", links);
  const seenLinks = new Set((existing || []).map((r: { link: string }) => r.link));
  const newOnes = all.filter((r) => !seenLinks.has(r.link));

  if (!DRY_RUN) {
    await supabase
      .from("regulatory_updates")
      .upsert(upsertRows, { onConflict: "source,link" })
      .then(() => null, (e) => console.error("[regulatory-ai] upsert failed:", e));
  }

  // Build alert digest: only NEW items that match a customer's past audit.
  const alerts: string[] = [];
  for (const item of newOnes) {
    if (item.affects_clauses.length === 0) continue;
    for (const clause of item.affects_clauses) {
      const matches = await auditsCitingClause(clause);
      if (matches.length === 0) continue;
      alerts.push(
        `*${clause}* · ${item.source.toUpperCase()}\n_${item.title.slice(0, 120)}_\n→ Affects ${matches.length} of your audit${matches.length === 1 ? "" : "s"}: ${matches.slice(0, 3).map((m) => m.notice_id || "—").join(", ")}\n${item.link}`
      );
      break; // one alert per item
    }
  }

  console.log(`[regulatory-ai] ${newOnes.length} new items · ${alerts.length} match customer audits`);

  if (DRY_RUN) {
    alerts.slice(0, 5).forEach((a) => console.log(`[DRY] ${a}\n`));
    return;
  }

  if (alerts.length > 0) {
    const digest = [
      `*Regulatory AI · ${new Date().toISOString().slice(0, 10)}*`,
      `${alerts.length} update${alerts.length === 1 ? "" : "s"} affecting your audits:`,
      "",
      ...alerts.slice(0, 8)
    ].join("\n\n");
    const sent = await sendAlert(digest);
    if (!sent.ok) console.warn("[regulatory-ai] telegram failed:", sent.reason);
    else console.log("[regulatory-ai] telegram digest sent");
  }
}

run().catch((err) => { console.error("[regulatory-ai] fatal:", err); process.exit(1); });
