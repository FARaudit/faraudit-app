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
