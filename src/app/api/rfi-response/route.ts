import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  pending_audit_id?: string;
  notice_id: string;
  title?: string | null;
  agency?: string | null;
  naics_code?: string | null;
  notice_type?: string | null;
  description?: string | null;
}

const SYSTEM_PROMPT = `You are FARaudit's pre-solicitation intelligence engine. The customer is a defense subcontractor responding to a SOURCES SOUGHT or PRE-SOLICITATION SYNOPSIS posted on SAM.gov.

Goal: draft a strategic, professional response that:
1. Demonstrates capability without overstating it
2. Shapes the eventual solicitation in the customer's favor (SOW influence)
3. Surfaces unconsidered risks the agency may have missed
4. Mirrors the agency's terminology so the response feels native
5. Stays under 800 words

Format:
- Subject line
- One-paragraph executive intro that names the customer's solution category and unique angle
- Capability statement (3 bullets max — facilities, prior work, certifications relevant to NAICS)
- Solution-first answer to the agency's stated need
- 2–3 unconsidered risks the customer believes the agency should plan for, framed as collaborative
- One specific question that, if answered, would clarify scope (this is the SOW influence move)
- Closing: company name, POC line items, capability documents available on request

Tone: confident but never boastful. No marketing fluff. No "we are excited to..." openings.

Output the full email/letter ready to copy-paste — no preamble, no markdown headers, no explanation of what you wrote.`;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!anthropic) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.notice_id) {
    return NextResponse.json({ error: "notice_id required" }, { status: 400 });
  }

  const userPrompt = [
    `Notice ID: ${body.notice_id}`,
    body.notice_type ? `Notice type: ${body.notice_type}` : null,
    body.agency ? `Agency: ${body.agency}` : null,
    body.naics_code ? `NAICS: ${body.naics_code}` : null,
    body.title ? `Title: ${body.title}` : null,
    body.description ? `\nNotice content:\n${body.description}` : null,
    "",
    "Draft the response now."
  ].filter(Boolean).join("\n");

  let draft = "";
  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }]
    });
    const block = res.content.find((b) => b.type === "text");
    draft = block && block.type === "text" ? block.text.trim() : "";
  } catch (e) {
    return NextResponse.json(
      { error: `draft failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  if (!draft) {
    return NextResponse.json({ error: "Empty draft from model" }, { status: 502 });
  }

  // Persist (best-effort — table may not exist yet on first deploy).
  if (body.pending_audit_id) {
    await supabase
      .from("rfi_responses")
      .insert({
        pending_audit_id: body.pending_audit_id,
        notice_id: body.notice_id,
        notice_type: body.notice_type ?? null,
        response_draft: draft,
        user_id: user.id
      })
      .select()
      .maybeSingle()
      .then(() => null, () => null); // swallow — UI works without persistence
  }

  return NextResponse.json({ draft });
}
