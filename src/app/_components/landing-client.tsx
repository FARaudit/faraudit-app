"use client";

import Link from "next/link";
import { useEffect } from "react";

const BG = "#03080f";
const SURFACE = "#06101a";
const SURFACE_2 = "#091522";
const TEXT_1 = "#e2eaf4";
const TEXT_2 = "#5a7fa0";
const TEXT_3 = "#3d5b75";
const GOLD = "#c4a44a";
const GOLD_DIM = "#8b7430";
const GREEN = "#28b06a";
const RED = "#c84d4d";

export default function LandingClient() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    const nav = document.getElementById("main-nav");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <main style={{ background: BG, color: TEXT_1, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <style>{`
        .reveal { opacity: 0; transform: translateY(18px); transition: opacity .7s ease, transform .7s ease; }
        .reveal.in { opacity: 1; transform: none; }
        #main-nav { transition: background .2s ease, border-color .2s ease, backdrop-filter .2s ease; }
        #main-nav.scrolled { background: rgba(3,8,15,.84); backdrop-filter: blur(10px); border-color: rgba(196,164,74,.14); }
        a { transition: color .15s ease, opacity .15s ease, background .15s ease; }
        .h-cta { transition: filter .15s ease, transform .15s ease; }
        .h-cta:hover { filter: brightness(1.1); transform: translateY(-1px); }
        ::selection { background: ${GOLD}; color: ${BG}; }
      `}</style>

      <nav
        id="main-nav"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "16px 32px",
          borderBottom: "1px solid transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 20, color: TEXT_1, letterSpacing: "-0.01em" }}>
            FARaudit
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 13, color: TEXT_2 }}>
          <Link href="/how-it-works" style={{ color: TEXT_2, textDecoration: "none" }}>How it works</Link>
          <Link href="/pricing" style={{ color: TEXT_2, textDecoration: "none" }}>Pricing</Link>
          <Link href="/login" style={{ color: TEXT_2, textDecoration: "none" }}>Sign in</Link>
          <Link
            href="/audit"
            className="h-cta"
            style={{ background: GOLD, color: BG, padding: "9px 18px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 13, textDecoration: "none" }}
          >
            Free audit
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "80px 32px 100px", maxWidth: 1080, margin: "0 auto" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.22em", color: TEXT_3, textTransform: "uppercase", marginBottom: 16 }}>
          Federal Contract Intelligence · TX/OK Corridor
        </p>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "clamp(40px, 6vw, 68px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.025em", marginBottom: 24, color: TEXT_1 }}>
          Read the solicitation.<br />Catch every trap.<br /><span style={{ color: GOLD }}>Win the bid.</span>
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, color: TEXT_2, maxWidth: 620, fontWeight: 300, marginBottom: 32 }}>
          FARaudit pulls every clause out of a federal solicitation in under 60 seconds. CLIN
          ambiguities, FOB conflicts, DFARS trap clauses (252.223-7008, 7018, 7021, 7060),
          Section L formatting traps, Section M weight maps. Defense subcontractors stop
          discovering them mid-bid.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/audit"
            className="h-cta"
            style={{ background: GOLD, color: BG, padding: "14px 26px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            Run a free audit
          </Link>
          <Link
            href="/how-it-works"
            className="h-cta"
            style={{ border: "1px solid rgba(255,255,255,0.14)", color: TEXT_1, padding: "13px 26px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            See how it works
          </Link>
        </div>
      </section>

      {/* Audit card — FA301626Q0068 */}
      <section className="reveal" style={{ padding: "0 32px 100px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ background: SURFACE, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT_2, letterSpacing: "0.06em" }}>
            <span>
              <span style={{ color: GOLD, marginRight: 8 }}>●</span>
              FA301626Q0068 · USAF Tinker AFB · audit complete · 38s
            </span>
            <span>SOW · 84/100</span>
          </div>

          <div style={{ padding: "26px 22px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            <Trap tag="P0 · DFARS trap" clause="252.223-7008" title="Hexavalent chromium prohibition" note="Detected in Section H — disqualifying for finishing subs without alternative cert." tone="red" />
            <Trap tag="P0 · CLIN ambiguity" clause="CLIN 0001 / 0002" title="FOB Origin vs Destination conflict" note="Quantity 100 ea Origin (Section B) but 100 ea Destination (Section F). 2x freight margin exposure." tone="red" />
            <Trap tag="P1 · Section L" clause="Section L paragraph 14" title="Page-limit / formatting trap" note="50-page limit but exhibit pages ARE counted. Fonts 12pt with 1.15 spacing. 9 of 10 bidders miss this." tone="amber" />
          </div>

          <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 18, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT_3, flexWrap: "wrap" }}>
            <span><span style={{ color: GREEN }}>●</span> 12 FAR clauses parsed</span>
            <span><span style={{ color: GREEN }}>●</span> 7 DFARS clauses parsed</span>
            <span><span style={{ color: RED }}>●</span> 4 traps surfaced (3 P0 · 1 P1)</span>
            <span><span style={{ color: GOLD }}>●</span> KO clarification email drafted</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="reveal" style={{ padding: "60px 32px", maxWidth: 1080, margin: "0 auto" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.22em", color: TEXT_3, textTransform: "uppercase", marginBottom: 14 }}>What it catches</p>
        <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 38, color: TEXT_1 }}>
          Six trap clauses. Every solicitation. Every audit.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { tag: "DFARS 252.223-7008", body: "Hexavalent chromium prohibition. P0 — disqualifying without alt-process cert." },
            { tag: "DFARS 252.204-7018", body: "Covered telecom equipment. P0 — supply chain attestation required." },
            { tag: "DFARS 252.204-7021", body: "CMMC requirements. P0 — minimum level 2 certification by award." },
            { tag: "DFARS 252.225-7060", body: "Xinjiang forced labor prohibition. P0 — supply chain due diligence rep." },
            { tag: "CLIN ambiguity", body: "Quantity / unit-of-issue / FOB conflicts across Sections B, F, H. P0 — margin exposure." },
            { tag: "Section L / M traps", body: "Page-limit, font, exhibit-counting traps. Section M weight maps. P1 — proposal effort allocation." }
          ].map((f) => (
            <div key={f.tag} style={{ background: SURFACE, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "20px 22px" }}>
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.15em", color: GOLD, textTransform: "uppercase", marginBottom: 10 }}>{f.tag}</p>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: TEXT_2 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section className="reveal" style={{ padding: "60px 32px", maxWidth: 1080, margin: "0 auto" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.22em", color: TEXT_3, textTransform: "uppercase", marginBottom: 14 }}>Process</p>
        <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 38, color: TEXT_1 }}>
          Five stages. Sub-60-second turnaround.
        </h2>
        <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: 12, maxWidth: 720 }}>
          {[
            { n: "01", title: "Upload solicitation PDF", body: "Drag any SAM.gov-published solicitation. Up to 200 pages, 50 attachments." },
            { n: "02", title: "Classify document type", body: "SOW · PWS · SOO · RFP · RFQ · IFB · Sources Sought. Branches the audit pipeline." },
            { n: "03", title: "Overview + clause extraction", body: "Every FAR, DFARS, agency-specific clause pulled and tagged with severity." },
            { n: "04", title: "Compliance + risk synthesis", body: "Six trap clauses cross-checked. CLIN conflicts. Section L/M traps." },
            { n: "05", title: "KO clarification draft", body: "Top three risks become a contracting-officer email — copy, send, win." }
          ].map((s) => (
            <li key={s.n} style={{ display: "grid", gridTemplateColumns: "60px 1fr", alignItems: "baseline", gap: 18, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, color: GOLD_DIM, fontWeight: 500 }}>{s.n}</span>
              <div>
                <p style={{ fontFamily: "Syne, sans-serif", fontSize: 17, fontWeight: 600, color: TEXT_1, marginBottom: 4 }}>{s.title}</p>
                <p style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.6 }}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Validation */}
      <section className="reveal" style={{ padding: "60px 32px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ background: SURFACE_2, border: "1px solid rgba(196,164,74,0.18)", borderRadius: 12, padding: 32 }}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.22em", color: GOLD, textTransform: "uppercase", marginBottom: 14 }}>Field validation</p>
          <p style={{ fontFamily: "Syne, sans-serif", fontSize: 22, lineHeight: 1.4, fontWeight: 600, color: TEXT_1, maxWidth: 800, letterSpacing: "-0.01em" }}>
            FA301626Q0068 — three P0 traps surfaced before the estimator opened a spreadsheet.
            CLIN quantity ambiguity, FOB conflict, hexavalent chromium prohibition. The same
            audit costs $0 to run, beats Govwin/Deltek by 47 minutes per solicitation.
          </p>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="reveal" style={{ padding: "60px 32px 100px", maxWidth: 1080, margin: "0 auto" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.22em", color: TEXT_3, textTransform: "uppercase", marginBottom: 14 }}>Pricing</p>
        <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 18, color: TEXT_1 }}>
          Unlimited audits. <span style={{ color: GOLD }}>One flat rate.</span>
        </h2>
        <p style={{ fontSize: 15, color: TEXT_2, maxWidth: 580, lineHeight: 1.65, fontWeight: 300, marginBottom: 28 }}>
          Design Partner $1,250/mo (12-month, 7 spots) · Standard $1,500/mo · Growth $2,500/mo.
          First audit is free — no credit card.
        </p>
        <Link
          href="/pricing"
          className="h-cta"
          style={{ display: "inline-block", border: `1px solid ${GOLD}`, color: GOLD, padding: "12px 22px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 13, textDecoration: "none" }}
        >
          See pricing
        </Link>
      </section>

      {/* Final CTA */}
      <section className="reveal" style={{ padding: "60px 32px 120px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", color: TEXT_1, marginBottom: 12 }}>
          Audit one solicitation. Free.
        </h2>
        <p style={{ fontSize: 15, color: TEXT_2, marginBottom: 24, fontWeight: 300 }}>
          Drop a SAM.gov PDF. Get the full report in under 60 seconds. Decide from there.
        </p>
        <Link
          href="/audit"
          className="h-cta"
          style={{ background: GOLD, color: BG, padding: "14px 30px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14, textDecoration: "none", display: "inline-block" }}
        >
          Run a free audit
        </Link>
      </section>

      <footer style={{ padding: "32px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 12, color: TEXT_3 }}>
        <div>
          <span style={{ color: TEXT_2, fontFamily: "Syne, sans-serif", fontWeight: 600, marginRight: 12 }}>FARaudit</span>
          © 2026 · Federal Contract Intelligence
        </div>
        <nav style={{ display: "flex", gap: 18 }}>
          <Link href="/login" style={{ color: TEXT_3, textDecoration: "none" }}>Sign in</Link>
          <Link href="/pricing" style={{ color: TEXT_3, textDecoration: "none" }}>Pricing</Link>
          <Link href="/privacy" style={{ color: TEXT_3, textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: TEXT_3, textDecoration: "none" }}>Terms</Link>
          <a href="mailto:jose@faraudit.com" style={{ color: TEXT_3, textDecoration: "none" }}>Contact</a>
        </nav>
      </footer>
    </main>
  );
}

function Trap({
  tag,
  clause,
  title,
  note,
  tone
}: {
  tag: string;
  clause: string;
  title: string;
  note: string;
  tone: "red" | "amber" | "blue";
}) {
  const color = tone === "red" ? "#c84d4d" : tone === "amber" ? "#c4a44a" : "#1962b8";
  return (
    <div style={{ borderLeft: `2px solid ${color}`, paddingLeft: 16 }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.12em", color, textTransform: "uppercase", marginBottom: 6 }}>{tag}</p>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#5a7fa0", marginBottom: 4 }}>{clause}</p>
      <p style={{ fontFamily: "Syne, sans-serif", fontSize: 15, fontWeight: 600, color: "#e2eaf4", marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 12, color: "#5a7fa0", lineHeight: 1.6 }}>{note}</p>
    </div>
  );
}
