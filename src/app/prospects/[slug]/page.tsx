import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/* THIS PAGE SERVED FABRICATED FEDERAL IDENTIFIERS.
 *
 * A hardcoded RECORDS map held four companies with invented UEIs (MK7XAB99TB29 and three
 * more) and invented CAGE codes — identifiers whose ONLY honest source is SAM — alongside
 * invented certifications, revenue bands, audit histories, and five NAMED individuals with
 * titles and a "reachable" flag, presented across six tabs as researched intelligence.
 *
 * Nothing in this codebase reads a prospects table; `from("prospects")` appears nowhere. So
 * there was no source these records could have come from, and there is none to swap in.
 * Wiring one is #SESS-SALES-AI. The route stays so that item has somewhere to land.
 */

export default async function ProspectPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5">
        <div className="flex items-center gap-2 text-xs text-text-3 mb-2">
          <Link href="/prospects" className="hover:text-text-2">Prospects</Link>
          <span>›</span>
          <span className="text-text-2">{decodeURIComponent(slug)}</span>
        </div>
        <h1 className="font-display text-2xl text-text font-medium">No record for this prospect</h1>
      </header>
      <main className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
        <section className="border border-border bg-surface p-6">
          <p className="text-text-2 text-sm leading-relaxed">
            This page used to show a six-tab profile here — registration identifiers, certifications,
            revenue, named contacts. Every field was written into the page rather than researched, so
            it has been removed. Prospect records are not connected to a data source yet.
          </p>
          <Link href="/prospects" className="mt-4 inline-block text-accent text-sm hover:underline">
            Back to Prospects
          </Link>
        </section>
      </main>
    </div>
  );
}
