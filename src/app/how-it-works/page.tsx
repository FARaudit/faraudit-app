// /how-it-works · The 8-stage federal acquisition lifecycle, inline.
// Replaces the prior iframe wrapper that pointed at /lifecycle/index.html
// (broken in production due to CDN/iframe behavior). Source of truth for
// stage data is public/lifecycle/index.html — preserved for direct demos.

import type { Metadata } from "next";
import Link from "next/link";

const BG = "#03080f";
const SURFACE = "#06101a";
const SURFACE_2 = "#091522";
const TEXT_1 = "#e2eaf4";
const TEXT_2 = "#5a7fa0";
const TEXT_3 = "#3d5b75";
const GOLD = "#c4a44a";
const RED = "#c84d4d";
const AMBER = "#d4a032";
const GREEN = "#28b06a";

export const metadata: Metadata = {
  title: "How it works — FARaudit",
  description:
    "The complete federal acquisition lifecycle, end to end. From the first government signal to contract award — and what FARaudit does at every stage."
};

type Risk = { t: string; severity: "P0" | "P1"; d: string; a: string };
type Clause = { n: string; t: string; kind: "trap" | "required" | "reference" };

type Stage = {
  num: string;
  label: string;
  title: string;
  sub: string;
  faPresent: boolean; // is FARaudit active at this stage?
  whats: string[];
  keys: string[];
  faNarrative: string | null;
  faHook: string | null;
  outputs: string[];
  outcomes: string[];
  clauses: Clause[];
  risks: Risk[];
};

