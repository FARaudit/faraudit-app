import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Static CMMC reference. Levels per DoD CMMC 2.0 model.
const LEVELS = {
  "1": {
    label: "Level 1 — Foundational",
    practices: 17,
    summary: "Basic safeguarding of FCI (Federal Contract Information). Annual self-assessment.",
    triggers: ["DFARS 252.204-7012 (limited)", "FAR 52.204-21"],
    checklist: [
      "Limit information system access to authorized users",
      "Identify users + processes acting on behalf of users",
      "Verify and control connections to + use of external systems",
      "Sanitize or destroy media before disposal",
      "Identify, report, and correct flaws in a timely manner",
      "Provide protection from malicious code at appropriate locations",
      "Update malicious code protection mechanisms when new releases are available"
    ]
  },
  "2": {
    label: "Level 2 — Advanced",
    practices: 110,
    summary: "Protects CUI (Controlled Unclassified Information). Aligned with NIST SP 800-171. Triennial third-party assessment for prioritized contracts.",
    triggers: ["DFARS 252.204-7012", "DFARS 252.204-7019", "DFARS 252.204-7020", "DFARS 252.204-7021"],
    checklist: [
      "Develop a System Security Plan (SSP) covering all 110 NIST 800-171 controls",
      "Submit SPRS score in the Supplier Performance Risk System before contract award",
      "Identify and segment all CUI flows through your network",
      "Multi-factor authentication for privileged + remote access",
      "FIPS 140-2 validated cryptography for CUI in transit + at rest",
      "Incident response plan with 72-hour DoD reporting capability",
      "Engage a C3PAO for triennial assessment if your contract requires it",
      "Annual affirmation by senior official"
    ]
  },
  "3": {
    label: "Level 3 — Expert",
    practices: 134,
    summary: "Higher protection for CUI on the most sensitive programs. Government-led assessment every 3 years.",
    triggers: ["DFARS 252.204-7012 (with critical asset designation)"],
    checklist: [
      "All Level 2 practices + 24 additional from NIST SP 800-172",
      "Advanced threat protection for APT-class adversaries",
      "Government-led assessment by DoD Cyber Crimes Center or equivalent",
      "Penetration testing performed by qualified red team",
      "Threat hunting capability with documented runbooks"
    ]
  }
};

function inferLevel(audit: Record<string, unknown>): "0" | "1" | "2" | "3" {
  const compJson = (audit.compliance_json as Record<string, unknown>) || {};
  const dfarsClauses = Array.isArray(compJson.dfars_clauses) ? (compJson.dfars_clauses as string[]) : [];
  const flags = Array.isArray(compJson.dfars_flags) ? (compJson.dfars_flags as Array<Record<string, unknown>>) : [];
  const allText = [
    ...dfarsClauses,
    ...flags.map((f) => `${f.clause} ${f.title}`),
    JSON.stringify(compJson).slice(0, 4000)
  ].join(" ").toLowerCase();

  if (/critical (asset|program)|level\s*3|cmmc[-\s]*3/.test(allText)) return "3";
  if (/252\.204-7021|cmmc level\s*2|cmmc[-\s]*2|nist\s*sp\s*800-171|controlled unclassified|cui/.test(allText)) return "2";
  if (/252\.204-7012|fci|federal contract information|cmmc level\s*1|cmmc[-\s]*1/.test(allText)) return "1";
  return "0";
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const auditId = url.searchParams.get("audit_id");

  // If audit_id passed, return per-audit assessment.
  if (auditId) {
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, notice_id, title, agency, compliance_json")
      .eq("id", auditId)
      .single();
    if (error || !audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });
    const level = inferLevel(audit as Record<string, unknown>);
    const levelData = level === "0" ? null : LEVELS[level];
    return NextResponse.json({
      audit_id: auditId,
      required_level: level === "0" ? "NOT REQUIRED" : `CMMC ${level}`,
      level_data: levelData,
      reference: LEVELS
    });
  }

  // Aggregate: CMMC distribution across all audits.
  const { data: audits } = await supabase
    .from("audits")
    .select("id, notice_id, agency, compliance_json")
    .limit(500);

  const distribution: Record<"0" | "1" | "2" | "3", number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  const recentByLevel: Record<"1" | "2" | "3", Array<{ id: string; notice_id: string | null; agency: string | null }>> = { "1": [], "2": [], "3": [] };
  for (const a of (audits || []) as Array<Record<string, unknown>>) {
    const level = inferLevel(a);
    distribution[level] += 1;
    if (level !== "0" && recentByLevel[level].length < 5) {
      recentByLevel[level].push({
        id: String(a.id),
        notice_id: (a.notice_id as string) || null,
        agency: (a.agency as string) || null
      });
    }
  }

  return NextResponse.json({
    reference: LEVELS,
    distribution,
    recent_by_level: recentByLevel,
    total_audited: (audits || []).length
  });
}
