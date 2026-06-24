// Single source for a schema-validated (structured-outputs) Claude call.
//
// The agentic MAP (agentic-map.ts) and the V2 judgment (audit-judgment.ts) make
// the SAME call shape — same endpoint, version, beta header, temperature gate,
// json_schema envelope, and text-block parse. Keeping it in ONE place stops the
// two from drifting: the 2026-06-22 review caught exactly that drift (MAP sent
// `temperature` to Haiku, which 4.x models reject with HTTP 400, while the
// judgment file had already learned to gate it to Sonnet only). Centralize → the
// rule lives once.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "structured-outputs-2025-11-13,pdfs-2024-09-25";

export interface StructuredCallOpts {
  apiKey: string;
  model: string;
  system: string;
  userPrompt: string;
  schema: object;
  maxTokens: number;
  timeoutMs?: number;
  label?: string;
  /** External cancellation — when this aborts (e.g. an upstream MAP budget timeout),
   *  the in-flight request is aborted too, so a timed-out batch stops spending. */
  signal?: AbortSignal;
  /** A large, SHARED system prefix (e.g. the agentic compact matrix) sent as a
   *  separate, CACHED system block (cache_control ephemeral) ahead of `system`.
   *  When several calls pass the BYTE-IDENTICAL prefix, the first writes the cache
   *  and the rest read it (prime-then-parallel) — the per-role `system` + userPrompt
   *  vary freely after the cache breakpoint. Anthropic silently no-ops the cache when
   *  the prefix is under the model minimum (~1024 tok Sonnet / 2048 Haiku), so passing
   *  a short prefix is safe — it just isn't cached. */
  cachedSystemPrefix?: string;
}

export interface StructuredCallResult {
  text: string;            // the raw JSON text (caller parses into its own type)
  stopReason: string | null; // "end_turn" | "max_tokens" | … — "max_tokens" ⇒ output was truncated
}

/** POST a json_schema structured-output request; return the JSON text + stop
 *  reason. `temperature` is SONNET-ONLY — Opus/Haiku 4.x reject it with HTTP 400
 *  "temperature is deprecated for this model". Throws on non-2xx or a missing text
 *  block (fail loud). `stopReason === "max_tokens"` lets the caller flag an
 *  output-capped (under-extracted) response instead of trusting it as complete. */
export async function callStructuredClaude(opts: StructuredCallOpts): Promise<StructuredCallResult> {
  const { apiKey, model, system, userPrompt, schema, maxTokens } = opts;
  const timeoutMs = opts.timeoutMs ?? (Number(process.env.CLAUDE_TIMEOUT_MS) || 240000);
  const label = opts.label ?? "structured call";
  // When a cached prefix is supplied, send `system` as a two-block array: the shared
  // prefix FIRST with a cache_control breakpoint (the first call writes the cache, the
  // rest read it), then the per-call role block uncached. Otherwise send the plain
  // string. cache_control is GA — no extra beta header needed.
  const systemField = opts.cachedSystemPrefix
    ? [
        { type: "text", text: opts.cachedSystemPrefix, cache_control: { type: "ephemeral" } },
        { type: "text", text: system },
      ]
    : system;
  const body = {
    model,
    max_tokens: maxTokens,
    ...(/^claude-sonnet-/i.test(model) ? { temperature: 0 } : {}),
    system: systemField,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema } },
  };
  // Transient server-overload / rate-limit are retried with exponential backoff —
  // live runs hit 529 "Overloaded" (Anthropic capacity), which is NOT a code defect
  // and a retry clears it. A 4xx (schema/auth) is NEVER retried (more attempts won't
  // fix it), and an EXTERNAL abort (upstream budget cancellation) stops retrying too.
  const RETRYABLE = new Set([429, 500, 502, 503, 529]);
  const MAX_RETRIES = 3;
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // External cancellation also aborts this request (upstream budget timeout).
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-beta": ANTHROPIC_BETA,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const data = await res.json();
      // Defensive: take the first block that actually carries text (structured outputs
      // surface the JSON in a text block, but don't hard-require type==="text" — a
      // future block-type change would otherwise throw on an OK 200).
      const textBlock = (data?.content as Array<{ type?: string; text?: string }> | undefined)?.find((b) => typeof b?.text === "string");
      if (!textBlock?.text) throw new Error(`${label}: structured output returned no text block`);
      return { text: textBlock.text, stopReason: (data?.stop_reason as string | null) ?? null };
    }
    lastErr = `${label} ${res.status}: ${(await res.text()).slice(0, 400)}`;
    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES && !opts.signal?.aborted) {
      const backoffMs = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
      console.warn(`[anthropic-structured] ${label} ${res.status} transient — retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr || `${label}: exhausted retries`);
}
