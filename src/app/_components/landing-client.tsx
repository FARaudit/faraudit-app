"use client";

import Link from "next/link";
import { useEffect } from "react";

// ── Tokens ──────────────────────────────────────────────
const BG        = "#0A1628";
const NAVY2     = "#0d1f35";
const BLUE      = "#378ADD";
const LIGHT     = "#B5D4F4";
const PALE      = "#E6F1FB";
const WHITE     = "#ffffff";
const TEXT_1    = "#e2e8f2";
const TEXT_2    = "#94a3b8";
const TEXT_3    = "#64748b";
const GREEN     = "#28b06a";
const RED       = "#c84d4d";
const AMBER     = "#d4a032";
const SURFACE   = "rgba(255,255,255,0.04)";
const BORDER    = "rgba(255,255,255,0.08)";
const BORDER2   = "rgba(255,255,255,0.14)";
const MONO      = "'JetBrains Mono', monospace";
const SANS      = "'Manrope', system-ui, sans-serif";

// ── Trap badge sub-component ─────────────────────────────
function TrapBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-block",
      background: "rgba(212,160,50,0.12)",
      border: `1px solid rgba(212,160,50,0.3)`,
      color: AMBER,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.08em",
      padding: "2px 8px",
      borderRadius: 4,
      fontFamily: MONO,
      textTransform: "uppercase" as const,
    }}>{label}</span>
  );
}

