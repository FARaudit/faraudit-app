import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FARaudit Pricing — Federal Contract Intelligence",
  description:
    "Unlimited audits, full FAR/DFARS reports, DFARS trap detection. Design Partner $1,250/mo · Standard $1,500/mo · Growth $2,500/mo."
};

const tiers = [
  {
    name: "Design Partner",
    price: "$1,250",
    term: "12-month commitment · rate locked · 7 spots",
    featured: false,
    features: [
      "Unlimited audits — all solicitations",
      "Direct line to founder",
      "Roadmap input and influence",
      "Full FAR/DFARS compliance report",
      "All 6 DFARS trap detections",
      "KO clarification email drafts",
      "Section L/M analysis"
    ],
    cta: { text: "Apply for a spot", href: "mailto:jose@faraudit.com?subject=Design%20Partner", style: "outline" }
  },
  {
    name: "Standard",
    price: "$1,500",
    term: "Month-to-month · cancel anytime",
    featured: true,
    features: [
      "Unlimited audits — all solicitations",
      "Full FAR/DFARS compliance report",
      "All 6 DFARS trap detections",
      "KO clarification email drafts",
      "SAM.gov daily feed (your NAICS)",
      "Section L/M analysis",
      "SOW/PWS/SOO classification"
    ],
    cta: { text: "Start free audit", href: "/audit", style: "primary" }
  },
  {
    name: "Growth",
    price: "$2,500",
    term: "Month-to-month · cancel anytime",
    featured: false,
    features: [
      "Everything in Standard",
      "SAM.gov automation (10+ NAICS)",
      "Pre-solicitation synopsis monitoring",
      "60–90 day early pipeline intelligence",
      "API access for system integration",
      "Priority turnaround and support",
      "Proposal strategy output per audit"
    ],
    cta: { text: "Contact us", href: "mailto:jose@faraudit.com?subject=Growth%20plan", style: "outline" }
  }
];

const BG = "#03080f";
const SURFACE = "#06101a";
const TEXT_1 = "#e2eaf4";
const TEXT_2 = "#5a7fa0";
const TEXT_3 = "#3d5b75";
const GOLD = "#c4a44a";

export default function PricingPage() {
  return (
    <main style={{ background: BG, minHeight: "100vh", padding: "80px 40px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Link href="/" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT_3, textDecoration: "none" }}>
          ← FARaudit
        </Link>

        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_2, letterSpacing: "0.22em", textTransform: "uppercase", margin: "24px 0 12px" }}>
          Pricing
        </p>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 44, fontWeight: 700, color: TEXT_1, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 14 }}>
          Unlimited audits.<br /><span style={{ color: GOLD }}>One flat rate.</span>
        </h1>
        <p style={{ fontSize: 16, color: TEXT_2, marginBottom: 52, maxWidth: 560, lineHeight: 1.7, fontWeight: 300 }}>
          Every plan includes unlimited audits, full FAR/DFARS compliance reports, all six DFARS trap detections, and KO clarification email drafts. No per-audit fees. No setup costs.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
          {tiers.map((tier) => (
            <div
              key={tier.name}
              style={{
                background: tier.featured ? "linear-gradient(165deg, #091522, #06101a)" : SURFACE,
                border: tier.featured ? `1px solid rgba(196,164,74,0.35)` : "1px solid rgba(255,255,255,0.09)",
                borderRadius: 12,
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                position: "relative"
              }}
            >
              {tier.featured && (
                <div style={{ position: "absolute", top: -11, left: 24, background: GOLD, color: BG, fontFamily: "JetBrains Mono, monospace", fontSize: 9, padding: "3px 12px", borderRadius: 20, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
                  Most popular
                </div>
              )}

              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: TEXT_2, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
                {tier.name}
              </p>
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 36, fontWeight: 500, color: TEXT_1, lineHeight: 1, marginBottom: 4 }}>
                {tier.price}
                <sub style={{ fontSize: 13, color: TEXT_2 }}> /mo</sub>
              </p>
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_2, marginBottom: 22 }}>
                {tier.term}
              </p>

              <ul style={{ listStyle: "none", padding: 0, flex: 1, marginBottom: 22 }}>
                {tier.features.map((f) => (
                  <li
                    key={f}
                    style={{ fontSize: 12, color: TEXT_2, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 8, lineHeight: 1.5 }}
                  >
                    <span style={{ color: GOLD, flexShrink: 0 }}>—</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={tier.cta.href}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: 12,
                  borderRadius: 6,
                  fontFamily: "Syne, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                  background: tier.cta.style === "primary" ? GOLD : "transparent",
                  color: tier.cta.style === "primary" ? BG : TEXT_1,
                  border: tier.cta.style === "outline" ? "1px solid rgba(255,255,255,0.14)" : "none"
                }}
              >
                {tier.cta.text}
              </Link>
            </div>
          ))}
        </div>

        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT_2, padding: "13px 16px", background: "rgba(40,176,106,0.08)", border: "1px solid rgba(40,176,106,0.15)", borderRadius: 5, display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#28b06a", flexShrink: 0, display: "inline-block" }} />
          First audit is free — no credit card required. Upload any active solicitation and see the full report in under 60 seconds.
        </div>
      </div>
    </main>
  );
}
