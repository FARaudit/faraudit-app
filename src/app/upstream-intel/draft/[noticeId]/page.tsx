import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import { fetchLiveOpportunitiesScoped } from "@/lib/bd-os/live-opportunities";
import type { OpportunityRow } from "@/lib/bd-os/queries";
import StreamingText from "@/components/StreamingText";

export const dynamic = "force-dynamic";

/* THIS PAGE ASKED A MODEL TO INVENT A FEDERAL SUBMISSION.
 *
 * It passed the model nothing but a notice id — no title, no agency, no scope — and then told it
 * to write a response "aligned to inferred scope", naming three HARDCODED NAICS codes
 * (336413/332710/332721) as the company's specialities whether or not the reader's profile held
 * them. The reader's actual codes are on file and were never read.
 *
 * ⛔ AND IT ASKED FOR A PRIOR PERFORMANCE REFERENCE. `capability_statements.past_performance` is
 * an EMPTY ARRAY on the account this was measured against, so there was no reference to cite and
 * the only way to satisfy that instruction was to make one up — in a document a customer may send
 * to a contracting officer. A fabricated past-performance citation is not a rendering defect.
 *
 * WHAT IT DOES NOW. The notice is resolved from the customer's own feed, so the draft is written
 * against the real title, agency, type and deadline, and a notice outside their scope is refused
 * rather than guessed at. The company facts come from their capability statement. Past
 * performance is requested ONLY when records exist; with none on file the model is told to leave
 * a marked placeholder and forbidden to invent one.
 */

type Caps = {
  company_name: string | null;
  naics_codes: string[] | null;
  core_competencies: string | null;
  differentiators: string | null;
  past_performance: unknown[] | null;
};

export default async function DraftPage({
  params
}: {
  params: Promise<{ noticeId: string }>;
}) {
  const { noticeId } = await params;
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const decoded = decodeURIComponent(noticeId);

  let row: OpportunityRow | null = null;
  let feedFailed = false;
  try {
    const { rows } = await fetchLiveOpportunitiesScoped(sb);
    const key = decoded.toLowerCase();
    row =
      (rows || []).find(
        (r) =>
          String(r.notice_id || "").toLowerCase() === key ||
          String(r.solicitation_number || "").toLowerCase() === key
      ) || null;
  } catch {
    feedFailed = true;
  }

  const { data: capsRow } = await sb
    .from("capability_statements")
    .select("company_name, naics_codes, core_competencies, differentiators, past_performance")
    .maybeSingle();
  const caps = (capsRow || null) as Caps | null;
  const ppCount = Array.isArray(caps?.past_performance) ? caps!.past_performance!.length : 0;

  /* A failed feed read and a notice genuinely outside the customer's scope are different facts
     and must not render alike — one is our outage, the other is their answer. */
  if (feedFailed || !row) {
    return (
      <Shell decoded={decoded}>
        <section className="border border-border bg-surface p-6">
          <p className="text-text font-medium">
            {feedFailed ? "SAM could not be read just now." : "That notice is not in your feed."}
          </p>
          <p className="mt-1 text-text-2 text-sm">
            {feedFailed
              ? "This is an outage, not a missing notice. Reload in a moment."
              : "A draft is only written against a notice we can actually read, so nothing is drafted here. It may sit outside your NAICS codes, or its response date may have passed."}
          </p>
          <Link href="/upstream-intel" className="mt-4 inline-block text-accent text-sm hover:underline">
            Back to Upstream Intel
          </Link>
        </section>
      </Shell>
    );
  }

  const prompt = [
    `Draft a response to this ${row.notice_type || "notice"}. Use ONLY the facts given — do not add`,
    `capabilities, certifications, contract numbers, customer names or dates that are not here.`,
    ``,
    `NOTICE`,
    `  id: ${row.notice_id || "—"}`,
    `  solicitation: ${row.solicitation_number || "—"}`,
    `  title: ${row.title || "—"}`,
    `  buying office: ${row.agency || "—"}`,
    `  NAICS: ${row.naics_code || "—"}`,
    `  responses due: ${row.response_deadline || "not stated"}`,
    ``,
    `RESPONDING COMPANY`,
    `  name: ${caps?.company_name || "—"}`,
    `  registered NAICS: ${(caps?.naics_codes || []).join(", ") || "—"}`,
    `  core competencies: ${caps?.core_competencies || "not on file"}`,
    `  differentiators: ${caps?.differentiators || "not on file"}`,
    ``,
    `Write ~200 words: (1) a capability statement tied to THIS notice's stated scope,`,
    ppCount > 0
      ? `(2) a past performance paragraph drawn only from the ${ppCount} record(s) supplied in context,`
      : `(2) a past performance section left as the literal placeholder [PAST PERFORMANCE — ADD A REFERENCE]` +
        ` — there are NO past performance records on file, so do not name a contract, customer, value or date,`,
    `(3) two or three specific points where the eventual SOW language could be shaped, each tied to a`,
    `capability above. No greeting, no closing.`
  ].join("\n");

  return (
    <Shell decoded={decoded}>
      <div className="border border-border bg-surface p-4 mb-6">
        <p className="text-text font-medium text-sm leading-snug">{row.title || "Untitled notice"}</p>
        <p className="mt-1 text-text-2 text-xs">
          {row.notice_type || "Notice"} · {row.agency || "Buying office not stated"}
          {row.response_deadline && ` · responses due ${String(row.response_deadline).slice(0, 10)}`}
        </p>
      </div>

      <StreamingText
        prompt={prompt}
        context={{
          notice: {
            notice_id: row.notice_id,
            solicitation_number: row.solicitation_number,
            title: row.title,
            type: row.notice_type,
            agency: row.agency,
            naics: row.naics_code,
            response_deadline: row.response_deadline
          },
          company: {
            name: caps?.company_name ?? null,
            naics_codes: caps?.naics_codes ?? [],
            core_competencies: caps?.core_competencies ?? null,
            differentiators: caps?.differentiators ?? null
          },
          past_performance: ppCount > 0 ? caps!.past_performance : []
        }}
        emptyState="ANTHROPIC_API_KEY not set — draft unavailable."
      />

      <p className="mt-6 text-xs text-text-3 leading-relaxed">
        A draft, not a submission — read every line before it leaves your hands.
        {ppCount === 0 && (
          <>
            {" "}
            <span className="text-warn">
              You have no past performance on file, so the draft leaves that section blank for you to
              fill. It will not write one for you.
            </span>{" "}
            <Link href="/settings" className="text-accent hover:underline">Add past performance</Link>.
          </>
        )}
      </p>
    </Shell>
  );
}

function Shell({ decoded, children }: { decoded: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5">
        <div className="flex items-center gap-2 text-xs text-text-3 mb-2">
          <Link href="/upstream-intel" className="hover:text-text-2">Upstream Intel</Link>
          <span>›</span>
          <span className="text-text-2">{decoded}</span>
        </div>
        <h1 className="font-display text-2xl text-text font-medium">Draft Response</h1>
      </header>
      <main className="px-6 md:px-10 py-8 max-w-3xl mx-auto">{children}</main>
    </div>
  );
}
