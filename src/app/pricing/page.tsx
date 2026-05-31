import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — FARaudit · Federal Contract Intelligence",
  description: "Design Partner $1,250/mo · Standard $2,500/mo · Enterprise for large teams. Federal Contract Intelligence for defense subcontractors.",
};

const TIERS = [
  {
    slug: "design_partner",
    name: "Design Partner",
    badge: "FOUNDING RATE",
    price: 1250,
    annual: 15000,
    audits: "25 audits/month",
    seats: "1 seat",
    cta: "Apply Now",
    ctaHref: "/access.html",
    primary: true,
    urgency: "5 slots remaining · rate locked 12 months",
    description: "For solo BD directors getting started with Federal Contract Intelligence.",
  },
  {
    slug: "standard",
    name: "Standard",
    badge: "FULL PLATFORM",
    price: 2500,
    annual: 30000,
    audits: "100 audits/month",
    seats: "3 seats",
    cta: "Contact Us",
    ctaHref: "mailto:jose@faraudit.com?subject=FARaudit%20Standard%20Inquiry",
    primary: false,
    urgency: null,
    description: "For BD teams that need the full intelligence layer and unlimited capacity.",
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    badge: "5+ SEATS",
    price: null,
    annual: null,
    audits: "Unlimited audits",
    seats: "Unlimited seats",
    cta: "Contact Us",
    ctaHref: "mailto:jose@faraudit.com?subject=FARaudit%20Enterprise%20Inquiry",
    primary: false,
    urgency: null,
    description: "For large contractors with custom requirements, API access, and dedicated support.",
  },
];

type CellValue = boolean | string;

const FEATURES: { category: string; rows: { name: string; design_partner: CellValue; standard: CellValue; enterprise: CellValue }[] }[] = [
  { category: "CORE PLATFORM", rows: [
    { name: "Run Audit OS · 3-call engine", design_partner: true, standard: true, enterprise: true },
    { name: "Audit history retention", design_partner: "90 days", standard: "Unlimited", enterprise: "Unlimited" },
    { name: "Opportunities · upstream intelligence", design_partner: true, standard: true, enterprise: true },
    { name: "Defense News · per-card insights", design_partner: true, standard: true, enterprise: true },
    { name: "Defense Spending intelligence", design_partner: true, standard: true, enterprise: true },
    { name: "Contracting Officers + Agencies", design_partner: true, standard: true, enterprise: true },
    { name: "Capability Statement auto-population", design_partner: true, standard: true, enterprise: true },
    { name: "Pipeline tracking", design_partner: "25 active", standard: "Unlimited", enterprise: "Unlimited" },
    { name: "Acquisition Stages lifecycle", design_partner: true, standard: true, enterprise: true },
    { name: "Win Rate capture · Won/Lost tracking", design_partner: true, standard: true, enterprise: true },
    { name: "All federal NAICS codes", design_partner: true, standard: true, enterprise: true },
    { name: "Email support", design_partner: true, standard: true, enterprise: true },
  ]},
  { category: "INTELLIGENCE LAYER", rows: [
    { name: "Wage Benchmarks · SCA + DBA", design_partner: false, standard: true, enterprise: true },
    { name: "GAO Protests intelligence", design_partner: false, standard: true, enterprise: true },
    { name: "FAR/DFARS regulatory updates", design_partner: false, standard: true, enterprise: true },
    { name: "Teaming Partners discovery", design_partner: false, standard: true, enterprise: true },
    { name: "Recompete alerts", design_partner: false, standard: true, enterprise: true },
    { name: "Win Rate Analytics · full dashboard", design_partner: false, standard: true, enterprise: true },
    { name: "Priority support", design_partner: false, standard: true, enterprise: true },
  ]},
  { category: "ENTERPRISE INFRASTRUCTURE", rows: [
    { name: "API access", design_partner: false, standard: false, enterprise: true },
    { name: "Dedicated CSM", design_partner: false, standard: false, enterprise: true },
    { name: "Custom NAICS coverage", design_partner: false, standard: false, enterprise: true },
    { name: "SLA + uptime guarantee", design_partner: false, standard: false, enterprise: true },
    { name: "Unlimited seats", design_partner: false, standard: false, enterprise: true },
  ]},
];

function Cell({ value }: { value: CellValue }) {
  if (value === true) return <span style={{ color: "#378ADD", fontWeight: 700 }}>✓</span>;
  if (value === false) return <span style={{ color: "#4b5563" }}>—</span>;
  return <span style={{ color: "#94a3b8", fontSize: 12 }}>{value}</span>;
}

