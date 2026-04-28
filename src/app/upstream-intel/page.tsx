import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import StreamingText from "@/components/StreamingText";

export const dynamic = "force-dynamic";

interface UpstreamRecord {
  notice_id: string;
  title: string;
  type: string;
  agency: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  influence_score: number;
  match_reason: string;
}

// Static seed: real implementation pulls from SAM.gov RFI/Sources Sought feed
// + computes influence_score from prior SOW match history.
const SEED: UpstreamRecord[] = [
  {
    notice_id: "FA8533-26-RFI-0042",
    title: "Sources Sought — Hexavalent-free Coating Process Development",
    type: "Sources Sought",
    agency: "USAF Tinker AFB",
    posted_date: "2026-04-22",
    response_deadline: "2026-05-08",
    influence_score: 92,
    match_reason: "Prior SOW used your hex-free chrome alternative spec verbatim — high SOW influence likelihood."
  },
  {
    notice_id: "W912DY-26-RFI-0017",
    title: "RFI — Modular Tower Assembly Capacity",
    type: "RFI",
    agency: "ACC, Fort Hood",
    posted_date: "2026-04-25",
    response_deadline: "2026-05-15",
    influence_score: 78,
    match_reason: "NAICS 332710 fit; capacity claim on prior responses had 60% inclusion rate."
  },
  {
    notice_id: "N00024-26-PRESOL-0009",
    title: "Pre-Solicitation — Submarine Component Forging",
    type: "Pre-Solicitation",
    agency: "NAVSEA",
    posted_date: "2026-04-19",
    response_deadline: "2026-04-30",
    influence_score: 64,
    match_reason: "Forging capability fit; 4-day window is tight."
  }
];

export default async function UpstreamIntelPage() {
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
          <span className="text-text-2">Upstream Intel</span>
        </div>
        <h1 className="font-display text-3xl text-text font-medium">Upstream Intelligence</h1>
        <p className="mt-2 text-text-2 text-sm">
          RFI · Sources Sought · Pre-Solicitation feed ranked by SOW influence likelihood.
        </p>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-6xl mx-auto space-y-6">
        {SEED.map((r) => (
          <UpstreamCard key={r.notice_id} record={r} />
        ))}

        <section className="border border-border bg-surface p-6 mt-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-3">Strategy brief</p>
          <StreamingText
            prompt="In 4 sentences, advise a defense subcontractor in the TX/OK corridor on which RFI / Sources Sought to prioritize this week. Tie ranking to NAICS 336413 / 332710 / 332721 alignment and SOW-influence likelihood. End with one specific action."
            emptyState="ANTHROPIC_API_KEY not set."
          />
        </section>
      </main>
    </div>
  );
}

function UpstreamCard({ record }: { record: UpstreamRecord }) {
  const score = record.influence_score;
  const scoreColor = score >= 75 ? "text-green" : score >= 50 ? "text-warn" : "text-text-2";
  const dash = (score / 100) * 251.32; // 2π × 40
  const daysToDeadline = record.response_deadline
    ? Math.ceil((new Date(record.response_deadline).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <article className="border border-border bg-surface p-5 grid grid-cols-1 md:grid-cols-[120px_1fr_auto] gap-5 items-center">
      {/* Influence gauge */}
      <div className="flex items-center justify-center">
        <div className="relative w-[100px] h-[100px]">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="40" stroke="#122240" strokeWidth="6" fill="none" />
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              className={scoreColor}
              strokeDasharray={`${dash} 251.32`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-mono text-2xl ${scoreColor}`}>{score}</span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-text-3 mt-0.5">influence</span>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.18em] border border-accent/40 text-accent px-2 py-0.5">
            {record.type}
          </span>
          <span className="font-mono text-xs text-text-3">{record.notice_id}</span>
        </div>
        <p className="mt-2 text-text font-medium leading-snug">{record.title}</p>
        <p className="mt-1 text-text-2 text-xs">
          {record.agency || "—"}
          {record.posted_date && ` · posted ${record.posted_date}`}
          {record.response_deadline && (
            <>
              {" · due "}
              <span className={(daysToDeadline ?? 0) <= 7 ? "text-warn" : ""}>
                {record.response_deadline}{daysToDeadline !== null ? ` (${daysToDeadline}d)` : ""}
              </span>
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-text-3 italic leading-relaxed border-l-2 border-border pl-3">
          {record.match_reason}
        </p>
      </div>

      <div className="flex flex-col gap-2 md:items-end">
        <Link
          href={`/upstream-intel/draft/${encodeURIComponent(record.notice_id)}`}
          className="bg-accent text-white px-4 py-2 text-xs font-medium tracking-wide hover:bg-accent-2 text-center"
        >
          Draft Response
        </Link>
        <Link
          href={`/audit?noticeId=${encodeURIComponent(record.notice_id)}`}
          className="border border-border text-text-2 hover:text-text px-4 py-2 text-xs text-center"
        >
          Run Audit
        </Link>
      </div>
    </article>
  );
}
