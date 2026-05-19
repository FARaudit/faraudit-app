"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auditDisplayName, displaySolicitationId } from "@/lib/audit-display";
import FeedbackWidget from "@/app/_components/feedback-widget";

interface PrioritizedRisk {
  text: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  citation?: string;
  recommended_action?: string;
}

interface CLIN {
  clin?: string;
  description?: string;
  quantity?: string | number;
  unit?: string;
  fob?: string;
  pricing_arrangement?: string;
  status?: "ok" | "ambiguous" | "conflict";
  notes?: string;
}

interface DFARSFlag {
  clause: string;
  title: string;
  detected: boolean;
  severity: "P0" | "P1" | "P2";
}

interface Props {
  audit: Record<string, unknown>;
  userEmail: string;
}

function asStringList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x.trim() : JSON.stringify(x))).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || /^(none|n\/a)$/i.test(s)) return [];
    return s.includes(",") ? s.split(",").map((x) => x.trim()).filter(Boolean) : [s];
  }
  return [String(v)];
}

function deriveRisks(risks: Record<string, unknown>): PrioritizedRisk[] {
  if (Array.isArray(risks.prioritized_risks)) {
    return (risks.prioritized_risks as PrioritizedRisk[]).filter((r) => r && typeof r.text === "string" && r.text.trim());
  }
  const out: PrioritizedRisk[] = [];
  const push = (arr: unknown, priority: PrioritizedRisk["priority"], category: string) => {
    if (!Array.isArray(arr)) return;
    for (const r of arr) {
      if (typeof r === "string" && r.trim()) {
        const cite = r.match(/((?:FAR|DFARS)\s*\d+\.\d+(?:-\d+)?)/i)?.[1];
        out.push({ text: r, priority, category, citation: cite });
      }
    }
  };
  push(risks.top_3_risks, "P0", "Deal-breaker");
  push(risks.technical_risks, "P1", "Technical");
  push(risks.schedule_risks, "P1", "Schedule");
  push(risks.price_risks, "P1", "Price");
  push(risks.evaluation_risks, "P2", "Evaluation");
  const seen = new Set<string>();
  const order = { P0: 0, P1: 1, P2: 2 } as const;
  return out
    .filter((r) => {
      const k = r.text.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => order[a.priority] - order[b.priority]);
}

// Audit detail pages reuse the home shell (topbar + sidebar) so users keep
// the same navigation context after drilling into an audit. Nav items are
// plain anchors to /home#tab — HomeClient's hashchange listener picks up
// the hash on load and activates the right tab.
function AuditTopbar({ userEmail, solicitationId }: { userEmail: string; solicitationId: string }) {
  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "U";
  const handle = userEmail ? userEmail.split("@")[0] : "user";
  return (
    <div className="topbar">
      <div className="tb-brand">
        <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
          <path d="M14 2L24 7V15C24 20.5 19.5 25 14 26C8.5 25 4 20.5 4 15V7L14 2Z" stroke="#C9A84C" strokeWidth="1.4" fill="rgba(201,168,76,.1)" opacity=".9"/>
          <line x1="10" y1="13" x2="18" y2="13" stroke="#C9A84C" strokeWidth=".9" opacity=".7"/>
          <line x1="10" y1="16" x2="16" y2="16" stroke="#C9A84C" strokeWidth=".9" opacity=".5"/>
        </svg>
        <div className="tb-wordmark">FAR<span>audit</span></div>
      </div>
      <div className="tb-center">
        <div className="tb-stats">Audit · {solicitationId}</div>
      </div>
      <div className="tb-right">
        <FeedbackWidget userEmail={userEmail || null} />
        <a className="tb-user" href="/home" title={userEmail || "Back to intelligence home"}>
          <div className="user-av">{initials}</div>
          <div className="user-nm">{handle}</div>
        </a>
      </div>
    </div>
  );
}

const SIDEBAR_ANCHOR_STYLE: React.CSSProperties = { textDecoration: "none" };

function AuditSidebar() {
  return (
    <div className="sidebar">
      <div className="nav-label">Workspace</div>
      <a href="/home#home" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        Today
      </a>
      <a href="/home#audit" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M4 2h8l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          <line x1="6" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/>
          <line x1="6" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/>
        </svg>
        Run Audit
      </a>
      <a href="/home#past-audits" className="nav-item active" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
          <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Past Audits
      </a>
      <a href="/home#pipeline" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <polyline points="2,11 5,7 8,9 11,4 14,6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Pipeline
      </a>
      <a href="/home#capability" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2"/>
          <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Capability Statement
      </a>

      <div className="nav-label">Intelligence</div>
      <a href="/home#opportunities" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Opportunities
      </a>
      <a href="/home#defense-spending" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="8" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        Defense Spending
      </a>
      <a href="/home#news" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M2 2h12v2L8 10 2 4V2z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Defense News
      </a>
      <a href="/home#contracting-officers" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M3 14c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Contracting Officers
      </a>
      <a href="/home#agencies" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M2 14h12M3 14V6l5-3 5 3v8M6 14V9h4v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Agencies
      </a>
      <a href="/home#protests" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        GAO Protests
      </a>
      <a href="/home#regulatory" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          <line x1="6" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="6" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        FAR/DFARS Updates
      </a>
      <a href="/home#cmmc" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L13 4V8C13 11 11 13 8 14C5 13 3 11 3 8V4L8 2Z" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M6 8l1.5 1.5L10 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        CMMC Readiness
      </a>
      <a href="/home#wages" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M2 13h12M3 13V8h2v5M7 13V5h2v8M11 13v-3h2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Wage Benchmarks
      </a>
      <a href="/home#teaming" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
          <circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M2 13c0-2 1.5-3 3-3s3 1 3 3M8 13c0-2 1.5-3 3-3s3 1 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Teaming Partners
      </a>

      <div className="nav-label">Account</div>
      <a href="/settings" className="nav-item" style={SIDEBAR_ANCHOR_STYLE}>
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Profile &amp; Settings
      </a>
    </div>
  );
}

export default function AuditReport({ audit, userEmail: _userEmail }: Props) {
  const id = String(audit.id ?? "");
  const noticeId = (audit.notice_id as string) || "—";
  const displayId = displaySolicitationId({
    solicitation_number: audit.solicitation_number as string | null | undefined,
    notice_id: audit.notice_id as string | null | undefined,
    title: audit.title as string | null | undefined
  });
  // auditDisplayName masks UUID/hex/pdf-timestamp leaks and falls back to a
  // humanized "Untitled audit · {timestamp}" instead of bare "Untitled
  // solicitation". Same helper used across Pipeline + Recent Audits + Past
  // Audits + Capability past-perf surfaces (P0-D / P0-D.5).
  const title = auditDisplayName({
    title: audit.title as string | null | undefined,
    notice_id: audit.notice_id as string | null | undefined,
    solicitation_number: audit.solicitation_number as string | null | undefined,
    created_at: audit.created_at as string | null | undefined
  });
  const agency = (audit.agency as string) || "—";
  const naics = (audit.naics_code as string) || "";
  const setAside = (audit.set_aside as string) || "";
  const score = typeof audit.compliance_score === "number" ? (audit.compliance_score as number) : 0;
  const recommendation = (audit.recommendation as string) || "";
  const docType = (audit.document_type as string) || "Other";
  const docTypeRationale = (audit.document_type_rationale as string) || "";
  const docTypeConfidence = ((audit.document_type_confidence as string) || "low").toLowerCase();
  const bidRecommendation = (audit.bid_recommendation as string) || "";
  const status = (audit.status as string) || "complete";
  const overviewJson = (audit.overview_json as Record<string, unknown>) || {};
  const compJson = (audit.compliance_json as Record<string, unknown>) || {};
  const risksJson = (audit.risks_json as Record<string, unknown>) || {};

  const farClauses = asStringList(compJson.far_clauses);
  const dfarsClauses = asStringList(compJson.dfars_clauses);
  const dfarsFlags: DFARSFlag[] = Array.isArray(compJson.dfars_flags)
    ? (compJson.dfars_flags as DFARSFlag[])
    : [];
  const trapCount = dfarsFlags.filter((f) => f.detected).length;
  const pdfSource = (compJson.pdf_source as string | undefined) || undefined;
  const isMetadataOnly = pdfSource === "sam_unavailable";

  const clins: CLIN[] = Array.isArray(compJson.clins) ? (compJson.clins as CLIN[]) : [];

  const risks = deriveRisks(risksJson);
  const strengths = asStringList(overviewJson.key_strengths || risksJson.strengths);
  const nextSteps = asStringList(overviewJson.next_steps || compJson.key_compliance_actions);

  const verdictKind = recommendation === "PROCEED" ? "bid" : recommendation === "DECLINE" ? "decline" : "caution";
  const verdictLabel = recommendation === "PROCEED" ? "BID" : recommendation === "DECLINE" ? "DECLINE" : "CAUTION";
  const verdictColor = verdictKind === "bid" ? "var(--green)" : verdictKind === "decline" ? "var(--red)" : "var(--amber)";

  return (
    <div className="bd-home audit-detail">
      <div className="app">
        <AuditTopbar userEmail={_userEmail} solicitationId={displayId} />
        <AuditSidebar />
        <div className="main">
          <div className="report-page">
            <header className="report-header">
              <a className="report-back" href="/home">← Intelligence Home</a>
          <div className="report-title">
            <div className="report-title-id">{displayId}</div>
            <div className="report-title-agency">
              {agency}{naics ? ` · NAICS ${naics}` : ""}{setAside ? ` · ${setAside}` : ""}
            </div>
          </div>
          <div className="report-actions">
            <ScoreGauge score={score} />
            <WinProbabilityBadge auditId={id} cached={typeof audit.win_probability === "number" ? (audit.win_probability as number) : null} cachedBasis={typeof audit.win_probability_basis === "number" ? (audit.win_probability_basis as number) : null} />
            <span className="verdict-pill" style={{ color: verdictColor, borderColor: verdictColor, background: `${verdictColor}10` }}>
              {verdictLabel}
            </span>
            <a className="action-btn" href={`/api/audit/${id}/pdf`} download>
              ↓ PDF Export
            </a>
            <KOEmailButton auditId={id} />
          </div>
        </header>

        {isMetadataOnly && (
          <div
            style={{
              margin: "0 0 18px",
              padding: "10px 14px",
              border: "1px solid var(--amber)",
              background: "rgba(245,158,11,.06)",
              color: "var(--amber)",
              borderRadius: 4,
              fontFamily: "var(--mono)",
              fontSize: 11,
              lineHeight: 1.5,
              fontWeight: 600,
              letterSpacing: ".02em"
            }}
          >
            Metadata-only audit · Solicitation document not retrievable from SAM. Upload PDF to unlock full FAR/DFARS clause inventory.
          </div>
        )}

        <div className="report-body">
          {/* Title + meta */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 700, color: "var(--text)", lineHeight: 1.15, letterSpacing: "-.01em", margin: 0 }}>
              {title}
            </h1>
          </div>

          {status === "processing" && (
            <div className="report-section" style={{ borderColor: "var(--amber)", background: "rgba(245,158,11,.04)" }}>
              <div className="report-section-eyebrow" style={{ color: "var(--amber)" }}>In progress</div>
              <div className="report-section-title">Audit running…</div>
              <p className="empty-block">Refresh in a few seconds.</p>
            </div>
          )}

          {status === "failed" && (
            <div className="report-section" style={{ borderColor: "var(--red)", background: "rgba(220,38,38,.05)" }}>
              <div className="report-section-eyebrow" style={{ color: "var(--red)" }}>Audit failed</div>
              <p className="empty-block">{(audit.error_message as string) || "Unknown error"}</p>
            </div>
          )}

          {status === "complete" && (
            <>
              <ProcessFlow />

              <KOCard
                auditId={id}
                agency={agency}
                noticeId={noticeId}
                displayId={displayId}
                koEmailFromAudit={(audit.ko_email_recipient as string) || (compJson.ko_email as string) || ""}
                koNameFromAudit={(audit.ko_name as string) || (compJson.ko_name as string) || ""}
              />

              <IncumbentCard
                noticeId={noticeId}
                initial={{
                  name: (audit.incumbent_name as string) || null,
                  award_value: typeof audit.incumbent_award_value === "number" ? (audit.incumbent_award_value as number) : null,
                  expiry: (audit.incumbent_expiry as string) || null,
                  uei: (audit.incumbent_uei as string) || null,
                  looked_up_at: (audit.incumbent_lookup_at as string) || null
                }}
              />

              {/* SECTION 1 — Document Classification */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 1 · Classification</div>
                <h2 className="report-section-title">Document type</h2>
                <div className="classify-grid">
                  <div className="classify-badge">{docType}</div>
                  <div>
                    <p className="classify-rationale">{docTypeRationale || "No rationale recorded."}</p>
                    <span className={`classify-confidence confidence-${docTypeConfidence}`}>
                      Confidence · {docTypeConfidence}
                    </span>
                  </div>
                </div>
                <div className="classify-callout">
                  <strong>Why this matters:</strong> SOW = comply precisely · PWS = innovate on outcomes · SOO = propose your own approach.
                </div>
              </section>

              {/* SECTION 2 — Overview / CLINs */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 2 · Overview</div>
                <h2 className="report-section-title">CLIN structure &amp; scope</h2>
                <OverviewSummary data={overviewJson} />
                {clins.length === 0 ? (
                  <p className="empty-block">No CLIN structure parsed by the audit engine.</p>
                ) : (
                  <div style={{ marginTop: 14 }}>
                    {clins.map((c, i) => <CLINCard key={i} clin={c} />)}
                  </div>
                )}
              </section>

              {/* SECTION 3 — Compliance */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 3 · Compliance</div>
                <h2 className="report-section-title">FAR / DFARS</h2>
                {farClauses.length === 0 && dfarsClauses.length === 0 ? (
                  isMetadataOnly ? (
                    <p className="empty-block" style={{ marginTop: 12, lineHeight: 1.55 }}>
                      Clause inventory requires the full RFP PDF. Download the solicitation from SAM.gov and re-upload here for clause-by-clause compliance audit.
                    </p>
                  ) : (
                    <p className="empty-block" style={{ marginTop: 12, lineHeight: 1.55 }}>
                      No FAR or DFARS clauses were extracted from this document. The audit ran with a PDF, so the engine attempted full clause extraction — review the PDF directly to confirm.
                    </p>
                  )
                ) : (
                  <>
                <div className="compliance-summary">
                  <span className="compliance-pill far">{farClauses.length} FAR</span>
                  <span className="compliance-pill dfars">{dfarsClauses.length} DFARS</span>
                  <span className="compliance-pill traps">{trapCount} TRAP{trapCount === 1 ? "" : "S"} DETECTED</span>
                </div>

                <div className="compliance-grid">
                  <div>
                    <div className="clause-list-h">FAR Clauses ({farClauses.length})</div>
                    {farClauses.length === 0 ? (
                      <p className="empty-block">None cited.</p>
                    ) : (
                      farClauses.map((c, i) => (
                        <div key={i} className="clause-row">
                          <span>{c}</span>
                          <span className="clause-tag req">Required</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="clause-list-h">DFARS Clauses ({dfarsClauses.length})</div>
                    {dfarsClauses.length === 0 ? (
                      <p className="empty-block">None cited.</p>
                    ) : (
                      dfarsClauses.map((c, i) => {
                        const isTrap = dfarsFlags.some((f) => f.detected && c.includes(f.clause));
                        return (
                          <div key={i} className={`clause-row${isTrap ? " trap" : ""}`}>
                            <span>{c}</span>
                            <span className={`clause-tag ${isTrap ? "trap" : "req"}`}>{isTrap ? "Trap" : "Required"}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {dfarsFlags.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div className="clause-list-h">DFARS trap detection</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                      {dfarsFlags.map((f) => {
                        const detected = f.detected;
                        const color = detected ? "var(--red)" : "var(--green)";
                        const bg = detected ? "rgba(220,38,38,.06)" : "rgba(74,222,128,.04)";
                        return (
                          <div key={f.clause} style={{ border: `1px solid ${color}`, borderRadius: 3, padding: "10px 12px", background: bg }}>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color, letterSpacing: ".06em" }}>{f.clause}</div>
                            <div style={{ fontFamily: "var(--serif)", fontSize: 13, color: "var(--text)", marginTop: 3 }}>{f.title}</div>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color, letterSpacing: ".12em", marginTop: 6, textTransform: "uppercase" }}>
                              {detected ? "⚠ Detected" : "✓ Not detected"} · {f.severity}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                  </>
                )}
              </section>

              {/* SECTION 4 — Risks */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 4 · Risks</div>
                <h2 className="report-section-title">P0 / P1 / P2 risk register</h2>
                {risks.length === 0 ? (
                  <p className="empty-block">No risks surfaced by the audit engine.</p>
                ) : (
                  risks.map((r, i) => <RiskCard key={i} risk={r} />)
                )}
              </section>

              {/* SECTION 5 — Recommendation */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 5 · Recommendation</div>
                <h2 className="report-section-title">{verdictLabel}</h2>
                <div className={`rec-block ${verdictKind}`}>
                  <div>
                    <div className={`rec-verdict ${verdictKind}`}>{verdictLabel}</div>
                    <div className="rec-score">Score · {score}/100</div>
                  </div>
                  <div className="rec-summary">
                    {bidRecommendation || `${recommendation || "PROCEED_WITH_CAUTION"}. Score ${score}/100.`}
                  </div>
                </div>
                {(strengths.length > 0 || risks.length > 0 || nextSteps.length > 0) && (
                  <div className="checklist">
                    {strengths.length > 0 && (
                      <div>
                        <div className="check-block-h green">Key strengths</div>
                        {strengths.map((s, i) => <div key={i} className="check-row green">{s}</div>)}
                      </div>
                    )}
                    {risks.length > 0 && (
                      <div>
                        <div className="check-block-h red">Key risks</div>
                        {risks.slice(0, 5).map((r, i) => <div key={i} className="check-row red">{r.text}</div>)}
                      </div>
                    )}
                  </div>
                )}
                {nextSteps.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div className="check-block-h" style={{ color: "var(--gold)" }}>Next steps</div>
                    {nextSteps.map((s, i) => (
                      <div key={i} className="check-row" style={{ paddingLeft: 18 }}>· {s}</div>
                    ))}
                  </div>
                )}
              </section>

              {/* SECTION 6 — KO Email */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 6 · Outreach</div>
                <h2 className="report-section-title">Contracting Officer clarification</h2>
                <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--t60)", lineHeight: 1.6, marginBottom: 14 }}>
                  Pre-drafted clarification email built from the ambiguities and risks above. Edit before sending.
                </p>
                <KOEmailComposer auditId={id} initialNoticeId={noticeId} />
              </section>

              {/* SECTION 7 — Notes */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 7 · Team notes</div>
                <h2 className="report-section-title">Private workspace</h2>
                <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--t60)", lineHeight: 1.6, marginBottom: 14 }}>
                  Add internal notes. Auto-saved to FARaudit · never leaves your account.
                </p>
                <NotesEditor auditId={id} initial={(audit.notes as string) || ""} />
              </section>

              {/* SECTION 8 — Outcome Tracker */}
              <section className="report-section">
                <div className="report-section-eyebrow">Section 8 · Track outcome</div>
                <h2 className="report-section-title">Bid lifecycle</h2>
                <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--t60)", lineHeight: 1.6, marginBottom: 14 }}>
                  Mark KO contact, bid submission, and final outcome. Pipeline stage updates automatically. Win-rate analytics depend on this data.
                </p>
                <OutcomeTracker
                  auditId={id}
                  initial={{
                    outcome: (audit.outcome as string) || null,
                    outcome_date: (audit.outcome_date as string) || null,
                    ko_contacted: !!audit.ko_contacted,
                    ko_contact_date: (audit.ko_contact_date as string) || null,
                    bid_submitted: !!audit.bid_submitted,
                    bid_submit_date: (audit.bid_submit_date as string) || null,
                    team_assignee: (audit.team_assignee as string) || ""
                  }}
                />
                <RichOutcomeCapture
                  auditId={id}
                  outcome={(audit.outcome as string) || null}
                />
              </section>
            </>
          )}
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--amber)" : "var(--red)";
  const dash = Math.max(0, Math.min(100, score)) * 1.57; // r=25, c=2πr≈157
  return (
    <div className="score-gauge" style={{ color }}>
      <svg viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="25" stroke="var(--border)" strokeWidth="2" fill="none" />
        <circle cx="30" cy="30" r="25" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray={`${dash} 157`} strokeLinecap="round" />
      </svg>
      <span className="score-num" style={{ color }}>{score}</span>
    </div>
  );
}

function ProcessFlow() {
  const steps = [
    { label: "Classify", done: true },
    { label: "Overview", done: true },
    { label: "Compliance", done: true },
    { label: "Risks", done: true },
    { label: "Recommendation", done: true, active: true }
  ];
  return (
    <div className="process-flow">
      {steps.map((s, i) => (
        <div key={s.label} className={`process-step ${s.done ? "done" : ""} ${s.active ? "active" : ""}`}>
          <div className="process-step-icon">{s.done ? "✓" : i + 1}</div>
          <div className="process-step-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function OverviewSummary({ data }: { data: Record<string, unknown> }) {
  const summary = data.summary;
  const fields: { key: string; label: string }[] = [
    { key: "scope", label: "Scope" },
    { key: "primary_objective", label: "Primary Objective" },
    { key: "customer", label: "Customer" },
    { key: "contract_type", label: "Contract Type" },
    { key: "ceiling_value_estimate", label: "Ceiling Value" },
    { key: "period_of_performance", label: "Period of Performance" }
  ];
  const present = fields.filter(({ key }) => {
    const v = data[key];
    return v != null && v !== "";
  });
  return (
    <div>
      {summary ? (
        <p style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--text)", lineHeight: 1.65, marginBottom: 14, fontStyle: "italic" }}>
          {String(summary)}
        </p>
      ) : null}
      {present.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {present.map(({ key, label }) => (
            <div key={key}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>{String(data[key])}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CLINCard({ clin }: { clin: CLIN }) {
  const status = (clin.status || "ok").toLowerCase();
  const flagCls = status === "conflict" ? "red" : status === "ambiguous" ? "amber" : "green";
  const flagLabel = status === "conflict" ? "Conflict" : status === "ambiguous" ? "Ambiguous" : "Clean";
  return (
    <div className="clin-card">
      <span className="clin-num">{clin.clin || "—"}</span>
      <span className="clin-desc">{clin.description || "—"}</span>
      <span className="clin-meta">{clin.quantity ?? "—"} {clin.unit || ""}</span>
      <span className="clin-meta">{clin.fob || "—"}</span>
      <span className="clin-meta">{clin.pricing_arrangement || "—"}</span>
      <span className={`clin-flag ${flagCls}`}>{flagLabel}</span>
    </div>
  );
}

function RiskCard({ risk }: { risk: PrioritizedRisk }) {
  const cls = risk.priority.toLowerCase();
  return (
    <div className={`risk-card ${cls}`}>
      <div className="risk-head">
        <span className={`risk-sev ${cls}`}>{risk.priority}</span>
        <span className="risk-cat">{risk.category}</span>
        {risk.citation && <span className="risk-cite">{risk.citation}</span>}
      </div>
      <div className="risk-text">{risk.text}</div>
      {risk.recommended_action && (
        <div className="risk-action">
          <strong>Recommended action</strong>
          {risk.recommended_action}
        </div>
      )}
    </div>
  );
}

function KOEmailButton({ auditId }: { auditId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="action-btn primary"
        onClick={() => {
          setOpen(true);
          if (typeof document !== "undefined") {
            document.getElementById("ko-email-section")?.scrollIntoView({ behavior: "smooth" });
          }
        }}
      >
        ✉ Compose KO Email
      </button>
      {open && null /* the actual editor lives in Section 6 below */}
    </>
  );
}

function KOEmailComposer({ auditId, initialNoticeId }: { auditId: string; initialNoticeId: string }) {
  const [subject, setSubject] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [drafting, setDrafting] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [status, setStatus] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  async function buildDraft() {
    setDrafting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ko-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSubject(data.subject || "");
      setBody(data.body || "");
    } catch (err) {
      setStatus({ kind: "error", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setDrafting(false);
    }
  }

  async function copy() {
    if (!body) return;
    const fullText = `Subject: ${subject}\n\n${body}`;
    try { await navigator.clipboard.writeText(fullText); setStatus({ kind: "success", msg: "Copied to clipboard." }); } catch { /* */ }
  }

  function openInMail() {
    const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const r = recipient.trim();
    if (!EMAIL_RX.test(r)) {
      setStatus({ kind: "error", msg: "Enter a valid recipient email." });
      return;
    }
    const ccTrim = cc.trim();
    if (ccTrim && !EMAIL_RX.test(ccTrim)) {
      setStatus({ kind: "error", msg: "Enter a valid cc email or leave blank." });
      return;
    }
    if (!subject || !body) return;
    setStatus(null);
    const ccParam = ccTrim ? `cc=${encodeURIComponent(ccTrim)}&` : "";
    const mailto =
      `mailto:${encodeURIComponent(r)}?` +
      ccParam +
      `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (mailto.length > 1800) {
      setStatus({ kind: "error", msg: "Email too long for some mail clients — use Copy and paste instead." });
      return;
    }
    window.location.href = mailto;
  }

  return (
    <div id="ko-email-section" className="ko-email-area">
      {!body && (
        <button type="button" className="action-btn primary" disabled={drafting} onClick={buildDraft} style={{ alignSelf: "flex-start" }}>
          {drafting ? "Drafting…" : `✎ Draft KO Email · ${initialNoticeId}`}
        </button>
      )}
      {body && (
        <>
          <input
            className="ko-email-input"
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ fontWeight: 600 }}
          />
          <textarea
            className="ko-email-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck
          />
          <div className="ko-email-actions">
            <input
              className="ko-email-input"
              type="email"
              placeholder="ko@agency.mil"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <input
              className="ko-email-input"
              type="email"
              placeholder="cc (optional)"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
            <button type="button" className="action-btn" onClick={copy}>Copy</button>
            <button type="button" className="action-btn primary" disabled={!recipient || !subject || !body} onClick={openInMail}>
              ✉ Open in Mail
            </button>
          </div>
        </>
      )}
      {status && <div className={`ko-status ${status.kind}`}>{status.msg}</div>}
    </div>
  );
}

function NotesEditor({ auditId, initial }: { auditId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValue = useRef(initial);

  useEffect(() => {
    if (value === lastValue.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        const res = await fetch(`/api/audit/${auditId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        lastValue.current = value;
        setSavedAt(new Date());
        setState("saved");
      } catch (err) {
        setState("error");
        setErrMsg(err instanceof Error ? err.message : String(err));
      }
    }, 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, auditId]);

  const indicator = useMemo(() => {
    if (state === "saving") return { cls: "saving", txt: "● Saving…" };
    if (state === "error") return { cls: "error", txt: `! ${errMsg || "Save failed"}` };
    if (state === "saved" && savedAt) return { cls: "saved", txt: `✓ Saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` };
    return { cls: "", txt: "Saves automatically" };
  }, [state, savedAt, errMsg]);

  return (
    <div className="notes-area">
      <textarea
        className="notes-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add your team notes for this solicitation…"
        spellCheck
      />
      <div className={`notes-status ${indicator.cls}`}>{indicator.txt}</div>
    </div>
  );
}

interface OutcomeState {
  outcome: string | null;
  outcome_date: string | null;
  ko_contacted: boolean;
  ko_contact_date: string | null;
  bid_submitted: boolean;
  bid_submit_date: string | null;
  team_assignee: string;
}

function OutcomeTracker({ auditId, initial }: { auditId: string; initial: OutcomeState }) {
  const [state, setState] = useState<OutcomeState>(initial);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function patch(update: Partial<OutcomeState>) {
    const next = { ...state, ...update };
    setState(next);
    setSave("saving");
    try {
      const res = await fetch(`/api/audit/${auditId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSave("saved");
      setSavedAt(new Date());
    } catch (err) {
      setSave("error");
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  const indicator = (() => {
    if (save === "saving") return { cls: "saving", txt: "● Saving…" };
    if (save === "error")  return { cls: "error",  txt: `! ${errMsg || "Save failed"}` };
    if (save === "saved" && savedAt) return { cls: "saved", txt: `✓ Saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` };
    return { cls: "", txt: "Saves automatically" };
  })();

  return (
    <div className="notes-area">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>

        {/* Outcome */}
        <div>
          <label style={fieldLabelStyle}>Outcome</label>
          <select
            value={state.outcome || ""}
            onChange={(e) => {
              const v = e.target.value || null;
              patch({ outcome: v, outcome_date: v && !state.outcome_date ? todayISO() : state.outcome_date });
            }}
            style={selectStyle}
          >
            <option value="">— Not set —</option>
            <option value="pending">Pending</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="no-bid">No-bid</option>
          </select>
        </div>

        <div>
          <label style={fieldLabelStyle}>Outcome date</label>
          <input
            type="date"
            value={state.outcome_date ? state.outcome_date.slice(0, 10) : ""}
            onChange={(e) => patch({ outcome_date: e.target.value || null })}
            style={inputStyle}
          />
        </div>

        {/* KO contacted */}
        <div>
          <label style={fieldLabelStyle}>KO contacted</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              id={`ko-contacted-${auditId}`}
              type="checkbox"
              checked={state.ko_contacted}
              onChange={(e) => {
                const checked = e.target.checked;
                patch({ ko_contacted: checked, ko_contact_date: checked && !state.ko_contact_date ? todayISO() : state.ko_contact_date });
              }}
            />
            <input
              type="date"
              value={state.ko_contact_date ? state.ko_contact_date.slice(0, 10) : ""}
              onChange={(e) => patch({ ko_contact_date: e.target.value || null })}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Bid submitted */}
        <div>
          <label style={fieldLabelStyle}>Bid submitted</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={state.bid_submitted}
              onChange={(e) => {
                const checked = e.target.checked;
                patch({ bid_submitted: checked, bid_submit_date: checked && !state.bid_submit_date ? todayISO() : state.bid_submit_date });
              }}
            />
            <input
              type="date"
              value={state.bid_submit_date ? state.bid_submit_date.slice(0, 10) : ""}
              onChange={(e) => patch({ bid_submit_date: e.target.value || null })}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Team assignee */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={fieldLabelStyle}>Team assignee</label>
          <input
            type="text"
            value={state.team_assignee}
            onChange={(e) => setState({ ...state, team_assignee: e.target.value })}
            onBlur={() => patch({ team_assignee: state.team_assignee })}
            placeholder="Name or email of internal owner"
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>
      </div>
      <div className={`notes-status ${indicator.cls}`}>{indicator.txt}</div>
    </div>
  );
}

interface RichOutcomeRow {
  outcome?: string | null;
  margin_estimated_pct?: number | null;
  margin_actual_pct?: number | null;
  contract_value_actual?: number | null;
  cpars_rating?: number | null;
  customer_relationship_strength?: string | null;
  win_reason?: string | null;
  lost_to_competitor?: string | null;
  lost_reason_category?: string | null;
  lessons_learned?: string | null;
}

const RELATIONSHIP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "cold", label: "Cold" },
  { value: "warm", label: "Warm" },
  { value: "strong", label: "Strong" },
  { value: "strategic", label: "Strategic" }
];

const LOST_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "price", label: "Price" },
  { value: "technical", label: "Technical" },
  { value: "past_performance", label: "Past performance" },
  { value: "timing", label: "Timing" },
  { value: "relationships", label: "Relationships" },
  { value: "other", label: "Other" }
];

function RichOutcomeCapture({ auditId, outcome }: { auditId: string; outcome: string | null }) {
  const isAwarded = outcome === "won";
  const isLost = outcome === "lost";
  const visible = isAwarded || isLost;

  const [row, setRow] = useState<RichOutcomeRow>({});
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/audit/${auditId}/outcome-detail`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && data.row) setRow(data.row);
      } catch {
        // soft-fail: form just stays empty
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [auditId, visible]);

  function patch(update: Partial<RichOutcomeRow>) {
    const next = { ...row, ...update };
    setRow(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(next);
    }, 800);
  }

  async function persist(payload: RichOutcomeRow) {
    setSave("saving");
    try {
      const body = {
        outcome: isAwarded ? "awarded" : "lost",
        margin_estimated_pct: payload.margin_estimated_pct ?? null,
        margin_actual_pct: payload.margin_actual_pct ?? null,
        contract_value_actual: payload.contract_value_actual ?? null,
        cpars_rating: payload.cpars_rating ?? null,
        customer_relationship_strength: payload.customer_relationship_strength ?? null,
        win_reason: payload.win_reason ?? null,
        lost_to_competitor: payload.lost_to_competitor ?? null,
        lost_reason_category: payload.lost_reason_category ?? null,
        lessons_learned: payload.lessons_learned ?? null
      };
      const res = await fetch(`/api/audit/${auditId}/outcome-detail`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSave("saved");
      setSavedAt(new Date());
    } catch (err) {
      setSave("error");
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (!visible) return null;

  const indicator = (() => {
    if (!loaded) return { cls: "", txt: "Loading rich outcome…" };
    if (save === "saving") return { cls: "saving", txt: "● Saving rich outcome…" };
    if (save === "error")  return { cls: "error",  txt: `! ${errMsg || "Save failed"}` };
    if (save === "saved" && savedAt) return { cls: "saved", txt: `✓ Rich outcome saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` };
    return { cls: "", txt: "Saves automatically" };
  })();

  return (
    <div className="notes-area" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--border2)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: isAwarded ? "var(--green)" : "var(--red)" }}>
          {isAwarded ? "▸ Award details — feed the moat" : "▸ Loss details — feed the moat"}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t40)" }}>
          contributes to your win-probability data
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>

        {/* Margin estimated — both awarded + lost */}
        <div>
          <label style={fieldLabelStyle}>Margin estimated (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={row.margin_estimated_pct ?? ""}
            onChange={(e) => patch({ margin_estimated_pct: e.target.value === "" ? null : Number(e.target.value) })}
            style={inputStyle}
          />
        </div>

        {isAwarded && (
          <>
            <div>
              <label style={fieldLabelStyle}>Margin actual (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={row.margin_actual_pct ?? ""}
                onChange={(e) => patch({ margin_actual_pct: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="fill once project margin is known"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Contract value actual ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={row.contract_value_actual ?? ""}
                onChange={(e) => patch({ contract_value_actual: e.target.value === "" ? null : Number(e.target.value) })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>CPARS rating (1-5)</label>
              <select
                value={row.cpars_rating ?? ""}
                onChange={(e) => patch({ cpars_rating: e.target.value === "" ? null : Number(e.target.value) })}
                style={selectStyle}
              >
                <option value="">— Not yet —</option>
                <option value="1">1 — Unsatisfactory</option>
                <option value="2">2 — Marginal</option>
                <option value="3">3 — Satisfactory</option>
                <option value="4">4 — Very good</option>
                <option value="5">5 — Exceptional</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabelStyle}>Customer relationship</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {RELATIONSHIP_OPTIONS.map((opt) => {
                  const active = row.customer_relationship_strength === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patch({ customer_relationship_strength: active ? null : opt.value })}
                      style={{
                        ...inputStyle,
                        cursor: "pointer",
                        background: active ? "var(--green)" : "rgba(3,8,16,.6)",
                        color: active ? "var(--void)" : "var(--text)",
                        borderColor: active ? "var(--green)" : "var(--border2)",
                        fontWeight: active ? 700 : 400,
                        padding: "6px 14px"
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabelStyle}>What gave you the edge</label>
              <textarea
                value={row.win_reason ?? ""}
                onChange={(e) => patch({ win_reason: e.target.value || null })}
                placeholder="1-3 sentences: why you won (CMMC readiness, incumbent relationship, lowest price, etc.)"
                style={{ ...inputStyle, width: "100%", minHeight: 64, resize: "vertical", fontFamily: "var(--serif)" }}
              />
            </div>
          </>
        )}

        {isLost && (
          <>
            <div>
              <label style={fieldLabelStyle}>Lost to competitor</label>
              <input
                type="text"
                value={row.lost_to_competitor ?? ""}
                onChange={(e) => patch({ lost_to_competitor: e.target.value || null })}
                placeholder="who won it (optional)"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Why lost</label>
              <select
                value={row.lost_reason_category ?? ""}
                onChange={(e) => patch({ lost_reason_category: e.target.value || null })}
                style={selectStyle}
              >
                <option value="">— Not set —</option>
                {LOST_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={fieldLabelStyle}>Lessons learned</label>
          <textarea
            value={row.lessons_learned ?? ""}
            onChange={(e) => patch({ lessons_learned: e.target.value || null })}
            placeholder={isAwarded ? "what to repeat next time" : "what to do differently next time"}
            style={{ ...inputStyle, width: "100%", minHeight: 64, resize: "vertical", fontFamily: "var(--serif)" }}
          />
        </div>
      </div>

      <div className={`notes-status ${indicator.cls}`}>{indicator.txt}</div>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--t40)",
  marginBottom: 6
};

const inputStyle: React.CSSProperties = {
  background: "rgba(3,8,16,.6)",
  border: "1px solid var(--border2)",
  borderRadius: 2,
  padding: "7px 10px",
  fontFamily: "var(--mono)",
  fontSize: 11,
  color: "var(--text)",
  outline: "none"
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  cursor: "pointer"
};

interface KOIntelRow {
  ko_email: string;
  ko_name?: string | null;
  agency?: string | null;
  solicitations_issued?: number;
  questions_asked?: number;
  questions_answered?: number;
  avg_response_days?: number | null;
  last_contact?: string | null;
  notes?: string | null;
}

function KOCard({
  auditId,
  agency,
  noticeId,
  displayId,
  koEmailFromAudit,
  koNameFromAudit
}: {
  auditId: string;
  agency: string;
  noticeId: string;
  displayId: string;
  koEmailFromAudit: string;
  koNameFromAudit: string;
}) {
  const [ko, setKo] = useState<KOIntelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!koEmailFromAudit) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/ko-intelligence?email=${encodeURIComponent(koEmailFromAudit)}`);
        if (cancelled) return;
        if (res.status === 404) { setKo(null); return; }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setKo(data.ko);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [koEmailFromAudit]);

  async function addToContacts() {
    if (!koEmailFromAudit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ko-intelligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ko_email: koEmailFromAudit,
          ko_name: koNameFromAudit || null,
          agency: agency || null,
          last_solicitation_id: auditId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setKo(data.ko);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!koEmailFromAudit && !loading) {
    return null; // No KO email surfaced — skip card entirely.
  }

  const respRate = ko && ko.questions_asked && ko.questions_asked > 0
    ? Math.round(((ko.questions_answered || 0) / ko.questions_asked) * 100)
    : null;

  return (
    <section className="report-section" style={{ borderColor: "rgba(96,165,250,.32)" }}>
      <div className="report-section-eyebrow" style={{ color: "var(--blue)" }}>Contracting Officer</div>
      <h2 className="report-section-title">{koNameFromAudit || ko?.ko_name || "KO contact"}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <div>
          <div style={fieldLabelStyle}>Email</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--gold)" }}>{koEmailFromAudit || "—"}</div>
          <div style={{ ...fieldLabelStyle, marginTop: 12 }}>Agency</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>{agency}</div>
          <div style={{ ...fieldLabelStyle, marginTop: 12 }}>Notice</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)" }}>{displayId}</div>
        </div>
        <div>
          {loading && <div className="empty-block">Loading contact history…</div>}
          {!loading && !ko && koEmailFromAudit && (
            <div>
              <div className="empty-block" style={{ marginBottom: 10 }}>No prior contact recorded.</div>
              <button className="action-btn primary" onClick={addToContacts} disabled={busy}>
                {busy ? "Adding…" : "+ Add to KO Intelligence"}
              </button>
            </div>
          )}
          {!loading && ko && (
            <>
              <div style={fieldLabelStyle}>Response rate</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>
                {respRate != null
                  ? `${ko.questions_answered}/${ko.questions_asked} questions answered · ${respRate}%`
                  : "No questions tracked yet"}
                {ko.avg_response_days != null && (
                  <> · avg {Number(ko.avg_response_days).toFixed(1)}d</>
                )}
              </div>
              <div style={{ ...fieldLabelStyle, marginTop: 12 }}>Solicitations issued</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>
                {ko.solicitations_issued ?? 0}
              </div>
              <div style={{ ...fieldLabelStyle, marginTop: 12 }}>Last contact</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)" }}>
                {ko.last_contact ? new Date(ko.last_contact).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
              </div>
              <a className="action-btn" href={`/home#ko-intelligence`} style={{ marginTop: 14, display: "inline-block" }}>
                Contact history →
              </a>
            </>
          )}
          {err && <div className="ko-status error" style={{ marginTop: 10 }}>{err}</div>}
        </div>
      </div>
    </section>
  );
}

interface IncumbentState {
  name: string | null;
  award_value: number | null;
  expiry: string | null;
  uei: string | null;
  looked_up_at: string | null;
}

function IncumbentCard({ noticeId, initial }: { noticeId: string; initial: IncumbentState }) {
  const [state, setState] = useState<IncumbentState>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  // Auto-fetch on mount when nothing cached yet.
  useEffect(() => {
    if (state.name || !noticeId) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/incumbent/${encodeURIComponent(noticeId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (data.incumbent) {
          setState({
            name: data.incumbent.name ?? null,
            award_value: data.incumbent.award_value ?? null,
            expiry: data.incumbent.expiry ?? null,
            uei: data.incumbent.uei ?? null,
            looked_up_at: data.incumbent.looked_up_at ?? null
          });
        } else if (data.reason) {
          setReason(data.reason);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [noticeId, state.name]);

  async function refresh() {
    setBusy(true); setErr(null); setReason(null);
    try {
      const res = await fetch(`/api/incumbent/${encodeURIComponent(noticeId)}?refresh=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.incumbent) {
        setState({
          name: data.incumbent.name ?? null,
          award_value: data.incumbent.award_value ?? null,
          expiry: data.incumbent.expiry ?? null,
          uei: data.incumbent.uei ?? null,
          looked_up_at: data.incumbent.looked_up_at ?? null
        });
      } else if (data.reason) {
        setReason(data.reason);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const fmtMoney = (n: number | null) =>
    n == null ? "—" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`;

  return (
    <section className="report-section" style={{ borderColor: "rgba(167,139,250,.32)" }}>
      <div className="report-section-eyebrow" style={{ color: "#A78BFA" }}>Incumbent intelligence</div>
      <h2 className="report-section-title">{state.name || (busy ? "Looking up…" : "No incumbent identified")}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
        <div>
          <div style={fieldLabelStyle}>Award value</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--gold)" }}>{fmtMoney(state.award_value)}</div>
        </div>
        <div>
          <div style={fieldLabelStyle}>Expires</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>
            {state.expiry ? new Date(state.expiry).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"}
          </div>
        </div>
        <div>
          <div style={fieldLabelStyle}>UEI</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>{state.uei || "—"}</div>
        </div>
        <div>
          <div style={fieldLabelStyle}>Last lookup</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t40)" }}>
            {state.looked_up_at ? new Date(state.looked_up_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="action-btn" onClick={refresh} disabled={busy}>
          {busy ? "Querying USAspending…" : "↻ Refresh"}
        </button>
        {reason && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t40)" }}>{reason}</span>}
        {err && <span className="ko-status error">{err}</span>}
      </div>
      {state.name && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(167,139,250,.04)", borderLeft: "3px solid #A78BFA", borderRadius: 2 }}>
          <strong style={{ fontFamily: "var(--mono)", fontSize: 9, color: "#A78BFA", letterSpacing: ".12em", textTransform: "uppercase" }}>Strategic note</strong>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)", lineHeight: 1.6, marginTop: 4 }}>
            Incumbent has the install base. To displace, your bid needs a clearly differentiated technical advantage or a price that beats their re-baseline by ≥15%. Reference their PoP end date in your timeline narrative.
          </div>
        </div>
      )}
    </section>
  );
}

function WinProbabilityBadge({ auditId, cached, cachedBasis }: { auditId: string; cached: number | null; cachedBasis: number | null }) {
  const [pct, setPct] = useState<number | null>(cached);
  const [basis, setBasis] = useState<number>(cachedBasis ?? 0);
  const [confidence, setConfidence] = useState<"tight" | "directional">("directional");
  const [reason, setReason] = useState<string>("");
  const [loading, setLoading] = useState(cached == null);

  useEffect(() => {
    let cancelled = false;
    if (cached != null) return;
    (async () => {
      try {
        const res = await fetch(`/api/win-probability/${auditId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setPct(typeof data.probability === "number" ? data.probability : null);
          setBasis(data.basis ?? 0);
          setConfidence(data.confidence === "tight" ? "tight" : "directional");
          setReason(data.reason || "");
        }
      } catch {
        // silent — badge gracefully shows insufficient corpus
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [auditId, cached]);

  if (loading) {
    return (
      <span style={{ ...gaugePillBase, color: "var(--t40)", borderColor: "var(--border)" }} title="Computing win probability…">
        WIN%·…
      </span>
    );
  }
  // Show "—" only when there's literally no historical data to compute from
  // (basis === 0). Anything ≥1 outcome surfaces a directional probability with
  // a `~` prefix and a tooltip explaining it tightens as the corpus grows.
  if (pct == null) {
    return (
      <span
        style={{ ...gaugePillBase, color: "var(--t40)", borderColor: "var(--border)" }}
        title={reason || "No outcomes logged yet — mark audits AWARDED or LOST to seed the model."}
      >
        WIN% · —
      </span>
    );
  }
  const color = pct >= 60 ? "var(--green)" : pct >= 35 ? "var(--amber)" : "var(--red)";
  const directional = confidence === "directional";
  return (
    <span
      style={{
        ...gaugePillBase,
        color,
        borderColor: color,
        background: `${color}10`,
        ...(directional ? { borderStyle: "dashed" as const } : {})
      }}
      title={reason || `Based on ${basis} comparable audits in the corpus`}
    >
      WIN · {directional ? "~" : ""}{pct}%
    </span>
  );
}

const gaugePillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontFamily: "var(--mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  padding: "8px 12px",
  borderRadius: 2,
  border: "1.5px solid"
};


