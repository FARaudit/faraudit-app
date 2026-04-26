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

            <Section title="Overview" summary={audit.overview_summary}>
              {audit.overview_json && <OverviewView data={audit.overview_json} />}
            </Section>

            <Section title="Compliance" summary={audit.compliance_summary}>
              {audit.compliance_json && <ComplianceView data={audit.compliance_json} />}
            </Section>

            <Section title="Risks" summary={audit.risks_summary}>
              {audit.risks_json && <RisksView data={audit.risks_json} />}
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
  children
}: {
  title: string;
  summary?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 rounded-xl border border-zinc-800 p-6">
      <h2 className="font-semibold text-lg">{title}</h2>
      {summary && <p className="text-zinc-400 text-sm mt-1">{summary}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function OverviewView({ data }: { data: Record<string, unknown> }) {
  const order = [
    "summary",
    "scope",
    "primary_objective",
    "customer",
    "contract_type",
    "ceiling_value_estimate",
    "period_of_performance"
  ];
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      {order.map((k) => {
        const v = data[k];
        if (v === undefined || v === null || v === "") return null;
        return (
          <div key={k} className={k === "summary" ? "sm:col-span-2" : ""}>
            <dt className="text-zinc-500 text-xs uppercase">{k.replace(/_/g, " ")}</dt>
            <dd className="text-zinc-200 mt-1">{String(v)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function ComplianceView({ data }: { data: Record<string, unknown> }) {
  const lists: Array<{ key: string; label: string }> = [
    { key: "far_clauses", label: "FAR clauses" },
    { key: "dfars_clauses", label: "DFARS clauses" },
    { key: "required_certifications", label: "Required certifications" },
    { key: "key_compliance_actions", label: "Key compliance actions" },
    { key: "deadlines", label: "Deadlines" }
  ];
  const setAside = data.set_aside_type;
  const sbEligible = data.small_business_eligibility;
  return (
    <div className="space-y-4">
      {Boolean(setAside || sbEligible) && (
        <p className="text-sm">
          {setAside ? (
            <>
              <span className="text-zinc-500">Set-aside: </span>
              <span className="text-zinc-200">{String(setAside)}</span>
            </>
          ) : null}
          {sbEligible ? (
            <span className="ml-3">
              <span className="text-zinc-500">SB eligible: </span>
              <span className="text-zinc-200">{String(sbEligible)}</span>
            </span>
          ) : null}
        </p>
      )}
      {lists.map(({ key, label }) => {
        const items = data[key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key}>
            <p className="text-zinc-500 text-xs uppercase mb-2">{label}</p>
            <ul className="space-y-1 text-sm text-zinc-200">
              {items.map((item, i) => (
                <li key={i} className="border-l-2 border-zinc-800 pl-3">
                  {String(item)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RisksView({ data }: { data: Record<string, unknown> }) {
  const lists: Array<{ key: string; label: string; emphasis?: boolean }> = [
    { key: "top_3_risks", label: "Top 3 risks", emphasis: true },
    { key: "technical_risks", label: "Technical" },
    { key: "schedule_risks", label: "Schedule" },
    { key: "price_risks", label: "Price" },
    { key: "evaluation_risks", label: "Evaluation" }
  ];
  const severity = data.severity_score;
  return (
    <div className="space-y-4">
      {typeof severity === "number" && (
        <div>
          <p className="text-zinc-500 text-xs uppercase mb-1">Severity</p>
          <p className="text-2xl font-bold">{severity}/10</p>
        </div>
      )}
      {lists.map(({ key, label, emphasis }) => {
        const items = data[key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key}>
            <p
              className={`text-xs uppercase mb-2 ${
                emphasis ? "text-red-400" : "text-zinc-500"
              }`}
            >
              {label}
            </p>
            <ul className="space-y-1 text-sm text-zinc-200">
              {items.map((item, i) => (
                <li key={i} className="border-l-2 border-zinc-800 pl-3">
                  {String(item)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
