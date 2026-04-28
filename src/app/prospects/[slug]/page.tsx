import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import StreamingText from "@/components/StreamingText";

export const dynamic = "force-dynamic";

interface ProspectRecord {
  slug: string;
  name: string;
  city: string;
  score: number;
  capability: string;
  contact: string | null;
  cage: string;
  uei: string;
  naics: string[];
  certs: string[];
  decision_makers: Array<{ name: string; title: string; reachable: boolean }>;
  revenue_band: string;
  status: string;
  audits: Array<{ notice_id: string; recommendation: string; date: string }>;
}

const RECORDS: Record<string, ProspectRecord> = {
  "snoe-inc": {
    slug: "snoe-inc",
    name: "Snoe Inc",
    city: "Tulsa, OK",
    score: 9.2,
    capability: "Forging · NAICS 332710",
    contact: null,
    cage: "0X9N4",
    uei: "MK7XAB99TB29",
    naics: ["332710", "332111"],
    certs: ["CMMC L2 in progress", "ITAR registered"],
    decision_makers: [
      { name: "Marvin Snoe", title: "President", reachable: true },
      { name: "Linda Park", title: "Director, Government Programs", reachable: true }
    ],
    revenue_band: "$8M – $20M",
    status: "Active outreach",
    audits: [{ notice_id: "FA8533-26-Q-0042", recommendation: "PROCEED", date: "2026-04-22" }]
  },
  "pmr-global": {
    slug: "pmr-global",
    name: "PMR Global",
    city: "Houston, TX",
    score: 8.8,
    capability: "Machining · NAICS 332710",
    contact: null,
    cage: "5LM27",
    uei: "JK39AB72MN18",
    naics: ["332710", "336413"],
    certs: ["AS9100D", "CMMC L2"],
    decision_makers: [
      { name: "Patricia Russo", title: "VP Operations", reachable: true }
    ],
    revenue_band: "$20M – $50M",
    status: "Audit complete",
    audits: [{ notice_id: "W912DY-26-R-0018", recommendation: "PROCEED_WITH_CAUTION", date: "2026-04-15" }]
  },
  "southern-machine-works": {
    slug: "southern-machine-works",
    name: "Southern Machine Works",
    city: "Birmingham, AL",
    score: 8.3,
    capability: "Heavy machining · NAICS 332710",
    contact: null,
    cage: "8N2P5",
    uei: "RT47BC81PL92",
    naics: ["332710"],
    certs: ["ISO 9001:2015"],
    decision_makers: [{ name: "Bill Henderson", title: "Owner", reachable: true }],
    revenue_band: "$5M – $15M",
    status: "RFI in flight",
    audits: []
  },
  "american-valmark": {
    slug: "american-valmark",
    name: "American Valmark",
    city: "Dallas, TX",
    score: 7.8,
    capability: "Coating · NAICS 332812",
    contact: "Rachel Prevost",
    cage: "3K8R7",
    uei: "WX52CD93QR41",
    naics: ["332812"],
    certs: ["NADCAP coating"],
    decision_makers: [{ name: "Rachel Prevost", title: "Director, Defense Programs", reachable: true }],
    revenue_band: "$15M – $35M",
    status: "Discovery",
    audits: []
  }
};

const TABS = ["Snapshot", "Financials", "Authority", "Compliance", "Play", "Anchors"] as const;
type Tab = (typeof TABS)[number];

