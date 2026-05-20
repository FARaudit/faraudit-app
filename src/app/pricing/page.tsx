import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FARaudit Pricing — Defense BD Operating System",
  description:
    "The trap was already in the document. Standard $1,250/mo · Professional $2,500/mo · Enterprise on request. All tiers include the full Defense BD OS — Run Audit, Defense Spending, Defense News AI, Capability Statement, CMMC Readiness, more."
};

const BG = "#03080f";
const SURFACE = "#06101a";
const SURFACE_2 = "#0a1525";
const TEXT_1 = "#e2eaf4";
const TEXT_2 = "#5a7fa0";
const TEXT_3 = "#3d5b75";
const GOLD = "#c4a44a";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_GOLD = "rgba(196,164,74,0.32)";

type Tier = {
  slug: "design_partner" | "professional" | "enterprise";
  name: string;
  price: string;
  priceSuffix?: string;
  eyebrow: string;
  featured: boolean;
  badgeLabel?: string;
  cta: { label: string; href?: string; disabled?: boolean };
};

const TIERS: Tier[] = [
  {
    slug: "design_partner",
    name: "Standard",
    badgeLabel: "Founding Rate",
    price: "$1,250",
    priceSuffix: "/mo",
    eyebrow: "5 slots remaining · 90-day program · rate locks at signup",
    featured: true,
    cta: { label: "Apply", href: "/access.html" }
  },
  {
    slug: "professional",
    name: "Professional",
    badgeLabel: "Most Popular",
    price: "$2,500",
    priceSuffix: "/mo",
    eyebrow: "Billed annually · full platform · open enrollment",
    featured: false,
    cta: { label: "Talk to us", href: "mailto:hello@faraudit.com?subject=FARaudit%20Standard%20inquiry" }
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    price: "Talk to us",
    eyebrow: "Multi-seat · priority SLA · custom NAICS coverage",
    featured: false,
    cta: { label: "Contact us", href: "mailto:hello@faraudit.com?subject=FARaudit%20Enterprise%20inquiry" }
  }
];

// Comparison feature rows. All three tiers ship the same product surface;
// the difference is price + onboarding (design partner reward, not feature
// gating). Enterprise gets custom integrations + dedicated support on top.
const FEATURES: { label: string; tiers: string[] }[] = [
    { label: "Run Audit OS · 3-call engine · full solicitation coverage", tiers: ["✓", "✓", "✓"] },
    { label: "Audit history retention", tiers: ["90 days", "Unlimited", "Unlimited"] },
    { label: "Defense Spending intelligence · USAspending.gov · all federal NAICS · top 10 primes · YoY", tiers: ["✓", "✓", "✓"] },
    { label: "Defense News with per-card AI insights · claude-opus-4-7", tiers: ["✓", "✓", "✓"] },
    { label: "Contracting Officers + Agencies intelligence", tiers: ["✓", "✓", "✓"] },
    { label: "Capability Statement persistence + auto-population", tiers: ["✓", "✓", "✓"] },
    { label: "Pipeline tracking", tiers: ["25 active", "Unlimited", "Unlimited"] },
    { label: "CMMC Readiness assessment (Levels 1/2/3)", tiers: ["✓", "✓", "✓"] },
    { label: "All federal NAICS codes", tiers: ["✓", "✓", "✓"] },
    { label: "Email support", tiers: ["✓", "✓", "✓"] },
    { label: "Wage Benchmarks · SCA + DBA", tiers: ["—", "✓", "✓"] },
    { label: "GAO Protests intelligence", tiers: ["—", "✓", "✓"] },
    { label: "FAR/DFARS regulatory updates", tiers: ["—", "✓", "✓"] },
    { label: "Teaming Partners discovery", tiers: ["—", "✓", "✓"] },
    { label: "Recompete alerts", tiers: ["—", "✓", "✓"] },
    { label: "Priority support", tiers: ["—", "✓", "✓"] },
    { label: "API access", tiers: ["—", "—", "✓"] },
    { label: "Dedicated CSM", tiers: ["—", "—", "✓"] },
    { label: "Multi-seat · SLA", tiers: ["—", "—", "✓"] },
  ];

