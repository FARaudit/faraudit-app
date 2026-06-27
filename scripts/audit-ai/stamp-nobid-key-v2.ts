// Brain card 75-R1: mint the v2 CANDIDATE NO_BID key. Same judgment CONTENT (verdict/gates/showStopper/
// decoy unchanged — verbatim cites preserved) against the rebuilt §F source. New source_sha → new keySha.
// Does NOT mutate the committed v1 artifact and does NOT flip the registry (candidate, not canonical).
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { keySha256, type JudgmentKey } from "./judgment-score";

const GOLD = "scripts/audit-ai/gold-sets";
const V1_KEY = `${GOLD}/FA860126Q00260001.judgment.frozen.SYNTHETIC.json`;
const V2_KEY = `${GOLD}/FA860126Q00260001.judgment.frozen.SYNTHETIC.v2.json`;
const V2_SRC = `${GOLD}/FA860126Q00260001-FULL-SOURCE.v2.complete.txt`;
const fileSha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

const k = JSON.parse(readFileSync(V1_KEY, "utf8")) as JudgmentKey & Record<string, unknown>;
const v1KeySha = fileSha(V1_KEY);

const srcSha = fileSha(V2_SRC);
const srcBytes = statSync(V2_SRC).size;

k._title = String(k._title).replace("(gradeable JudgmentKey schema)", "(gradeable JudgmentKey schema; v2 — synthetic mod re-placed in §F per card 75-R1)");
k._suiteRole = String(k._suiteRole) + " V2 (card 75-R1): the synthetic delivery contradiction is re-placed inside a recognized SECTION F (supersedes base §F 90-day + SOW §IV 8-month) and §B is grounded from the real CLIN, so the agentic engine attributes + grounds it. CONTENT-identical to v1 (verdict/gates/showStopper/decoy/verbatim cites unchanged); only the source LOCATION/structure changed. v1's source placed the mod as a trailing unattributed AMENDMENT → graduation run derived INCOMPLETE (engine never saw it).";
k._provenance_note = "SYNTHETIC-ADVERSARIAL key, v2 (card 75-R1). Base FA860126Q00260001 (HDR MWIR thermal imager, AFIT/AFLCMC, NAICS 334511, unrestricted, Combined Synopsis/Solicitation) is REAL — fetched from SAM.gov 2026-06-26. The delivery contradiction is now a clearly-labeled [SYNTHETIC-ADVERSARIAL] SECTION F (header 'SECTION F — DELIVERIES OR PERFORMANCE [SYNTHETIC-ADVERSARIAL AMENDMENT — SUPERSEDES BASE §F]', fenced + banner-delimited, never blended) that the section detector attributes to §F. The base 90-day §F schedule and the SOW §IV '8 months' target are SUPERSEDED/VOIDED so no meetable delivery term competes. §B is grounded from the real CLIN 0001 (FFP, 1 each, PSC 5855) so coverage completes. Verbatim binding clause wording (60-day non-waivable FAT / 30-day ARO / UNACCEPTABLE) preserved → key sourceCites still resolve. DFARS 225.872 qualifying-country, 1-yr warranty, FOB-destination are real base terms (provenance, not gates/decoys).";
k.source_sha256 = srcSha;
k.source_bytes = srcBytes;
k.source_completeness = "base-real-from-SAM + labeled-synthetic-§F-amendment (v2; supersedes base delivery terms)";
k.authored_against = V2_SRC;
k.supersedes = [{
  file: "FA860126Q00260001.judgment.frozen.SYNTHETIC.json",
  key_type: "full_verdict",
  status: "candidate-supersede (pending CEO ratification — registry NOT yet flipped)",
  retired_sha256: v1KeySha,
  reason: "card 75-R1: v1 source placed the synthetic mod as a trailing unattributed AMENDMENT block; the section detector never assigned it to §F so the agentic engine never grounded the impossibility (graduation run #38 derived INCOMPLETE). v2 re-places it as a recognized §F that supersedes base delivery terms + grounds §B. Judgment content identical.",
}];
// card 76-R1: re-point the namedGate sourceCite to the BINDING INPUTS (F.1 + F.2) only. The 60>30
// net-effect/conclusion is demoted to the provenance banner so the engine must DERIVE the conflict; the
// gate TOKEN (the derived concept) + aliases are unchanged — the cite just no longer quotes the conclusion.
const ng = (k as unknown as { namedGates?: Array<{ sourceCite?: string }> }).namedGates;
if (ng && ng[0]) {
  ng[0].sourceCite = "First article testing is a NON-WAIVABLE precondition to production and delivery ... The Government will require SIXTY (60) calendar days to conduct first article testing ... No production delivery may occur before the close of this 60-day Government testing period (F.1). The Contractor shall deliver all production units ... NOT LATER THAN THIRTY (30) calendar days After Receipt of Order (ARO) (F.2). [Binding inputs only per card 76-R1; the conclusion is demoted to the provenance banner and the engine derives the conflict from F.1 and F.2.]";
}

const adj = k.adjudication as Record<string, unknown>;
adj.rulingRef = String(adj.rulingRef) + " · card 75-R1 (rebuild source: synthetic mod → recognized §F supersede + §B grounded) · card 76-R1 (substance-derivation guard: net-effect conclusion demoted to provenance banner; body keeps only binding inputs F.1/F.2/F.3; namedGate cite re-pointed to binding inputs; engine must derive 60>30)";
adj.authoredAt = "2026-06-27";
adj.sourceSha256 = srcSha;
adj.candidate = true; // NOT canonical until CEO greenlights
adj.keySha256 = "PENDING";

const ksha = keySha256(k);
adj.keySha256 = ksha;
writeFileSync(V2_KEY, JSON.stringify(k, null, 2) + "\n");

console.log(`v2 candidate key written: ${V2_KEY}`);
console.log(`  source_sha256 = ${srcSha}`);
console.log(`  source_bytes  = ${srcBytes}`);
console.log(`  NEW keySha256 = ${ksha}`);
console.log(`  (v1 keySha was 22424bc8…; v1 key file sha ${v1KeySha.slice(0, 12)}… recorded as retired_sha256)`);
const reload = JSON.parse(readFileSync(V2_KEY, "utf8")) as JudgmentKey;
console.log(`  recompute==stamped: ${keySha256(reload) === reload.adjudication?.keySha256 ? "✅ YES" : "❌ NO"}`);
