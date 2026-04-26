import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";

type Params = { id: string };

const RECOMMENDATION_STYLES: Record<string, { color: string; label: string }> = {
  PROCEED: {
    color: "text-green border-green",
    label: "Proceed"
  },
  PROCEED_WITH_CAUTION: {
    color: "text-amber border-amber",
    label: "Caution"
  },
  DECLINE: {
    color: "text-red border-red",
    label: "Decline"
  }
};

const DANGEROUS_DFARS = ["252.223-7008", "252.204-7018", "252.204-7021"];

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
    return s.includes(",")
      ? s.split(",").map((x) => x.trim()).filter(Boolean)
      : [s];
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

  const farClauses = toStringList(compJson.far_clauses);
  const dfarsClauses = toStringList(compJson.dfars_clauses);
  const certs = toStringList(compJson.required_certifications);
  const actions = toStringList(compJson.key_compliance_actions);
  const deadlines = toStringList(compJson.deadlines);

  const top3 = toStringList(risksJson.top_3_risks);
  const technical = toStringList(risksJson.technical_risks);
  const schedule = toStringList(risksJson.schedule_risks);
  const price = toStringList(risksJson.price_risks);
  const evaluation = toStringList(risksJson.evaluation_risks);

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
            <p className="font-mono text-sm text-text-2 tracking-wider">
              {audit.notice_id}
            </p>
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
            <p className="mt-2 text-text-2 text-sm">
              Refresh in a few seconds.
            </p>
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
            {/* Executive Risk Summary */}
            <Section eyebrow="Executive Risk Summary" title="What you need to know first">
              {top3.length === 0 &&
              technical.length === 0 &&
              schedule.length === 0 &&
              price.length === 0 &&
              evaluation.length === 0 ? (
                <p className="text-text-2 italic">
                  No risks surfaced by the audit engine.
                </p>
              ) : (
                <div className="space-y-3">
                  {top3.map((r, i) => (
                    <RiskCard key={`p0-${i}`} priority="P0" text={r} />
                  ))}
                  {technical.map((r, i) => (
                    <RiskCard key={`p1-t-${i}`} priority="P1" text={r} category="Technical" />
                  ))}
                  {schedule.map((r, i) => (
                    <RiskCard key={`p1-s-${i}`} priority="P1" text={r} category="Schedule" />
                  ))}
                  {price.map((r, i) => (
                    <RiskCard key={`p2-p-${i}`} priority="P2" text={r} category="Price" />
                  ))}
                  {evaluation.map((r, i) => (
                    <RiskCard key={`p2-e-${i}`} priority="P2" text={r} category="Evaluation" />
                  ))}
                </div>
              )}
            </Section>

            {/* Compliance */}
            <Section eyebrow="Compliance" title="Clauses · certifications · deadlines">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                <ClauseList label="FAR Clauses" items={farClauses} />
                <ClauseList
                  label="DFARS Clauses"
                  items={dfarsClauses}
                  flagDangerous
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
                      <li
                        key={i}
                        className="border-l-2 border-gold pl-4 py-1 text-sm"
                      >
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* Overview */}
            <Section eyebrow="Overview" title="Solicitation summary">
              <OverviewGrid data={overviewJson} />
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
        <circle
          cx="50"
          cy="50"
          r="44"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          className="text-border"
        />
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
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-3">
        {eyebrow}
      </p>
      <h2 className="font-display text-2xl md:text-3xl text-text font-light mb-10">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RiskCard({
  priority,
  text,
  category
}: {
  priority: "P0" | "P1" | "P2";
  text: string;
  category?: string;
}) {
  const borders = {
    P0: "border-red bg-red/5",
    P1: "border-amber bg-amber/5",
    P2: "border-blue bg-blue/5"
  };
  const labelColors = {
    P0: "text-red",
    P1: "text-amber",
    P2: "text-blue"
  };
  const citation = text.match(
    /((?:FAR|DFARS)\s*\d+\.\d+(?:-\d+)?)/i
  )?.[1];

  return (
    <div className={`border-l-4 ${borders[priority]} pl-5 pr-4 py-4`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className={`font-mono text-xs font-medium tracking-wider ${labelColors[priority]}`}
        >
          {priority}
        </span>
        {category && (
          <span className="font-mono text-xs text-text-3 uppercase tracking-wider">
            {category}
          </span>
        )}
        {citation && (
          <span className="font-mono text-xs text-text-2 ml-auto">
            {citation}
          </span>
        )}
      </div>
      <p className="mt-2 text-text leading-relaxed">{text}</p>
    </div>
  );
}

function ClauseList({
  label,
  items,
  flagDangerous = false
}: {
  label: string;
  items: string[];
  flagDangerous?: boolean;
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
            const isDanger =
              flagDangerous &&
              DANGEROUS_DFARS.some((d) => c.includes(d));
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
      <p className="font-mono text-xs uppercase text-text-3 mb-2 tracking-wider">
        {title}
      </p>
      <pre className="text-xs text-text-2 bg-surface border border-border p-3 overflow-auto max-h-80">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
