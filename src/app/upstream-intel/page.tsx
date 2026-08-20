import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import { fetchLiveOpportunitiesScoped } from "@/lib/bd-os/live-opportunities";
import type { OpportunityRow } from "@/lib/bd-os/queries";
import StreamingText from "@/components/StreamingText";

export const dynamic = "force-dynamic";

/* THIS PAGE USED TO INVENT ITS OWN CONTENT.
 *
 * It shipped a hardcoded SEED of three notices — invented notice ids, invented agencies,
 * invented dates — rendered to a SIGNED-IN customer as their own upstream feed, with no
 * "Example" marker anywhere on the page. Each row carried an `influence_score` drawn as a
 * precise gauge (92 · 78 · 64) and a `match_reason`, one of which stated a measured-sounding
 * "60% inclusion rate" that nothing had ever measured. Both buttons on every row pointed at
 * those non-existent notices, and the Run Audit one pointed at /audit, which is not a route.
 *
 * WHAT REPLACES IT, AND WHAT DOES NOT. The FEED half is real and always was: SAM publishes
 * Sources Sought and Presolicitation notices, and fetchLiveOpportunitiesScoped — the same call
 * /notices renders from — already returns them inside the customer's own NAICS scope. So the
 * rows are now real rows.
 *
 * The RANKING half is not real and is not replaced by an estimate. `influence_score` and
 * `match_reason` required a SOW match history that does not exist, so the gauge is gone rather
 * than recomputed from something weaker wearing the same number. What ranks the list now is
 * the deadline, which is a fact on the row. The page says so instead of implying more.
 */

const UPSTREAM_TYPES = ["sources sought", "presolicitation"];

const isUpstream = (r: OpportunityRow): boolean =>
  UPSTREAM_TYPES.includes(String(r.notice_type || "").trim().toLowerCase());

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export default async function UpstreamIntelPage() {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  /* Three outcomes, and none of them render alike: a failed read is not an empty feed, and
     an empty feed is not a feed we never asked for. */
  let rows: OpportunityRow[] | null = null;
  let codes: string[] = [];
  try {
    const { rows: all, scope } = await fetchLiveOpportunitiesScoped(sb);
    codes = scope.codes || [];
    rows = (all || []).filter(isUpstream).sort((a, b) => {
      const da = daysUntil(a.response_deadline), db = daysUntil(b.response_deadline);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  } catch {
    rows = null;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5">
        <div className="flex items-center gap-2 text-xs text-text-3 mb-2">
          <Link href="/dashboard" className="hover:text-text-2">Dashboard</Link>
          <span>›</span>
          <span className="text-text-2">Upstream Intel</span>
        </div>
        <h1 className="font-display text-3xl text-text font-medium">Upstream Intelligence</h1>
        <p className="mt-2 text-text-2 text-sm">
          Sources Sought and Presolicitation notices in your NAICS codes — requirements that are
          not fixed yet, so a response can still shape the eventual scope. Soonest deadline first.
        </p>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-6xl mx-auto space-y-6">
        {rows === null && (
          <section className="border border-border bg-surface p-6">
            <p className="text-text font-medium">SAM could not be read just now.</p>
            <p className="mt-1 text-text-2 text-sm">
              This is an outage, not an empty result — there may well be open upstream notices.
              Reload in a moment.
            </p>
          </section>
        )}

        {rows !== null && rows.length === 0 && (
          <section className="border border-border bg-surface p-6">
            <p className="text-text font-medium">No upstream notices are open in your NAICS codes.</p>
            <p className="mt-1 text-text-2 text-sm">
              SAM was read and answered{codes.length ? ` for ${codes.join(" · ")}` : ""}. Sources
              Sought and Presolicitation notices post irregularly; this is a real zero, not a
              failure.
            </p>
          </section>
        )}

        {rows !== null && rows.length > 0 && (
          <>
            <p className="text-xs text-text-3">
              {rows.length} open upstream {rows.length === 1 ? "notice" : "notices"}
              {codes.length ? ` · ${codes.join(" · ")}` : ""}
            </p>
            {rows.map((r) => (
              <UpstreamCard key={r.notice_id || r.id} record={r} />
            ))}
          </>
        )}

        <section className="border border-border bg-surface p-6 mt-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-3">Strategy brief</p>
          {/* The prompt used to name three hardcoded NAICS codes, which were not necessarily the
              reader's. It now carries the codes their profile actually holds, and the brief is
              suppressed entirely when there is nothing real to advise on. */}
          {rows && rows.length > 0 ? (
            <StreamingText
              prompt={
                `In 4 sentences, advise a defense subcontractor on which of these open Sources Sought / ` +
                `Presolicitation notices to prioritise this week, and why. Rank on response deadline and ` +
                `fit to NAICS ${codes.join(", ") || "their registered codes"}. Use only the notices given. ` +
                `End with one specific action.`
              }
              context={{
                naics: codes,
                notices: rows.slice(0, 12).map((r) => ({
                  notice_id: r.notice_id,
                  title: r.title,
                  type: r.notice_type,
                  agency: r.agency,
                  naics: r.naics_code,
                  response_deadline: r.response_deadline
                }))
              }}
              emptyState="ANTHROPIC_API_KEY not set."
            />
          ) : (
            <p className="text-text-3 text-sm italic">
              No brief — there are no upstream notices to rank.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

function UpstreamCard({ record }: { record: OpportunityRow }) {
  const days = daysUntil(record.response_deadline);
  const noticeId = String(record.notice_id || "").trim();
  const sol = String(record.solicitation_number || "").trim();
  const urgent = days !== null && days <= 7;

  return (
    <article className="border border-border bg-surface p-5 grid grid-cols-1 md:grid-cols-[120px_1fr_auto] gap-5 items-center">
      {/* Days to respond — a fact on the row. This slot held an invented influence score. */}
      <div className="flex flex-col items-center justify-center">
        {days === null ? (
          <span className="text-xs text-text-3 text-center">no deadline<br />posted</span>
        ) : (
          <>
            <span className={`font-mono text-3xl ${urgent ? "text-warn" : "text-text"}`}>
              {days < 0 ? "—" : days}
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-text-3 mt-0.5">
              {days < 0 ? "closed" : days === 1 ? "day left" : "days left"}
            </span>
          </>
        )}
      </div>

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.18em] border border-accent/40 text-accent px-2 py-0.5">
            {record.notice_type || "Notice"}
          </span>
          <span className="font-mono text-xs text-text-3">{sol || noticeId}</span>
          {record.naics_code && (
            <span className="font-mono text-[10px] text-text-3">NAICS {record.naics_code}</span>
          )}
        </div>
        <p className="mt-2 text-text font-medium leading-snug">{record.title || "Untitled notice"}</p>
        <p className="mt-1 text-text-2 text-xs">
          {record.agency || "Buying office not stated"}
          {record.response_deadline && ` · responses due ${String(record.response_deadline).slice(0, 10)}`}
        </p>
      </div>

      <div className="flex flex-col gap-2 md:items-end">
        <Link
          href={`/upstream-intel/draft/${encodeURIComponent(noticeId)}`}
          className="bg-accent text-white px-4 py-2 text-xs font-medium tracking-wide hover:bg-accent-2 text-center"
        >
          Draft Response
        </Link>
        {/* Was /audit, which is not a route — the button 404'd on every row. */}
        <Link
          href={`/notices/${encodeURIComponent(noticeId)}`}
          className="border border-border text-text-2 hover:text-text px-4 py-2 text-xs text-center"
        >
          Open notice
        </Link>
      </div>
    </article>
  );
}
