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
  /** Per-run usage tally (concurrency-safe — each audit owns its own callback). Emitted alongside the legacy
   *  global sink. Best-effort: a throw here never affects the call result. */
  onUsage?: (u: StructuredUsage) => void;
  /** Optional structured user-content BLOCKS (e.g. a base64-PDF `document` block + a text block) — when present,
   *  they REPLACE the plain `userPrompt` string as the user message content, so a caller can send VISION content
   *  through this same schema-validated call path (OCR-accuracy layer-3). Absent ⇒ the string path (byte-identical
   *  to every existing caller). The beta header already carries `pdfs-2024-09-25`, so PDF document blocks are valid. */
  userContent?: unknown[];
}

export interface StructuredCallResult {
  text: string;            // the raw JSON text (caller parses into its own type)
  stopReason: string | null; // "end_turn" | "max_tokens" | … — "max_tokens" ⇒ output was truncated
}

// Opt-in usage capture — MIRRORS audit-engine.ts setUsageSink (the legacy engine's
// already-reviewed cost-capture hook). NULL in production: when no sink is set this
// is a no-op, so the prod hot path is byte-unchanged. The Stage-4 A/B runner sets a
// sink to total real token cost (incl. cache write/read — the new engine's whole cost
// story is the cached matrix prefix). Authoritative actualization is still the
// Anthropic Console delta; this gives a precise per-run estimate to compare against.
export interface StructuredUsage {
  label: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write: number; // cache_creation_input_tokens (priced 1.25×)
  cache_read: number;  // cache_read_input_tokens (priced 0.10×)
  ms: number;
}
let _usageSink: ((u: StructuredUsage) => void) | null = null;
export function setStructuredUsageSink(sink: ((u: StructuredUsage) => void) | null) { _usageSink = sink; }

/** POST a json_schema structured-output request; return the JSON text + stop
 *  reason. `temperature` is SONNET-ONLY — Opus/Haiku 4.x reject it with HTTP 400
 *  "temperature is deprecated for this model". Throws on non-2xx or a missing text
 *  block (fail loud). `stopReason === "max_tokens"` lets the caller flag an
 *  output-capped (under-extracted) response instead of trusting it as complete. */
// The Anthropic structured-output (json_schema) validator REJECTS a handful of standard JSON-Schema keywords with a
// hard 400 (e.g. `minProperties`/`maxProperties` on an object → "property 'minProperties' is not supported"). A 400
// is non-retryable, so a single such keyword ANYWHERE in a schema makes every call using it throw — and a caller
// that swallows the throw (e.g. the adversarial verifier → sound=false) then honest-fails EVERY audit silently.
// Card 274 shipped exactly such a keyword (`minProperties:1`) and it universally broke committals (card 285 root).
// Defensively DEEP-STRIP the known-unsupported keywords here so no future schema can reintroduce the class of bug.
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set(["minProperties", "maxProperties"]);
export function sanitizeSchema<T>(node: T): T {
  if (Array.isArray(node)) return node.map((n) => sanitizeSchema(n)) as unknown as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED_SCHEMA_KEYWORDS.has(k)) continue; // drop the unsupported keyword (would 400)
      out[k] = sanitizeSchema(v);
    }
    return out as unknown as T;
  }
  return node;
}

