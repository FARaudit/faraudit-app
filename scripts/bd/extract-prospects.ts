// FA-60 · BD pipeline extraction · corpus moat → DoD award history
//
// Two-source design:
//   1. Supabase audits — proof we already audit these NAICS (moat evidence,
//      logged not gated, since the corpus is sparse vs the SAM universe).
//   2. USAspending.gov spending_by_award — DoD-awarded contracts in target
//      NAICS, last 360 days. USAspending is sourced from FPDS (same federal
//      authoritative award stream SAM derives from), and unlike SAM's
//      opportunities/v2/search ptype=a it actually honors the NAICS filter
//      server-side. SAM was probed first; its naicsCode param is silently
//      dropped on award notices, returning a global unfiltered slice.
//      Pivoted to USAspending after that confirmation. SAM_API_KEY still
//      required by env discipline (Fort Knox enforces it present), but the
//      script does not call SAM at runtime.
//
// Run: cd ~/faraudit-app && npx tsx scripts/bd/extract-prospects.ts
//
// Outputs:
//   scripts/bd/prospects-YYYYMMDD.csv         · all qualified vendors
//   scripts/bd/prospects-top10-YYYYMMDD.csv   · top-10 with state diversity cap
//
// Rules: 20 (execution evidence) · 32 (status-only logs) · 36 (verify gate).

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const NAICS_TARGETS = [
  "332710", "336413", "336415", "332999", "336412", "334511", "335931"
];
const CORPUS_LOOKBACK_DAYS = 30;
const AWARD_WINDOW_DAYS = 360;     // USAspending allows multi-year; we mirror the SAM-window discipline
const MIN_AWARDS_LAST_12MO = 2;
const PAGE_LIMIT = 100;            // USAspending hard cap per response
const PAGE_CAP = 50;               // hard ceiling on pages per NAICS (5K awards each)
const PAUSE_MS = 200;
const TOP_N = 10;
const STATE_CAP = 3;
// Sweet-spot for mid-market defense subs (per-award average value).
const SWEET_LO = 50_000;
const SWEET_HI = 5_000_000;
// ICP guardrails — exclude tier-1 primes that show up due to many micro-awards.
const MAX_TOTAL_VALUE = 25_000_000;   // cumulative 12mo
const MAX_AWARD_COUNT = 40;            // primes fragment hundreds of POs; mid-market subs don't
// Date sanity — USAspending source rows occasionally contain typo'd future
// dates (e.g. 3025-, 2260-). Anything more than 60 days ahead is rejected.
const FUTURE_DATE_HORIZON_DAYS = 60;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SAM_API_KEY_PRESENT = !!process.env.SAM_API_KEY; // not used at runtime; just env-discipline check

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ENV MISSING — need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Rule 23)");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function ymd(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function isoMinusDays(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
function isoDateMinusDays(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface UsaAward {
  awardId: string | null;
  recipientName: string;
  recipientId: string | null;        // USAspending recipient hash
  uei: string | null;
  amount: number;
  startDate: string | null;
  modifiedDate: string | null;
  naicsCode: string | null;
  recipientStateCode: string | null;
  popStateCode: string | null;
}

interface Vendor {
  recipientId: string;
  uei: string | null;
  name: string;
  naics: Set<string>;
  awardCount: number;
  totalValue: number;
  lastAwardDate: string;
  lastAwardValue: number;
  state: string | null;          // prefer recipient state, fallback PoP state
  popState: string | null;
}

async function corpusSignal(): Promise<Record<string, number>> {
  const since = isoMinusDays(CORPUS_LOOKBACK_DAYS);
  const out: Record<string, number> = {};
  for (const n of NAICS_TARGETS) {
    const { count, error } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("status", "complete")
      .eq("naics_code", n)
      .gte("completed_at", since);
    out[n] = error ? 0 : (count ?? 0);
    if (error) console.warn(`[corpus] ${n} → ${error.message}`);
  }
  return out;
}

async function fetchUsaPage(naics: string[], startDate: string, endDate: string, page: number): Promise<{ items: UsaAward[]; hasNext: boolean }> {
  const body = {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      naics_codes: naics,
      award_type_codes: ["A", "B", "C", "D"],
      agencies: [{ type: "awarding", tier: "toptier", name: "Department of Defense" }],
      award_amounts: [{ lower_bound: 1, upper_bound: 50_000_000 }],
      recipient_type_names: ["small_business", "small_disadvantaged_business", "woman_owned_small_business", "veteran_owned_business", "service_disabled_veteran_owned_business"]
    },
    fields: [
      "Award ID", "Recipient Name", "recipient_id", "Recipient UEI",
      "Award Amount", "Start Date", "Last Modified Date",
      "NAICS", "Recipient Location State Code", "Place of Performance State Code"
    ],
    page,
    limit: PAGE_LIMIT,
    sort: "Last Modified Date",
    order: "desc"
  };
  const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) {
    console.warn(`[usa] HTTP ${res.status} on page ${page} — halting`);
    return { items: [], hasNext: false };
  }
  const data: any = await res.json();
  const results: any[] = data.results || [];
  const items: UsaAward[] = results.map(r => ({
    awardId: r["Award ID"] ?? null,
    recipientName: r["Recipient Name"] || "(unknown)",
    recipientId: r.recipient_id ?? null,
    uei: r["Recipient UEI"] ?? null,
    amount: Number(r["Award Amount"] || 0),
    startDate: r["Start Date"] ?? null,
    modifiedDate: r["Last Modified Date"] ?? null,
    naicsCode: r.NAICS?.code ?? null,
    recipientStateCode: r["Recipient Location State Code"] ?? null,
    popStateCode: r["Place of Performance State Code"] ?? null
  }));
  return { items, hasNext: !!data.page_metadata?.hasNext };
}

