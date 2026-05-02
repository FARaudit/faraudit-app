"use client";

export function ViewHeader({
  eyebrow,
  title,
  subtitle
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ paddingBottom: 4 }}>
      <div
        style={{
          fontFamily: "var(--bd-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--gold)",
          opacity: 0.85,
          marginBottom: 6
        }}
      >
        {eyebrow}
      </div>
      <h1
        style={{
          fontFamily: "var(--bd-serif)",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: "var(--text)",
          margin: "0 0 6px 0",
          lineHeight: 1.15
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontFamily: "var(--bd-mono)",
            fontSize: 11,
            color: "var(--text2)",
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 920
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function V2Notice({ items }: { items: string[] }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px dashed var(--border)",
        borderRadius: 3,
        padding: "14px 18px"
      }}
    >
      <div
        style={{
          fontFamily: "var(--bd-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--gold)",
          opacity: 0.7,
          marginBottom: 8
        }}
      >
        Coming Next · V2
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontFamily: "var(--bd-mono)",
          fontSize: 10,
          color: "var(--text2)",
          lineHeight: 1.7
        }}
      >
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        padding: "60px 24px",
        textAlign: "center",
        fontFamily: "var(--bd-mono)",
        background: "var(--bg-surface)",
        border: "1px dashed var(--border)",
        borderRadius: 3
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text2)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>{sub}</div>}
    </div>
  );
}
