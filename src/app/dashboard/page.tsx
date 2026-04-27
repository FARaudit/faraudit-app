import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import SignOutButton from "./signout-button";

interface AuditRow {
  id: number;
  notice_id: string;
  title: string | null;
  agency: string | null;
  response_deadline: string | null;
  compliance_score: number | null;
  recommendation: string | null;
  status: string | null;
  created_at: string | null;
}

const COMPETITORS = [
  { name: "GovDash", note: "AI proposal generation. Heavy on capture managers." },
  { name: "VisibleThread", note: "Compliance matrix tooling. Static analysis only." },
  { name: "Deltek GovWin", note: "$15-50K/yr seat. Bloated. Built for primes." },
  { name: "Procurement Sciences", note: "Generic SAM.gov scraper + LLM summaries." },
  { name: "Manual review", note: "$300/hr capture consultants. 2-day turnaround." }
];

// Display-cleanup for legacy titles that came in URL-encoded from PDF filename derivation.
function cleanTitle(raw: string | null): string {
  if (!raw) return "Untitled solicitation";
  return raw
    .replace(/\+/g, " ")
    .replace(/^solicitation\s*[-–—]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Untitled solicitation";
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [activeRes, highScoreRes, totalRes, recentRes] = await Promise.all([
    supabase.from("audits").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("compliance_score", 70),
    supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "complete"),
    supabase
      .from("audits")
      .select("id, notice_id, title, agency, response_deadline, compliance_score, recommendation, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  const recent = (recentRes.data || []) as AuditRow[];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 md:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-display text-2xl text-text">FARaudit</Link>
          <nav className="hidden md:flex gap-6 text-sm text-text-2">
            <Link href="/dashboard" className="text-text">Dashboard</Link>
            <Link href="/audit" className="hover:text-text">Audit</Link>
            <Link href="/capital" className="hover:text-text">Capital OS</Link>
            <Link href="/legal" className="hover:text-text">LexAnchor</Link>
          </nav>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-3 font-mono uppercase tracking-wider">Signed in as</p>
          <p className="text-sm text-text">{user.email}</p>
          <SignOutButton />
        </div>
      </header>

      <main className="px-6 md:px-10 py-12 md:py-16 max-w-7xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-4">Command Center</p>
        <h1 className="font-display text-4xl md:text-5xl text-text font-light">Dashboard</h1>
        <p className="mt-3 text-text-2">Live solicitations · scores · capture intelligence</p>

        {/* Metric cards */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          <Metric label="Active Solicitations" value={activeRes.count ?? 0} />
          <Metric label="High-Score Matches" value={highScoreRes.count ?? 0} accent="gold" />
          <Metric label="Audit Reports" value={totalRes.count ?? 0} />
        </div>

        {/* Recent audits */}
        <div className="mt-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-2">Live Feed</p>
              <h2 className="font-display text-2xl md:text-3xl text-text font-light">Recent audits</h2>
            </div>
            <Link
              href="/audit"
              className="text-sm text-gold hover:text-gold-dim font-mono uppercase tracking-wider"
            >
              + Run audit
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="border border-border bg-surface p-16 text-center">
              <p className="font-display text-xl text-text-2">No audits yet.</p>
              <p className="text-sm text-text-3 mt-2 mb-6">Audit your first solicitation to see findings here.</p>
              <Link
                href="/audit"
                className="inline-block px-8 py-3 bg-gold text-bg font-medium hover:bg-gold-dim transition-colors"
              >
                Run your first audit
              </Link>
            </div>
          ) : (
            <div className="border border-border">
              {recent.map((a) => <FeedRow key={a.id} audit={a} />)}
            </div>
          )}
        </div>

        {/* News today */}
        <div className="mt-20">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-2">News</p>
          <h2 className="font-display text-2xl md:text-3xl text-text font-light mb-8">Today&apos;s digest</h2>
          <div className="border border-border bg-surface p-10 text-center">
            <p className="text-text-2">No news today.</p>
            <p className="text-xs text-text-3 mt-2 font-mono">
              FARaudit daily digest fires 06:15 CT · pulls from Federal Register, GAO, SAM.gov
            </p>
          </div>
        </div>

        {/* SAM.gov feed */}
        <div className="mt-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-2">SAM.gov Feed</p>
              <h2 className="font-display text-2xl md:text-3xl text-text font-light">
                Recent solicitations · NAICS 336413 · TX + OK
              </h2>
            </div>
          </div>
          <div className="border border-border bg-surface p-10 text-center">
            <p className="text-text-2">Live feed warming up.</p>
            <p className="text-xs text-text-3 mt-2 font-mono">
              Tinker AFB · Sheppard AFB · Red River Army Depot · Sierra Army Depot
            </p>
          </div>
        </div>

        {/* Competitor watch */}
        <div className="mt-20">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-2">Competitor Watch</p>
          <h2 className="font-display text-2xl md:text-3xl text-text font-light mb-8">Who else is in this space</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-border">
            {COMPETITORS.map((c) => (
              <div key={c.name} className="bg-surface p-5">
                <p className="font-display text-base text-text">{c.name}</p>
                <p className="mt-2 text-xs text-text-2 leading-relaxed">{c.note}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: "gold" }) {
  return (
    <div className="bg-surface px-8 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-text-3 font-mono">{label}</p>
      <p
        className={`mt-5 font-display text-5xl md:text-6xl font-light tracking-tight ${
          accent === "gold" ? "text-gold" : "text-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FeedRow({ audit }: { audit: AuditRow }) {
  const score = audit.compliance_score;
  let scoreColor = "text-text-3 border-text-3/40";
  if (typeof score === "number") {
    if (score >= 70) scoreColor = "text-green border-green";
    else if (score >= 40) scoreColor = "text-amber border-amber";
    else scoreColor = "text-red border-red";
  }

  const isPending = audit.status === "processing" || audit.status === "pending";
  const isFailed = audit.status === "failed";

  return (
    <Link
      href={`/audit/${audit.id}`}
      className="group flex items-center justify-between gap-6 bg-surface hover:bg-surface-2 px-6 py-5 border-b border-border last:border-b-0 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-gold tracking-wider">{audit.notice_id}</p>
          {isPending && <span className="font-mono text-xs text-amber uppercase">processing</span>}
          {isFailed && <span className="font-mono text-xs text-red uppercase">failed</span>}
        </div>
        <p className="mt-1.5 text-text truncate font-display text-lg">{cleanTitle(audit.title)}</p>
        <p className="mt-1 text-xs text-text-2 truncate font-mono">
          {audit.agency || "—"}
          {audit.response_deadline && ` · due ${new Date(audit.response_deadline).toLocaleDateString()}`}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {audit.recommendation && (
          <span className="hidden sm:inline-block font-mono text-xs uppercase tracking-[0.2em] text-text-3 group-hover:text-text-2">
            {audit.recommendation === "PROCEED_WITH_CAUTION" ? "Caution" : audit.recommendation}
          </span>
        )}
        <div
          className={`flex items-center justify-center w-14 h-14 rounded-full border-2 ${scoreColor} font-display text-xl`}
        >
          {typeof score === "number" ? score : "—"}
        </div>
      </div>
    </Link>
  );
}
