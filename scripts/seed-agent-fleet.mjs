// Seed agent_fleet_status with the 9 LIVE + 7 QUEUED + 1 RETIRED agents
// captured in the digest agents-view-1 (Phase A static snapshot, May 8 2026 evening).
//
// Idempotent: uses upsert on agent_name. Safe to re-run after digest updates.
// Run: node scripts/seed-agent-fleet.mjs (with NEXT_PUBLIC_SUPABASE_URL +
//      SUPABASE_SERVICE_ROLE_KEY in env, e.g. via `vercel env pull`).

import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_SR) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const sb = createClient(SUPA_URL, SUPA_SR, { auth: { persistSession: false } });

// Cadence in seconds: 1800 = 30 min, 86400 = 24h
const FLEET = [
  // ─── LIVE — 9 agents ───
  {
    agent_name: 'audit-ai',
    status: 'live',
    vertical: 'faraudit',
    expected_cadence_seconds: 86400,
    cost_per_day_usd: 17.50,
    skills_present: ['pdf_extraction', '3_call_decomposition', 'sonnet_default', 'opus_retry', 'corpus_write', 'sam_non_pdf_guard'],
    skills_missing: ['self_quality_check', 'accuracy_benchmark', 'cost_ledger_writes', 'digest_email_feed'],
    notes: 'P0-2 GATE — deployment 111c76d3 awaiting real cron-tick verification per Rule 20',
  },
  {
    agent_name: 'sam-ingest',
    status: 'live',
    vertical: 'faraudit',
    expected_cadence_seconds: 86400,
    cost_per_day_usd: 0,
    skills_present: ['pagination', 'naics_filtering', 'dedupe', 'pdf_availability_check', 'pending_queue_cap_250'],
    skills_missing: ['pdf_size_precheck', 'priority_scoring', 'agency_relevance_ranking'],
    notes: 'cap-at-insert deployed (commit 6b38e72 · PENDING_QUEUE_CAP=250)',
  },
  {
    agent_name: 'email-ai',
    status: 'live',
    vertical: 'ceo-ops',
    expected_cadence_seconds: 1800,
    cost_per_day_usd: 0.60,
    skills_present: ['gmail_oauth', 'dual_filter', 'category_tabs_query', 'six_label_canonical', 'sonnet_classifier', 'prompt_decision_tree'],
    skills_missing: ['signal_vs_noise', 'digest_email_tab_feed', 'daily_brief_drafting', 'prospect_detection', 'web_filing_system'],
    notes: 'P0-3 REBUILD — Sonnet swap shipped 43c88de · category-tabs query 273d908 · architecture rebuild scoped for next session',
  },
  {
    agent_name: 'recompete-ai',
    status: 'live',
    vertical: 'faraudit',
    expected_cadence_seconds: 86400,
    cost_per_day_usd: 0.001,
    skills_present: ['outcome_scanner', '180day_window', 'telegram_digest'],
    skills_missing: ['idle_when_no_won_contracts'],
    notes: 'idle today — no won contracts in corpus · candidate to pause until first paying customer',
  },
  {
    agent_name: 'regulatory-ai',
    status: 'live',
    vertical: 'faraudit',
    expected_cadence_seconds: 86400,
    cost_per_day_usd: 0.20,
    skills_present: ['rss_pulls_4', 'cross_ref_compliance_json', 'alerting'],
    skills_missing: ['newsletter_feed_write', 'digest_section_update', 'severity_scoring'],
    notes: 'FAR/DFARS · GAO protests · Federal Register monitoring',
  },
  {
    agent_name: 'qa-ai',
    status: 'live',
    vertical: 'ceo-ops',
    expected_cadence_seconds: 1800,
    cost_per_day_usd: 0,
    skills_present: ['health_checks_15', 'telegram_alerting', 'regression_detection', 'three_domain_coverage'],
    skills_missing: ['ssl_cert_expiry', 'dns_check', 'vercel_build_status', 'supabase_connection_check'],
    notes: 'free (HTTP only) · first-line domain regression alarm',
  },
  {
    agent_name: 'bullrize-cron',
    status: 'live',
    vertical: 'bullrize',
    expected_cadence_seconds: 86400,
    cost_per_day_usd: 0,
    skills_present: ['edgar_pagination', 'dedupe', 'upsert'],
    skills_missing: ['form_13f', 'insider_clustering', 'historical_baseline'],
    notes: 'SEC EDGAR Form4/13D · free API',
  },
  {
    agent_name: 'bullrize-daily-pipeline',
    status: 'live',
    vertical: 'bullrize',
    expected_cadence_seconds: 86400,
    cost_per_day_usd: 2.00,
    skills_present: ['options_flow', 'dark_pool', 'congress', 'tide', 'etf', 'gamma', 'fred_5_series'],
    skills_missing: ['faraudit_dod_cross_ref', 'confirmation_engine_thresholds'],
    notes: 'UW $125/mo prepaid · light Sonnet for synthesis',
  },
  {
    agent_name: 'apex-intel-pipeline',
    status: 'live',
    vertical: 'ceo-ops',
    expected_cadence_seconds: 86400,
    cost_per_day_usd: 0.10,
    skills_present: ['fleet_state_aggregation', 'telegram_digest', 'morning_brief_fire'],
    skills_missing: ['digest_html_feed', 'overnight_regression_detection', 'auto_flag_stale_sections'],
    notes: 'fires the 06:15 CT trigger that starts every working session',
  },

  // ─── QUEUED — 7 agents ───
  { agent_name: 'signal-ai',     status: 'queued', vertical: 'bullrize', cost_per_day_usd: 0, notes: 'NEXT BUILD — Confirmation Engine · four-factor convergence · the Bullrize moat' },
  { agent_name: 'security-ai',   status: 'queued', vertical: 'holdings', cost_per_day_usd: 0, notes: 'Fort Knox automation · pre-customer mandatory' },
  { agent_name: 'compliance-ai', status: 'queued', vertical: 'holdings', cost_per_day_usd: 0, notes: 'ToS + privacy + securities sign-off · pre-paid-customer mandatory' },
  { agent_name: 'accountant-ai', status: 'queued', vertical: 'holdings', cost_per_day_usd: 0, notes: 'per-agent cost ledger · Founder Loan tracking · entity P&L · fixes the digest cost-tracking gap' },
  { agent_name: 'news-ai',       status: 'queued', vertical: 'holdings', cost_per_day_usd: 0, notes: 'defense + financial intelligence · powers Track 3 newsletter cadence' },
  { agent_name: 'prospect-ai',   status: 'queued', vertical: 'faraudit', cost_per_day_usd: 0, notes: 'LinkedIn + email outreach automation · post-demo' },
  { agent_name: 'alert-ai',      status: 'queued', vertical: 'bullrize', cost_per_day_usd: 0, notes: 'per-customer Telegram signal alerts · post-Signal-AI' },

  // ─── RETIRED — 1 agent ───
  { agent_name: 'faraudit-cron', status: 'retired', vertical: 'faraudit', cost_per_day_usd: 0, notes: 'RETIRED MAY 2 — replaced by sam-ingest + Audit-AI split · 0 successful audits in 6 weeks · Railway service deletion pending' },
];

console.log(`[seed] upserting ${FLEET.length} agents to agent_fleet_status...`);

const { data, error } = await sb
  .from('agent_fleet_status')
  .upsert(FLEET, { onConflict: 'agent_name' })
  .select('agent_name, status');

if (error) {
  console.error('[seed] FAIL:', error.message);
  process.exit(1);
}

console.log(`[seed] OK · ${data.length} rows upserted`);
const byStatus = data.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
console.log(`[seed] distribution:`, byStatus);
