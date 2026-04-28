"use client";

import Link from "next/link";
import { useState } from "react";

const BG = "#03080f";
const SURFACE = "#06101a";
const TEXT_1 = "#e2eaf4";
const TEXT_2 = "#5a7fa0";
const TEXT_3 = "#3d5b75";
const GOLD = "#c4a44a";

const TOUR = [
  {
    n: "01",
    title: "Upload a solicitation",
    body: "Drop the PDF on /audit. We accept FBO/SAM RFQ/RFP/IFB packages up to 50MB. Multi-volume? Concatenate first or upload Section L/M separately."
  },
  {
    n: "02",
    title: "Read the audit summary",
    body: "Top of the report shows: solicitation number, agency, NAICS, set-aside, due date, and a P0/P1/P2 trap count. P0 = bid-killing, P1 = scoring risk, P2 = nice-to-fix."
  },
  {
    n: "03",
    title: "Hit every DFARS trap",
    body: "We scan for the 6 most-missed DFARS clauses (252.223-7008 hex chrome, 7018 covered defense info, 7021 cyber maturity, 7060 substitution, plus CLIN ambiguity and Section L page-limit conflicts)."
  },
  {
    n: "04",
    title: "Generate KO clarifications",
    body: "Each P0 trap auto-drafts an email to the contracting officer. Plain-text, government-grade tone, ready to send through the Q&A portal."
  },
  {
    n: "05",
    title: "Win the bid",
    body: "Use the proposal strategy block (Growth tier) to align Section L compliance with Section M evaluation factors. Bid with leverage, not hope."
  }
];

const MODULES = [
  {
    title: "FAR vs DFARS — what's the difference?",
    body: "FAR (Federal Acquisition Regulation) applies to all federal procurement. DFARS (Defense FAR Supplement) layers DoD-specific rules on top. If your solicitation cites a DFARS clause, treat it as authoritative for DoD work; FAR fills the gaps. Common DFARS pain points: 252.204-7012 (covered defense info safeguarding), 252.225-7001 (Buy American), 252.225-7048 (export control)."
  },
  {
    title: "Sections L and M — what to read first",
    body: "Section L = instructions to offerors (how to submit). Section M = evaluation factors (how the government scores). Always cross-reference: every Section L requirement should map to a Section M factor. If it doesn't, ask the KO. Page limits, font sizes, format requirements — Section L violations are non-discretionary; the KO will reject the proposal even if technically superior."
  },
  {
    title: "How to read CLINs without losing your mind",
    body: "CLINs (Contract Line Item Numbers) define what you're being paid for. Watch for: FOB Origin vs Destination conflicts (who pays freight?), FFP vs T&M mixing within one CLIN (illegal), Option Year structure (CLIN 0001 base, 1001 option year 1, 2001 option year 2). Sub-CLINs use letter suffixes (0001AA). When in doubt, ask the KO via Q&A — never assume."
  },
  {
    title: "Set-asides and certifications — what unlocks what",
    body: "8(a), HUBZone, SDVOSB, WOSB, EDWOSB, VOSB, Total Small Business, Small Disadvantaged Business — each unlocks a different bid pool. Re-cert annually via SAM.gov. NAICS code drives the size standard ($-revenue or employee count). One missed cert = ineligible bid. Track expiration dates 90 days out."
  }
];

