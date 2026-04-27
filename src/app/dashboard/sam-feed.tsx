"use client";

import { useEffect, useState } from "react";

interface SAMRow {
  noticeId: string;
  title: string;
  agency: string | null;
  responseDeadline: string | null;
  typeOfSetAside: string | null;
  uiLink: string | null;
  postedDate: string | null;
  naicsCode: string | null;
}

function shortAgency(full: string | null): string {
  if (!full) return "—";
  // SAM.gov returns hierarchical paths like "DEPT OF DEFENSE.DEPT OF THE ARMY.AMC.MICC"
  // Show the leaf component for compactness.
  const parts = full.split(".").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || full;
}

function fmtDeadline(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return d;
  }
}

export default function SAMFeed() {
  const [rows, setRows] = useState<SAMRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sam-feed", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setRows(Array.isArray(d.solicitations) ? d.solicitations : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) {
    return (
      <div className="border border-border">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-surface px-6 py-5 border-b border-border last:border-b-0 animate-pulse"
          >
            <div className="h-3 w-32 bg-border rounded mb-2" />
            <div className="h-4 w-3/4 bg-border rounded mb-2" />
            <div className="h-3 w-1/2 bg-border/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border border-border bg-surface p-10 text-center">
        <p className="text-text-2">No new solicitations in target NAICS codes today.</p>
        <p className="text-xs text-text-3 mt-2 font-mono">
          Watching 336413 · 332710 · 332721 · last 7 days · TX + OK corridor
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border">
      {rows.map((r) => (
        <a
          key={r.noticeId}
          href={r.uiLink ?? `https://sam.gov/opp/${r.noticeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start justify-between gap-6 bg-surface hover:bg-surface-2 px-6 py-5 border-b border-border last:border-b-0 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs text-gold tracking-wider">{r.noticeId}</span>
              {r.naicsCode && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-3">
                  NAICS {r.naicsCode}
                </span>
              )}
            </div>
            <p className="mt-2 text-text font-display text-lg leading-snug truncate">{r.title}</p>
            <p className="mt-1 text-xs text-text-2 font-mono">
              {shortAgency(r.agency)}
              {r.responseDeadline && ` · due ${fmtDeadline(r.responseDeadline)}`}
            </p>
          </div>
          {r.typeOfSetAside && (
            <span className="hidden sm:inline-block self-start mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-green border border-green/40 bg-green/5 px-2 py-1 whitespace-nowrap">
              {r.typeOfSetAside}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
