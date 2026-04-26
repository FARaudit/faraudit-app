import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

// Stub endpoint — drafts a Contracting Officer clarification email for an audit.
// TODO: wire to Anthropic with full audit context once UI flow is validated.

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

  const body = await req.json().catch(() => ({}));
  const auditId = body.auditId;
  if (!auditId) {
    return NextResponse.json({ error: "auditId required" }, { status: 400 });
  }

  const { data: audit } = await supabase
    .from("audits")
    .select("notice_id, title, agency, compliance_json, risks_json, recommendation")
    .eq("id", auditId)
    .single();

  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Stub draft — pulled from audit context. Real Claude wiring in a follow-up.
  const draft = `Subject: Clarification request — ${audit.notice_id}${audit.title ? " · " + audit.title : ""}

Dear Contracting Officer,

I am writing on behalf of [COMPANY NAME] regarding solicitation ${audit.notice_id}${audit.agency ? " issued by " + audit.agency : ""}. After a thorough review of the requirement we would appreciate clarification on the following items before proceeding with our proposal:

1. [Question 1 — pulled from the highest-priority risk identified in our compliance audit]
2. [Question 2 — clarification on FAR/DFARS clause applicability]
3. [Question 3 — set-aside eligibility and size-standard interpretation]

We confirm receipt of the solicitation and intend to submit a responsive proposal upon receiving the clarifications above. Please advise on the deadline for question submission and the expected response timeline.

Thank you for your consideration.

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
