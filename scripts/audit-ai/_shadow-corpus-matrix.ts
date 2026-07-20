// Phase-1 SHADOW · 30-run corpus replay matrix (cards #596/#597, Brain-authorized).
// For every banked run-record: compute deriveShadowVerdict on the SAME inputs and compare to the AS-BANKED actual
// verdict. Produces the shadow-vs-actual matrix + BINDING-c aggregates. $0, verdict-inert, offline.
process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true"; // recognizer helper (reused by the shadow) — pre-import
import { readFileSync, readdirSync } from "fs";
type F = any;
(async () => {
  const { deriveShadowVerdict } = await import("../../src/lib/audit-decide");
  const dir = "scripts/audit-ai/run-records";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !/panel-findings-bank|panel-characterization|smoke|REMOTE_|_lbj-armed/.test(f));
  const naicsOf = (rec: any, src: string): string | null => {
    const cand = rec.solicitation?.naicsCode ?? rec.naics ?? rec.meta?.naics ?? rec.result?.inputs?.naics;
    if (cand) return String(cand);
    const m = (src || "").match(/NAICS\s*(?:code)?[:\s#]*([0-9]{5,6})/i);
    return m ? m[1] : null;
  };
  const rows: any[] = [];
  for (const file of files.sort()) {
    let rec: any; try { rec = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")); } catch { continue; }
    const res = rec.result ?? {};
    const inp = res.inputs;
    if (!inp || !Array.isArray(inp.findings)) continue;
    const actual = res.verdict ?? "?";
    const naics = naicsOf(rec, inp.source ?? "");
    let shadow: any;
    try { shadow = deriveShadowVerdict(inp, { naics }); } catch (e) { shadow = { verdict: "THREW", reason: String(e), decidingCount: -1, enrichmentCount: -1, killShotClasses: [] }; }
    const sol = file.split(".")[0].slice(0, 22);
    rows.push({ sol, id: (file.match(/\.([0-9a-f]{8})/)?.[1]) ?? file.slice(0, 8), actual, shadow: shadow.verdict, naics: naics ?? "-", deciding: shadow.decidingCount, enrich: shadow.enrichmentCount, classes: shadow.killShotClasses.join(","), reason: (shadow.reason || "").slice(0, 62) });
  }

  const COMMIT = new Set(["BID", "BID_WITH_CAUTION"]);
  console.log(`\n${"SOL".padEnd(23)} ${"id".padEnd(9)} ${"ACTUAL".padEnd(18)}→ ${"SHADOW".padEnd(18)} dec/enr  classes / reason`);
  console.log("─".repeat(140));
  for (const r of rows) {
    const flip = r.actual !== r.shadow ? (COMMIT.has(r.shadow) && !COMMIT.has(r.actual) ? " ⬆COMMIT" : (!COMMIT.has(r.shadow) && COMMIT.has(r.actual) ? " ⬇PULL" : " ~")) : "";
    console.log(`${r.sol.padEnd(23)} ${r.id.padEnd(9)} ${r.actual.padEnd(18)}→ ${r.shadow.padEnd(18)} ${String(r.deciding).padStart(2)}/${String(r.enrich).padStart(3)}  ${r.classes.slice(0,20).padEnd(20)}${flip}  ${r.reason}`);
  }

  // ── BINDING-c aggregates ──
  const n = rows.length;
  const actualCommit = rows.filter((r) => COMMIT.has(r.actual)).length;
  const shadowCommit = rows.filter((r) => COMMIT.has(r.shadow)).length;
  const realNoBid = rows.filter((r) => r.actual === "NO_BID" || r.actual === "INELIGIBLE");
  const noBidPreserved = realNoBid.every((r) => r.shadow === "NO_BID" || r.shadow === "INELIGIBLE" || r.shadow === "NEEDS_HUMAN_REVIEW");
  const falseBids = rows.filter((r) => COMMIT.has(r.shadow) && (r.actual === "NO_BID" || r.actual === "INELIGIBLE")); // shadow commits where actual was a hard no
  const incomplete = rows.filter((r) => r.actual === "INCOMPLETE");
  const incompletePreserved = incomplete.every((r) => r.shadow === "INCOMPLETE" || r.shadow === "NEEDS_HUMAN_REVIEW");
  const threw = rows.filter((r) => r.shadow === "THREW");
  console.log("\n" + "═".repeat(60));
  console.log(`records replayed:            ${n}`);
  console.log(`committal — actual:          ${actualCommit}/${n}`);
  console.log(`committal — SHADOW:          ${shadowCommit}/${n}  (positive pole)`);
  console.log(`real NO_BID/INELIGIBLE:      ${realNoBid.length} → preserved (not committed): ${noBidPreserved ? "YES ✅" : "NO ❌"}`);
  console.log(`FALSE-BIDs (shadow commits a real hard-no): ${falseBids.length} ${falseBids.length === 0 ? "✅" : "❌ " + falseBids.map((r) => r.id).join(",")}`);
  console.log(`shadow THREW:                ${threw.length} ${threw.length ? "❌ " + threw.map((r) => r.id).join(",") : "✅"}`);
  // Commit-flips (the thesis): the positive pole newly commits where the old pole did not.
  const commitFlips = rows.filter((r) => COMMIT.has(r.shadow) && !COMMIT.has(r.actual));
  console.log(`\n⬆ COMMIT-FLIPS (positive pole newly commits): ${commitFlips.length}`);
  for (const r of commitFlips) console.log(`   ${r.id.padEnd(9)} ${r.actual} → ${r.shadow}  [${r.classes.slice(0,24)}]  ${r.reason}`);
  // Of those, any over a real hard-no = FALSE-BID (must be 0).
  console.log(`   …of which over a real NO_BID/INELIGIBLE (FALSE-BID): ${commitFlips.filter((r)=>["NO_BID","INELIGIBLE"].includes(r.actual)).length}`);
  // INCOMPLETE→commit: split false-INCOMPLETE correction (coverageComplete=false was the legacy bug) vs a genuine-incomplete violation.
  const incToCommit = incomplete.filter((r) => COMMIT.has(r.shadow));
  console.log(`\nINCOMPLETE→commit (for Brain review — false-INCOMPLETE correction vs violation): ${incToCommit.length}`);
  for (const r of incToCommit) console.log(`   ${r.id.padEnd(9)} INCOMPLETE → ${r.shadow}  ${r.reason}`);
  const incHeld = incomplete.length - incToCommit.length;
  console.log(`INCOMPLETE that stay honest-fail (INCOMPLETE/NHR): ${incHeld}/${incomplete.length}`);
  // LBJ spotlight
  const lbj = rows.filter((r) => r.sol.includes("12318726") || r.id === "40fd02ce" || r.id === "45f9bacd");
  if (lbj.length) { console.log("\nLBJ spotlight:"); lbj.forEach((r) => console.log(`  ${r.id}: actual=${r.actual} → shadow=${r.shadow} (naics=${r.naics}, deciding=${r.deciding}) — ${r.reason}`)); }
})();