const STAGES: Stage[] = [
  {
    num: "00",
    label: "Govt need identified",
    title: "Government requirement identified",
    sub: "Agency determines a need · Program office begins planning",
    faPresent: false,
    whats: ["Program office defines requirement", "Budget allocated — PPBE cycle", "Market research — FAR Part 10", "Acquisition strategy developed"],
    keys: ["SOO drafted", "NAICS code assigned", "Set-aside determination made", "Estimated value established"],
    faNarrative: "FARaudit not yet involved. This stage is internal to the agency.",
    faHook: null,
    outputs: [],
    outcomes: [],
    clauses: [],
    risks: []
  },
  {
    num: "01",
    label: "Pre-Sol Synopsis",
    title: "Pre-Solicitation Synopsis",
    sub: "FAR 5.203 · Public notice on SAM.gov · The starting gun",
    faPresent: true,
    whats: ["CO posts public notice to SAM.gov", "Industry begins positioning", "Small business office reviews set-aside", "Value and timeline published"],
    keys: ["Contract type announced (FFP/T&M/Cost+)", "NAICS code confirmed", "Anticipated release date provided", "CO contact posted"],
    faNarrative:
      "Synopsis Scanner detects notices at 06:15 CT daily across 9 defense NAICS codes. Analyzes contract type, set-aside, urgency score 0–100. Generates a strategic CO contact email — precise single-question inquiry that positions the contractor as an industry SME. This is the 60–90 day head start no competitor offers.",
    faHook: "60–90 days before the solicitation drops",
    outputs: ["Synopsis analysis", "CO contact email", "Preparation calendar", "Urgency score 0–100"],
    outcomes: ["60–90 day head start", "CO relationship established", "Teaming strategy formed"],
    clauses: [
      { n: "FAR 5.203", t: "Publicizing Contract Actions — requires pre-solicitation notice", kind: "reference" },
      { n: "FAR Part 10", t: "Market Research — agency gauges industry capability", kind: "reference" }
    ],
    risks: [
      {
        t: "Missed synopsis — competition starts without you",
        severity: "P1",
        d: "If the Synopsis posts and you don't respond within the first week, competitors establish the CO relationship first.",
        a: "FARaudit: Synopsis Scanner fires same day. CO email drafted within minutes of detection."
      }
    ]
  },
  {
    num: "02",
    label: "Sources Sought / RFI",
    title: "Sources Sought · Request for Information",
    sub: "Agency shapes the requirement · Maximum contractor influence window",
    faPresent: true,
    whats: ["Agency gauges market capability", "Identifies qualified vendors", "Refines performance standards", "Tests pricing assumptions"],
    keys: ["Technical capabilities requested", "Pricing data collected", "SOW/PWS language being written", "Evaluation weights undecided"],
    faNarrative:
      "RFI Scanner monitors 9 defense NAICS codes daily. Ranks by influence score. RFI Response Drafter produces solution-first strategic response: unconsidered risks flagged, agency terminology mirrored, performance standards proposed. Contractor language enters the final SOW.",
    faHook: "Where contractor language enters the government SOW",
    outputs: ["Ranked RFI feed", "Strategic response draft", "Unconsidered risk analysis", "Terminology alignment"],
    outcomes: ["Language written into SOW", "SME positioning", "Evaluation criteria shaped"],
    clauses: [
      { n: "FAR 10.002", t: "Market Research procedures — governs Sources Sought", kind: "reference" },
      { n: "FAR 52.215-3", t: "Request for Information or Solicitation for Planning Purposes", kind: "reference" }
    ],
    risks: [
      {
        t: "RFI leads with company history",
        severity: "P0",
        d: "Agencies don't care about past performance at this stage — they're evaluating technical understanding.",
        a: "FARaudit: Response Drafter hard-coded to lead with solution approach. Company history never in first paragraph."
      },
      {
        t: "Failing to identify unconsidered risks",
        severity: "P1",
        d: "Most influential RFI responses identify a technical risk the agency missed. This positions you as SME and gets your language into the final SOW.",
        a: "FARaudit: Drafter produces 2–3 unconsidered risk flags with specific mitigations."
      }
    ]
  },
  {
    num: "03",
    label: "Solicitation Drops",
    title: "Solicitation released",
    sub: "RFQ / RFP / IFB posted to SAM.gov · Competition clock starts",
    faPresent: true,
    whats: ["CO releases solicitation to SAM.gov", "Question window opens — 7–14 days", "Site visit scheduled if applicable", "Offerors begin proposal development"],
    keys: ["Section B — CLINs and pricing", "Section C — SOW, PWS, or SOO", "Section L — instructions to offerors", "Section M — evaluation factors"],
    faNarrative:
      "Full three-call audit engine. Pre-step: SOW/PWS/SOO Classifier determines document type. Call 1: CLIN structure, quantity ambiguities, FOB conflicts. Call 2: FAR/DFARS compliance. Call 3: DFARS trap detection — hexavalent chromium 252.223-7008, covered telecom 252.204-7018, CMMC 252.204-7021.",
    faHook: "Three-call architecture — no token truncation on large IDIQs",
    outputs: ["SOW/PWS/SOO classification + bid strategy", "CLIN ambiguity flags", "Full compliance report", "DFARS trap list", "KO clarification email"],
    outcomes: ["Zero pricing surprises", "Compliance confirmed", "Clarification questions filed"],
    clauses: [
      { n: "252.223-7008", t: "Prohibition of Hexavalent Chromium — disqualification trap", kind: "trap" },
      { n: "252.204-7018", t: "Covered Defense Telecom Equipment — supply chain requirement", kind: "trap" },
      { n: "252.204-7021", t: "CMMC Requirements — cybersecurity certification", kind: "trap" },
      { n: "52.219-14", t: "Limitations on Subcontracting — 50% self-performance rule", kind: "required" },
      { n: "52.225-1", t: "Buy American — domestic end product certification", kind: "required" }
    ],
    risks: [
      {
        t: 'CLIN quantity ambiguity — "Set of 2 · 80 Each"',
        severity: "P0",
        d: 'Does "80 Each" mean 80 sets (160 plugs) or 80 individual plugs? A 2x margin exposure on the entire CLIN.',
        a: "FARaudit: Flagged in Call 1 with specific clarification question to CO ready to send."
      },
      {
        t: "FOB designation conflict",
        severity: "P0",
        d: "CLIN 0001 shows Government Destination, CLINs 0002/0003 show Contractor Destination. Contractor who ships wrong pays freight.",
        a: "FARaudit: FOB conflict flagged in Call 1. KO email includes explicit FOB question with citations."
      },
      {
        t: "Hexavalent chromium in coating supply chain",
        severity: "P1",
        d: "DFARS 252.223-7008 prohibits hex-chrome without written approval. Many aerospace primers contain it.",
        a: "FARaudit: Flagged in Call 3 with supplier verification checklist."
      }
    ]
  },
  {
    num: "04",
    label: "Proposal Development",
    title: "Proposal development",
    sub: "Contractor builds technical and price volumes",
    faPresent: true,
    whats: ["Estimator prices each CLIN", "Technical team writes approach", "Compliance matrix completed", "Past performance compiled"],
    keys: ["BOE developed per CLIN", "Labor categories and rates applied", "Material and subcontract costs", "Subcontracting plan if required"],
    faNarrative:
      "Audit report drives every pricing decision. CLIN quantities resolved before estimating. FOB confirmed. Document type determines strategy: SOW = compliance-first, PWS = outcome innovation, SOO = propose your own PWS. Section M evaluation factors extracted and weighted.",
    faHook: "Audit report drives pricing — before the spreadsheet opens",
    outputs: ["CLIN pricing guidance", "Section L checklist", "Section M response outline", "Risk-adjusted BOE inputs"],
    outcomes: ["Defensible pricing", "Compliant submission"],
    clauses: [{ n: "52.215-14", t: "Integrity of Unit Prices — cost/pricing data certification", kind: "required" }],
    risks: []
  },
  {
    num: "05",
    label: "Submission",
    title: "Quote / proposal submitted",
    sub: "Delivered to CO by deadline · In English · In USD",
    faPresent: true,
    whats: ["Submit by hard deadline", "Email to both CO contacts", "SAM.gov registration current", "Reps and certs signed"],
    keys: ["SF 1449 completed", "USD only (FAR 52.214-35)", "English only (FAR 52.214-34)", "Buy American cert (52.225-4)", "Telecom rep (252.204-7017)"],
    faNarrative:
      "Pre-submission checklist derived from audit report. Every clause with an offeror action confirmed complete. Deadline, email addresses, currency and language requirements extracted and verified. No late or non-compliant submissions.",
    faHook: "Pre-submission compliance checklist — zero gaps",
    outputs: ["Pre-submission checklist", "Both CO emails confirmed", "Deadline + time zone verified", "Reps and certs status"],
    outcomes: ["On-time delivery", "Compliant package"],
    clauses: [
      { n: "52.214-34", t: "Submission in English — mandatory", kind: "required" },
      { n: "52.214-35", t: "Submission in USD — mandatory", kind: "required" },
      { n: "52.204-7", t: "SAM.gov Registration — current at submission", kind: "required" },
      { n: "252.204-7017", t: "Covered Telecom Representation — offeror certification", kind: "required" }
    ],
    risks: [
      {
        t: "Submitting after deadline (CDT vs EDT)",
        severity: "P0",
        d: '"12:00 PM CDT" — Eastern time contractor who reads this as noon Eastern submits one hour late. Rejected without exception.',
        a: "FARaudit: Deadline flagged with explicit time zone in all three zones. No ambiguity."
      },
      {
        t: "Missing MFG name or part number",
        severity: "P1",
        d: "Special Note 6 requires: (1) MFG name (2) part number (3) illustrations (4) literature. Missing any = non-responsive.",
        a: "FARaudit: Note 6 extracted and added to checklist as four explicit line items."
      }
    ]
  },
  {
    num: "06",
    label: "Evaluation",
    title: "Government evaluation",
    sub: "LPTA or Best Value · Technical acceptability first",
    faPresent: true,
    whats: ["CO evaluates technical volumes", "Price reasonableness vs IGE", "Responsibility determination", "Award decision finalized"],
    keys: ["Rating: Acceptable / Unacceptable", "Past performance if Section M requires", "Price vs IGE compared", "Small business status verified"],
    faNarrative:
      "SOW Influence Tracker activates. Cross-references RFI response from Stage 02 against the final SOW. Computes match score 0–100 and identifies specific phrases that carried through. This is the ROI demonstration that justifies the subscription and creates the renewal conversation.",
    faHook: "SOW Influence Tracker — closes the loop, proves ROI",
    outputs: ["Match score 0–100", "Phrases that carried through", "Risk flags that became requirements", "Competitive positioning report"],
    outcomes: ["ROI demonstrated", "Advantage documented"],
    clauses: [
      { n: "FAR 15.305", t: "Proposal Evaluation — technical factors and procedures", kind: "reference" },
      { n: "52.219-6", t: "Total Small Business Set-Aside — eligibility at evaluation", kind: "required" }
    ],
    risks: [
      {
        t: "Technical unacceptability — missed Section M factor",
        severity: "P0",
        d: "LPTA evaluation is binary: Acceptable or Unacceptable. One missed mandatory Section M factor = rejected regardless of price.",
        a: "FARaudit: Section M factors extracted in Call 1 and mapped to Section L. Proposal outline explicitly aligns each."
      }
    ]
  },
  {
    num: "07",
    label: "Award",
    title: "Contract award · Performance begins",
    sub: "Purchase Order or Contract issued · WAWF invoicing active",
    faPresent: true,
    whats: ["CO issues award", "Contractor countersigns", "Performance period begins", "WAWF registration confirmed"],
    keys: ["Contract number assigned", "DoDAAC codes confirmed", "Delivery schedule tracked", "Modifications analyzed"],
    faNarrative:
      "Post-award compliance monitoring. WAWF routing codes verified — DoDAAC F87700 (pay official), FA3016 (admin), F3PT73 (inspect/ship-to). Delivery tracked against Section F. FARaudit flags recompete timeline 180 days before contract expiration.",
    faHook: "Post-award compliance + recompete intelligence",
    outputs: ["WAWF routing verification", "Delivery schedule tracker", "Modification analysis", "Recompete alert (180d)"],
    outcomes: ["On-time invoicing", "Delivery compliance"],
    clauses: [
      { n: "252.232-7006", t: "WAWF Payment Instructions — Combo document type for fixed-price", kind: "required" },
      { n: "252.232-7003", t: "Electronic Submission of Payment Requests — mandatory WAWF", kind: "required" },
      { n: "5352.242-9000", t: "Contractor Access to Air Force Installations — base pass required", kind: "required" }
    ],
    risks: [
      {
        t: "Wrong WAWF document type",
        severity: "P1",
        d: "Fixed-price deliverables must use Combo in WAWF. Using Invoice 2in1 triggers rejection and restarts 30-day payment clock.",
        a: "FARaudit: Combo confirmed for all physical CLINs. DoDAAC codes pre-populated in checklist."
      },
      {
        t: "Missing base access form — delivery blocked",
        severity: "P1",
        d: "5352.242-9000 requires written request on company letterhead before delivery. Showing up without it = rejected.",
        a: "FARaudit: Clause flagged in Call 2. Base access template extracted and added to post-award checklist."
      }
    ]
  }
];

