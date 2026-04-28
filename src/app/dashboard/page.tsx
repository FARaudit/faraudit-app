import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import StreamingText from "@/components/StreamingText";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: number;
  notice_id: string;
  title: string | null;
  document_type: string | null;
  recommendation: string | null;
  compliance_score: number | null;
  ko_email_sent: boolean | null;
  status: string;
  created_at: string;
}

export default async function DashboardPage() {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: audits }, { count: emails }, { count: solicitationsCount }] = await Promise.all([
    sb
      .from("audits")
      .select("id, notice_id, title, document_type, recommendation, compliance_score, ko_email_sent, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    sb.from("audits").select("id", { count: "exact", head: true }).eq("ko_email_sent", true),
    sb
      .from("intel_briefs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
  ]);

  const auditList = (audits ?? []) as AuditRow[];
  const auditCount = auditList.length;
  const trapsCount = auditList.filter((a) => a.recommendation === "DECLINE").length;

  const briefPrompt = `Today's federal contracting intelligence summary for a defense subcontractor in the TX/OK corridor. Cover in 4 bullets:
1. New solicitations matched to NAICS 336413 / 332710 / 332721 in the last 24h
2. Upcoming proposal deadlines in the next 7 days for tracked NAICS codes
3. Congressional defense spending news that affects subcontract pipelines
4. One actionable next step for the day

No preamble. Bullets only. Each ≤25 words.`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-1">Dashboard</p>
          <h1 className="font-display text-3xl text-text font-medium">FARaudit command</h1>
        </div>
        <Link
          href="/audit"
          className="bg-accent text-white px-4 py-2 text-sm font-medium tracking-wide hover:bg-accent-2"
        >
          + New audit
        </Link>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-7xl mx-auto space-y-10">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
          <Stat label="Audits Run" value={String(auditCount)} sub="Recent 20 shown" />
          <Stat label="Traps Caught" value={String(trapsCount)} tone="red" sub="Declined recommendations" />
          <Stat label="KO Emails Sent" value={String(emails ?? 0)} sub="via Resend" />
          <Stat label="Active Solicitations" value={String(solicitationsCount ?? 0)} sub="Watched (30d)" />
        </section>

        <section>
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-3">Morning Brief</p>
          <StreamingText
            prompt={briefPrompt}
            emptyState="ANTHROPIC_API_KEY not set — brief unavailable."
          />
        </section>

        <section>
          <p className="text-[10px] uppercase tracking-[0.3em] text-text-3 mb-3">Recent audits</p>
          {auditList.length === 0 ? (
            <p className="text-text-3 italic text-sm">No audits yet — run your first.</p>
          ) : (
            <div className="border border-border bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-text-3">
                  <tr>
                    <Th>Notice</Th>
                    <Th>Title</Th>
                    <Th>Type</Th>
                    <Th align="right">Score</Th>
                    <Th>Recommendation</Th>
                    <Th>KO Email</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {auditList.map((a) => (
                    <tr key={a.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-2 text-text font-mono text-xs">{a.notice_id}</td>
                      <td className="px-4 py-2 text-text-2 text-xs truncate max-w-[28ch]">{a.title || "—"}</td>
                      <td className="px-4 py-2">
                        {a.document_type ? (
                          <span className="text-[10px] tracking-[0.18em] uppercase border border-accent/40 text-accent px-2 py-0.5">
                            {a.document_type}
                          </span>
                        ) : (
                          <span className="text-text-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-text text-right font-mono">{a.compliance_score ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">
                        {a.recommendation === "PROCEED" && <span className="text-green">Proceed</span>}
                        {a.recommendation === "PROCEED_WITH_CAUTION" && <span className="text-warn">Caution</span>}
                        {a.recommendation === "DECLINE" && <span className="text-red">Decline</span>}
                        {!a.recommendation && <span className="text-text-3">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {a.ko_email_sent ? <span className="text-green">✓ sent</span> : <span className="text-text-3">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-text-3 uppercase">{a.status}</td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/audit/${a.id}`} className="text-xs text-accent hover:text-mid">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "green" }) {
  const color = tone === "red" ? "text-red" : tone === "green" ? "text-green" : "text-text";
  return (
    <div className="bg-surface px-5 py-5">
      <p className="text-[11px] uppercase tracking-[0.2em] text-text-3">{label}</p>
      <p className={`mt-2 font-mono text-3xl ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-[10px] text-text-3">{sub}</p>}
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`text-${align} px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-normal`}>
      {children ?? ""}
    </th>
  );
}