export default async function ProspectPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab: tabParam } = await searchParams;
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const record = RECORDS[slug];
  if (!record) notFound();

  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "Snapshot";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5">
        <div className="flex items-center gap-2 text-xs text-text-3 mb-2">
          <Link href="/prospects" className="hover:text-text-2">Prospects</Link>
          <span>›</span>
          <span className="text-text-2">{record.name}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl text-text font-medium">{record.name}</h1>
            <p className="mt-1 text-text-2 text-sm">{record.city} · {record.capability}</p>
          </div>
          <div className="text-right">
            <span className={`font-mono text-3xl ${record.score >= 8.5 ? "text-green" : record.score >= 7.5 ? "text-warn" : "text-text"}`}>
              {record.score.toFixed(1)}
            </span>
            <p className="text-[10px] text-text-3 uppercase tracking-[0.18em] mt-1">match score</p>
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-1 text-xs">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/prospects/${record.slug}?tab=${t}`}
              className={`px-2.5 py-1 border ${
                tab === t ? "border-accent text-text bg-surface-2" : "border-border text-text-3 hover:text-text-2"
              }`}
            >
              {t}
            </Link>
          ))}
        </nav>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
        {tab === "Snapshot" && <SnapshotTab record={record} />}
        {tab === "Financials" && <FinancialsTab record={record} />}
        {tab === "Authority" && <AuthorityTab record={record} />}
        {tab === "Compliance" && <ComplianceTab record={record} />}
        {tab === "Play" && <PlayTab record={record} />}
        {tab === "Anchors" && <AnchorsTab record={record} />}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-3">{title}</p>
      <div className="border border-border bg-surface p-5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-text-3 mb-1">{label}</p>
      <p className="text-text font-mono text-sm">{value}</p>
    </div>
  );
}

function SnapshotTab({ record }: { record: ProspectRecord }) {
  return (
    <Section title="Snapshot">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Field label="Headquarters" value={record.city} />
        <Field label="CAGE" value={record.cage} />
        <Field label="UEI" value={record.uei} />
        <Field label="NAICS" value={record.naics.join(" · ")} />
        <Field label="Status" value={record.status} />
        <Field label="Capability" value={record.capability} />
      </div>
    </Section>
  );
}

function FinancialsTab({ record }: { record: ProspectRecord }) {
  return (
    <Section title="Financials">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Field label="Revenue band" value={record.revenue_band} />
        <Field label="D&B rating" value="—" />
        <Field label="Funding posture" value="Self-funded" />
      </div>
      <p className="mt-5 text-text-3 text-xs italic">
        Production wires D&amp;B + Aviation Week financial intelligence per CAGE.
      </p>
    </Section>
  );
}

function AuthorityTab({ record }: { record: ProspectRecord }) {
  return (
    <Section title="Authority">
      <ul className="space-y-3">
        {record.decision_makers.map((dm) => (
          <li key={dm.name} className="flex items-baseline justify-between border-b border-border pb-2 last:border-0">
            <div>
              <p className="text-text font-medium">{dm.name}</p>
              <p className="text-text-3 text-xs">{dm.title}</p>
            </div>
            <span className={`text-[10px] uppercase tracking-[0.18em] ${dm.reachable ? "text-green" : "text-text-3"}`}>
              {dm.reachable ? "Reachable" : "Gated"}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ComplianceTab({ record }: { record: ProspectRecord }) {
  return (
    <Section title="Compliance">
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {record.certs.map((c) => (
          <li key={c} className="border-l-2 border-accent pl-3 text-text text-sm">{c}</li>
        ))}
      </ul>
      {record.certs.length === 0 && (
        <p className="text-text-3 italic text-sm">No certifications recorded.</p>
      )}
    </Section>
  );
}

function PlayTab({ record }: { record: ProspectRecord }) {
  const prompt = `Outline a 3-step outreach play for ${record.name} (${record.city}) — ${record.capability}. They are at status "${record.status}". Decision makers: ${record.decision_makers.map((d) => `${d.name}, ${d.title}`).join("; ")}. Each step ≤ 2 sentences.`;
  return (
    <Section title="Play">
      <StreamingText prompt={prompt} emptyState="Set ANTHROPIC_API_KEY for personalized outreach plan." />
    </Section>
  );
}

function AnchorsTab({ record }: { record: ProspectRecord }) {
  return (
    <Section title="Anchors">
      {record.audits.length === 0 ? (
        <p className="text-text-3 italic text-sm">No live audits or RFI matches anchored yet.</p>
      ) : (
        <ul className="space-y-2">
          {record.audits.map((a) => (
            <li key={a.notice_id} className="flex items-baseline justify-between border-l-2 border-accent pl-3">
              <div>
                <p className="text-text font-mono text-xs">{a.notice_id}</p>
                <p className="text-text-3 text-xs">{a.date}</p>
              </div>
              <span className={`text-[10px] uppercase tracking-[0.18em] ${
                a.recommendation === "PROCEED" ? "text-green" : a.recommendation === "DECLINE" ? "text-red" : "text-warn"
              }`}>
                {a.recommendation.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