const GLOSSARY = [
  ["KO", "Contracting Officer — the only person legally allowed to commit the government to a contract."],
  ["COR", "Contracting Officer's Representative — technical liaison; can clarify but not commit."],
  ["RFQ", "Request for Quote — informal price solicitation, usually under simplified acquisition threshold."],
  ["RFP", "Request for Proposal — formal solicitation, usually best-value with technical evaluation."],
  ["IFB", "Invitation for Bid — sealed bid, lowest price wins, no negotiation."],
  ["BPA", "Blanket Purchase Agreement — preset terms, ordered against over time."],
  ["IDIQ", "Indefinite Delivery / Indefinite Quantity — task-order vehicle; min/max ceiling."],
  ["GSA Schedule", "Pre-negotiated price list; contracting shortcut for federal buyers."],
  ["NAICS", "North American Industry Classification System — drives small business size standards."],
  ["CAGE Code", "Commercial and Government Entity code — your federal vendor ID."],
  ["UEI", "Unique Entity ID — replaced DUNS in 2022; required in SAM.gov."],
  ["FAR 52.204-25", "Section 889 — bans Huawei/ZTE telecom from federal contracts."],
  ["DFARS 252.204-7012", "Cyber clause — requires NIST 800-171 compliance for DoD contractors."],
  ["DFARS 252.223-7008", "Hex chrome prohibition — no hexavalent chromium without KO approval."]
];

export default function LearnPage() {
  const [openModule, setOpenModule] = useState<number | null>(0);
  const [openTour, setOpenTour] = useState<number | null>(0);

  return (
    <main style={{ background: BG, minHeight: "100vh", padding: "80px 40px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <Link href="/" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT_3, textDecoration: "none" }}>
          ← FARaudit
        </Link>

        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_2, letterSpacing: "0.22em", textTransform: "uppercase", margin: "24px 0 12px" }}>
          Learn
        </p>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 44, fontWeight: 700, color: TEXT_1, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 14 }}>
          Federal contracts,<br /><span style={{ color: GOLD }}>decoded.</span>
        </h1>
        <p style={{ fontSize: 16, color: TEXT_2, marginBottom: 52, maxWidth: 600, lineHeight: 1.7, fontWeight: 300 }}>
          Five steps to your first audit. Four modules on the FAR/DFARS landscape. A glossary you'll actually use.
        </p>

        <Section label="Tour">
          {TOUR.map((step, i) => (
            <Card
              key={step.n}
              n={step.n}
              title={step.title}
              body={step.body}
              open={openTour === i}
              onClick={() => setOpenTour(openTour === i ? null : i)}
            />
          ))}
        </Section>

        <Section label="Modules">
          {MODULES.map((m, i) => (
            <Card
              key={m.title}
              n={`0${i + 1}`}
              title={m.title}
              body={m.body}
              open={openModule === i}
              onClick={() => setOpenModule(openModule === i ? null : i)}
            />
          ))}
        </Section>

        <Section label="Glossary">
          <div style={{ background: SURFACE, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
            {GLOSSARY.map(([term, def]) => (
              <div key={term} style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 16 }}>
                <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: GOLD }}>{term}</p>
                <p style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.6 }}>{def}</p>
              </div>
            ))}
          </div>
        </Section>

        <div style={{ marginTop: 48, padding: "20px 24px", background: "rgba(196,164,74,0.08)", border: `1px solid ${GOLD}33`, borderRadius: 10 }}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: GOLD, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
            Ready
          </p>
          <p style={{ fontSize: 16, color: TEXT_1, marginBottom: 12, lineHeight: 1.5 }}>
            Upload your first solicitation. Free. No card.
          </p>
          <Link href="/audit" style={{ display: "inline-block", padding: "10px 20px", background: GOLD, color: BG, textDecoration: "none", fontFamily: "Syne, sans-serif", fontSize: 13, fontWeight: 600, borderRadius: 6 }}>
            Start free audit →
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_3, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
        {label}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Card({ n, title, body, open, onClick }: { n: string; title: string; body: string; open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: SURFACE,
        border: open ? `1px solid ${GOLD}55` : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "16px 20px",
        cursor: "pointer",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "inherit"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: GOLD, flexShrink: 0 }}>{n}</p>
        <p style={{ fontSize: 14, color: TEXT_1, flex: 1, fontWeight: 500 }}>{title}</p>
        <p style={{ color: TEXT_3, fontSize: 18 }}>{open ? "−" : "+"}</p>
      </div>
      {open && (
        <p style={{ marginTop: 12, marginLeft: 27, fontSize: 13, color: TEXT_2, lineHeight: 1.7 }}>{body}</p>
      )}
    </button>
  );
}
