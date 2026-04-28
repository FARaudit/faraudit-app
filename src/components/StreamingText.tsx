"use client";

import { useEffect, useRef, useState } from "react";

export interface StreamingTextProps {
  prompt: string;
  context?: Record<string, unknown>;
  trigger?: number;
  className?: string;
  emptyState?: string;
}

export default function StreamingText({
  prompt,
  context,
  trigger,
  className = "",
  emptyState = "—"
}: StreamingTextProps) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setText("");
    setError(null);
    if (!prompt.trim()) return;
    setStreaming(true);

    fetch("/api/analysis/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context }),
      signal: ctl.signal
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError((data as { error?: string }).error || `HTTP ${res.status}`);
          setStreaming(false);
          return;
        }
        if (!res.body) {
          setError("no body");
          setStreaming(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") {
              setStreaming(false);
              return;
            }
            try {
              const parsed = JSON.parse(payload) as { delta?: string; error?: string };
              if (parsed.delta) setText((prev) => prev + parsed.delta);
              if (parsed.error) setError(parsed.error);
            } catch {
              /* ignore partial */
            }
          }
        }
        setStreaming(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("Network error");
        setStreaming(false);
      });

    return () => {
      cancelled = true;
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, trigger, JSON.stringify(context ?? {})]);

  return (
    <div
      className={`border-l-2 border-accent pl-4 py-3 text-sm leading-relaxed text-text whitespace-pre-line ${className}`}
    >
      {text || (!streaming && !error && <span className="text-text-3 italic">{emptyState}</span>)}
      {streaming && <span className="blink ml-0.5 text-accent">▋</span>}
      {error && <span className="text-red text-xs block mt-2">⚠ {error}</span>}
    </div>
  );
}
