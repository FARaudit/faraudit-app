// SHOW-STOPPER BAND — the one region E1 fixed that no banked record could exercise.
//   npx tsx scripts/audit-ai/_showstopper-band-probe.ts
//
// deriveVerdict decides on COPIES taken BEFORE the post-verdict pass runs, and the v3 payload renders the
// show-stopper band from those copies — so a restored excerpt head reached the whole report EXCEPT the tile a
// disqualifying finding appears in. No banked record can show this: all 46 carry an EMPTY show-stopper band
// (30 NHR, 8 CAUTION, 7 INCOMPLETE, 1 BID), because none of them disqualifies the firm.
//
// NOTHING IS INVENTED. Real record, real source, real finding set, real bar, real excerpt. Two legitimate
// INPUTS are supplied, neither of them evidence:
//   1. a closed-world bidder profile that does NOT hold the bar's attribute — a real firm fact, and what turns
//      a real bar into a proven fail (firmStatus "fails" → provenFails → show-stopper);
//   2. that one finding's excerpt is HEAD-CLIPPED to a substring of itself — what the extractor does in the
//      wild, and precisely the defect E1 repairs.
// The rail re-grounds every seed against real source, so nothing ungrounded can reach a verdict.
// $0 — callModel throws and the API key is cleared.
export {};
import * as fs from "fs";
import * as path from "path";
import { runAgenticAudit } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";

delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL REACHED"); }) as never;

const REC = "_new-653570ea.json";
const RAW = fs.readFileSync(path.join(__dirname, "run-records", REC), "utf8");
const SRC: string = JSON.parse(RAW).result.inputs.source;
const ATTR = "size_standard";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

/** Clip the head off the bar's excerpt, exactly as a wrapped extraction would. */
function seedFor(clip: boolean) {
  const rec = JSON.parse(RAW);
  const findings = rec.result.findings as Array<Record<string, unknown>>;
  const bar = findings.find((f) => f.requiredAttribute === ATTR && typeof f.excerpt === "string");
  if (!bar) throw new Error(`no finding carrying ${ATTR}`);
  const full = bar.excerpt as string;
  const at = full.indexOf("North American Industry Classification");
  if (at < 0) throw new Error("anchor not found in the bar excerpt");
  if (clip) bar.excerpt = full.slice(at);
  return { findings, full, clipped: full.slice(at), rec };
}

const run = async (flag: boolean) => {
  const { findings, rec } = seedFor(true);
  for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) delete process.env[k];
  for (const [k, v] of Object.entries(rec.meta?.flagEnv ?? {})) process.env[k] = v as string;
  delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  if (flag) process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";
  const ctx: AuditToolContext = { fullSource: SRC, groundingSource: SRC } as AuditToolContext;
  // Closed-world profile WITHOUT the bar's attribute — the firm provably does not meet it.
  const profile = { closedWorld: true, satisfiedAttributes: ["registration:SAM-active"] };
  return runAgenticAudit({ ctx, experts: [], callModel, seedFindings: findings as never,
    bidderProfile: profile as never, manifestComplete: rec.input?.manifestComplete ?? rec.result.inputs.manifestComplete,
    naics: rec.input?.naics ?? null, setAside: rec.input?.setAside ?? null,
    sections: rec.input?.sections } as never) as Promise<any>;
};

(async () => {
  const { clipped } = seedFor(true);
  const off = await run(false);
  const on = await run(true);
  const offS = off.decision?.showStoppers ?? [], onS = on.decision?.showStoppers ?? [];
  console.log(`\nverdict OFF=${off.decision?.verdict} ON=${on.decision?.verdict} · show-stoppers OFF=${offS.length} ON=${onS.length}`);
  console.log(`REASON: ${String(off.decision?.reason ?? "").slice(0, 200)}\n`);

  check("the real bar reaches the SHOW-STOPPER band once the firm provably fails it",
    offS.length > 0 && onS.length > 0, `OFF=${offS.length} ON=${onS.length} · verdict ${off.decision?.verdict}`);
  if (!offS.length || !onS.length) { console.log("\n⚪ INCONCLUSIVE — no show-stopper produced; nothing to observe."); process.exit(1); }

  const pick = (arr: any[]) => arr.find((s) => s.requiredAttribute === ATTR) ?? arr[0];
  const offEx = String(pick(offS).excerpt ?? ""), onEx = String(pick(onS).excerpt ?? "");
  console.log(`  OFF band: ${JSON.stringify(offEx.slice(0, 110))}`);
  console.log(`  ON  band: ${JSON.stringify(onEx.slice(0, 110))}\n`);

  check("flag-OFF the band shows the clipped fragment — the defect, reproduced",
    offEx.trim().startsWith("North American Industry"), `got: ${offEx.slice(0, 80)}`);
  check("flag-ON the band shows the RESTORED head — the fix reaching the tile it never reached",
    onEx !== offEx && onEx.length > offEx.length, `OFF len ${offEx.length} → ON len ${onEx.length}`);
  const nrm = (s: string) => s.replace(/\s+/g, " ").trim();
  check("the widened band excerpt is VERBATIM solicitation text",
    nrm(SRC).includes(nrm(onEx)), "a widened show-stopper quote that is not verbatim source would be fabrication");
  check("the analyzed span is preserved on the stopper copy",
    (pick(onS) as { excerptPreReground?: string }).excerptPreReground === clipped,
    `excerptPreReground=${JSON.stringify(String((pick(onS) as { excerptPreReground?: string }).excerptPreReground ?? "").slice(0, 70))}`);
  check("the verdict did not move", off.decision?.verdict === on.decision?.verdict,
    `${off.decision?.verdict} → ${on.decision?.verdict}`);

  console.log(failures === 0 ? "\n✅ SHOW-STOPPER BAND VERIFIED at $0 — the region the corpus could not reach"
                             : `\n❌ ${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
})();
