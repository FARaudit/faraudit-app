import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/* THIS PAGE INVENTED FOUR COMPANIES AND SHOWED THEM TO SIGNED-IN CUSTOMERS.
 *
 * A hardcoded SEED rendered Snoe Inc, PMR Global, Southern Machine Works and American
 * Valmark as the reader's own prospect list — invented cities, invented scores to one
 * decimal (9.2 · 8.8 · 8.3 · 7.8), invented statuses ("Audit complete", "RFI in flight")
 * and an invented contact person. The detail page behind it went further: fabricated UEIs
 * and CAGE codes — federal registration identifiers with exactly one real source, SAM —
 * plus certifications, revenue bands, audit histories, and five NAMED individuals with
 * titles and a "reachable" flag.
 *
 * WHY IT IS NOT REPLACED WITH REAL ROWS. There is no source to read. Nothing in this
 * codebase queries a prospects table — `from("prospects")` does not appear anywhere — and
 * wiring one is its own item (#SESS-SALES-AI: move the Sales AI output into Supabase and
 * wire a live tab). So the honest state is "not wired yet", and the surface stays for that
 * item to fill rather than being deleted out from under it.
 *
 * ⛔ AND IT IS NOT RELABELLED AS AN EXAMPLE. A demo table of plausible subcontractors with
 * scores is read as a product doing its job, and the identifiers made it worse, not more
 * illustrative. Same call as the Defense Spending panel in #426: pull it.
 */

export default async function ProspectsPage() {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5">
        <div className="flex items-center gap-2 text-xs text-text-3 mb-2">
          <Link href="/dashboard" className="hover:text-text-2">Dashboard</Link>
          <span>›</span>
          <span className="text-text-2">Prospects</span>
        </div>
        <h1 className="font-display text-3xl text-text font-medium">Prospects</h1>
        <p className="mt-2 text-text-2 text-sm">
          Subcontractor records — not connected to a data source yet.
        </p>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-6xl mx-auto">
        <section className="border border-border bg-surface p-6">
          <p className="text-text font-medium">There is nothing here yet, and that is the truth of it.</p>
          <p className="mt-2 text-text-2 text-sm leading-relaxed">
            This page used to list four subcontractors with scores, statuses and contacts. None of
            them existed — they were written into the page, not found. They have been removed rather
            than relabelled, because a table of plausible companies reads as a product working.
          </p>
          <p className="mt-3 text-text-2 text-sm leading-relaxed">
            Prospect discovery runs today, but its output is not yet stored anywhere this page can
            read. When it is, real records appear here — with the identifiers coming from SAM, which
            is the only place a UEI or CAGE code can honestly come from.
          </p>
          <Link href="/notices" className="mt-4 inline-block text-accent text-sm hover:underline">
            Open Notices, which is live
          </Link>
        </section>
      </main>
    </div>
  );
}
