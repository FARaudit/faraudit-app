interface Props {
  kind: "clean" | "review" | "trap" | "info" | "neutral";
  children: React.ReactNode;
}

const STYLE: Record<Props["kind"], string> = {
  clean:   "bg-[#10B98120] text-[#10B981] border border-[#10B98140]",
  review:  "bg-[#F59E0B20] text-[#F59E0B] border border-[#F59E0B40]",
  trap:    "bg-[#EF444420] text-[#EF4444] border border-[#EF444440]",
  info:    "bg-[#378ADD20] text-[#378ADD] border border-[#378ADD40]",
  neutral: "bg-[#0D1C30] text-[#5B8AB8] border border-[#122240]"
};

export default function StatusPill({ kind, children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-[1px] rounded text-[10px] font-medium uppercase tracking-[0.06em] ${STYLE[kind]}`}
      style={{ fontFamily: "var(--sans)" }}
    >
      {children}
    </span>
  );
}

// Map a recommendation string to a pill kind.
export function recPillKind(rec: string | null | undefined): Props["kind"] {
  if (!rec) return "neutral";
  if (rec === "PROCEED") return "clean";
  if (rec === "PROCEED_WITH_CAUTION") return "review";
  if (rec === "DECLINE") return "trap";
  return "info";
}

// Map a compliance score 0-100 to a pill kind.
export function scorePillKind(score: number | null | undefined): Props["kind"] {
  if (score == null) return "neutral";
  if (score >= 70) return "clean";
  if (score >= 40) return "review";
  return "trap";
}
