"use client";

import { ViewHeader, V2Notice } from "./shared";

const SOURCES = [
  { name: "Breaking Defense",   url: "https://breakingdefense.com",       blurb: "Acquisition + program-level reporting" },
  { name: "Defense News",       url: "https://defensenews.com",           blurb: "Pentagon · service branches · global" },
  { name: "DefenseScoop",       url: "https://defensescoop.com",          blurb: "DoD tech · cyber · AI" },
  { name: "Federal News Network", url: "https://federalnewsnetwork.com",  blurb: "Federal workforce + acquisition policy" },
  { name: "GAO Reports",        url: "https://www.gao.gov/reports-testimonies", blurb: "Audit findings · contract disputes" },
  { name: "DoD Contract Awards", url: "https://www.defense.gov/News/Contracts/", blurb: "Daily contract announcements" }
];

const SIGNALS = [
  { tag: "P0", label: "Bid protests sustained", color: "var(--red)" },
  { tag: "P1", label: "FAR/DFARS rule changes", color: "var(--amber)" },
  { tag: "P2", label: "Agency budget moves", color: "var(--green)" },
  { tag: "WATCH", label: "Industry consolidation", color: "var(--text2)" }
];

export default function DefenseNewsView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1400 }}>
      <ViewHeader
        eyebrow="Curated · BD-grade signal extraction"
        title="Defense News"
        subtitle="Live news feed scoped to federal contracting + DoD acquisition. V1 ships with curated source links — V2 wires NewsAPI ingestion + AI relevance scoring tied to your NAICS watchlist."
      />

      {/* Curated sources */}
      <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "rgba(200,146,42,.025)" }}>
          <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85 }}>
            Curated sources · Open in new tab
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 0 }}>
          {SOURCES.map((s, i) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "14px 16px",
                borderRight: i % 3 !== 2 ? "1px solid var(--border)" : "none",
                borderBottom: "1px solid var(--border)",
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
                transition: "background .12s"
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(200,146,42,.03)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ fontFamily: "var(--bd-serif)", fontSize: 13, fontWeight: 700, color: "var(--gold)" }}>
                {s.name}
              </span>
              <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", lineHeight: 1.5 }}>
                {s.blurb}
              </span>
              <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text2)", marginTop: 4 }}>
                Open ↗
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Signal taxonomy preview */}
      <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "rgba(200,146,42,.025)" }}>
          <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85 }}>
            Signal taxonomy · what we'll auto-classify
          </div>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {SIGNALS.map((s) => (
            <div key={s.tag} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  fontFamily: "var(--bd-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  padding: "2px 8px",
                  borderRadius: 2,
                  border: `1px solid ${s.color}`,
                  color: s.color,
                  minWidth: 60,
                  textAlign: "center"
                }}
              >
                {s.tag}
              </span>
              <span style={{ fontFamily: "var(--bd-mono)", fontSize: 11, color: "var(--text)" }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <V2Notice items={[
        "NewsAPI ingestion → fa_news_corpus table (separate Railway worker)",
        "Relevance scoring against your 13 NAICS codes + tracked agencies",
        "Daily executive summary email at 06:30 CDT",
        "Bid-protest tracker: Court of Federal Claims + GAO weekly digest"
      ]} />
    </div>
  );
}
