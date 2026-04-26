import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import KOEmailButton from "./ko-email-button";

type Params = { id: string };

interface DFARSFlag {
  clause: string;
  title: string;
  detected: boolean;
  severity: "P0" | "P1" | "P2";
}

interface PrioritizedRisk {
  text: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  citation?: string;
}

const RECOMMENDATION_STYLES: Record<string, { color: string; label: string }> = {
  PROCEED: { color: "text-green border-green", label: "Proceed" },
  PROCEED_WITH_CAUTION: { color: "text-amber border-amber", label: "Caution" },
  DECLINE: { color: "text-red border-red", label: "Decline" }
};

const PRIORITY_BORDERS: Record<string, string> = {
  P0: "border-red bg-red/5",
  P1: "border-amber bg-amber/5",
  P2: "border-blue bg-blue/5"
};
const PRIORITY_COLORS: Record<string, string> = {
  P0: "text-red",
  P1: "text-amber",
  P2: "text-blue"
};

// Fallback synthesizer for legacy audits that ran before the engine post-processing
// landed. Maps the categorized arrays into PrioritizedRisk[] using the same rules.
function synthesizePrioritized(risksJson: Record<string, unknown>): PrioritizedRisk[] {
  const out: PrioritizedRisk[] = [];
  const push = (arr: unknown, priority: PrioritizedRisk["priority"], category: string) => {
    if (!Array.isArray(arr)) return;
    for (const r of arr) {
      if (typeof r === "string" && r.trim()) {
        out.push({ text: r, priority, category, citation: extractCitation(r) });
      }
    }
  };
  push(risksJson.top_3_risks, "P0", "Deal-breaker");
  push(risksJson.technical_risks, "P1", "Technical");
  push(risksJson.schedule_risks, "P1", "Schedule");
  push(risksJson.price_risks, "P1", "Price");
  push(risksJson.evaluation_risks, "P2", "Evaluation");

  const seen = new Set<string>();
  const order: Record<"P0" | "P1" | "P2", number> = { P0: 0, P1: 1, P2: 2 };
  return out
    .filter((r) => {
      const k = r.text.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => order[a.priority] - order[b.priority]);
}

function extractCitation(text: string): string | undefined {
  return text.match(/((?:FAR|DFARS)\s*\d+\.\d+(?:-\d+)?)/i)?.[1];
}

function toStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        return JSON.stringify(v);
      })
      .filter((s): s is string => !!s && s.length > 0);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s.toLowerCase() === "none" || s.toLowerCase() === "n/a") return [];
    return s.includes(",") ? s.split(",").map((x) => x.trim()).filter(Boolean) : [s];
  }
  if (typeof value === "object") return [JSON.stringify(value)];
  return [String(value)];
}

