import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase env vars not set" }, { status: 500 });
  }

  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accept auditId in any of: { auditId } | { audit_id } | { id }; numeric or string.
  const body = await req.json().catch(() => ({}));
  const raw = body.auditId ?? body.audit_id ?? body.id;
  const auditId =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && raw.trim() && /^\d+$/.test(raw.trim())
      ? Number(raw.trim())
      : null;

  if (!auditId) {
    console.warn("[ko-email] missing auditId in body:", JSON.stringify(body));
    return NextResponse.json(
      { error: "auditId required (received: " + JSON.stringify(raw) + ")" },
      { status: 400 }
    );
  }

  const { data: audit } = await supabase
    .from("audits")
    .select("notice_id, title, agency, compliance_json, risks_json, recommendation, bid_recommendation")
    .eq("id", auditId)
    .single();

  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Pull top 3 risks for the body of the email when available.
  type Risk = { text?: string; priority?: string };
  const risksJson = (audit.risks_json ?? {}) as Record<string, unknown>;
  const prioritized = (risksJson.prioritized_risks as Risk[] | undefined) ?? [];
  const topThree = prioritized
    .filter((r) => r?.text)
    .slice(0, 3)
    .map((r, i) => `${i + 1}. ${r.text}`)
    .join("\n") ||
    "1. [Question 1 — pulled from highest-priority risk identified]\n2. [Question 2]\n3. [Question 3]";

  const draft = `Subject: Clarification request — ${audit.notice_id}${audit.title ? " · " + audit.title : ""}

Dear Contracting Officer,

I am writing on behalf of [COMPANY NAME] regarding solicitation ${audit.notice_id}${audit.agency ? " issued by " + audit.agency : ""}. After a thorough review of the requirement we would appreciate clarification on the following items before proceeding with our proposal:

${topThree}

We confirm receipt of the solicitation and intend to submit a responsive proposal upon receiving the clarifications above. Please advise on the deadline for question submission and the expected response timeline.

Respectfully,
[NAME]
[TITLE]
[COMPANY]
[CAGE / UEI]
[EMAIL] · [PHONE]

— —
Audit reference: #${auditId} · Recommendation: ${audit.recommendation || "pending"}
This is a draft; review and tailor before sending.`;

  return NextResponse.json({ draft });
}

export async function GET() {
  return NextResponse.json({ status: "ko-email endpoint live" });
}
