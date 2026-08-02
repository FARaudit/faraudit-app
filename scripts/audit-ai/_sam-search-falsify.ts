// Falsify the "0 notices" result from _find-open-floor-candidates.ts before believing it.
// A zero from a search is indistinguishable from a broken query until you make the SAME query return
// something. Widen one dimension at a time and report the raw outcome shape.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { searchOpportunitiesByNaics } from "../../src/lib/sam";

const run = async (label: string, opts: Parameters<typeof searchOpportunitiesByNaics>[0]) => {
  const r = (await searchOpportunitiesByNaics(opts)) as Record<string, any>;
  const items = (r.solicitations ?? []) as unknown[];
  console.log(`  ${label.padEnd(48)} ok=${r.ok} kind=${r.kind ?? "-"} n=${items.length}${r.error ? ` err=${String(r.error).slice(0, 60)}` : ""}`);
  return items.length;
};

(async () => {
  console.log(`\nFALSIFYING the 0-result — widen one dimension at a time\n`);
  console.log(`  keys on the outcome object: ${Object.keys(await searchOpportunitiesByNaics({ naicsCodes: ["561720"], limit: 5, daysBack: 30 })).join(", ")}\n`);
  await run("561720/561730 · 45d · activeOnly", { naicsCodes: ["561720", "561730"], limit: 60, daysBack: 45, activeOnly: true });
  await run("561720/561730 · 45d · NO activeOnly", { naicsCodes: ["561720", "561730"], limit: 60, daysBack: 45 });
  await run("561720/561730 · 180d · NO activeOnly", { naicsCodes: ["561720", "561730"], limit: 60, daysBack: 180 });
  await run("561720 alone · 180d", { naicsCodes: ["561720"], limit: 60, daysBack: 180 });
  await run("336414 (the SPRRA naics) · 180d", { naicsCodes: ["336414"], limit: 60, daysBack: 180 });
  await run("541330 engineering (control) · 30d", { naicsCodes: ["541330"], limit: 60, daysBack: 30 });
  console.log(`\n  If EVERY row is 0, the query path is broken, not the market.\n  If the control returns rows, 0 for 561720/561730 is a real empty.\n`);
  process.exit(0);
})();
