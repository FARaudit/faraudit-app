// The desk-fit judgement for /defense-news: how much a story bears on the reader's
// own NAICS codes, and the one line telling them what to do about it.
//
// Lives outside the route so it can be exercised directly against real headlines.
// A route file may only export Next's own handlers, so anything a probe needs to
// call has to sit here.

import type Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

/** A story as the judge needs to see it. Structurally the subset of the route's
 *  NewsItem that the prompt reads, so the route passes its items straight in. */
export interface JudgeableItem {
  source: string;
  title: string;
  summary: string;
  link: string;
}

export interface Judgement {
  relevance: number;
  code: string | null;
  why: string;
}

/** Whose desk this is, in the model's words. Built only from codes on file and
 *  their 13 CFR titles. The prompt this replaced asserted a revenue band, a
 *  company type and three certifications for every reader alike — none of which
 *  we know, and all of which were being written into advice addressed to them. */
export function judgePrompt(desk: string | null): string {
  if (!desk) {
    return [
      "You advise small and mid-sized federal contractors. You do NOT know this",
      "reader's industry — they have no NAICS codes on file — so do not guess one",
      "and do not name an industry, revenue or certification for them.",
      "",
      "For each numbered story, return relevance 0-100 for a generic federal",
      "contractor and one line of what to watch.",
      'Always return "code": null — you have no code list to choose from.'
    ].join("\n");
  }
  return [
    "You advise ONE federal contractor. Their business is exactly these NAICS codes:",
    desk,
    "",
    "For each numbered story below, judge how much it bears on THIS contractor's",
    "business and say what they should do about it.",
    "",
    "relevance (0-100):",
    "  80-100  touches their industry directly, or a contract or rule they must act on",
    "  55-79   shapes their market — the budget, a prime they sub to, a policy that reaches them",
    "  20-54   defense news worth knowing but nothing they can act on",
    "  0-19    no bearing on their business",
    "  Be strict. Most defense news does not touch a given contractor. A page where",
    "  everything scores 80 is useless to them.",
    "",
    'code: the ONE code from the list above this story bears on, or null.',
    "  NEVER return a code that is not in that list. null is the correct answer when",
    "  the story matters for a reason that is not industry-specific.",
    "",
    "why: max 22 words. Address them directly. Name the concrete action or exposure.",
    "  No 'consider', no 'might want to', no restating the headline."
  ].join("\n");
}

/** One call per chunk of stories. The whole list is judged against one desk in one
 *  request, so the model ranks stories against EACH OTHER rather than scoring each
 *  in isolation with no sense of what else is on the page that day. */
export async function judgeChunk(
  client: Anthropic,
  desk: string | null,
  allowedCodes: Set<string>,
  chunk: JudgeableItem[]
): Promise<Map<string, Judgement>> {
  const out = new Map<string, Judgement>();
  const listing = chunk
    .map((it, i) => `${i + 1}. [${it.source}] ${it.title}\n   ${it.summary.slice(0, 280)}`)
    .join("\n\n");
  try {
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{
        role: "user",
        content:
          `${judgePrompt(desk)}\n\nSTORIES:\n${listing}\n\n` +
          `Return ONLY a JSON array, one object per story, no prose and no code fence:\n` +
          `[{"i":1,"relevance":0-100,"code":"<code or null>","why":"..."}]`
      }]
    });
    const text = msg.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("")
      .trim();
    // The model is asked for a bare array; a fence or a sentence around it is a
    // formatting slip, not a failure, so the array is extracted rather than the
    // whole response discarded.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) {
      console.error("[defense-news] judge returned no JSON array", { head: text.slice(0, 120) });
      return out;
    }
    const parsed = JSON.parse(text.slice(start, end + 1)) as Array<{
      i?: number; relevance?: number; code?: string | null; why?: string;
    }>;
    if (!Array.isArray(parsed)) return out;

    for (const row of parsed) {
      const idx = Number(row?.i) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= chunk.length) continue;
      const item = chunk[idx];
      if (!item.link) continue;

      const rel = Number(row?.relevance);
      // ── Grounding ──
      // The model may only name a code the customer actually holds. Left
      // unchecked it will helpfully invent a plausible neighbouring code, and
      // that code would then be printed on the card as the reader's own.
      const claimed = typeof row?.code === "string" ? row.code.trim() : "";
      const code = allowedCodes.has(claimed) ? claimed : null;
      const why = typeof row?.why === "string" ? row.why.trim().replace(/^["']|["']$/g, "") : "";
      if (!why) continue;

      out.set(item.link, {
        relevance: Number.isFinite(rel) ? Math.max(0, Math.min(100, Math.round(rel))) : 0,
        code,
        why
      });
    }
  } catch (err) {
    console.error("[defense-news] judge chunk failed", {
      size: chunk.length,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  return out;
}