const clauseStyle: Record<Clause["kind"], { bg: string; color: string; label: string }> = {
  trap: { bg: "rgba(200,77,77,0.14)", color: RED, label: "Trap" },
  required: { bg: "rgba(212,160,50,0.14)", color: AMBER, label: "Required" },
  reference: { bg: "rgba(90,127,160,0.14)", color: TEXT_2, label: "Reference" }
};

export default function HowItWorksPage() {
  return (
    <main style={{ background: BG, color: TEXT_1, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <style>{`
        a { transition: color .15s ease, opacity .15s ease, background .15s ease; }
        .h-cta { transition: filter .15s ease, transform .15s ease; }
        .h-cta:hover { filter: brightness(1.1); transform: translateY(-1px); }
        ::selection { background: ${GOLD}; color: ${BG}; }
      `}</style>

      {/* Header nav — matches landing */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "16px 32px",
          background: "rgba(3,8,15,0.84)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(196,164,74,0.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 20, color: TEXT_1, letterSpacing: "-0.01em" }}>FARaudit</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 13, color: TEXT_2 }}>
          <Link href="/how-it-works" style={{ color: TEXT_1, textDecoration: "none", fontWeight: 500 }}>How it works</Link>
          <Link href="/pricing" style={{ color: TEXT_2, textDecoration: "none" }}>Pricing</Link>
          <Link href="/login" style={{ color: TEXT_2, textDecoration: "none" }}>Sign in</Link>
          <Link
            href="/audit"
            className="h-cta"
            style={{ background: GOLD, color: BG, padding: "9px 18px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 13, textDecoration: "none" }}
          >
            Request Access
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "80px 32px 60px", maxWidth: 1080, margin: "0 auto" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.22em", color: TEXT_3, textTransform: "uppercase", marginBottom: 16 }}>
          Federal Acquisition Lifecycle · 8 Stages
        </p>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "clamp(36px, 5.5vw, 60px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.025em", marginBottom: 24, color: TEXT_1 }}>
          The complete<br />acquisition lifecycle.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, color: TEXT_2, maxWidth: 680, fontWeight: 300, marginBottom: 28 }}>
          From the first government signal to contract award. Most contractors live in stages 03–07. FARaudit covers seven of eight — starting 60–90 days earlier than any competitor at Stage 01.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/audit"
            className="h-cta"
            style={{ background: GOLD, color: BG, padding: "14px 26px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            Request Access →
          </Link>
          <Link
            href="/pricing"
            className="h-cta"
            style={{ border: "1px solid rgba(255,255,255,0.14)", color: TEXT_1, padding: "13px 26px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Coverage strip */}
      <section style={{ padding: "0 32px 40px", maxWidth: 1080, margin: "0 auto" }}>
        <div
          style={{
            background: SURFACE,
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            padding: "18px 22px",
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.18em", color: TEXT_3, textTransform: "uppercase" }}>FARaudit Coverage</span>
            <span style={{ fontSize: 14, color: TEXT_1 }}>
              <strong style={{ color: GOLD }}>Stages 01–07</strong> · 7 of 8 · only Stage 00 is internal to the agency
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.18em", color: TEXT_3, textTransform: "uppercase" }}>Competitor Coverage</span>
            <span style={{ fontSize: 14, color: TEXT_2 }}>Starts at Stage 03 · solicitation already public · advantage gone</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.18em", color: TEXT_3, textTransform: "uppercase" }}>Lead Time</span>
            <span style={{ fontSize: 14, color: TEXT_1 }}>
              <strong style={{ color: GREEN }}>60–90 days</strong> head start
            </span>
          </div>
        </div>
      </section>

      {/* 8 stage cards */}
      <section style={{ padding: "20px 32px 80px", maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {STAGES.map((s) => (
          <article
            key={s.num}
            style={{
              background: SURFACE,
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              overflow: "hidden",
              opacity: s.faPresent ? 1 : 0.78
            }}
          >
            {/* Stage header */}
            <header
              style={{
                padding: "18px 24px",
                background: s.faPresent ? "linear-gradient(135deg, rgba(196,164,74,0.10), rgba(3,8,15,0))" : "rgba(255,255,255,0.02)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "flex-start",
                gap: 18,
                flexWrap: "wrap"
              }}
            >
              <div
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                  fontWeight: 700,
                  color: s.faPresent ? GOLD : TEXT_3,
                  letterSpacing: "0.04em",
                  border: `1px solid ${s.faPresent ? "rgba(196,164,74,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 4,
                  padding: "5px 10px",
                  flexShrink: 0
                }}
              >
                STAGE {s.num}
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 600, color: TEXT_1, margin: "0 0 4px" }}>{s.title}</h2>
                <p style={{ fontSize: 12, color: TEXT_2, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.02em", margin: 0 }}>{s.sub}</p>
              </div>
              {s.faPresent ? (
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 600, color: GREEN, background: "rgba(40,176,106,0.14)", border: "1px solid rgba(40,176,106,0.3)", padding: "5px 9px", borderRadius: 4, letterSpacing: "0.06em" }}>FARaudit ACTIVE</span>
              ) : (
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 600, color: TEXT_3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "5px 9px", borderRadius: 4, letterSpacing: "0.06em" }}>AGENCY-INTERNAL</span>
              )}
            </header>

            {/* Body */}
            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
              {/* Two-col: what's happening / key docs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 22 }}>
                <div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.16em", color: TEXT_3, textTransform: "uppercase", marginBottom: 8 }}>What&apos;s happening</div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {s.whats.map((it) => (
                      <li key={it} style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.55, paddingLeft: 16, position: "relative" }}>
                        <span style={{ position: "absolute", left: 0, color: TEXT_3 }}>·</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.16em", color: TEXT_3, textTransform: "uppercase", marginBottom: 8 }}>Key documents &amp; actions</div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {s.keys.map((it) => (
                      <li key={it} style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.55, paddingLeft: 16, position: "relative" }}>
                        <span style={{ position: "absolute", left: 0, color: TEXT_3 }}>·</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* FARaudit narrative */}
              {s.faNarrative ? (
                <div
                  style={{
                    background: s.faPresent ? "rgba(196,164,74,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${s.faPresent ? "rgba(196,164,74,0.16)" : "rgba(255,255,255,0.05)"}`,
                    borderRadius: 8,
                    padding: "14px 16px"
                  }}
                >
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.16em", color: s.faPresent ? GOLD : TEXT_3, textTransform: "uppercase", marginBottom: 8 }}>
                    {s.faPresent ? "FARaudit at this stage" : "FARaudit at this stage"}
                  </div>
                  <p style={{ fontSize: 13, color: TEXT_1, lineHeight: 1.65, margin: 0 }}>{s.faNarrative}</p>
                  {s.faHook ? (
                    <p style={{ fontSize: 12, color: GOLD, marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>→ {s.faHook}</p>
                  ) : null}
                </div>
              ) : null}

              {/* Outputs + outcomes */}
              {s.outputs.length || s.outcomes.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 22 }}>
                  {s.outputs.length ? (
                    <div>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.16em", color: TEXT_3, textTransform: "uppercase", marginBottom: 8 }}>Outputs</div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.outputs.map((it) => (
                          <li key={it} style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.5, paddingLeft: 16, position: "relative" }}>
                            <span style={{ position: "absolute", left: 0, color: GOLD }}>→</span>
                            {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {s.outcomes.length ? (
                    <div>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.16em", color: TEXT_3, textTransform: "uppercase", marginBottom: 8 }}>Outcomes</div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.outcomes.map((it) => (
                          <li key={it} style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.5, paddingLeft: 16, position: "relative" }}>
                            <span style={{ position: "absolute", left: 0, color: GREEN }}>✓</span>
                            {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* FAR/DFARS clauses */}
              {s.clauses.length ? (
                <div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.16em", color: TEXT_3, textTransform: "uppercase", marginBottom: 10 }}>FAR / DFARS clauses</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {s.clauses.map((c) => {
                      const cs = clauseStyle[c.kind];
                      return (
                        <div
                          key={c.n}
                          style={{
                            background: SURFACE_2,
                            border: "1px solid rgba(255,255,255,0.05)",
                            borderRadius: 6,
                            padding: "10px 14px",
                            display: "flex",
                            gap: 14,
                            alignItems: "center",
                            flexWrap: "wrap"
                          }}
                        >
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: TEXT_1, fontWeight: 500, minWidth: 110 }}>{c.n}</span>
                          <span style={{ fontSize: 12.5, color: TEXT_2, flex: 1, minWidth: 200 }}>{c.t}</span>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 600, color: cs.color, background: cs.bg, padding: "3px 8px", borderRadius: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{cs.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Risk flags */}
              {s.risks.length ? (
                <div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.16em", color: TEXT_3, textTransform: "uppercase", marginBottom: 10 }}>Risk flags</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {s.risks.map((r) => {
                      const isP0 = r.severity === "P0";
                      const sevColor = isP0 ? RED : AMBER;
                      const sevBg = isP0 ? "rgba(200,77,77,0.10)" : "rgba(212,160,50,0.10)";
                      return (
                        <div
                          key={r.t}
                          style={{
                            background: sevBg,
                            border: `1px solid ${isP0 ? "rgba(200,77,77,0.22)" : "rgba(212,160,50,0.22)"}`,
                            borderRadius: 8,
                            padding: "12px 14px"
                          }}
                        >
                          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, color: sevColor, letterSpacing: "0.08em" }}>{r.severity}</span>
                            <span style={{ fontSize: 13, color: TEXT_1, fontWeight: 500 }}>{r.t}</span>
                          </div>
                          <p style={{ fontSize: 12.5, color: TEXT_2, lineHeight: 1.55, margin: "0 0 6px" }}>{r.d}</p>
                          <p style={{ fontSize: 12, color: GOLD, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>{r.a}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      {/* CTA */}
      <section style={{ padding: "0 32px 100px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ background: SURFACE, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "40px 32px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 28, fontWeight: 600, color: TEXT_1, margin: "0 0 12px" }}>Ready to see it on a real solicitation?</h2>
          <p style={{ fontSize: 15, color: TEXT_2, lineHeight: 1.6, maxWidth: 520, margin: "0 auto 24px" }}>
            Upload an active RFQ, RFP, or IFB. Three-call audit returns CLIN ambiguities, FAR/DFARS compliance, and DFARS trap detection in under 4 minutes.
          </p>
          <Link
            href="/audit"
            className="h-cta"
            style={{ display: "inline-block", background: GOLD, color: BG, padding: "14px 28px", borderRadius: 6, fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            Request Access →
          </Link>
        </div>
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
