"use client";

import { useEffect, useState } from "react";

interface Brief {
  id: number;
  brief_type: string;
  priority: string;
  title: string;
  body: string | null;
  source: string | null;
  source_url: string | null;
  created_at: string | null;
}

const PRIORITY_BADGE: Record<string, string> = {
  p0: "text-red border-red bg-red/5",
  p1: "text-amber border-amber bg-amber/5",
  p2: "text-blue border-blue bg-blue/5"
};

export default function NewsToday() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intel-briefs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setBriefs(Array.isArray(d.briefs) ? d.briefs : []);
      })
      .catch(() => {
        if (!cancelled) setBriefs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (briefs === null) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border border-border bg-surface px-5 py-4 animate-pulse">
            <div className="h-3 w-16 bg-border rounded mb-3" />
            <div className="h-4 w-3/4 bg-border rounded mb-2" />
            <div className="h-3 w-2/3 bg-border/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (briefs.length === 0) {
    return (
      <div className="border border-border bg-surface p-10 text-center">
        <p className="text-text-2">No intel today.</p>
        <p className="text-xs text-text-3 mt-2 font-mono">Next digest at 06:30 CT</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {briefs.map((b) => {
        const badge = PRIORITY_BADGE[b.priority] || PRIORITY_BADGE.p2;
        const card = (
          <article className="bg-surface border border-border hover:border-border-2 px-5 py-4 transition-colors">
            <div className="flex items-baseline gap-3">
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 border ${badge}`}
              >
                {b.priority?.toUpperCase() || "P2"}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-3">
                {b.brief_type}
              </span>
              {b.source && (
                <span className="font-mono text-[10px] text-text-3 ml-auto">{b.source}</span>
              )}
            </div>
            <h3 className="mt-2 text-text">{b.title}</h3>
            {b.body && (
              <p className="mt-1 text-sm text-text-2 leading-relaxed line-clamp-2">{b.body}</p>
            )}
          </article>
        );
        return b.source_url ? (
          <a
            key={b.id}
            href={b.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            {card}
          </a>
        ) : (
          <div key={b.id}>{card}</div>
        );
      })}
    </div>
  );
}
