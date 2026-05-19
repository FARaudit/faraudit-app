// FARaudit Prospector AI · weekly BD pipeline refresh
//
// Wraps the proven FA-60 v2 pipeline as a Railway weekly cron. Pulls
// USAspending DoD awards filtered to defense-mfg NAICS + small-biz, dedupes
// against existing Notion BD Pipeline entries, and writes top-10 net-new
// prospects with SAM.gov email lookup (if API scope allows).
//
// Notes on field names: USAspending /api/v2/search/spending_by_award returns
// display-formatted keys like "Recipient Name", "Recipient UEI", "Award
// Amount" — NOT snake_case. The mapper below normalizes both shapes so the
// agent works whether USAspending evolves the field naming.
//
// Cron: 0 11 * * 1 (Monday 11:00 UTC = 06:00 CT).
// Env: NOTION_API_KEY · SAM_API_KEY · optional DRY_RUN=true.

import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import fetch from 'node-fetch';

const NOTION_KEY = process.env.NOTION_API_KEY!;
const SAM_KEY = process.env.SAM_API_KEY || '';
const BD_DB_ID = 'c2a5451fa95d4198be2a1648fed5df0b';
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!NOTION_KEY) {
  console.error('NOTION_API_KEY missing — refuse to start');
  process.exit(2);
}

// NAICS: defense aerospace subcontractors (same set as FA-60 v1+v2 + adjacent)
const DEFENSE_NAICS = ['336413', '336412', '336411', '332710', '332999', '334511', '335931'];

// ICP revenue band (per FA-60 v2 doctrine)
const MIN_AWARD = 50_000;
const MAX_AWARD = 5_000_000;
const MIN_AWARDS_LAST_12MO = 2;
const MAX_AWARDS_COUNT = 40; // exclude prime fragmentation
const STATE_CAP = 3;
const TOP_N = 10;
const ENRICH_LIMIT = 14; // pull a few spares for failure-resilience

// Manual blocklist — companies that pass technical filters but fail ICP fit
// or cannot be enriched via autonomous web search. Populated from FA-60 v1+v2
// + Prospector AI tick 1 (2026-05-19) manual review. Compared after normalize().
//
// CRITERIA for adding:
//   - "Too big" (subsidiary of a $1B+ prime · wrong ICP-size)
//   - "Unfindable" (no exec DM surfaces after 2+ search passes)
//   - "Name collision" (same name as a different known entity · can't disambiguate)
//   - "Prime not sub" (full prime contractor · wrong customer segment)
const ICP_BLOCKLIST = new Set(
  [
    // Too-big / prime-not-sub
    'asrc federal facilities logistics llc', // $4.95B tribal-owned subsidiary
    'asrc federal facilities logistics inc',
    'lockheed martin',                       // prime not sub
    // Unfindable / no surface DM (Prospector AI tick 1 drops)
    'aviarms support corp',                  // no exec DM after 2 search passes
    's i t corporation',                     // no findable web presence
    'sit corporation',
    'melton sales service',                  // generic name · no NJ match
    'es3 prime logistics group',             // PM-only · no exec-level DM
    // Name collision · cannot disambiguate
    'phoenix trading inc',                   // collides with Phoenix Defense (different entity)
  ].map(normalize)
);

// Layer 3 — website fetch + CMMC posture classification.
// Works headless in Railway. Returns 'HOT' / 'WARM' / 'COLD' / 'UNKNOWN'.
// HOT  = defense work + no CMMC mention
// WARM = CMMC Level 1 only / "working toward"
// COLD = CMMC Level 2 certified by C3PAO
async function classifyPosture(websiteUrl: string): Promise<'HOT' | 'WARM' | 'COLD' | 'UNKNOWN'> {
  if (!websiteUrl) return 'UNKNOWN';
  try {
    const resp = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FARauditBot/2.0)' },
      // @ts-ignore
      signal: AbortSignal.timeout(8000)
    } as any);
    if (!resp.ok) return 'UNKNOWN';
    const html = (await resp.text()).toLowerCase();
    if (/cmmc\s*(level\s*)?2|c3pao|cybersecurity\s*maturity.*level\s*2/.test(html)) return 'COLD';
    if (/cmmc\s*(level\s*)?1|working\s+toward\s+cmmc|cmmc\s+ready/.test(html)) return 'WARM';
    if (/defense|military|dod|navy|army|air force/.test(html)) return 'HOT';
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