async function fetchAllUsa(): Promise<UsaAward[]> {
  const startDate = isoDateMinusDays(AWARD_WINDOW_DAYS);
  const endDate = todayIsoDate();
  console.log(`[fa-60] USAspending window: ${startDate} → ${endDate}`);
  const all: UsaAward[] = [];
  let page = 1;
  while (page <= PAGE_CAP) {
    const t0 = Date.now();
    const { items, hasNext } = await fetchUsaPage(NAICS_TARGETS, startDate, endDate, page);
    all.push(...items);
    console.log(`[fa-60] page ${page} → ${items.length} awards (${Date.now() - t0}ms · total ${all.length})`);
    if (!hasNext || items.length === 0) break;
    page++;
    await sleep(PAUSE_MS);
  }
  if (page > PAGE_CAP) console.warn(`[fa-60] hit PAGE_CAP=${PAGE_CAP} — truncating fetch`);
  return all;
}

function sanitizeDate(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const horizon = new Date(Date.now() + FUTURE_DATE_HORIZON_DAYS * 86400_000).toISOString().slice(0, 10);
  if (raw > horizon) return fallback; // reject typo'd futures
  if (raw < "2020-01-01") return fallback; // reject obvious garbage past
  return raw;
}

function aggregate(awards: UsaAward[]): Map<string, Vendor> {
  const out = new Map<string, Vendor>();
  const today = todayIsoDate();
  for (const a of awards) {
    const key = a.recipientId || a.uei || `name:${a.recipientName}`;
    const modDate = a.modifiedDate?.slice(0, 10) || "";
    const date = sanitizeDate(a.startDate, sanitizeDate(modDate, today));
    if (!out.has(key)) {
      out.set(key, {
        recipientId: a.recipientId || "",
        uei: a.uei,
        name: a.recipientName,
        naics: new Set(),
        awardCount: 0,
        totalValue: 0,
        lastAwardDate: "",
        lastAwardValue: 0,
        state: a.recipientStateCode,
        popState: a.popStateCode
      });
    }
    const v = out.get(key)!;
    v.awardCount += 1;
    v.totalValue += Number.isFinite(a.amount) ? a.amount : 0;
    if (date && date > v.lastAwardDate) {
      v.lastAwardDate = date;
      v.lastAwardValue = Number.isFinite(a.amount) ? a.amount : 0;
    }
    if (a.naicsCode) v.naics.add(a.naicsCode);
    if (!v.state && a.recipientStateCode) v.state = a.recipientStateCode;
    if (!v.popState && a.popStateCode) v.popState = a.popStateCode;
    if (!v.uei && a.uei) v.uei = a.uei;
  }
  return out;
}

function effectiveState(v: Vendor): string | null {
  return v.state || v.popState || null;
}

function inSweetSpot(v: Vendor): boolean {
  const avg = v.totalValue / Math.max(1, v.awardCount);
  return avg >= SWEET_LO && avg <= SWEET_HI;
}

function topNWithStateCap(qualified: Vendor[], n: number, cap: number): Vendor[] {
  const sorted = [...qualified].sort((a, b) => {
    const aS = inSweetSpot(a) ? 1 : 0;
    const bS = inSweetSpot(b) ? 1 : 0;
    if (aS !== bS) return bS - aS;
    if (a.lastAwardDate !== b.lastAwardDate) return a.lastAwardDate < b.lastAwardDate ? 1 : -1;
    return b.totalValue - a.totalValue;
  });
  const out: Vendor[] = [];
  const stateCount = new Map<string, number>();
  const UNKNOWN = "__UNKNOWN__";
  for (const v of sorted) {
    if (out.length >= n) break;
    const k = effectiveState(v) || UNKNOWN;
    const c = stateCount.get(k) || 0;
    if (k !== UNKNOWN && c >= cap) continue;
    stateCount.set(k, c + 1);
    out.push(v);
  }
  return out;
}

