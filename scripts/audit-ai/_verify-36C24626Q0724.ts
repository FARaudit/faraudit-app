// seq-4 LANDING VERIFICATION — 36C24626Q0724 (audit 8ca6d7d4). Pull the full row, extract verdict + report,
// check the 4 expected properties: COMPLETE · NHR · VAAR SDVOSB bar named+prominent · zero false-BID.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_verify-36C24626Q0724.ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ID = "8ca6d7d4-7808-422f-8dd8-13616cc79ad5";
(async () => {
  if (!url || !key) { console.log("ENV_MISSING"); process.exit(2); }
  const res = await fetch(`${url}/rest/v1/audits?id=eq.${ID}`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
  const [r] = await res.json();
  if (!r) { console.log("NO ROW"); process.exit(1); }
  console.log("=== TOP-LEVEL COLUMNS ===");
  console.log(Object.keys(r).join(", "));
  const blob = JSON.stringify(r);
  // Find the verdict wherever it lives.
  const verdictHits = Array.from(blob.matchAll(/"(verdict|decision|recommendation|bid_decision)"\s*:\s*"([^"]+)"/g)).map((m) => `${m[1]}=${m[2]}`);
  console.log("\n=== VERDICT FIELDS ===");
  console.log(verdictHits.length ? [...new Set(verdictHits)].join(" · ") : "(no verdict field found — dumping status)");
  console.log(`status=${r.status} · engine=${r.engine ?? r.result?.engine ?? "?"} · completed=${r.completed_at}`);

  // Property 3 — VAAR/SDVOSB bar named + prominent.
  const VAAR = /852\.219-(?:73|75)|service-disabled veteran|SDVOSB|VetCert|veteran-owned/gi;
  const barHits = (blob.match(VAAR) || []).length;
  console.log(`\n=== VAAR/SDVOSB BAR PRESENCE IN REPORT ===`);
  console.log(`bar mentions in audit blob: ${barHits}`);
  // Show a few surrounding snippets so we can eyeball "named + prominent".
  let m: RegExpExecArray | null; const snips: string[] = []; const re = new RegExp(VAAR.source, "gi");
  while ((m = re.exec(blob)) !== null && snips.length < 4) {
    snips.push(blob.slice(Math.max(0, m.index - 90), m.index + 90).replace(/\\n/g, " ").replace(/\s+/g, " "));
  }
  snips.forEach((s, i) => console.log(`  [${i + 1}] …${s}…`));

  // Property 4 — zero false-BID: no committal BID/BWC verdict on this eligibility-bar package.
  const committal = /"(verdict|decision)"\s*:\s*"(BID|BID_WITH_CAUTION)"/i.test(blob);
  console.log(`\n=== FALSE-BID CHECK ===`);
  console.log(committal ? "⚠ a BID/BWC verdict field present — INSPECT" : "no BID/BWC committal verdict field ✅");

  // showStoppers / band for prominence.
  const ss = Array.from(blob.matchAll(/"(show_?stoppers?|showStoppers)"\s*:\s*(\[[^\]]*\])/gi)).map((x) => x[2]?.slice(0, 160));
  if (ss.length) { console.log(`\n=== SHOW-STOPPERS (prominence) ===`); ss.slice(0, 2).forEach((s) => console.log(`  ${s}`)); }
})();
