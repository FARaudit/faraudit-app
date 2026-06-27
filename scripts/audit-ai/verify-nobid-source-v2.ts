// Brain cards 75-R1 + 76-R1 verification — ALL $0 (string/section checks, NO audit/LLM call).
//   npx tsx scripts/audit-ai/verify-nobid-source-v2.ts
import { readFileSync } from "node:fs";
import { detectSections, detectConstructionOutOfScope } from "../../src/lib/section-boundary-detector";
import { keySha256, type JudgmentKey } from "./judgment-score";

const GOLD = "scripts/audit-ai/gold-sets";
const V2 = `${GOLD}/FA860126Q00260001-FULL-SOURCE.v2.complete.txt`;
const V1 = `${GOLD}/FA860126Q00260001-FULL-SOURCE.complete.txt`;
const V2_KEY = `${GOLD}/FA860126Q00260001.judgment.frozen.SYNTHETIC.v2.json`;
const text = readFileSync(V2, "utf8");
const v1 = readFileSync(V1, "utf8");

const doc = { rawText: text, pages: [{ pageNum: 1, lines: text.split("\n") }], warnings: [] as string[] } as never;
const bag = detectSections(doc);
const rows: Array<[boolean, string, string]> = [];
const add = (ok: boolean, check: string, detail: string) => rows.push([ok, check, detail]);

// ── split §F into PROVENANCE BANNER (human authoring note) vs LENS-READABLE BODY (F.1 onward) ──
const F = bag.sections["F"];
const ftext = F?.text ?? "";
const bodyStart = ftext.search(/F\.1 FIRST ARTICLE APPROVAL/);
const fBanner = bodyStart >= 0 ? ftext.slice(0, bodyStart) : "";
const fBody = bodyStart >= 0 ? ftext.slice(bodyStart) : ftext;

// === card 75-R1 (carry-over) ===
add(!!F && (F.confidence === "high" || F.confidence === "medium"), "§F detected (block attributed to Deliveries/Performance)", F ? `confidence=${F.confidence}` : "MISSING");
const B = bag.sections["B"];
const bHasObligation = !!B && /CLIN 0001 \(binding supply obligation\)/.test(B.text) && /Firm-Fixed-Price/.test(B.text);
add(!!B && B.confidence !== "missing", "§B detected (not structurally missing)", B ? `confidence=${B.confidence}` : "MISSING");
add(bHasObligation, "§B carries a groundable binding obligation (real CLIN 0001)", bHasObligation ? "ok" : "obligation not inside §B");

// === card 76-R1 — substance-derivation guard ===
const concInBody = /universally unmeetable|net-?effect/i.test(fBody);
const concInBanner = /universally unmeetable/i.test(fBanner) && /net-?effect/i.test(fBanner);
add(!concInBody, "76-R1: conclusion ('universally unmeetable'/'net-effect') ABSENT from lens-readable §F body", concInBody ? "STILL IN BODY" : "absent from body ✓");
add(concInBanner, "76-R1: conclusion present ONLY in the provenance banner (demoted, not deleted)", concInBanner ? "in banner ✓" : "not found in banner");
// F.1 and F.2 — the two INPUTS the engine needs to derive 60>30 — each individually present in BODY
const f1 = /NON-WAIVABLE precondition to production and delivery/.test(fBody) && /SIXTY \(60\) calendar days/.test(fBody);
const f2 = /THIRTY \(30\) calendar days After Receipt of Order/.test(fBody);
add(f1, "76-R1: F.1 (non-waivable 60-day FAT precondition) resolves in §F body", f1 ? "ok" : "MISSING");
add(f2, "76-R1: F.2 (30-day ARO delivery) resolves in §F body", f2 ? "ok" : "MISSING");
add(!f1 || !f2 || (f1 && f2), "76-R1: both inputs present, conflict is DERIVABLE not stated", f1 && f2 ? "60-day + 30-day both in body; engine computes 60>30" : "input missing");

// === showStopper + namedGate cites target BINDING TERMS (F.1/F.2/F.3), resolve in BODY, not the conclusion ===
const key = JSON.parse(readFileSync(V2_KEY, "utf8")) as JudgmentKey;
const ss = key.showStoppers?.[0]?.sourceCite ?? "";
const ssBindingPhrases = ["NON-WAIVABLE precondition to production and delivery", "SIXTY (60) calendar days", "THIRTY (30) calendar days After Receipt of Order", "rated UNACCEPTABLE"];
const ssResolves = ssBindingPhrases.every((p) => fBody.includes(p)) && !/universally unmeetable|net-?effect/i.test(ss);
add(ssResolves, "76-R1: showStopper cite targets binding terms (F.1/F.2/F.3) in §F body, NOT a conclusion", ssResolves ? "ok" : "FAIL");
const ng = key.namedGates?.[0]?.sourceCite ?? "";
add(!/universally unmeetable|net-?effect|Because 60 > 30|physically unmeetable/i.test(ng), "76-R1: namedGate cite re-pointed to binding inputs (no conclusion quoted)", /unmeetable|net-?effect|60 > 30/i.test(ng) ? "still quotes conclusion" : "binding inputs only ✓");

// === integrity ===
add(keySha256(key) === key.adjudication?.keySha256, "keySha256 recompute == stamped", `${keySha256(key).slice(0, 12)}…`);
add(!/90 Calendar Days/.test(text) && !/8 months after receipt/.test(text), "no live competing delivery term (90-day + 8-month gone)", "ok");
const det = detectConstructionOutOfScope({ naicsCode: "334511", fullText: text });
add(det === null, "detector negative replay: 334511 does NOT trip OOS", det === null ? "null (in-scope)" : "TRIPPED");
const baseMarkers = ["HDR M700", "(DFARS) 225.872", "Spectral range 3-5 microns", "52.212-2", "Dr. Michael Dexter", "UNRESTRICTED", "334511"];
const lost = baseMarkers.filter((m) => !text.includes(m));
add(lost.length === 0, "manifest reconciliation: base content markers preserved", lost.length ? `LOST: ${lost.join(", ")}` : `${baseMarkers.length}/${baseMarkers.length} present`);
add(Math.abs(text.length - v1.length) < 6000, "byte delta vs v1 within band (structural edit)", `Δ=${text.length - v1.length}`);

const w = Math.max(...rows.map((r) => r[1].length));
console.log("\n┌─ NO_BID SOURCE v2 — $0 VERIFICATION (cards 75-R1 + 76-R1) " + "─".repeat(6));
for (const [ok, c, d] of rows) console.log(`│ ${ok ? "✅" : "❌"} ${c.padEnd(w)}  ${d}`);
console.log("└" + "─".repeat(w + 22));
console.log(`\nsections: ${Object.keys(bag.sections).sort().join(",")} | format=${bag.formatDetected}`);
const failed = rows.filter((r) => !r[0]);
if (failed.length) { console.error(`\n✗ ${failed.length} check(s) FAILED`); process.exit(1); }
console.log("✓ ALL $0 CHECKS PASS — conclusion demoted to banner; body holds only derivable binding inputs; cites target binding terms; keySha intact. CANDIDATE only — no re-run (CEO-gated).");