// NOTE on Layers 4/5/6 (LinkedIn Company Page · Decision-Maker · Signals):
//
// These layers REQUIRE either:
//   (a) a paid search API (Brave Search · Google Custom Search · SerpAPI)
//   (b) LinkedIn auth + scraping infrastructure (high-maintenance · ToS risk)
//   (c) human-in-loop enrichment via the chat-side WebSearch tool
//
// DDG HTML scrape from headless Node is unreliable (high rate-limit / 403).
// Current strategy: agent writes rows with status "needs_dm_enrichment" and
// flags in Notes; CEO or chat-side run handles DM discovery before DM cadence.
//
// To wire layers 4/5/6 in-agent: add BRAVE_SEARCH_API_KEY env var + a wrapper
// around Brave's /res/v1/web/search endpoint, then run per-company queries
// for: site:linkedin.com/company "{name}" and site:linkedin.com/in "{name}" +
// title keywords. Track at Notion BD as a property when implemented.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'"`]/g, '')           // strip punctuation
    .replace(/\b(inc|llc|corp|corporation|co|company|ltd|lp|limited)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Prospect {
  company: string;
  uei: string;
  state: string;
  awards_12mo: number;
  total_value_12mo: number;
  compliance_posture: 'HOT' | 'WARM' | 'COLD';
  icp_score: number;
  contact_email: string;
  key_signal_note: string;
}

async function getExistingPipeline(): Promise<Set<string>> {
  const out = new Set<string>();
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 10; i++) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const resp = await fetch(`https://api.notion.com/v1/databases/${BD_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      console.error(`Notion query failed: HTTP ${resp.status}`);
      break;
    }
    const data: any = await resp.json();
    for (const page of data.results || []) {
      const props = page.properties || {};
      const companyProp = props['Company'];
      if (companyProp?.rich_text?.[0]) {
        out.add(normalize(companyProp.rich_text[0].plain_text));
      }
    }
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return out;
}

async function pullUSASpending(): Promise<any[]> {
  const cutoff = new Date(Date.now() - 360 * 86400_000);
  const startDate = cutoff.toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  const body = {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      naics_codes: DEFENSE_NAICS,
      award_type_codes: ['A', 'B', 'C', 'D'],
      agencies: [{ type: 'awarding', tier: 'toptier', name: 'Department of Defense' }],
      award_amounts: [{ lower_bound: 1, upper_bound: 50_000_000 }],
      recipient_type_names: [
        'small_business',
        'small_disadvantaged_business',
        'woman_owned_small_business',
        'veteran_owned_business',
        'service_disabled_veteran_owned_business'
      ]
    },
    fields: [
      'Award ID',
      'Recipient Name',
      'recipient_id',
      'Recipient UEI',
      'Award Amount',
      'Start Date',
      'Last Modified Date',
      'NAICS',
      'Recipient Location State Code',
      'Place of Performance State Code'
    ],
    page: 1,
    limit: 100,
    sort: 'Last Modified Date',
    order: 'desc'
  };

  const allAwards: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const resp = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, page })
    });
    if (!resp.ok) {
      console.warn(`USASpending HTTP ${resp.status} page ${page}`);
      break;
    }
    const data: any = await resp.json();
    const results = data.results || [];
    allAwards.push(...results);
    if (!data.page_metadata?.hasNext || results.length === 0) break;
    await new Promise(r => setTimeout(r, 200));
  }
  return allAwards;
}

interface Vendor {
  name: string;
  uei: string;
  state: string;
  awards: number;
  total: number;
  naics: Set<string>;
}

function aggregate(awards: any[]): Map<string, Vendor> {
  const out = new Map<string, Vendor>();
  for (const a of awards) {
    const name = a['Recipient Name'] || a.recipient_name || '';
    const uei = a['Recipient UEI'] || a.recipient_uei || '';
    const state =
      a['Recipient Location State Code'] ||
      a['Place of Performance State Code'] ||
      a.recipient_location?.state_code ||
      '';
    const amount = Number(a['Award Amount'] || a.total_obligated_amount || 0);
    const naicsCode = a.NAICS?.code || '';
    const key = uei || name;
    if (!key) continue;
    if (!out.has(key)) {
      out.set(key, { name, uei, state, awards: 0, total: 0, naics: new Set() });
    }
    const v = out.get(key)!;
    v.awards += 1;
    v.total += Number.isFinite(amount) ? amount : 0;
    if (naicsCode) v.naics.add(naicsCode);
    if (!v.state && state) v.state = state;
    if (!v.uei && uei) v.uei = uei;
  }
  return out;
}

async function lookupSamEmail(uei: string): Promise<string> {
  if (!SAM_KEY || !uei) return '';
  // Probe v4/v3/v2 endpoints — entity-information scope typically not on opps key
  const endpoints = [
    'https://api.sam.gov/entity-information/v4/entities',
    'https://api.sam.gov/entity-information/v3/entities',
    'https://api.sam.gov/entity-information/v2/entities'
  ];
  for (const ep of endpoints) {
    try {
      const resp = await fetch(`${ep}?api_key=${SAM_KEY}&ueiSAM=${uei}`, {
        // @ts-ignore
        signal: AbortSignal.timeout(8000)
      } as any);
      if (!resp.ok) continue;
      const data: any = await resp.json();
      const pocs = data?.entityData?.[0]?.pointsOfContact || {};
      for (const pocType of ['electronicBusinessPOC', 'governmentBusinessPOC', 'pastPerformancePOC']) {
        const poc = pocs[pocType];
        if (poc?.emailAddress) return poc.emailAddress;
      }
      return '';
    } catch {
      continue;
    }
  }
  return '';
}

function scoreVendor(v: Vendor, email: string): number {
  let score = 50;
  // Compliance posture default — HOT (no website check at agent runtime; can extend)
  score += 20;
  if (v.awards >= 10) score += 10;
  const corridor = new Set([
    'TX', 'OK', 'KS', 'AL', 'OH', 'MI', 'VA', 'CA', 'FL', 'CO', 'MD', 'GA', 'PA', 'NY', 'WA', 'LA', 'TN', 'MO', 'NH', 'NJ'
  ]);
  if (corridor.has(v.state)) score += 5;
  if (email) score += 5; // bonus for verified contact
  return Math.min(100, score);
}

async function writeToNotion(p: Prospect): Promise<string> {
  const hook =
    p.compliance_posture === 'HOT'
      ? 'CMMC Phase 2 Nov 2026 — no certification visible'
      : p.compliance_posture === 'WARM'
        ? 'CMMC Level 1 only — Level 2 required post-Nov 2026'
        : 'CMMC L2 certified — angle on FAR/DFARS intel';

  const today = new Date().toISOString().slice(0, 10);
  const notesText = `Prospector AI ${today}. ${p.awards_12mo} awards · $${(p.total_value_12mo / 1000).toFixed(0)}K total. ${p.key_signal_note}.`;

  const properties: any = {
    Prospect: { title: [{ text: { content: p.company } }] },
    Company: { rich_text: [{ text: { content: p.company } }] },
    Stage: { select: { name: 'Identified' } },
    Source: { select: { name: 'Newsletter' } }, // 'Prospector AI' not in DB options; tagged in Notes
    Vertical: { select: { name: 'FARaudit' } },
    'ICP Score': { number: p.icp_score },
    'Next Action': { rich_text: [{ text: { content: `DM via LinkedIn · ${hook}` } }] },
    Notes: { rich_text: [{ text: { content: notesText.slice(0, 2000) } }] }
  };
  if (p.contact_email) properties.Email = { email: p.contact_email };

  const resp = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ parent: { database_id: BD_DB_ID }, properties })
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error(`Notion write failed: HTTP ${resp.status} — ${body.slice(0, 200)}`);
    return '';
  }
  const data: any = await resp.json();
  return data.id || '';
}

async function main() {
  console.log(`[prospector-ai] start ${new Date().toISOString()} · DRY_RUN=${DRY_RUN}`);

  const existing = await getExistingPipeline();
  console.log(`[prospector-ai] existing pipeline entries (Company + DM): ${existing.size}`);

  const awards = await pullUSASpending();
  console.log(`[prospector-ai] awards pulled: ${awards.length}`);

  const vendors = aggregate(awards);
  console.log(`[prospector-ai] unique vendors: ${vendors.size}`);

  const stateCount = new Map<string, number>();
  const candidates: Vendor[] = [];
  const ranked = [...vendors.values()].sort((a, b) => b.awards - a.awards);
  for (const v of ranked) {
    if (v.total < MIN_AWARD || v.total > MAX_AWARD) continue;
    if (v.awards < MIN_AWARDS_LAST_12MO || v.awards > MAX_AWARDS_COUNT) continue;
    const normalized = normalize(v.name);
    if (existing.has(normalized)) continue;
    if (ICP_BLOCKLIST.has(normalized)) continue;
    const c = stateCount.get(v.state) || 0;
    if (v.state && c >= STATE_CAP) continue;
    stateCount.set(v.state, c + 1);
    candidates.push(v);
    if (candidates.length >= ENRICH_LIMIT) break;
  }
  console.log(`[prospector-ai] candidates after band+dedupe+state-cap: ${candidates.length}`);

  const enriched: Prospect[] = [];
  for (const v of candidates) {
    const email = await lookupSamEmail(v.uei);
    // Layer 3: posture classification via website fetch.
    // Heuristic: try {normalized}.com — refine when site discovery wired (Layer 3a).
    const guessedUrl = `https://www.${normalize(v.name).replace(/\s+/g, '')}.com`;
    const rawPosture = await classifyPosture(guessedUrl);
    const posture: 'HOT' | 'WARM' | 'COLD' = rawPosture === 'UNKNOWN' ? 'HOT' : rawPosture;
    const score = scoreVendor(v, email);
    enriched.push({
      company: v.name,
      uei: v.uei,
      state: v.state,
      awards_12mo: v.awards,
      total_value_12mo: v.total,
      compliance_posture: posture,
      icp_score: score,
      contact_email: email,
      key_signal_note: `${v.awards} DoD awards · NAICS ${[...v.naics].join('|')} · posture_source=${rawPosture === 'UNKNOWN' ? 'default(HOT)' : 'website-classified'} · needs_dm_enrichment=true`
    });
  }

  enriched.sort((a, b) => b.icp_score - a.icp_score);
  const top10 = enriched.slice(0, TOP_N);

  console.log(`\n[prospector-ai] Top ${top10.length} candidates:`);
  for (let i = 0; i < top10.length; i++) {
    const p = top10[i];
    console.log(
      `  ${i + 1}. ${p.company} · ${p.state} · ${p.awards_12mo}x · $${(p.total_value_12mo / 1000).toFixed(0)}K · ICP ${p.icp_score} · email=${p.contact_email || '—'}`
    );
  }

  if (DRY_RUN) {
    console.log('\n[prospector-ai] DRY_RUN=true — skipping Notion writes');
    return;
  }

  let written = 0;
  const failed: string[] = [];
  for (const p of top10) {
    const id = await writeToNotion(p);
    if (id) {
      written++;
      console.log(`  ✅ ${p.company} → ${id.slice(0, 8)}...`);
    } else {
      failed.push(p.company);
    }
  }
  console.log(`\n[prospector-ai] complete · written=${written}/${top10.length}${failed.length ? ' · failed=' + failed.join(', ') : ''}`);
}

main().catch(err => {
  console.error('[prospector-ai] FATAL', err);
  process.exit(1);
});