export async function callStructuredClaude(opts: StructuredCallOpts): Promise<StructuredCallResult> {
  const { apiKey, model, system, userPrompt, maxTokens } = opts;
  const schema = sanitizeSchema(opts.schema);
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
    // userContent (structured blocks — e.g. a base64-PDF document block for OCR-accuracy layer-3 vision) REPLACES the
    // plain string when present; absent ⇒ the string path (byte-identical to every existing caller).
    messages: [{ role: "user", content: opts.userContent ?? userPrompt }],
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
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // External cancellation also aborts this request (upstream budget timeout). The listener is NAMED and removed in
    // `finally` (adversarial-review): `opts.signal` is a LONG-LIVED, run-wide budget signal shared by dozens of calls,
    // and a per-iteration anonymous `{once:true}` listener that never fires accumulates dead listeners across retries
    // + across the whole run (MaxListenersExceededWarning + retained dead controllers). Bind once per attempt, remove
    // on every exit path.
    const onExternalAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
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
    } catch (err) {
      // NETWORK-LEVEL THROW retry (Guard 3). `fetch` REJECTS — never returns an HTTP status — on a transient network
      // failure ("fetch failed" / ECONNRESET / socket hang up / DNS). The prior loop had a `finally` but NO `catch`,
      // so every such throw escaped the retry loop unretried — even though the IDENTICAL Anthropic-overload condition,
      // when it arrives as a 529, IS retried below. Under a capacity brown-out that asymmetry killed long multi-call
      // runs (the per-doc construction proposer makes ~6 calls; one network drop aborted the whole run). Retry
      // genuine network throws with the SAME backoff as a retryable status.
      // DO NOT retry an ABORT (adversarial-review cost fix): an AbortError is EITHER an external budget cancellation
      // (must stop promptly) OR an INTERNAL `timeoutMs` timeout. A timeout means the request was accepted and the
      // model may have been GENERATING BILLABLE OUTPUT for up to timeoutMs before being killed — re-firing it would
      // silently re-bill up to MAX_RETRIES× (aborts return no body, so those tokens are UNCOUNTED). Both abort flavors
      // therefore honest-fail here rather than re-spend. Only a non-abort network throw is transient-and-cheap to retry.
      const isAbort = (err as Error)?.name === "AbortError";
      lastErr = `${label} fetch threw: ${(err as Error)?.message ?? String(err)}`;
      if (!isAbort && attempt < MAX_RETRIES) {
        const backoffMs = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        console.warn(`[anthropic-structured] ${label} network throw — retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw new Error(lastErr);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onExternalAbort);
    }
    if (res.ok) {
      const data = await res.json();
      if (data?.usage) {
        const raw = data.usage as Record<string, number | undefined>;
        const u = {
          label,
          model,
          input_tokens: raw.input_tokens ?? 0,
          output_tokens: raw.output_tokens ?? 0,
          cache_write: raw.cache_creation_input_tokens ?? 0,
          cache_read: raw.cache_read_input_tokens ?? 0,
          ms: Date.now() - t0,
        };
        // Per-run tally (opts.onUsage, concurrency-safe) AND the legacy global sink (null in prod).
        try { opts.onUsage?.(u); } catch { /* never let cost capture break a call */ }
        if (_usageSink) _usageSink(u);
      }
      // Defensive: take the first block that actually carries text (structured outputs
      // surface the JSON in a text block, but don't hard-require type==="text" — a
      // future block-type change would otherwise throw on an OK 200).
      const textBlock = (data?.content as Array<{ type?: string; text?: string }> | undefined)?.find((b) => typeof b?.text === "string");
      if (!textBlock?.text) throw new Error(`${label}: structured output returned no text block`);
      return { text: textBlock.text, stopReason: (data?.stop_reason as string | null) ?? null };
    }
    const errBody = await res.text();
    lastErr = `${label} ${res.status}: ${errBody.slice(0, 400)}`;
    // Cost honesty (6E review): a non-2xx can still bill tokens already generated. Capture usage
    // from the error body when present so the sink isn't a silent undercount on failure paths.
    // (Aborts/timeouts return NO body → unknowable client-side; the Anthropic Console CSV remains
    // the authoritative actualization — the sink is a lower-bound estimate.)
    try {
      const eu = (JSON.parse(errBody) as { usage?: Record<string, number | undefined> }).usage;
      if (eu) {
        // Same per-run + global emit as the success path — else a failed/retried call's billed tokens
        // undercount the per-run cost tally (opts.onUsage), reintroducing the very undercount 6E guards against.
        const u = { label, model, input_tokens: eu.input_tokens ?? 0, output_tokens: eu.output_tokens ?? 0, cache_write: eu.cache_creation_input_tokens ?? 0, cache_read: eu.cache_read_input_tokens ?? 0, ms: Date.now() - t0 };
        try { opts.onUsage?.(u); } catch { /* never let cost capture break a call */ }
        if (_usageSink) _usageSink(u);
      }
    } catch { /* error body not JSON / carries no usage — nothing to capture */ }
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
