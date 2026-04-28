import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface ProspectSeed {
  slug: string;
  name: string;
  city: string;
  score: number;
  status: string;
  capability: string;
  contact: string | null;
}

const SEED: ProspectSeed[] = [
  { slug: "snoe-inc", name: "Snoe Inc", city: "Tulsa, OK", score: 9.2, status: "Active outreach", capability: "Forging · NAICS 332710", contact: null },
  { slug: "pmr-global", name: "PMR Global", city: "Houston, TX", score: 8.8, status: "Audit complete", capability: "Machining · NAICS 332710", contact: null },
  { slug: "southern-machine-works", name: "Southern Machine Works", city: "Birmingham, AL", score: 8.3, status: "RFI in flight", capability: "Heavy machining · NAICS 332710", contact: null },
  { slug: "american-valmark", name: "American Valmark", city: "Dallas, TX", score: 7.8, status: "Discovery", capability: "Coating · NAICS 332812", contact: "Rachel Prevost" }
];

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
        <h1 className="font-display text-3xl text-text font-medium">Prospects CRM</h1>
        <p className="mt-2 text-text-2 text-sm">Six-tab record per subcontractor: Snapshot · Financials · Authority · Compliance · Play · Anchors.</p>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-6xl mx-auto">
        <div className="border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-text-3">
              <tr>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-normal">Prospect</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-normal">Capability</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-normal">Status</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-normal">Contact</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-normal">Score</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-normal" />
              </tr>
            </thead>
            <tbody>
              {SEED.map((p) => (
                <tr key={p.slug} className="border-t border-border hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <p className="text-text font-medium">{p.name}</p>
                    <p className="text-[11px] text-text-3 mt-0.5">{p.city}</p>
                  </td>
                  <td className="px-4 py-3 text-text-2 text-xs">{p.capability}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="inline-block bg-accent/15 text-accent px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-2 text-xs">{p.contact ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono text-lg ${p.score >= 8.5 ? "text-green" : p.score >= 7.5 ? "text-warn" : "text-text"}`}>
                      {p.score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/prospects/${p.slug}`} className="text-xs text-accent hover:text-mid">
                      Open ›
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 border border-border bg-surface p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-3">Six-tab record</p>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-text-2">
            <li><strong className="text-text block">Snapshot</strong>HQ · NAICS · employees · key facilities</li>
            <li><strong className="text-text block">Financials</strong>D&amp;B · revenue band · funding posture</li>
            <li><strong className="text-text block">Authority</strong>Decision-makers + reachable contacts</li>
            <li><strong className="text-text block">Compliance</strong>CMMC · ITAR · cleared facilities · cert dates</li>
            <li><strong className="text-text block">Play</strong>Outreach sequence + last touch</li>
            <li><strong className="text-text block">Anchors</strong>Live audits + RFI / Sources Sought matched</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
