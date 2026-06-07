// Fix 8 verifier — exercises runAuditV2Metadata directly with synthetic
// SAM.gov metadata. Asserts the function produces a coherent metadata-only
// AuditV2Result: type="metadata_only", verdict="conditional", non-null
// metadata_brief with eligibility/deadline/synopsis/co_contact/missing_intel.
//
// Three probes exercise the deadline-urgency cliff (critical, warning, calm)
// and one probe omits the response deadline (urgency=0).

import { runAuditV2Metadata, type MetadataOnlyInput } from "../src/lib/audit-engine";

const SAMPLE_SYNOPSIS =
  "The U.S. Army Corps of Engineers is soliciting quotations for routine HVAC " +
  "maintenance services at Building 42, Fort Sample, supporting a 12-month " +
  "base period with two option years. The successful contractor shall provide " +
  "monthly preventive maintenance, on-call repair within 24 hours of notification, " +
  "and quarterly air-quality testing. Contracting Officer Sarah Johnson can be " +
  "reached at sarah.j.johnson@usace.army.mil for questions before the quote " +
  "submission deadline.";

const SAMPLE_SHORT_SYNOPSIS = "Sources sought notice. Provide capability statement.";

const now = Date.now();
function isoDaysFromNow(days: number): string {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

interface Probe {
  label: string;
  input: MetadataOnlyInput;
  expectUrgencyMin: number;
  expectUrgencyMax: number;
  expectEmail: boolean;
}

const PROBES: Probe[] = [
  {
    label: "critical (2 days out)",
    input: {
      noticeId: "TEST-CRITICAL",
      title: "HVAC Maintenance — Building 42",
      description: SAMPLE_SYNOPSIS,
      naicsCode: "238220",
      typeOfSetAside: "Small Business",
      postedDate: isoDaysFromNow(-5),
      responseDeadLine: isoDaysFromNow(2),
      noticeType: "Combined Synopsis/Solicitation",
      agency: "U.S. Army Corps of Engineers",
    },
    expectUrgencyMin: 100,
    expectUrgencyMax: 100,
    expectEmail: true,
  },
  {
    label: "warning (10 days out)",
    input: {
      noticeId: "TEST-WARNING",
      title: "HVAC Maintenance — Building 42",
      description: SAMPLE_SYNOPSIS,
      naicsCode: "238220",
      typeOfSetAside: "HUBZone",
      postedDate: isoDaysFromNow(-2),
      responseDeadLine: isoDaysFromNow(10),
      noticeType: "Solicitation",
      agency: "U.S. Army Corps of Engineers",
    },
    expectUrgencyMin: 50,
    expectUrgencyMax: 50,
    expectEmail: true,
  },
  {
    label: "calm (60 days out)",
    input: {
      noticeId: "TEST-CALM",
      title: "HVAC Maintenance — Building 42",
      description: SAMPLE_SYNOPSIS,
      naicsCode: "238220",
      typeOfSetAside: null,
      postedDate: isoDaysFromNow(-1),
      responseDeadLine: isoDaysFromNow(60),
      noticeType: "Sources Sought",
      agency: "U.S. Army Corps of Engineers",
    },
    expectUrgencyMin: 10,
    expectUrgencyMax: 10,
    expectEmail: true,
  },
  {
    label: "no deadline · short synopsis",
    input: {
      noticeId: "TEST-NO-DEADLINE",
      title: "Sources Sought",
      description: SAMPLE_SHORT_SYNOPSIS,
      naicsCode: null,
      typeOfSetAside: null,
      postedDate: null,
      responseDeadLine: null,
      noticeType: "Sources Sought",
      agency: null,
    },
    expectUrgencyMin: 0,
    expectUrgencyMax: 0,
    expectEmail: false,
  },
];

async function probe(p: Probe): Promise<{ pass: boolean; line: string }> {
  const t0 = Date.now();
  const r = await runAuditV2Metadata(p.input);
  const ms = Date.now() - t0;

  const dcType = r.judgment.documentClassification.type;
  const verdict = r.judgment.verdict.goNoGoRecommendation;
  const urgency = r.judgment.verdict.urgencyScore;
  const brief = r.metadata_brief;

  const checks: string[] = [];
  if (dcType !== "metadata_only") checks.push(`type=${dcType}`);
  if (verdict !== "conditional") checks.push(`verdict=${verdict}`);
  if (urgency < p.expectUrgencyMin || urgency > p.expectUrgencyMax) checks.push(`urgency=${urgency} (want ${p.expectUrgencyMin}..${p.expectUrgencyMax})`);
  if (!brief) checks.push("brief=null");
  if (brief && p.expectEmail && !brief.co_contact.email) checks.push("co_contact.email=null (expected)");
  if (brief && brief.missing_intel.length < 5) checks.push(`missing_intel=${brief.missing_intel.length} (<5)`);
  if (brief && !brief.synopsis_summary) checks.push("synopsis_summary=empty");
  if (ms > 1000) checks.push(`slow=${ms}ms`);

  const pass = checks.length === 0;
  const detail = brief
    ? ` urgency=${urgency} deadline=${brief.deadline.formatted} days=${brief.deadline.days_remaining} email=${brief.co_contact.email ?? "—"}`
    : "";
  return {
    pass,
    line: `${p.label.padEnd(34)} → ${pass ? "PASS" : "FAIL: " + checks.join(", ")}${detail}`,
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  Fix 8 verifier — runAuditV2Metadata deterministic synthesis");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  let allPass = true;
  for (const p of PROBES) {
    const r = await probe(p);
    console.log("  " + r.line);
    if (!r.pass) allPass = false;
  }
  console.log("");
  console.log(allPass ? "✓ Fix 8 verified — metadata-only path emits coherent brief at zero LLM cost" : "✗ Fix 8 FAILED");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
