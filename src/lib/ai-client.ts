// Model-agnostic AI client.
//
// One interface, three providers. Switch providers by setting AI_PROVIDER
// (anthropic | openai | gemini) and AI_MODEL. Default: anthropic +
// claude-sonnet-4-20250514. Every output is tagged with { provider, model } so
// downstream rows record which model produced them.

import Anthropic from "@anthropic-ai/sdk";

export type AIProvider = "anthropic" | "openai" | "gemini";

export interface AIRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface AIResponse {
  text: string;
  provider: AIProvider;
  model: string;
  raw?: unknown;
}

export interface AIStreamHandlers {
  onText?: (chunk: string) => void;
  onError?: (err: Error) => void;
}

export interface AIStream {
  text: () => Promise<string>;
}

function getProvider(): AIProvider {
  const env = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (env === "openai" || env === "gemini") return env;
  return "anthropic";
}

function getModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  const p = getProvider();
  if (p === "openai") return "gpt-4o-mini";
  if (p === "gemini") return "gemini-1.5-pro-latest";
  return "claude-sonnet-4-20250514";
}

export async function complete(req: AIRequest): Promise<AIResponse> {
  const provider = getProvider();
  const model = getModel();
  if (provider === "anthropic") return completeAnthropic(req, model);
  if (provider === "openai") return completeOpenAI(req, model);
  return completeGemini(req, model);
}

export function stream(req: AIRequest, handlers: AIStreamHandlers): AIStream {
  const provider = getProvider();
  const model = getModel();
  if (provider === "anthropic") return streamAnthropic(req, model, handlers);
  // OpenAI + Gemini: fall back to non-streaming complete + emit once.
  // This keeps the streaming UI responsive even for non-streaming providers.
  let textPromise: Promise<string> | null = null;
  return {
    text: async () => {
      if (!textPromise) {
        textPromise = (provider === "openai"
          ? completeOpenAI(req, model)
          : completeGemini(req, model)
        ).then((r) => {
          handlers.onText?.(r.text);
          return r.text;
        });
      }
      return textPromise;
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anthropic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function completeAnthropic(req: AIRequest, model: string): Promise<AIResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model,
    max_tokens: req.maxTokens ?? 800,
    system: req.system,
    messages: [{ role: "user", content: req.user }]
  });
  const block = resp.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  return { text, provider: "anthropic", model, raw: resp };
}

function streamAnthropic(req: AIRequest, model: string, handlers: AIStreamHandlers): AIStream {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });
  let captured = "";
  const response = client.messages.stream({
    model,
    max_tokens: req.maxTokens ?? 800,
    system: req.system,
    messages: [{ role: "user", content: req.user }]
  });
  response.on("text", (chunk) => {
    captured += chunk;
    handlers.onText?.(chunk);
  });
  response.on("error", (err) => handlers.onError?.(err instanceof Error ? err : new Error(String(err))));
  return {
    text: async () => {
      await response.finalMessage();
      return captured;
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OpenAI (non-streaming wrapper using fetch — keeps deps light)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function completeOpenAI(req: AIRequest, model: string): Promise<AIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 800,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user }
      ]
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, provider: "openai", model, raw: data };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini (Google Generative Language)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function completeGemini(req: AIRequest, model: string): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { maxOutputTokens: req.maxTokens ?? 800 }
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  return { text, provider: "gemini", model, raw: data };
}
