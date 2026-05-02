"use client";

import { ViewHeader, V2Notice } from "./shared";

interface Props {
  title: string;
  eyebrow: string;
  body: string;
  comingNext: string[];
}

export default function PlaceholderView({ title, eyebrow, body, comingNext }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1200 }}>
      <ViewHeader eyebrow={eyebrow} title={title} />
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          padding: "20px 22px"
        }}
      >
        <p
          style={{
            fontFamily: "var(--bd-mono)",
            fontSize: 12,
            color: "var(--text2)",
            lineHeight: 1.7,
            margin: 0
          }}
        >
          {body}
        </p>
      </div>
      <V2Notice items={comingNext} />
    </div>
  );
}
