"use client";

import { useState, useMemo } from "react";
import StatusPill, { recPillKind, scorePillKind, riskKindFromScore } from "../StatusPill";
import type { ViewKey } from "../Sidebar";
import type { OpportunityRow, AuditRow, HeaderCounter, HomeStats } from "@/lib/bd-os/queries";

interface Props {
  homeStats: HomeStats;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
  counter: HeaderCounter;
  onNav: (view: ViewKey) => void;
}

type FilterKey = "all" | "p0p1" | "expiring" | "small_business" | "recent";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",            label: "All" },
  { key: "p0p1",           label: "P0 · P1" },
  { key: "expiring",       label: "≤ 7 Days" },
  { key: "small_business", label: "Small Business" },
  { key: "recent",         label: "Recent Audits" }
];

export default function IntelligenceHomeView({ homeStats, opportunities, recentAudits, counter, onNav }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    return opportunities.filter((o) => {
      if (filter === "p0p1") return o.compliance_score != null && o.compliance_score < 70;
      if (filter === "expiring") return o.status === "pending"; // proxy until deadline column wired
      if (filter === "small_business") return (o.set_aside || "").toLowerCase().includes("small");
      if (filter === "recent") return o.status === "processed";
      return true;
    });
  }, [opportunities, filter]);

  const p0Rows = filtered.filter((o) => o.compliance_score != null && o.compliance_score < 40);
  const otherRows = filtered.filter((o) => !(o.compliance_score != null && o.compliance_score < 40));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1600 }}>
      {/* Row 1 — 4 stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <SitCard
          eyebrow="⚠ Critical — Act Today"
          eyebrowColor="var(--red)"
          value={homeStats.critical_p0}
          valueColor="var(--red)"
          shadow="0 0 24px rgba(239,68,68,.25)"
          sub="Solicitations with compliance traps that could disqualify your bid or cost you money on delivery."
          ctaLabel="Review P0 flags →"
          ctaColor="var(--red)"
          accentBg="rgba(239,68,68,.04)"
          onClick={() => { setFilter("p0p1"); }}
        />
        <SitCard
          eyebrow="⏱ Expiring This Week"
          eyebrowColor="var(--amber)"
          value={homeStats.expiring_7d}
          valueColor="var(--gold)"
          sub="Submission deadlines closing in 7 days or less. Missed windows are permanent — no extensions after closing."
          ctaLabel="View expiring →"
          ctaColor="var(--amber)"
          accentBorderTop="var(--amber)"
          onClick={() => setFilter("expiring")}
        />
        <SitCard
          eyebrow="● Live on SAM.gov Now"
          eyebrowColor="var(--gold2)"
          value={homeStats.live_sam_gov}
          valueColor="var(--gold)"
          sub="Active federal solicitations posted right now across your 13 NAICS codes. Updated by sam-ingest cron — every one is a potential contract."
          ctaLabel="Open SAM.gov feed →"
          ctaColor="var(--gold)"
          accentBorderTop="var(--gold)"
          onClick={() => onNav("sam-feed")}
        />
        <SitCard
          eyebrow="✓ Your Audit Activity"
          eyebrowColor="var(--green)"
          value={homeStats.audit_activity_month}
          valueColor="var(--green)"
          sub={`Audits completed in the last 30 days. ${homeStats.total_traps_caught} compliance traps caught total · saving 48+ hours of manual review per month.`}
          ctaLabel="View past audits →"
          ctaColor="var(--green)"
          accentBorderTop="var(--green)"
          onClick={() => onNav("past-audits")}
        />
      </div>

      {/* Row 2 — upload bar */}
      <button
        onClick={() => onNav("run-audit")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(200,146,42,.04)",
          border: "1.5px dashed rgba(200,146,42,.32)",
          borderRadius: 4,
          padding: "16px 20px",
          cursor: "pointer",
          transition: "all .15s",
          textAlign: "left",
          color: "inherit"
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(200,146,42,.55)";
          (e.currentTarget as HTMLElement).style.background = "rgba(200,146,42,.07)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(200,146,42,.32)";
          (e.currentTarget as HTMLElement).style.background = "rgba(200,146,42,.04)";
        }}
      >
        <div
          style={{
            width: 40, height: 40, borderRadius: 3,
            background: "rgba(200,146,42,.12)",
            border: "1px solid rgba(200,146,42,.26)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 2v11M6 6l4-4 4 4" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--bd-serif)", fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
            Start a New Audit — Drop Any Solicitation PDF
          </div>
          <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", lineHeight: 1.6, marginBottom: 7 }}>
            FARaudit reads every clause · FAR · DFARS · Section L · Section M · CLIN structure · P0/P1/P2 risk ranking · KO email drafted
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["RFQ", "RFP", "IDIQ", "IFB", "Any Page Count", "Any Agency"].map((t) => (
              <span
                key={t}
                style={{
                  fontFamily: "var(--bd-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 2,
                  background: "rgba(200,146,42,.10)",
                  border: "1px solid rgba(200,146,42,.22)",
                  color: "var(--gold)",
                  letterSpacing: "0.06em"
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <span
          style={{
            fontFamily: "var(--bd-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--bg-primary)",
            background: "var(--gold)",
            padding: "11px 22px",
            borderRadius: 2,
            flexShrink: 0
          }}
        >
          Run Audit →
        </span>
      </button>

      {/* Row 3 — feed table + right column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12, minHeight: 480 }}>
        {/* Feed */}
        <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(200,146,42,.025)"
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85 }}>
                Intelligence Feed
              </div>
              <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", marginTop: 2 }}>
                Filtered to your NAICS · {filtered.length} of {opportunities.length} solicitations
              </div>
            </div>
            <LivePill text={`${counter.audits.toLocaleString()} CORPUS`} />
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 6, padding: "10px 16px", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
            {FILTERS.map((f) => {
              const isActive = f.key === filter;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    fontFamily: "var(--bd-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "5px 12px",
                    borderRadius: 2,
                    background: isActive ? "rgba(200,146,42,.14)" : "transparent",
                    border: `1px solid ${isActive ? "rgba(200,146,42,.32)" : "var(--border)"}`,
                    color: isActive ? "var(--gold)" : "var(--text2)",
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {p0Rows.length > 0 && (
              <SectionBanner kind="p0" label="⚠ Requires Immediate Action" count={`${p0Rows.length} P0`} />
            )}
            {p0Rows.map((r) => <FeedRow key={r.id} row={r} />)}
            {otherRows.length > 0 && p0Rows.length > 0 && (
              <SectionBanner kind="watch" label="● Watch · Bid candidates" count={`${otherRows.length}`} />
            )}
            {otherRows.map((r) => <FeedRow key={r.id} row={r} />)}
            {filtered.length === 0 && (
              <div style={{ padding: "60px 24px", textAlign: "center", fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
                {opportunities.length === 0
                  ? "No solicitations queued yet. sam-ingest will populate the feed at 06:00 CDT."
                  : "No rows match the current filter."}
              </div>
            )}
          </div>
        </section>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <RightSection title="Recent Audits" sub={`Last ${Math.min(5, recentAudits.length)}`}>
            {recentAudits.length === 0 && (
              <div style={{ padding: "24px 14px", textAlign: "center", fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--muted)", fontStyle: "italic" }}>
                No audits yet.
              </div>
            )}
            {recentAudits.slice(0, 5).map((a) => (
              <div key={a.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--gold)", fontWeight: 600 }}>
                    {a.notice_id || "—"}
                  </span>
                  {a.compliance_score != null && (
                    <StatusPill kind={scorePillKind(a.compliance_score)}>{a.compliance_score}</StatusPill>
                  )}
                </div>
                <div style={{ fontFamily: "var(--bd-serif)", fontSize: 11, fontWeight: 500, color: "var(--text)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {a.title || "—"}
                </div>
                <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--text2)", marginTop: 4 }}>
                  {a.agency || "—"} · {new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            ))}
          </RightSection>

          <RightSection title="Account Intelligence">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <AcctStat n={counter.audits} label="Audits Run" />
              <AcctStat n={counter.traps} label="Traps Caught" color="var(--red)" hasBorderL />
              <AcctStat label="Value Audited" valueText={homeStats.value_audited_estimate} hasBorderT />
              <AcctStat label="Compliance Risk" valueText="$0" color="var(--green)" hasBorderL hasBorderT />
            </div>
            <div style={{ padding: "14px 14px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--text2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Design Partner Period
                </span>
                <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--gold)", fontWeight: 700 }}>
                  62d left
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(148,163,184,.1)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "var(--gold)", width: "31%", opacity: 0.7 }} />
              </div>
            </div>
          </RightSection>
        </div>
      </div>
    </div>
  );
}

function SitCard({
  eyebrow, eyebrowColor, value, valueColor, shadow, sub, ctaLabel, ctaColor,
  accentBg, accentBorderTop, onClick
}: {
  eyebrow: string;
  eyebrowColor: string;
  value: number;
  valueColor: string;
  shadow?: string;
  sub: string;
  ctaLabel: string;
  ctaColor: string;
  accentBg?: string;
  accentBorderTop?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: accentBg || "var(--bg-card)",
        border: "1px solid var(--border)",
        borderTop: accentBorderTop ? `3px solid ${accentBorderTop}` : "1px solid var(--border)",
        borderRadius: 3,
        padding: "16px 18px",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "background .15s",
        color: "inherit"
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = accentBg
          ? "rgba(239,68,68,.07)"
          : "rgba(200,146,42,.04)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = accentBg || "var(--bg-card)";
      }}
    >
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: eyebrowColor }}>
        {eyebrow}
      </div>
      <div
        style={{
          fontFamily: "var(--bd-mono)",
          fontSize: 36,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: valueColor,
          textShadow: shadow
        }}
      >
        {value.toLocaleString()}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", lineHeight: 1.6, marginTop: 4 }}>
        {sub}
      </div>
      <div
        style={{
          fontFamily: "var(--bd-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: ctaColor,
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid var(--border)"
        }}
      >
        {ctaLabel}
      </div>
    </button>
  );
}

function LivePill({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--bd-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: "var(--green)",
        letterSpacing: "0.1em",
        background: "rgba(16,185,129,.08)",
        border: "1px solid rgba(16,185,129,.2)",
        borderRadius: 2,
        padding: "4px 10px"
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", animation: "bd-ldot 1.6s ease-in-out infinite" }} />
      LIVE · {text}
    </div>
  );
}

function SectionBanner({ kind, label, count }: { kind: "p0" | "watch"; label: string; count: string }) {
  const isP0 = kind === "p0";
  return (
    <div
      style={{
        padding: "8px 16px",
        background: isP0 ? "rgba(239,68,68,.06)" : "rgba(148,163,184,.04)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}
    >
      <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: isP0 ? "var(--red)" : "var(--text2)" }}>
        {label}
      </span>
      <StatusPill kind={isP0 ? "p0" : "neutral"}>{count}</StatusPill>
    </div>
  );
}

function FeedRow({ row }: { row: OpportunityRow }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px minmax(0,1fr) 130px 90px 60px 72px 90px 80px 56px",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        transition: "all .12s"
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "rgba(200,146,42,.03)";
        el.style.borderLeft = "3px solid var(--gold)";
        el.style.paddingLeft = "13px";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "transparent";
        el.style.borderLeft = "0";
        el.style.paddingLeft = "16px";
      }}
      onClick={() => { window.location.hash = "run-audit"; }}
    >
      <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", padding: "1px 5px", background: "rgba(148,163,184,.06)", borderRadius: 2, textAlign: "center" }}>
        {row.naics_code || "—"}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--gold)", fontWeight: 600 }}>
          {row.notice_id}
        </div>
        <div
          style={{
            fontFamily: "var(--bd-serif)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text)",
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
          title={row.title || ""}
        >
          {row.title || "—"}
        </div>
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.agency || ""}>
        {row.agency || "—"}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--text)", fontWeight: 600 }}>
        —
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 11, fontWeight: 700, color: "var(--text2)" }}>
        —
      </div>
      <StatusPill kind="info">{row.status === "processed" ? "AUDITED" : "QUEUED"}</StatusPill>
      <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.set_aside || ""}>
        {row.set_aside ? abbrSetAside(row.set_aside) : "UNDISCL"}
      </span>
      {row.recommendation ? (
        <StatusPill kind={recPillKind(row.recommendation)}>{shortRec(row.recommendation)}</StatusPill>
      ) : (
        <StatusPill kind={riskKindFromScore(row.compliance_score)}>{row.compliance_score != null ? scoreToRisk(row.compliance_score) : "Watch"}</StatusPill>
      )}
      <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "right" }}>
        Audit →
      </span>
    </div>
  );
}