function TierCard({ tier }: { tier: Tier }) {
  return (
    <div
      style={{
        background: tier.featured ? "linear-gradient(165deg, #091522, #06101a)" : SURFACE,
        border: tier.featured ? `1px solid ${BORDER_GOLD}` : `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        position: "relative"
      }}
    >
      {tier.featured && (
        <div
          style={{
            position: "absolute",
            top: -11,
            left: 24,
            background: GOLD,
            color: BG,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            padding: "3px 12px",
            borderRadius: 20,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 500
          }}
        >
          Founding Rate
        </div>
      )}

      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: TEXT_2, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
        {tier.name}
      </p>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 36, fontWeight: 500, color: TEXT_1, lineHeight: 1, marginBottom: 8 }}>
        {tier.price}
        {tier.priceSuffix && <sub style={{ fontSize: 13, color: TEXT_2, marginLeft: 2 }}>{tier.priceSuffix}</sub>}
      </p>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TEXT_2, lineHeight: 1.6, marginBottom: 22, flex: 1 }}>
        {tier.eyebrow}
      </p>

      {tier.cta.disabled ? (
        <span
          aria-disabled="true"
          style={{
            display: "block",
            textAlign: "center",
            padding: 12,
            borderRadius: 6,
            fontFamily: "Syne, sans-serif",
            fontSize: 12,
            fontWeight: 600,
            background: "transparent",
            color: TEXT_3,
            border: `1px solid ${BORDER}`,
            width: "100%",
            cursor: "not-allowed"
          }}
        >
          {tier.cta.label}
        </span>
      ) : (
        <Link
          href={tier.cta.href || "#"}
          style={{
            display: "block",
            textAlign: "center",
            padding: 12,
            borderRadius: 6,
            fontFamily: "Syne, sans-serif",
            fontSize: 12,
            fontWeight: 600,
            background: tier.featured ? GOLD : "transparent",
            color: tier.featured ? BG : TEXT_1,
            border: tier.featured ? "none" : `1px solid ${BORDER}`,
            width: "100%",
            textDecoration: "none"
          }}
        >
          {tier.cta.label}
        </Link>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <main style={{ background: BG, minHeight: "100vh", padding: "60px 20px 80px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* Responsive treatment via scoped <style> · 3-col desktop, 2-col iPad, 1-col phone.
          Comparison table scrolls horizontally inside its container at narrow widths. */}
      <style>{`
        .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 56px; }
        .pricing-compare { overflow-x: auto; border: 1px solid ${BORDER}; border-radius: 8px; background: ${SURFACE}; }
        .pricing-compare table { width: 100%; min-width: 560px; border-collapse: collapse; }
        .pricing-compare th, .pricing-compare td { padding: 13px 16px; text-align: left; font-size: 12px; border-bottom: 1px solid ${BORDER}; }
        .pricing-compare th { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: ${TEXT_2}; background: ${SURFACE_2}; }
        .pricing-compare td.label { color: ${TEXT_1}; }
        .pricing-compare td.tick { text-align: center; color: ${GOLD}; font-family: 'JetBrains Mono', monospace; width: 90px; }
        .pricing-compare td.tick.dash { color: ${TEXT_3}; }
        .pricing-compare tr:last-child td { border-bottom: none; }

        @media (min-width: 768px) and (max-width: 1023px) {
          .pricing-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 767px) {
          .pricing-grid { grid-template-columns: 1fr; gap: 14px; }
          .pricing-compare th, .pricing-compare td { padding: 10px 12px; }
        }
      `}</style>

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Link href="/" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT_3, textDecoration: "none" }}>
          ← FARaudit
        </Link>

        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_2, letterSpacing: "0.22em", textTransform: "uppercase", margin: "24px 0 12px" }}>
          Pricing
        </p>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 44, fontWeight: 700, color: TEXT_1, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 14 }}>
          The trap was already<br /><span style={{ color: GOLD }}>in the document.</span>
        </h1>
        <p style={{ fontSize: 16, color: TEXT_2, marginBottom: 52, maxWidth: 620, lineHeight: 1.7, fontWeight: 300 }}>
          The full Defense BD Operating System on every plan. Run Audit, Defense Spending,
          Defense News AI insights, Capability Statement, CMMC Readiness — same product
          surface across all tiers. Standard pricing rewards the first 5 customers.
        </p>

        <div className="pricing-grid">
          {TIERS.map((t) => <TierCard key={t.slug} tier={t} />)}
        </div>

        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_2, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 14 }}>
          Compare features
        </p>
        <div className="pricing-compare">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                {TIERS.map((t) => <th key={t.slug} style={{ textAlign: "center", color: t.featured ? GOLD : TEXT_2 }}>{t.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((row) => (
                <tr key={row.label}>
                  <td className="label">{row.label}</td>
                  {row.tiers.map((cell, i) => (
                    <td key={i} className={`tick${cell === "—" ? " dash" : ""}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            marginTop: 40,
            padding: "20px 22px",
            background: "rgba(196,164,74,0.06)",
            border: `1px solid ${BORDER_GOLD}`,
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: GOLD, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0 }}>
            Join as a founding member
          </p>
          <p style={{ fontSize: 14, color: TEXT_1, lineHeight: 1.6, margin: 0 }}>
            5 founding spots open. $1,250/mo Standard rate. Direct line to the founder. Roadmap input.
          </p>
          <Link
            href="/access.html"
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              padding: "10px 18px",
              background: GOLD,
              color: BG,
              borderRadius: 6,
              fontFamily: "Syne, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none"
            }}
          >
            Apply →
          </Link>
        </div>
      </div>
    </main>
  );
}
