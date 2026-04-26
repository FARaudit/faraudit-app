import { redirect, notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

type Params = { id: string };

const RECOMMENDATION_STYLES: Record<string, { color: string; label: string }> = {
  PROCEED: {
    color: "border-emerald-700 bg-emerald-950/40 text-emerald-300",
    label: "✓ PROCEED"
  },
  PROCEED_WITH_CAUTION: {
    color: "border-amber-700 bg-amber-950/40 text-amber-300",
    label: "⚠ PROCEED WITH CAUTION"
  },
  DECLINE: {
    color: "border-red-800 bg-red-950/40 text-red-300",
    label: "✗ DECLINE"
  }
};

const COMPLIANCE_KEY_LABELS: Record<string, string> = {
  far_clauses: "FAR clauses",
  dfars_clauses: "DFARS clauses",
  required_certifications: "Required certifications",
  key_compliance_actions: "Key compliance actions",
  deadlines: "Deadlines",
  set_aside_type: "Set-aside",
  small_business_eligibility: "Small business eligibility"
};

const RISK_KEY_LABELS: Record<string, string> = {
  top_3_risks: "Top 3 risks",
  technical_risks: "Technical",
  schedule_risks: "Schedule",
  price_risks: "Price",
  evaluation_risks: "Evaluation",
  severity_score: "Severity"
};

function humanLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Coerces any JSON value into an array of strings for rendering.
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
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (typeof value === "object") return [JSON.stringify(value)];
  return [];
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

  const style =
    RECOMMENDATION_STYLES[audit.recommendation as string] ||
    RECOMMENDATION_STYLES.PROCEED_WITH_CAUTION;

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <p className="text-sm text-zinc-500">Audit Result</p>
        <h1 className="text-3xl font-bold mt-1">{audit.title || audit.notice_id}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Notice {audit.notice_id}
          {audit.agency ? ` · ${audit.agency}` : ""}
          {audit.naics_code ? ` · NAICS ${audit.naics_code}` : ""}
          {audit.set_aside ? ` · ${audit.set_aside}` : ""}
        </p>

        {audit.status === "processing" && (
          <div className="mt-8 rounded-xl border border-amber-700 bg-amber-950/40 p-6">
            <p className="font-semibold">Audit in progress</p>
            <p className="text-sm text-zinc-400 mt-2">Refresh in a few seconds.</p>
          </div>
        )}

        {audit.status === "failed" && (
          <div className="mt-8 rounded-xl border border-red-800 bg-red-950/40 p-6">
            <p className="font-semibold">Audit failed</p>
            <p className="text-sm text-zinc-400 mt-2">
              {audit.error_message || "Unknown error"}
            </p>
          </div>
        )}

        {audit.status === "complete" && (
          <>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 p-5">
                <p className="text-zinc-400 text-sm">Compliance score</p>
                <p className="text-3xl font-bold mt-2">{audit.compliance_score}/100</p>
              </div>
              <div className={`rounded-xl border p-5 ${style.color}`}>
                <p className="text-xs uppercase tracking-wide opacity-75">Recommendation</p>
                <p className="text-2xl font-bold mt-2">{style.label}</p>
                {audit.bid_recommendation && (
                  <p className="text-xs mt-2 opacity-80">{audit.bid_recommendation}</p>
                )}
              </div>
            </div>

            <Section title="Overview" summary={audit.overview_summary} raw={audit.overview_json}>
              <OverviewView data={audit.overview_json} />
            </Section>

            <Section title="Compliance" summary={audit.compliance_summary} raw={audit.compliance_json}>
              <KeyValueLists data={audit.compliance_json} keyLabels={COMPLIANCE_KEY_LABELS} />
            </Section>

            <Section title="Risks" summary={audit.risks_summary} raw={audit.risks_json}>
              <RisksView data={audit.risks_json} />
            </Section>
          </>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  summary,
  children,
  raw
}: {
  title: string;
  summary?: string | null;
  children: React.ReactNode;
  raw?: unknown;
}) {
  return (
    <div className="mt-8 rounded-xl border border-zinc-800 p-6">
      <h2 className="font-semibold text-lg">{title}</h2>
      {summary && <p className="text-zinc-400 text-sm mt-1">{summary}</p>}
      <div className="mt-4">{children}</div>
      {raw !== undefined && raw !== null && (
        <details className="mt-6 group">
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400">
            Show raw JSON
          </summary>
          <pre className="mt-3 text-xs text-zinc-500 bg-zinc-950 border border-zinc-900 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function OverviewView({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") {
    return <p className="text-sm text-zinc-500 italic">No overview data.</p>;
  }
  const obj = data as Record<string, unknown>;
  const order = [
    "summary",
    "scope",
    "primary_objective",
    "customer",
    "contract_type",
    "ceiling_value_estimate",
    "period_of_performance"
  ];
  const knownEntries = order
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
    .map((k) => [k, obj[k]] as const);
  const extraEntries = Object.entries(obj).filter(
    ([k, v]) => !order.includes(k) && v !== undefined && v !== null && v !== ""
  );
  const all = [...knownEntries, ...extraEntries];
  if (all.length === 0) {
    return <p className="text-sm text-zinc-500 italic">No overview fields populated.</p>;
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      {all.map(([k, v]) => (
        <div key={k} className={k === "summary" ? "sm:col-span-2" : ""}>
          <dt className="text-zinc-500 text-xs uppercase">{humanLabel(k)}</dt>
          <dd className="text-zinc-200 mt-1">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function KeyValueLists({
  data,
  keyLabels
}: {
  data: unknown;
  keyLabels: Record<string, string>;
}) {
  if (!data || typeof data !== "object") {
    return <p className="text-sm text-zinc-500 italic">No data returned.</p>;
  }
  const obj = data as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500 italic">Claude returned an empty object.</p>;
  }

  let renderedAny = false;
  const blocks = entries.map(([key, value]) => {
    const label = keyLabels[key] || humanLabel(key);
    const items = toStringList(value);
    if (items.length === 0) {
      // Scalar fallback — render single-line value
      const single = value === null || value === undefined ? null : String(value);
      if (!single || single === "[]" || single === "null") return null;
      renderedAny = true;
      return (
        <div key={key}>
          <p className="text-zinc-500 text-xs uppercase mb-1">{label}</p>
          <p className="text-sm text-zinc-200">{single}</p>
        </div>
      );
    }
    renderedAny = true;
    return (
      <div key={key}>
        <p className="text-zinc-500 text-xs uppercase mb-2">
          {label} <span className="text-zinc-700">({items.length})</span>
        </p>
        <ul className="space-y-1 text-sm text-zinc-200">
          {items.map((item, i) => (
            <li key={i} className="border-l-2 border-zinc-800 pl-3">
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  });

  if (!renderedAny) {
    return (
      <p className="text-sm text-zinc-500 italic">
        Object had keys but no renderable values. Expand &quot;Show raw JSON&quot; below to inspect.
      </p>
    );
  }

  return <div className="space-y-4">{blocks}</div>;
}

function RisksView({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") {
    return <p className="text-sm text-zinc-500 italic">No risks data.</p>;
  }
  const obj = data as Record<string, unknown>;
  const severity = obj.severity_score;
  const order = [
    "top_3_risks",
    "technical_risks",
    "schedule_risks",
    "price_risks",
    "evaluation_risks"
  ];
  const orderedEntries = order
    .filter((k) => obj[k] !== undefined && obj[k] !== null)
    .map((k) => [k, obj[k]] as const);
  const extraEntries = Object.entries(obj).filter(
    ([k]) => !order.includes(k) && k !== "severity_score"
  );

  let renderedAny = false;
  const blocks = [...orderedEntries, ...extraEntries].map(([key, value]) => {
    const label = RISK_KEY_LABELS[key] || humanLabel(key);
    const emphasis = key === "top_3_risks";
    const items = toStringList(value);
    if (items.length === 0) {
      const single = value === null || value === undefined ? null : String(value);
      if (!single || single === "[]" || single === "null") return null;
      renderedAny = true;
      return (
        <div key={key}>
          <p className={`text-xs uppercase mb-1 ${emphasis ? "text-red-400" : "text-zinc-500"}`}>
            {label}
          </p>
          <p className="text-sm text-zinc-200">{single}</p>
        </div>
      );
    }
    renderedAny = true;
    return (
      <div key={key}>
        <p className={`text-xs uppercase mb-2 ${emphasis ? "text-red-400" : "text-zinc-500"}`}>
          {label} <span className="text-zinc-700">({items.length})</span>
        </p>
        <ul className="space-y-1 text-sm text-zinc-200">
          {items.map((item, i) => (
            <li key={i} className="border-l-2 border-zinc-800 pl-3">
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  });

  return (
    <div className="space-y-4">
      {typeof severity === "number" && (
        <div>
          <p className="text-zinc-500 text-xs uppercase mb-1">Severity</p>
          <p className="text-2xl font-bold">{severity}/10</p>
        </div>
      )}
      {renderedAny ? (
        blocks
      ) : (
        <p className="text-sm text-zinc-500 italic">
          No risk lists populated. Expand &quot;Show raw JSON&quot; below to inspect.
        </p>
      )}
    </div>
  );
}
