// $0 — find a CURRENTLY OPEN solicitation to exercise the binding-doc analysis floor (#388) on a real
// customer scenario, not an expired one.
//
// Why this exists: the two census specimens (SPRRA2-26-R-0034, 36C24126Q0569) both have deadlines that have
// already PASSED — and SAM still reports `active=true` on both. The active flag alone is not "biddable"; the
// response deadline is. Running the floor on an expired notice tests the engine but is not a customer scenario.
//
// The floor bites hardest on packages with AMENDMENTS — an amendment states its operative content in the
// indicative ("the purpose of this amendment is to extend the close date..."), which is exactly what the
// duty-verb detector cannot see. So candidates are ranked by amendment count, then by days remaining.
//
// Reads only. Fires nothing. G2: Code never fires a paid run.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_find-open-floor-candidates.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { searchOpportunitiesByNaics, fetchLiveSamStatus } from "../../src/lib/sam";

// The NAICS this bidder actually pursues, taken from the banked corpus (561720 janitorial x5,
// 561730 landscaping x4, 336414 guided-missile x3) — not invented.
const NAICS = ["561720", "561730"];

(async () => {
  const r = (await searchOpportunitiesByNaics({ naicsCodes: NAICS, limit: 60, daysBack: 45, activeOnly: true })) as Record<string, unknown>;
  if (!r.ok) { console.log(`SAM search failed: ${JSON.stringify(r).slice(0, 400)}`); process.exit(1); }
  const items = ((r.solicitations ?? []) as Array<Record<string, any>>);
  console.log(`\nOPEN FLOOR CANDIDATES — NAICS ${NAICS.join("/")}, posted last 45d, active=Yes\n`);
  console.log(`  SAM returned ${items.length} notices`);

  const now = Date.now();
  const open = items
    .map((o) => ({
      sol: o.solicitationNumber ?? o.noticeId, notice: o.noticeId,
      title: String(o.title ?? "").slice(0, 46),
      setAside: String(o.typeOfSetAside ?? "-"),
      days: o.responseDeadLine ? Math.round((Date.parse(o.responseDeadLine) - now) / 86_400_000) : null,
    }))
    .filter((o) => o.days !== null && (o.days as number) > 0);
  console.log(`  with a FUTURE deadline: ${open.length}   (an expired notice is not a customer scenario)\n`);
  if (!open.length) { console.log(`  none — widen daysBack or the NAICS set\n`); process.exit(0); }

  // Amendment count is the floor-relevance signal; fetchLiveSamStatus is the production client for it.
  const scored: Array<{ sol: string; notice: string; days: number; amendments: number | null; setAside: string; title: string }> = [];
  for (const o of open.slice(0, 20)) {
    let amendments: number | null = null;
    try { amendments = (await fetchLiveSamStatus(String(o.notice), String(o.sol))).amendmentCount ?? null; } catch { /* leave null — never guess */ }
    scored.push({ sol: String(o.sol), notice: String(o.notice), days: o.days as number, amendments, setAside: o.setAside, title: o.title });
  }
  scored.sort((a, b) => (b.amendments ?? -1) - (a.amendments ?? -1) || a.days - b.days);

  console.log(`  ${"amd".padStart(4)} ${"days".padStart(5)}  ${"solicitation".padEnd(20)} ${"set-aside".padEnd(12)} title`);
  for (const s of scored) {
    console.log(`  ${String(s.amendments ?? "?").padStart(4)} ${String(s.days).padStart(5)}  ${s.sol.slice(0, 19).padEnd(20)} ${s.setAside.slice(0, 11).padEnd(12)} ${s.title}`);
  }
  const best = scored.find((s) => (s.amendments ?? 0) > 0);
  console.log(`\n  BEST FLOOR TEST: ${best ? `${best.sol} — ${best.amendments} amendment(s), ${best.days} days left · notice ${best.notice}` : "none carries an amendment; the floor would not be exercised on any of these"}`);
  console.log(`  (Amendments are where the floor bites: indicative-voice change text no duty-verb detector sees.)\n`);
  process.exit(0);
})();
