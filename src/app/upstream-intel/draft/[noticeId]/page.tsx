import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import StreamingText from "@/components/StreamingText";

export const dynamic = "force-dynamic";

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
  const prompt = `Draft an RFI / Sources Sought response for notice ${decoded}.
Position the company as a defense subcontractor in TX/OK corridor specializing in NAICS 336413 / 332710 / 332721.
Include: (1) capability statement aligned to inferred scope, (2) prior performance reference, (3) 2-3 SOW influence positions where the company would push for specific language. Output as a draft response of ~200 words. No greeting, no closing — straight to the response body.`;

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
      <main className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
        <StreamingText prompt={prompt} emptyState="ANTHROPIC_API_KEY not set — draft unavailable." />
        <p className="mt-6 text-xs text-text-3 italic">
          Edit any text before sending. Save to /prospects to track engagement.
        </p>
      </main>
    </div>
  );
}
