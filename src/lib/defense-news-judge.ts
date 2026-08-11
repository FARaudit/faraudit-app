// The desk-fit judgement for /defense-news: how much a story bears on the reader's
// own NAICS codes, and the one line telling them what to do about it.
//
// Lives outside the route so it can be exercised directly against real headlines.
// A route file may only export Next's own handlers, so anything a probe needs to
// call has to sit here.

import type Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

/** Published per-million-token rates for CLAUDE_MODEL, used only to turn the
 *  API's reported token counts into a dollar figure in the response and the
 *  logs. A rate change here does not change behaviour — it changes a number the
 *  reader can check against the billing console. */
export const RATE_PER_MTOK = { input: 3, output: 15 } as const;

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
  /** Warfighting/subject domain — the tab this story files under. Measured on a
   *  48-story live corpus: this places 85% of stories, against 46% for buying
   *  agency, which is why the TABS are domains and the agency is only a chip. */
  domain: string | null;
  /** The buying organisation, when the story is about one. Null on more than half
   *  of real stories, which is fine for a chip and fatal for a tab. */
  agency: string | null;
  /** The scroll-read line: what happened, and what it means for this desk. */
  why: string;
  /** 1-based index, within this chunk, of an earlier story covering the SAME
   *  event. Wire copy and a Google News aggregation of it carry different
   *  headlines, so nothing textual catches the pair — but the model reading both
   *  does, unprompted. Null when the story is not a repeat. */
  duplicateOf: number | null;
}

/** The domains a story may file under. Fixed set — a free-text domain would make
 *  a new tab appear every time the model reached for a synonym. */
export const DOMAINS = ["Policy", "Land", "Sea", "Air & Space", "Cyber", "Industry"] as const;
/** Buying organisations. "Other" is deliberately absent: a chip that says "Other"
 *  tells the reader nothing, so an unrecognised agency becomes null. */
export const AGENCIES = ["Army", "Navy", "Air Force", "Marine Corps", "Space Force", "DLA", "DARPA", "Pentagon/OSD", "Coast Guard", "GSA"] as const;

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
      "contractor, plus the same summary, domain and agency fields described below.",
      "",
      "why: two sentences, 30-40 words. What happened, then what a federal",
      "contractor should do about it. Lead with the concrete fact.",
      "",
      `domain: exactly one of: ${DOMAINS.join(" | ")}.`,
      `agency: one of: ${AGENCIES.join(" | ")}, or null when none is buying.`,
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
    "why: THE SUMMARY THE READER ACTUALLY READS. Most will never open the article —",
    "  they scroll. Two sentences, 30-40 words total, in this order:",
    "    1. What happened. The concrete fact: who, what, how much, by when.",
    "    2. What it means for THEM. The exposure, the opening, or the deadline.",
    "  Lead with the specific. \'Army awarded $840M for engine overhaul\' beats",
    "  \'A contract was announced\'. Never restate the headline, never say \'consider\'",
    "  or \'might want to\', never pad with \'this development\'.",
    "",
    `domain: exactly one of: ${DOMAINS.join(" | ")}.`,
    "  Policy covers rulemaking, budget, acquisition reform and congressional action.",
    "  Industry covers company news, M&A, earnings and the supplier base.",
    "",
    `agency: the buying organisation, exactly one of: ${AGENCIES.join(" | ")}, or null.`,
    "  null is the RIGHT answer whenever no single organisation is buying — most",
    "  policy and industry stories. Do not stretch to fill it.",
    "",
    "dup: if this story covers THE SAME EVENT as an earlier-numbered story in this",
    "  list, return that number. Otherwise null. The same contract award reported by",
    "  two outlets is the same event even when the headlines differ. A follow-up that",
    "  adds new facts is NOT a duplicate."
  ].join("\n");
}

/** One call per chunk of stories. The whole list is judged against one desk in one
 *  request, so the model ranks stories against EACH OTHER rather than scoring each
 *  in isolation with no sense of what else is on the page that day. */
export interface ChunkUsage {
  input_tokens: number;
  output_tokens: number;
  stories: number;
}

export async function judgeChunk(
  client: Anthropic,
  desk: string | null,
  allowedCodes: Set<string>,
  chunk: JudgeableItem[],
  /** Filled with what this call actually consumed, so the page's cost is read
   *  off the API's own usage numbers rather than off an estimate. */
  usage?: ChunkUsage[]
): Promise<Map<string, Judgement>> {
  const out = new Map<string, Judgement>();
  const listing = chunk
    .map((it, i) => `${i + 1}. [${it.source}] ${it.title}\n   ${it.summary.slice(0, 280)}`)
    .join("\n\n");
  try {
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      messages: [{
        role: "user",
        content:
          `${judgePrompt(desk)}\n\nSTORIES:\n${listing}\n\n` +
          `Return ONLY a JSON array, one object per story, no prose and no code fence:\n` +
          `[{"i":1,"relevance":0-100,"code":"<code or null>","domain":"<domain>","agency":"<agency or null>","dup":null,"why":"..."}]`
      }]
    });
    usage?.push({
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      stories: chunk.length
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
      i?: number; relevance?: number; code?: string | null;
      domain?: string | null; agency?: string | null; why?: string; dup?: number | null;
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

      // Domain and agency are closed sets. Anything outside them is dropped rather
      // than passed through: a free-text value would mint a tab nobody defined, and
      // an unrecognised agency on a chip is worse than no chip.
      const dom = typeof row?.domain === "string" ? row.domain.trim() : "";
      const ag = typeof row?.agency === "string" ? row.agency.trim() : "";

      out.set(item.link, {
        relevance: Number.isFinite(rel) ? Math.max(0, Math.min(100, Math.round(rel))) : 0,
        code,
        domain: (DOMAINS as readonly string[]).includes(dom) ? dom : null,
        agency: (AGENCIES as readonly string[]).includes(ag) ? ag : null,
        // Only a BACKWARD reference to a real position is honoured. A forward or
        // self reference would let two stories each name the other and remove the
        // event from the page entirely.
        duplicateOf: (Number.isInteger(row?.dup) && (row!.dup as number) >= 1 && (row!.dup as number) < idx + 1)
          ? (row!.dup as number) : null,
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