export default async function AuditResultPage({
  params
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: audit } = await supabase
    .from("audits")
    .select("*")
    .eq("id", id)
    .single();

  if (!audit) notFound();

  const recStyle =
    RECOMMENDATION_STYLES[audit.recommendation as string] ||
    RECOMMENDATION_STYLES.PROCEED_WITH_CAUTION;
  const score: number = audit.compliance_score ?? 0;
  const compJson = (audit.compliance_json ?? {}) as Record<string, unknown>;
  const risksJson = (audit.risks_json ?? {}) as Record<string, unknown>;
  const overviewJson = (audit.overview_json ?? {}) as Record<string, unknown>;

  // DFARS flags — always render 3 cards. Backfill if missing on legacy rows.
  const dfarsFlags: DFARSFlag[] = Array.isArray(compJson.dfars_flags)
    ? (compJson.dfars_flags as DFARSFlag[])
    : [
        { clause: "252.223-7008", title: "Hexavalent Chromium", detected: false, severity: "P0" },
        { clause: "252.204-7018", title: "Covered Telecom", detected: false, severity: "P0" },
        { clause: "252.204-7021", title: "CMMC", detected: false, severity: "P1" }
      ];

  // Prioritized risks — engine writes them; fall back to synthesis for older rows.
  const prioritized: PrioritizedRisk[] = Array.isArray(risksJson.prioritized_risks)
    ? (risksJson.prioritized_risks as PrioritizedRisk[])
    : synthesizePrioritized(risksJson);

  const farClauses = toStringList(compJson.far_clauses);
  const dfarsClauses = toStringList(compJson.dfars_clauses);
  const certs = toStringList(compJson.required_certifications);
  const actions = toStringList(compJson.key_compliance_actions);
  const deadlines = toStringList(compJson.deadlines);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5 flex items-center justify-between">
        <Link href="/dashboard" className="font-display text-2xl text-text">
          FARaudit
        </Link>
        <Link
          href="/audit"
          className="text-sm text-gold hover:text-gold-dim font-mono uppercase tracking-wider"
        >
          + New audit
        </Link>
      </header>

      <main className="px-6 md:px-10 py-12 md:py-16 max-w-5xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">
          Audit Report
        </p>

        {/* Header bar */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-start">
          <div>
            <p className="font-mono text-sm text-text-2 tracking-wider">{audit.notice_id}</p>
            <h1 className="mt-3 font-display text-3xl md:text-4xl text-text font-light leading-tight">
              {audit.title || "Untitled solicitation"}
            </h1>
            <p className="mt-4 text-text-2 text-sm font-mono">
              {audit.agency || "—"}
              {audit.naics_code && ` · NAICS ${audit.naics_code}`}
              {audit.set_aside && ` · ${audit.set_aside}`}
              {audit.response_deadline &&
                ` · due ${new Date(audit.response_deadline).toLocaleDateString()}`}
            </p>
          </div>

          {audit.status === "complete" && (
            <div className="flex items-center gap-6">
              <ScoreCircle score={score} />
              <div
                className={`px-5 py-3 border-2 ${recStyle.color} font-mono text-xs tracking-[0.25em] uppercase`}
              >
                {recStyle.label}
              </div>
            </div>
          )}
        </div>

        {audit.status === "processing" && (
          <div className="mt-12 border border-amber/40 bg-amber/5 p-6">
            <p className="font-display text-xl text-text">Audit in progress</p>
            <p className="mt-2 text-text-2 text-sm">Refresh in a few seconds.</p>
          </div>
        )}

        {audit.status === "failed" && (
          <div className="mt-12 border border-red/40 bg-red/5 p-6">
            <p className="font-display text-xl text-text">Audit failed</p>
            <p className="mt-2 text-text-2 text-sm">
              {audit.error_message || "Unknown error"}
            </p>
          </div>
        )}

        {audit.status === "complete" && (
          <>
            {/* SECTION 1 — Executive Risk Summary */}
            <Section eyebrow="Executive Risk Summary" title="What you need to know first">
              {prioritized.length === 0 ? (
                <p className="text-text-2 italic">No risks surfaced by the audit engine.</p>
              ) : (
                <div className="space-y-3">
                  {prioritized.map((r, i) => (
                    <RiskCard key={i} risk={r} />
                  ))}
                </div>
              )}
            </Section>

            {/* SECTION 2 — Compliance Findings (DFARS flags first, always all 3) */}
            <Section eyebrow="Compliance" title="DFARS trap detection">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dfarsFlags.map((flag) => (
                  <DFARSFlagCard key={flag.clause} flag={flag} />
                ))}
              </div>
            </Section>

            <Section eyebrow="Compliance" title="Clauses · certifications · deadlines">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                <ClauseList label="FAR Clauses" items={farClauses} />
                <ClauseList
                  label="DFARS Clauses"
                  items={dfarsClauses}
                  flagDetected={dfarsFlags.filter((f) => f.detected).map((f) => f.clause)}
                />
                <ListBlock label="Certifications Required" items={certs} />
                <ListBlock label="Key Deadlines" items={deadlines} />
              </div>
              {actions.length > 0 && (
                <div className="mt-12">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3 mb-4">
                    Key Compliance Actions
                  </p>
                  <ul className="space-y-2.5 text-text">
                    {actions.map((a, i) => (
                      <li key={i} className="border-l-2 border-gold pl-4 py-1 text-sm">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* SECTION 3 — Overview */}
            <Section eyebrow="Overview" title="Solicitation summary">
              <OverviewGrid data={overviewJson} />
            </Section>

            {/* SECTION 4 — KO Email Draft */}
            <Section eyebrow="Outreach" title="Contracting Officer email">
              <p className="text-text-2 text-sm mb-4 max-w-2xl">
                Draft a clarification email pre-populated with the highest-priority issues from this audit. Review and tailor before sending.
              </p>
              <KOEmailButton auditId={Number(audit.id)} />
            </Section>

            {/* Raw JSON debug */}
            <details className="mt-16 mb-8">
              <summary className="cursor-pointer text-xs text-text-3 hover:text-text-2 font-mono uppercase tracking-[0.2em]">
                Show raw JSON (debug)
              </summary>
              <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <RawJSON title="overview" data={overviewJson} />
                <RawJSON title="compliance" data={compJson} />
                <RawJSON title="risks" data={risksJson} />
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

function ScoreCircle({ score }: { score: number }) {
  let color = "text-red";
  if (score >= 70) color = "text-green";
  else if (score >= 40) color = "text-amber";
  const dash = Math.max(0, Math.min(100, score)) * 2.76;
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="2" fill="none" className="text-border" />
        <circle
          cx="50"
          cy="50"
          r="44"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className={color}
          strokeDasharray={`${dash} 276`}
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-3xl text-text font-light">{score}</span>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-20">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-3">{eyebrow}</p>
      <h2 className="font-display text-2xl md:text-3xl text-text font-light mb-10">{title}</h2>
      {children}
    </section>
  );
}

function RiskCard({ risk }: { risk: PrioritizedRisk }) {
  const border = PRIORITY_BORDERS[risk.priority] || PRIORITY_BORDERS.P2;
  const labelColor = PRIORITY_COLORS[risk.priority] || PRIORITY_COLORS.P2;
  return (
    <div className={`border-l-4 ${border} pl-5 pr-4 py-4`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className={`font-mono text-xs font-medium tracking-wider ${labelColor}`}>
          {risk.priority}
        </span>
        <span className="font-mono text-xs text-text-3 uppercase tracking-wider">
          {risk.category}
        </span>
        {risk.citation && (
          <span className="font-mono text-xs text-text-2 ml-auto">{risk.citation}</span>
        )}
      </div>
      <p className="mt-2 text-text leading-relaxed">{risk.text}</p>
    </div>
  );
}

function DFARSFlagCard({ flag }: { flag: DFARSFlag }) {
  const detected = flag.detected;
  const palette = detected
    ? "border-red bg-red/5 text-red"
    : "border-green/50 bg-green/5 text-green";
  const sevColor = PRIORITY_COLORS[flag.severity] || PRIORITY_COLORS.P0;
  return (
    <div className={`border ${palette} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-wider opacity-80">{flag.clause}</p>
          <p className="mt-1 font-display text-lg text-text">{flag.title}</p>
        </div>
        <span className={`font-mono text-xs ${sevColor}`}>{flag.severity}</span>
      </div>
      <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em]">
        {detected ? "⚠ Detected" : "✓ Not detected"}
      </p>
    </div>
  );
}

function ClauseList({
  label,
  items,
  flagDetected = []
}: {
  label: string;
  items: string[];
  flagDetected?: string[];
}) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3 mb-4">
        {label} <span className="text-text-3/60">({items.length})</span>
      </p>
      {items.length === 0 ? (
        <p className="text-text-3 text-sm italic">None cited</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c, i) => {
            const isDanger = flagDetected.some((d) => c.includes(d));
            return (
              <li
                key={i}
                className={`font-mono text-sm flex items-baseline gap-2 ${
                  isDanger ? "text-red" : "text-text"
                }`}
              >
                {isDanger && <span className="text-red">⚠</span>}
                <span>{c}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3 mb-4">
        {label} <span className="text-text-3/60">({items.length})</span>
      </p>
      {items.length === 0 ? (
        <p className="text-text-3 text-sm italic">—</p>
      ) : (
        <ul className="space-y-2 text-sm text-text">
          {items.map((c, i) => (
            <li key={i} className="border-l-2 border-border pl-3 py-0.5">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewGrid({ data }: { data: Record<string, unknown> }) {
  const fields = [
    { key: "scope", label: "Scope" },
    { key: "primary_objective", label: "Primary Objective" },
    { key: "customer", label: "Customer" },
    { key: "contract_type", label: "Contract Type" },
    { key: "ceiling_value_estimate", label: "Ceiling Value" },
    { key: "period_of_performance", label: "Period of Performance" }
  ];
  const summary = data.summary;
  return (
    <div>
      {summary ? (
        <p className="font-display text-xl md:text-2xl text-text leading-relaxed mb-12 max-w-3xl font-light italic">
          {String(summary)}
        </p>
      ) : null}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-7">
        {fields.map(({ key, label }) => {
          const v = data[key];
          if (v === null || v === undefined || v === "") return null;
          return (
            <div key={key}>
              <dt className="font-mono text-xs uppercase tracking-[0.2em] text-text-3 mb-2">
                {label}
              </dt>
              <dd className="text-text">{String(v)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function RawJSON({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase text-text-3 mb-2 tracking-wider">{title}</p>
      <pre className="text-xs text-text-2 bg-surface border border-border p-3 overflow-auto max-h-80">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
