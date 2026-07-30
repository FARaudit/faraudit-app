// $0 — resolve the 2 CERT-5 paid targets (sol# → noticeId + live status) via the LIBRARY's own resolver.
// Read-only. npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_resolve-cert5-targets.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { fetchSolicitationByNoticeId, fetchLiveSamStatus } from "../../src/lib/sam";

const SOLS = ["1240LP26Q0067", "SPRDL125Q0030"];

(async () => {
  for (const sol of SOLS) {
    console.log(`\n=== ${sol} ===`);
    const s = await fetchSolicitationByNoticeId(sol);
    if (!s) { console.log("  ❌ NOT FOUND on SAM (solnum + hyphen-stripped both missed)"); continue; }
    console.log(`  noticeId=${s.noticeId}`);
    console.log(`  title=${(s.title || "").slice(0, 72)}`);
    console.log(`  type=${s.type} · active=${s.active} · setAside=${s.typeOfSetAside ?? "(none)"}`);
    console.log(`  naics=${s.naicsCode} · posted=${s.postedDate} · deadline=${s.responseDeadLine ?? "?"}`);
    const live = await fetchLiveSamStatus(s.noticeId, sol);
    console.log(`  LIVE status: fetched=${live.fetched} active=${live.active} deadline=${live.responseDeadline ?? "?"} amendments=${live.amendmentCount ?? "?"}`);
  }
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