export default function LandingClient() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add("revealed");
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

    const nav = document.getElementById("main-nav");
    const onScroll = () => {
      if (nav) nav.classList.toggle("scrolled", window.scrollY > 20);
    };
    window.addEventListener("scroll", onScroll);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div style={{ background: BG, color: TEXT_1, fontFamily: SANS, minHeight: "100vh" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(55,138,221,0.3); }
        .reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.55s ease, transform 0.55s ease; }
        .revealed { opacity: 1; transform: translateY(0); }
        #main-nav { transition: background 0.2s, border-color 0.2s; }
        #main-nav.scrolled { background: rgba(10,22,40,0.95) !important; backdrop-filter: blur(12px); border-bottom: 1px solid rgba(55,138,221,0.2) !important; }
      `}</style>

      <nav id="main-nav" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: "transparent", borderBottom: "1px solid transparent",
      }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: TEXT_1 }}>
            FAR<span style={{ color: BLUE }}>audit</span>
          </Link>
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <Link href="/how-it-works" style={{ fontSize: 13, color: TEXT_2, textDecoration: "none" }}>How it works</Link>
            <Link href="/pricing" style={{ fontSize: 13, color: TEXT_2, textDecoration: "none" }}>Pricing</Link>
            <Link href="/sign-in" style={{ fontSize: 13, color: TEXT_2, textDecoration: "none" }}>Sign in</Link>
            <Link href="/access.html" style={{
              fontSize: 13, fontWeight: 700, color: WHITE, textDecoration: "none",
              background: BLUE, padding: "7px 18px", borderRadius: 6,
            }}>Request Access</Link>
          </div>
        </div>
      </nav>

      <section style={{ paddingTop: 140, paddingBottom: 100, maxWidth: 1060, margin: "0 auto", padding: "140px 24px 100px" }}>
        <div style={{ maxWidth: 700 }}>
          <div className="reveal" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: SURFACE, border: `1px solid ${BORDER2}`,
            borderRadius: 20, padding: "5px 14px", marginBottom: 28,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: TEXT_2, fontFamily: MONO }}>
              Federal Contract Intelligence
            </span>
          </div>

          <h1 className="reveal" style={{
            fontSize: 58, fontWeight: 800, lineHeight: 1.1,
            letterSpacing: "-0.04em", marginBottom: 24, color: TEXT_1,
          }}>
            Most contractors<br />start at Stage 03.<br />
            <span style={{ color: BLUE }}>You start at Stage 01.</span>
          </h1>

          <p className="reveal" style={{
            fontSize: 18, color: TEXT_2, lineHeight: 1.75,
            maxWidth: 560, marginBottom: 40,
          }}>
            FARaudit covers seven of eight acquisition stages — starting 60–90 days before the solicitation drops. Pre-Sol Synopses. RFI response drafting. Full three-call audit engine. Post-award compliance.
          </p>

          <div className="reveal" style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
            <Link href="/access.html" style={{
              fontSize: 15, fontWeight: 700, color: WHITE, textDecoration: "none",
              background: BLUE, padding: "14px 28px", borderRadius: 8,
              letterSpacing: "0.01em",
            }}>
              Request Access →
            </Link>
            <Link href="/how-it-works" style={{
              fontSize: 15, fontWeight: 600, color: TEXT_1, textDecoration: "none",
              border: `1px solid ${BORDER2}`, padding: "14px 28px", borderRadius: 8,
            }}>
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px 100px" }}>
        <div className="reveal" style={{
          background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: "48px 48px",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: BLUE, marginBottom: 16, fontFamily: MONO }}>
                01 · Upstream Intelligence
              </div>
              <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 20, color: TEXT_1 }}>
                60–90 days before<br />the solicitation drops.
              </h2>
              <p style={{ fontSize: 15, color: TEXT_2, lineHeight: 1.75, marginBottom: 28 }}>
                Synopsis Scanner detects Pre-Solicitation notices at 06:15 CT daily across 9 defense NAICS codes. Generates a strategic CO contact email before competitors know the requirement exists.
              </p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {[
                  "Synopsis analysis + urgency score 0–100",
                  "CO contact email — single-question SME positioning",
                  "RFI response drafter — solution-first, agency terminology mirrored",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: BLUE, flexShrink: 0, marginTop: 8 }} />
                    <span style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: BG, borderRadius: 10, padding: "28px 24px", border: `1px solid ${BORDER2}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: TEXT_3, marginBottom: 16, fontFamily: MONO }}>
                Stage coverage
              </div>
              {[
                { num: "00", label: "Govt need identified", fa: false },
                { num: "01", label: "Pre-Sol Synopsis", fa: true },
                { num: "02", label: "Sources Sought / RFI", fa: true },
                { num: "03", label: "Solicitation drops", fa: true },
                { num: "04–07", label: "Proposal → Award", fa: true },
              ].map((stage, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 0", borderBottom: i < 4 ? `1px solid ${BORDER}` : "none",
                }}>
                  <div style={{
                    width: 36, height: 24, borderRadius: 4,
                    background: stage.fa ? "rgba(55,138,221,0.15)" : SURFACE,
                    border: `1px solid ${stage.fa ? "rgba(55,138,221,0.3)" : BORDER}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: stage.fa ? BLUE : TEXT_3, fontFamily: MONO, flexShrink: 0,
                  }}>{stage.num}</div>
                  <span style={{ fontSize: 12, color: stage.fa ? TEXT_1 : TEXT_3 }}>{stage.label}</span>
                  {stage.fa && <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: GREEN, fontFamily: MONO, letterSpacing: "0.08em" }}>ACTIVE</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px 100px" }}>
        <div className="reveal" style={{
          background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: "48px 48px",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
            <div style={{ background: BG, borderRadius: 10, padding: "28px 24px", border: `1px solid ${BORDER2}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: TEXT_3, marginBottom: 16, fontFamily: MONO }}>
                FA301626Q0068 · T-38 Intake Plugs
              </div>
              {[
                { label: "CLIN quantity ambiguity", badge: "P0", desc: "\"80 Each\" — 80 sets or 80 plugs? 2× margin exposure." },
                { label: "FOB designation conflict", badge: "P0", desc: "CLIN 0001 vs CLINs 0002/0003 vs Note 7 — three different answers." },
                { label: "Hexavalent chromium", badge: "P1", desc: "DFARS 252.223-7008 — standard aerospace primers disqualify." },
              ].map((trap, i) => (
                <div key={i} style={{
                  padding: "12px 0", borderBottom: i < 2 ? `1px solid ${BORDER}` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <TrapBadge label={trap.badge} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_1 }}>{trap.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_3, lineHeight: 1.5 }}>{trap.desc}</div>
                </div>
              ))}
              <div style={{ marginTop: 16, fontSize: 11, color: BLUE, fontFamily: MONO, letterSpacing: "0.04em" }}>
                ✓ All three caught in 4 minutes
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: BLUE, marginBottom: 16, fontFamily: MONO }}>
                02 · Three-Call Audit Engine
              </div>
              <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 20, color: TEXT_1 }}>
                Every trap.<br />Every clause.<br />
                <span style={{ color: BLUE }}>Fully audited.</span>
              </h2>
              <p style={{ fontSize: 15, color: TEXT_2, lineHeight: 1.75, marginBottom: 28 }}>
                Pre-step classifies your document type — SOW, PWS, or SOO — because that changes your entire bid strategy. Three calls handle CLIN ambiguities, FAR/DFARS compliance, and DFARS trap detection. No token truncation on large IDIQs.
              </p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {[
                  "SOW / PWS / SOO classifier — bid strategy before clause checking",
                  "CLIN ambiguity + FOB conflict detection with CO email draft",
                  "6 DFARS traps: hex-chrome, covered telecom, CMMC, Xinjiang, Buy American",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: BLUE, flexShrink: 0, marginTop: 8 }} />
                    <span style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px 100px" }}>
        <div className="reveal" style={{ textAlign: "center" as const, marginBottom: 48 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: BLUE, marginBottom: 16, fontFamily: MONO }}>
            Pricing
          </div>
          <h2 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", color: TEXT_1, marginBottom: 14 }}>
            Federal Contract Intelligence.<br />Priced for every stage.
          </h2>
          <p style={{ fontSize: 16, color: TEXT_2, maxWidth: 480, margin: "0 auto" }}>
            Start as a solo BD director. Scale to a full team.
          </p>
        </div>

        <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            {
              name: "Design Partner",
              badge: "FOUNDING RATE",
              price: "$1,250",
              unit: "/mo",
              note: "Rate locked 12 months",
              // TODO: FA-101 — wire to Supabase design_partner_slots_remaining
              slots: "3 of 5 slots remaining",
              highlight: true,
            },
            {
              name: "Standard",
              badge: "FULL PLATFORM",
              price: "$2,500",
              unit: "/mo",
              note: "100 audits/month · 3 seats",
              slots: null,
              highlight: false,
            },
            {
              name: "Enterprise",
              badge: "5+ SEATS",
              price: "Custom",
              unit: "",
              note: "Unlimited audits · API access",
              slots: null,
              highlight: false,
            },
          ].map((tier, i) => (
            <div key={i} style={{
              background: tier.highlight ? NAVY2 : SURFACE,
              border: `1px solid ${tier.highlight ? "rgba(55,138,221,0.4)" : BORDER}`,
              borderRadius: 10, padding: "24px 22px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: tier.highlight ? BLUE : TEXT_3, marginBottom: 10, fontFamily: MONO }}>
                {tier.badge}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_1, marginBottom: 12, letterSpacing: "-0.02em" }}>
                {tier.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", color: TEXT_1 }}>{tier.price}</span>
                <span style={{ fontSize: 14, color: TEXT_3 }}>{tier.unit}</span>
              </div>
              <div style={{ fontSize: 12, color: TEXT_3, marginBottom: tier.slots ? 8 : 0 }}>{tier.note}</div>
              {tier.slots && (
                <div style={{ fontSize: 11, color: "#fca5a5", fontFamily: MONO, fontWeight: 600 }} id="slotsLeft">
                  ● {tier.slots}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="reveal" style={{ textAlign: "center" as const, marginTop: 28 }}>
          <Link href="/pricing" style={{
            fontSize: 14, color: BLUE, textDecoration: "none", fontWeight: 600,
            border: `1px solid rgba(55,138,221,0.3)`, padding: "10px 24px", borderRadius: 6,
          }}>
            See full pricing →
          </Link>
        </div>
      </section>

      <section style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px 120px", textAlign: "center" as const }}>
        <div className="reveal">
          <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", color: TEXT_1, marginBottom: 16 }}>
            Ready to start upstream?
          </h2>
          <p style={{ fontSize: 16, color: TEXT_2, marginBottom: 36, maxWidth: 480, margin: "0 auto 36px" }}>
            3 of 5 Design Partner slots remaining. Founding rate locked at signup.
          </p>
          <Link href="/access.html" style={{
            display: "inline-block", fontSize: 16, fontWeight: 700, color: WHITE, textDecoration: "none",
            background: BLUE, padding: "16px 36px", borderRadius: 8,
          }}>
            Apply for Design Partner access →
          </Link>
        </div>
      </section>

      <footer style={{
        borderTop: `1px solid ${BORDER}`,
        padding: "32px 24px",
        maxWidth: 1060, margin: "0 auto",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em", color: TEXT_1 }}>
          FAR<span style={{ color: BLUE }}>audit</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/how-it-works" style={{ fontSize: 13, color: TEXT_3, textDecoration: "none" }}>How it works</Link>
          <Link href="/pricing" style={{ fontSize: 13, color: TEXT_3, textDecoration: "none" }}>Pricing</Link>
          <Link href="/sign-in" style={{ fontSize: 13, color: TEXT_3, textDecoration: "none" }}>Sign in</Link>
          <Link href="/access.html" style={{ fontSize: 13, color: TEXT_3, textDecoration: "none" }}>Request Access</Link>
        </div>
        <div style={{ fontSize: 12, color: TEXT_3, fontFamily: MONO }}>
          © 2026 FARaudit Inc. · Dover, DE
        </div>
      </footer>

    </div>
  );
}
