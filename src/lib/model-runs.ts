import { createHash } from "node:crypto";
import { getAdminClient } from "@/lib/supabase-admin";

export interface RunRecord {
  user_id: string | null;
  surface: string;
  provider: string;
  model: string;
  prompt: string;
  output: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  metadata?: Record<string, unknown>;
}

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 32);
}

export async function recordRun(rec: RunRecord): Promise<void> {
  try {
    const sb = getAdminClient();
    if (!sb) return;
    await sb.from("model_runs").insert({
      user_id: rec.user_id,
      surface: rec.surface,
      provider: rec.provider,
      model: rec.model,
      prompt_hash: hashPrompt(rec.prompt),
      input_tokens: rec.input_tokens ?? null,
      output_tokens: rec.output_tokens ?? null,
      latency_ms: rec.latency_ms ?? null,
      output_text: rec.output.slice(0, 8000),
      metadata: rec.metadata ?? null
    });
  } catch {
    /* silent */
  }
}
