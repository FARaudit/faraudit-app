"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export default function AuditReport({ audit, userEmail: _userEmail }: Props) {
  const id = String(audit.id ?? "");
  const noticeId = (audit.notice_id as string) || "—";
  const title = (audit.title as string) || "Untitled solicitation";
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

  const clins: CLIN[] = Array.isArray(compJson.clins) ? (compJson.clins as CLIN[]) : [];

  const risks = deriveRisks(risksJson);
  const strengths = asStringList(overviewJson.key_strengths || risksJson.strengths);
  const nextSteps = asStringList(overviewJson.next_steps || compJson.key_compliance_actions);

  const verdictKind = recommendation === "PROCEED" ? "bid" : recommendation === "DECLINE" ? "decline" : "caution";
  const verdictLabel = recommendation === "PROCEED" ? "BID" : recommendation === "DECLINE" ? "DECLINE" : "CAUTION";
  const verdictColor = verdictKind === "bid" ? "var(--green)" : verdictKind === "decline" ? "var(--red)" : "var(--amber)";

  return (
    <div className="bd-home">
      <div className="report-page">
        <header className="report-header">
          <a className="report-back" href="/home">← Intelligence Home</a>
          <div className="report-title">
            <div className="report-title-id">{noticeId}</div>
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
              </section>
            </>
          )}
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
        ✉ Send KO Email
      </button>
      {open && null /* the actual editor lives in Section 6 below */}
    </>
  );
}

function KOEmailComposer({ auditId, initialNoticeId }: { auditId: string; initialNoticeId: string }) {
  const [draft, setDraft] = useState<string>("");
  const [drafting, setDrafting] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
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
      setDraft(data.draft || "");
    } catch (err) {
      setStatus({ kind: "error", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setDrafting(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try { await navigator.clipboard.writeText(draft); setStatus({ kind: "success", msg: "Copied to clipboard." }); } catch { /* */ }
  }

  async function send() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setStatus({ kind: "error", msg: "Enter a valid recipient email." });
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ko-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId, recipient: recipient.trim(), cc: cc.trim() || undefined, body: draft })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus({ kind: "success", msg: `Sent to ${data.recipient}${data.message_id ? ` · ${data.message_id}` : ""}` });
    } catch (err) {
      setStatus({ kind: "error", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div id="ko-email-section" className="ko-email-area">
      {!draft && (
        <button type="button" className="action-btn primary" disabled={drafting} onClick={buildDraft} style={{ alignSelf: "flex-start" }}>
          {drafting ? "Drafting…" : `✎ Draft KO Email · ${initialNoticeId}`}
        </button>
      )}
      {draft && (
        <>
          <textarea
            className="ko-email-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck
          />
          <div className="ko-email-actions">
            <input
              className="ko-email-input"
              type="email"
              placeholder="ko@agency.mil"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={sending}
            />
            <input
              className="ko-email-input"
              type="email"
              placeholder="cc (optional)"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              disabled={sending}
            />
            <button type="button" className="action-btn" onClick={copy}>Copy</button>
            <button type="button" className="action-btn primary" disabled={sending || !recipient} onClick={send}>
              {sending ? "Sending…" : "Send via Resend"}
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
    return { cls: "", txt: "Auto-saves 1s after you stop typing" };
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
    return { cls: "", txt: "Changes save instantly" };
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
  koEmailFromAudit,
  koNameFromAudit
}: {
  auditId: string;
  agency: string;
  noticeId: string;
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
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)" }}>{noticeId}</div>
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
  if (pct == null) {
    return (
      <span
        style={{ ...gaugePillBase, color: "var(--t40)", borderColor: "var(--border)" }}
        title={reason || `Need ≥100 comparable audits in corpus. Current: ${basis}.`}
      >
        WIN% · —
      </span>
    );
  }
  const color = pct >= 60 ? "var(--green)" : pct >= 35 ? "var(--amber)" : "var(--red)";
  return (
    <span
      style={{ ...gaugePillBase, color, borderColor: color, background: `${color}10` }}
      title={`Based on ${basis} comparable audits in the corpus`}
    >
      WIN · {pct}%
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


