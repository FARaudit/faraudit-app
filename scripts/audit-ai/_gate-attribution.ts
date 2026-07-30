// P0-4 — per-gate/pole-entrance attribution over banked NHR + INCOMPLETE runs. $0 offline.
// Buckets each escalation by WHICH pole entrance fired (from the reason string + coverage/finding shape),
// so the Verdict Arc knows precisely which entrances own the escalation mass.
import * as fs from "fs";
const runs = JSON.parse(fs.readFileSync("/tmp/banked_runs.json", "utf8"));
const V = (r: any) => r.compliance_json?.v3?.verdict;
const reasonOf = (r: any) => r.compliance_json?.v3?.reason || r.bid_recommendation || "";

const bucket = (reason: string, r: any): string => {
  const s = reason.toLowerCase();
  const cov = r.compliance_json?.v3?.coverage;
  if (/could not be grounded to a finding/.test(s)) return "A. grounding-miss (FIX-1)";
  if (/adversarial verification|not trustworthy enough|findings not trustworthy/.test(s)) return "V. adversarial-verifier distrust (veto)";
  if (/coverage cap|uncovered disqualifier|potential disqualifier/.test(s)) return "B. coverage-cap / uncovered-disqualifier";
  if (/unclassifiable|not bidder-self-determinable|deciding.*bar|structural bar|binding-a/.test(s)) return "C. binding-untyped (bar not classifiable)";
  if (/set-?aside|women owned|wosb|sdvosb|hubzone|8\(a\)|service-disabled/.test(s)) return "D. set-aside / socioeconomic eligibility";
  if (/registration|sam\.gov|sam-active|vista|register/.test(s)) return "E. registration (SAM/VISTA)";
  if (/size standard|naics|\$13 million|small business size/.test(s)) return "F. size-standard / NAICS";
  if (/licens|certification|accreditation|insurance|maintain/.test(s)) return "G. maintain-credential recital";
  if (/not complete|incomplete|content not analyzed|scanned|image|could not.*read|truncat|binding.*loss|manifest/.test(s)) return "H. INCOMPLETE: content-loss / manifest";
  if (!reason.trim()) return "Z. empty-reason (driver not in string)";
  return "Y. other/uncategorized";
};

const groups: Record<string, Record<string, { count: number; sols: Set<string>; sample: string }>> = { NEEDS_HUMAN_REVIEW: {}, INCOMPLETE: {} };
for (const r of runs) {
  const v = V(r); if (v !== "NEEDS_HUMAN_REVIEW" && v !== "INCOMPLETE") continue;
  const reason = reasonOf(r); const b = bucket(reason, r);
  const g = groups[v]; g[b] = g[b] || { count: 0, sols: new Set(), sample: "" };
  g[b].count++; g[b].sols.add(r.solicitation_number || "?");
  if (!g[b].sample) g[b].sample = reason.slice(0, 100).replace(/\s+/g, " ");
}
for (const v of ["NEEDS_HUMAN_REVIEW", "INCOMPLETE"]) {
  const g = groups[v]; const total = Object.values(g).reduce((a, x) => a + x.count, 0);
  console.log(`\n===== ${v}  (total ${total}) =====`);
  for (const [b, x] of Object.entries(g).sort((a, c) => c[1].count - a[1].count))
    console.log(`  ${String(x.count).padStart(3)}  ${b}  · sols=${x.sols.size}\n         e.g. "${x.sample}"`);
}
console.log(`\nNote: counts are per-RUN by that run's TOP verdict-driver reason (one bucket per run).`);
