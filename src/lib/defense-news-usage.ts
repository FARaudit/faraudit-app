/* The model-spend ledger for /defense-news.
 *
 * Defense News is the only customer-facing tab that calls a model on a page view,
 * so its cost moves with traffic rather than with audit runs. The route measures
 * what each judgement actually consumed off the Messages API `usage` field; this
 * is where that measurement is kept so a week of spend can be read without anyone
 * re-running a query by hand.
 *
 * Separate from `usage_events` on purpose: that ledger is keyed by audit_id and is
 * what Cost/Audit divides by, so a news row there would drag the cost of an audit
 * toward zero.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NewsSpend {
  model: string;
  calls: number;
  stories_judged: number;
  input_tokens: number;
  output_tokens: number;
  usd: number;
}

/** TRUE when this request actually spent. A fully-cached page view judges nothing
 *  and is the common case; recording it would put the traffic log in the cost
 *  ledger and pull every average toward zero. Exported so the decision is testable
 *  rather than buried in an `if` inside a try/catch that swallows its own reasons. */
export function isBillableSpend(spend: NewsSpend): boolean {
  return spend.calls > 0 && (spend.input_tokens > 0 || spend.output_tokens > 0);
}

/** Append one row for a request that called the model.
 *
 *  FAILS SAFE in the strictest sense: this runs on the read path of a page the
 *  customer is waiting for, so every error — the table absent before the migration
 *  is applied, RLS, a network blip — is caught and logged, and the reader still
 *  gets their news. Cost accounting is never worth a blank page. */
export async function recordNewsSpend(
  supabase: SupabaseClient,
  args: { userId: string | null; scopeKey: string; spend: NewsSpend }
): Promise<void> {
  try {
    if (!isBillableSpend(args.spend)) return;
    const s = args.spend;
    const { error } = await supabase.from("defense_news_usage").insert({
      user_id: args.userId,
      scope_key: args.scopeKey,
      model: s.model,
      calls: s.calls,
      stories_judged: s.stories_judged,
      input_tokens: s.input_tokens,
      output_tokens: s.output_tokens,
      cost_usd: Number(s.usd.toFixed(6)),
    });
    if (error) {
      console.warn(`[news-cost] ledger insert skipped (fail-safe): ${error.message}`);
      return;
    }
    console.log(
      `[news-cost] recorded $${s.usd.toFixed(5)} · ${s.calls} call(s) · ${s.stories_judged} stories · scope=${args.scopeKey || "(none)"}`
    );
  } catch (e) {
    console.warn(
      `[news-cost] ledger write threw (fail-safe, page unaffected): ${(e as Error)?.message ?? String(e)}`
    );
  }
}