export default function PricingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0A1628", color: "#e2e8f2", fontFamily: "Manrope, system-ui, sans-serif" }}>

      {/* NAV */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 60, borderBottom: "1px solid #1e2d45", position: "sticky", top: 0, background: "#0A1628", zIndex: 50 }}>
        <Link href="/" style={{ color: "#e2e8f2", textDecoration: "none", fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>
          FAR<span style={{ color: "#378ADD" }}>audit</span>
        </Link>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <Link href="/how-it-works" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 14 }}>How it works</Link>
          <Link href="/sign-in" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 14 }}>Sign in</Link>
          <Link href="/access.html" style={{ background: "#378ADD", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 700, padding: "8px 18px", borderRadius: 6 }}>Request Access</Link>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ textAlign: "center", padding: "80px 40px 60px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#378ADD", marginBottom: 16, textTransform: "uppercase" as const }}>Pricing</div>
        <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15, marginBottom: 16, letterSpacing: "-0.03em", color: "#e2e8f2" }}>
          Federal Contract Intelligence.<br />
          <span style={{ color: "#378ADD" }}>Priced for every stage.</span>
        </h1>
        <p style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
          Start as a solo BD director. Scale to a full team. Every tier runs on the same platform.
        </p>
      </div>

      {/* TIER CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, maxWidth: 1000, margin: "0 auto 80px", padding: "0 40px" }}>
        {TIERS.map((tier) => (
          <div key={tier.slug} style={{
            background: tier.primary ? "#0d1f35" : "#080e1a",
            border: tier.primary ? "1.5px solid #378ADD" : "1px solid #1e2d45",
            borderRadius: 12, padding: "32px 28px",
            display: "flex", flexDirection: "column" as const,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: tier.primary ? "#378ADD" : "#4a6080", marginBottom: 16, textTransform: "uppercase" as const }}>{tier.badge}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em", color: "#e2e8f2" }}>{tier.name}</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>{tier.description}</div>

            <div style={{ marginBottom: 24 }}>
              {tier.price ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", color: "#e2e8f2" }}>${tier.price.toLocaleString()}</span>
                    <span style={{ fontSize: 14, color: "#64748b" }}>/mo</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>${tier.annual?.toLocaleString()}/year · billed annually</div>
                </>
              ) : (
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "#94a3b8" }}>Custom pricing</div>
              )}
            </div>

            <div style={{ background: "#0A1628", borderRadius: 8, padding: "12px 14px", marginBottom: 24, display: "flex", flexDirection: "column" as const, gap: 6 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                <span>Audits</span><span style={{ color: "#e2e8f2", fontWeight: 600 }}>{tier.audits}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                <span>Seats</span><span style={{ color: "#e2e8f2", fontWeight: 600 }}>{tier.seats}</span>
              </div>
            </div>

            {tier.urgency && (
              <div style={{ fontSize: 11, color: "#378ADD", fontWeight: 600, marginBottom: 16, letterSpacing: "0.02em" }}>● {tier.urgency}</div>
            )}

            <Link href={tier.ctaHref} style={{
              display: "block", textAlign: "center" as const, textDecoration: "none",
              padding: "12px 20px", borderRadius: 8, fontWeight: 700, fontSize: 14, marginTop: "auto",
              ...(tier.primary
                ? { background: "#378ADD", color: "#fff" }
                : { background: "transparent", color: "#378ADD", border: "1.5px solid #378ADD" }),
            }}>{tier.cta}</Link>
          </div>
        ))}
      </div>

      {/* FEATURE TABLE */}
      <div style={{ maxWidth: 1000, margin: "0 auto 80px", padding: "0 40px" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 40, textAlign: "center" as const, letterSpacing: "-0.02em", color: "#e2e8f2" }}>Everything included</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px", padding: "12px 16px", borderBottom: "1px solid #1e2d45", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Feature</div>
          {TIERS.map(t => (
            <div key={t.slug} style={{ fontSize: 11, color: t.primary ? "#378ADD" : "#64748b", fontWeight: 700, textAlign: "center" as const, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{t.name}</div>
          ))}
        </div>

        {FEATURES.map((section) => (
          <div key={section.category} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#378ADD", padding: "10px 16px", textTransform: "uppercase" as const }}>{section.category}</div>
            {section.rows.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px", padding: "11px 16px", background: i % 2 === 0 ? "#080e1a" : "transparent", borderRadius: 6, alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>{row.name}</div>
                <div style={{ textAlign: "center" as const }}><Cell value={row.design_partner} /></div>
                <div style={{ textAlign: "center" as const }}><Cell value={row.standard} /></div>
                <div style={{ textAlign: "center" as const }}><Cell value={row.enterprise} /></div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 640, margin: "0 auto 80px", padding: "0 40px" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 32, textAlign: "center" as const, letterSpacing: "-0.02em", color: "#e2e8f2" }}>Common questions</h2>
        {[
          { q: "What counts as an audit?", a: "One audit = one solicitation run through the full 3-call engine. PDFs uploaded through Run Audit count against your monthly limit. Design Partner accounts reset on the 1st of each month." },
          { q: "Can I upgrade mid-month?", a: "Yes. Upgrades take effect immediately and are prorated. Downgrades take effect at the next billing cycle." },
          { q: "Is the founding rate really locked?", a: "Yes. Design Partner customers who sign up during the founding cohort lock their $1,250/mo rate for 12 months from signup. The standard rate is $2,500/mo." },
          { q: "What happens when I hit 25 audits?", a: "You'll see a counter in your dashboard. When you hit the limit, Run Audit pauses until your cycle resets. You can upgrade to Standard for 100 audits/month at any time." },
          { q: "Who is Enterprise for?", a: "Any contractor with 5+ seats, API integration needs, or custom NAICS requirements. Contact us and we'll scope it together." },
        ].map((item, i) => (
          <div key={i} style={{ borderBottom: "1px solid #1e2d45", padding: "20px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#e2e8f2" }}>{item.q}</div>
            <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>{item.a}</div>
          </div>
        ))}
      </div>

      {/* BOTTOM CTA */}
      <div style={{ textAlign: "center" as const, padding: "60px 40px 80px", borderTop: "1px solid #1e2d45" }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em", color: "#e2e8f2" }}>Ready to start?</div>
        <div style={{ fontSize: 15, color: "#64748b", marginBottom: 28 }}>5 Design Partner slots remaining. Founding rate locks at signup.</div>
        <Link href="/access.html" style={{ display: "inline-block", background: "#378ADD", color: "#fff", textDecoration: "none", padding: "14px 32px", borderRadius: 8, fontWeight: 700, fontSize: 15 }}>
          Apply for Design Partner →
        </Link>
      </div>

    </div>
  );
}