function csvLine(v: Vendor): string {
  const name = `"${v.name.replace(/"/g, '""')}"`;
  const naics = `"${[...v.naics].join("|")}"`;
  const state = effectiveState(v) ?? "";
  return [
    name,
    v.recipientId,
    v.uei ?? "",
    naics,
    state,
    v.lastAwardDate,
    v.lastAwardValue.toFixed(2),
    v.totalValue.toFixed(2),
    v.awardCount,
    inSweetSpot(v) ? "Y" : "N"
  ].join(",");
}

async function main() {
  console.log("[fa-60] extract-prospects starting");
  console.log("[fa-60] env: supabase=set sam_key=" + (SAM_API_KEY_PRESENT ? "present" : "absent"));
  console.log("[fa-60] target NAICS:", NAICS_TARGETS.join(","));

  const corpus = await corpusSignal();
  console.log("[fa-60] corpus signal (last 30d):", JSON.stringify(corpus));
  const totalCorpus = Object.values(corpus).reduce((a, b) => a + b, 0);
  console.log(`[fa-60] corpus moat evidence: ${totalCorpus} completed audits in target NAICS`);

  const awards = await fetchAllUsa();
  console.log(`[fa-60] total awards pulled: ${awards.length}`);

  const vendors = aggregate(awards);
  console.log(`[fa-60] unique vendors: ${vendors.size}`);

  const qualified = [...vendors.values()].filter(v =>
    v.awardCount >= MIN_AWARDS_LAST_12MO &&
    v.awardCount <= MAX_AWARD_COUNT &&
    v.totalValue <= MAX_TOTAL_VALUE
  );
  console.log(`[fa-60] qualified (≥${MIN_AWARDS_LAST_12MO} awards · count≤${MAX_AWARD_COUNT} · total≤$${MAX_TOTAL_VALUE/1_000_000}M): ${qualified.length}`);

  qualified.sort((a, b) => {
    if (a.lastAwardDate !== b.lastAwardDate) return a.lastAwardDate < b.lastAwardDate ? 1 : -1;
    return b.totalValue - a.totalValue;
  });

  const dir = join(process.cwd(), "scripts", "bd");
  mkdirSync(dir, { recursive: true });

  const header = "company_name,recipient_id,uei,naics,state,last_award_date,last_award_value,total_award_value,award_count,sweet_spot";
  const allPath = join(dir, `prospects-${ymd()}.csv`);
  writeFileSync(allPath, [header, ...qualified.map(csvLine)].join("\n") + "\n");
  console.log(`[fa-60] wrote ${allPath} (${qualified.length} rows)`);

  const top10 = topNWithStateCap(qualified, TOP_N, STATE_CAP);
  const topPath = join(dir, `prospects-top10-${ymd()}.csv`);
  writeFileSync(topPath, [header, ...top10.map(csvLine)].join("\n") + "\n");
  console.log(`[fa-60] wrote ${topPath} (${top10.length} rows)`);

  console.log("\n[fa-60] === TOP 10 SUMMARY ===");
  for (const v of top10) {
    const avg = v.totalValue / Math.max(1, v.awardCount);
    const sweet = inSweetSpot(v) ? "✓" : " ";
    console.log(
      `  ${sweet} ${v.name} · UEI ${v.uei ?? "-"} · ${effectiveState(v) ?? "?"} · ${v.awardCount} awards · last ${v.lastAwardDate} ($${v.lastAwardValue.toFixed(0)}) · total $${v.totalValue.toFixed(0)} · avg $${avg.toFixed(0)} · NAICS ${[...v.naics].join("|")}`
    );
  }

  console.log("\n[fa-60] DONE");
  console.log(
    `[fa-60] corpus_30d_total=${totalCorpus} usa_awards=${awards.length} unique_vendors=${vendors.size} qualified=${qualified.length} top10=${top10.length}`
  );

  if (qualified.length < 30) {
    console.warn(`[fa-60] VERIFY-FAIL · qualified=${qualified.length} < 30 — widen window or relax min-awards`);
    process.exit(3);
  }
  if (top10.length < TOP_N) {
    console.warn(`[fa-60] VERIFY-FAIL · top10=${top10.length} < ${TOP_N} — state-cap rejected too many candidates`);
    process.exit(4);
  }
}

main().catch(e => {
  console.error("[fa-60] FATAL", e);
  process.exit(1);
});
