interface Props {
  kind: "clean" | "review" | "trap" | "info" | "neutral" | "gold";
  children: React.ReactNode;
}

const STYLE: Record<Props["kind"], React.CSSProperties> = {
  clean:   { background: "rgba(74,222,128,.10)",  color: "var(--green)", borderColor: "rgba(74,222,128,.18)" },
  review:  { background: "rgba(245,158,11,.10)",  color: "var(--amber)", borderColor: "rgba(245,158,11,.20)" },
  trap:    { background: "rgba(239,68,68,.12)",   color: "var(--red)",   borderColor: "rgba(239,68,68,.22)"  },
  info:    { background: "rgba(96,165,250,.10)",  color: "var(--blue)",  borderColor: "rgba(96,165,250,.18)" },
  neutral: { background: "rgba(245,240,232,.04)", color: "var(--t40)",   borderColor: "rgba(245,240,232,.08)" },
  gold:    { background: "rgba(201,168,76,.10)",  color: "var(--gold)",  borderColor: "rgba(201,168,76,.20)" }
};

export default function StatusPill({ kind, children }: Props) {
  const s = STYLE[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        borderRadius: 2,
        fontFamily: "var(--bd-mono)",
        fontSize: 8,
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
