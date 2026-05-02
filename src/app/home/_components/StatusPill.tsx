interface Props {
  kind: "clean" | "review" | "trap" | "info" | "neutral" | "gold" | "p0" | "p1" | "p2" | "watch" | "bid";
  children: React.ReactNode;
}

const STYLE: Record<Props["kind"], React.CSSProperties> = {
  clean:   { background: "rgba(16,185,129,.10)",  color: "var(--green)", borderColor: "rgba(16,185,129,.22)" },
  review:  { background: "rgba(245,158,11,.10)",  color: "var(--amber)", borderColor: "rgba(245,158,11,.22)" },
  trap:    { background: "rgba(239,68,68,.12)",   color: "var(--red)",   borderColor: "rgba(239,68,68,.24)"  },
  info:    { background: "rgba(37,99,235,.12)",   color: "var(--blue)",  borderColor: "rgba(37,99,235,.22)"  },
  neutral: { background: "rgba(148,163,184,.06)", color: "var(--text2)", borderColor: "rgba(148,163,184,.16)" },
  gold:    { background: "rgba(200,146,42,.10)",  color: "var(--gold)",  borderColor: "rgba(200,146,42,.22)" },
  p0:      { background: "rgba(239,68,68,.14)",   color: "var(--red)",   borderColor: "rgba(239,68,68,.30)"  },
  p1:      { background: "rgba(245,158,11,.12)",  color: "var(--amber)", borderColor: "rgba(245,158,11,.26)" },
  p2:      { background: "rgba(16,185,129,.10)",  color: "var(--green)", borderColor: "rgba(16,185,129,.22)" },
  watch:   { background: "rgba(148,163,184,.08)", color: "var(--text2)", borderColor: "rgba(148,163,184,.20)" },
  bid:     { background: "rgba(200,146,42,.12)",  color: "var(--gold)",  borderColor: "rgba(200,146,42,.28)" }
};

export default function StatusPill({ kind, children }: Props) {
  const s = STYLE[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 7px",
        borderRadius: 3,
        fontFamily: "var(--bd-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        border: `1px solid ${s.borderColor as string}`,
        background: s.background,
        color: s.color
      }}
    >
      {children}
    </span>
  );
}

export function recPillKind(rec: string | null | undefined): Props["kind"] {
  if (!rec) return "neutral";
  if (rec === "PROCEED") return "clean";
  if (rec === "PROCEED_WITH_CAUTION") return "review";
  if (rec === "DECLINE") return "trap";
  return "info";
}

export function scorePillKind(score: number | null | undefined): Props["kind"] {
  if (score == null) return "neutral";
  if (score >= 70) return "clean";
  if (score >= 40) return "review";
  return "trap";
}

export function riskKindFromScore(score: number | null | undefined): Props["kind"] {
  if (score == null) return "watch";
  if (score < 40) return "p0";
  if (score < 70) return "p1";
  return "p2";
}