function abbrSetAside(s: string): string {
  const t = s.toLowerCase();
  if (t.includes("total small")) return "SB";
  if (t.includes("8(a)") || t.includes("8a")) return "8(a)";
  if (t.includes("woman")) return "WOSB";
  if (t.includes("sdvosb") || t.includes("service-disabled")) return "SDVOSB";
  if (t.includes("hubzone")) return "HZN";
  return "UNDISCL";
}

function shortRec(r: string): string {
  if (r === "PROCEED") return "BID";
  if (r === "PROCEED_WITH_CAUTION") return "WATCH";
  if (r === "DECLINE") return "P0";
  return r;
}

function scoreToRisk(score: number): string {
  if (score < 40) return "P0";
  if (score < 70) return "P1";
  return "P2";
}

function RightSection({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(200,146,42,.025)" }}>
        <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85 }}>
          {title}
        </div>
        {sub && (<span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--text2)" }}>{sub}</span>)}
      </div>
      {children}
    </section>
  );
}

function AcctStat({ n, label, valueText, color, hasBorderL, hasBorderT }: {
  n?: number;
  label: string;
  valueText?: string;
  color?: string;
  hasBorderL?: boolean;
  hasBorderT?: boolean;
}) {
  return (
    <div style={{
      padding: "12px 14px",
      borderLeft: hasBorderL ? "1px solid var(--border)" : "none",
      borderTop: hasBorderT ? "1px solid var(--border)" : "none"
    }}>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 18, fontWeight: 700, color: color || "var(--text)", lineHeight: 1 }}>
        {valueText != null ? valueText : (n != null ? n.toLocaleString() : "—")}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--text2)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}
