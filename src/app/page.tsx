import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

// force-dynamic — never let Vercel serve a cached 404 for /.
// On request: if the visitor is authenticated they jump to /dashboard;
// otherwise they get the marketing landing below.
export const dynamic = "force-dynamic";

async function maybeRedirectToDashboard(): Promise<void> {
  try {
    const sb = await createServerClient();
    const {
      data: { user }
    } = await sb.auth.getUser();
    if (user) redirect("/dashboard");
  } catch {
    /* never block the public landing on a transient auth-check error */
  }
}

const FINDINGS = [
  {
    label: "DFARS Traps",
    body: "Hexavalent chromium 252.223-7008. Covered telecom 252.204-7018. CMMC 252.204-7021. Caught and surfaced before bid."
  },
  {
    label: "CLIN Ambiguity",
    body: "Conflicting quantity, pricing arrangement, FOB terms. We extract every CLIN in Section B and flag inconsistencies."
  },
  {
    label: "FOB Conflicts",
    body: "FOB Origin vs Destination changes liability and freight cost. We surface the FOB clause and your exposure."
  },
  {
    label: "Section L / M Gaps",
    body: "Missing past performance volume. Page-limit traps. Evaluation factor weights buried in attachments."
  },
  {
    label: "Certifications Required",
    body: "CMMC level. NIST SP 800-171. ITAR. AS9100. Security clearances. We list every cert before you waste 40 hours."
  },
  {
    label: "Hex-Chrome Violations",
    body: "Hexavalent chromium representations on Aerospace and Defense parts. One bad checkbox = automatic disqualification."
  }
];

const STEPS = [
  { n: "01", title: "Upload solicitation", body: "Drop the SAM.gov PDF or paste the notice ID." },
  { n: "02", title: "Three-call analysis", body: "Overview · Compliance · Risks. Claude reads every page in parallel." },
  { n: "03", title: "Audit report + KO email", body: "Findings landed. Clarification email drafted from the top 3 risks." }
];

export default async function LandingPage() {
  await maybeRedirectToDashboard();
  return _Landing();
}

function _Landing() {
  return (
    <main>
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b border-border">
        <Link href="/" className="font-display text-xl text-text tracking-tight">FARaudit</Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/audit" className="text-text-2 hover:text-text">Audit</Link>
          <Link href="/how-it-works" className="text-text-2 hover:text-text">How It Works</Link>
          <Link href="/dashboard" className="text-text-2 hover:text-text">Dashboard</Link>
          <Link
            href="/login"
            className="px-4 py-2 border border-border-2 text-text hover:border-gold hover:text-gold transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative px-6 md:px-10 pt-24 md:pt-32 pb-20 max-w-6xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">
          Federal Contract Intelligence
        </p>
        <h1 className="mt-8 font-display font-light text-5xl sm:text-6xl md:text-7xl tracking-tight text-text leading-[1.05]">
          Federal Contract<br />Intelligence<span className="text-gold">.</span>
        </h1>
        <p className="mt-10 max-w-2xl text-lg md:text-xl text-text-2 leading-relaxed font-body">
          Defense subcontractors win more bids when they know what&apos;s hiding in the solicitation.
        </p>
        <div className="mt-12">
          <Link
            href="/audit"
            className="inline-flex items-center justify-center px-10 py-4 bg-gold text-bg font-medium tracking-wide hover:bg-gold-dim transition-colors"
          >
            Run a free audit
          </Link>
        </div>
        <div className="mt-24 h-px bg-gradient-to-r from-gold via-gold-dim to-transparent" />
      </section>

      {/* Findings */}
      <section className="px-6 md:px-10 pb-32 max-w-6xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-3">Coverage</p>
        <h2 className="font-display text-3xl md:text-4xl text-text font-light mb-12 max-w-3xl">
          What FARaudit finds in 45 seconds
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {FINDINGS.map((f) => (
            <div key={f.label} className="bg-bg p-8">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold mb-4">{f.label}</p>
              <p className="text-text leading-relaxed text-[15px]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-24">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-3">Process</p>
          <h2 className="font-display text-3xl md:text-4xl text-text font-light mb-14 max-w-3xl">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {STEPS.map((s) => (
              <div key={s.n}>
                <p className="font-mono text-xs text-gold tracking-[0.25em]">{s.n}</p>
                <h3 className="mt-4 font-display text-2xl text-text font-light">{s.title}</h3>
                <p className="mt-3 text-text-2 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Corridor */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-3">Specialization</p>
          <h2 className="font-display text-3xl md:text-4xl text-text font-light max-w-3xl leading-tight">
            Built for the TX + OK defense corridor
          </h2>
          <p className="mt-6 max-w-3xl text-text-2 leading-relaxed">
            Aerospace machining, sheet-metal, MILSPEC fabrication. NAICS 336413 small-business set-aside specialists. We know what Tinker, Sheppard, Sierra Army Depot, and Red River Army Depot buy — and how they evaluate.
          </p>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
            <div className="bg-bg p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3">Primary NAICS</p>
              <p className="mt-2 font-display text-2xl text-gold">336413</p>
              <p className="text-xs text-text-2 mt-1 font-mono">Aircraft Parts Mfg</p>
            </div>
            <div className="bg-bg p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3">Set-aside</p>
              <p className="mt-2 font-display text-2xl text-text">Total SB</p>
              <p className="text-xs text-text-2 mt-1 font-mono">100% small business</p>
            </div>
            <div className="bg-bg p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3">Corridor</p>
              <p className="mt-2 font-display text-2xl text-text">TX + OK</p>
              <p className="text-xs text-text-2 mt-1 font-mono">Tinker · Sheppard · RRAD</p>
            </div>
            <div className="bg-bg p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3">Audit time</p>
              <p className="mt-2 font-display text-2xl text-text">~45s</p>
              <p className="text-xs text-text-2 mt-1 font-mono">3 parallel calls</p>
            </div>
          </div>
        </div>
      </section>

      {/* Validation case study */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-24">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-3">Validation</p>
          <h2 className="font-display text-3xl md:text-4xl text-text font-light max-w-3xl leading-tight">
            Validated on <span className="font-mono text-2xl md:text-3xl">FA301626Q0068</span>
          </h2>
          <p className="mt-4 max-w-3xl text-text-2 font-mono text-sm">
            Air Force T-38 Talon RFQ · JBSA Lackland · NAICS 336413
          </p>
          <p className="mt-8 max-w-3xl text-text leading-relaxed font-display text-lg italic">
            Three material compliance traps surfaced before the estimator opened a spreadsheet.
          </p>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
            <div className="bg-bg p-7">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-red mb-3">P0 · Margin</p>
              <p className="font-display text-lg text-text leading-snug">CLIN quantity ambiguity</p>
              <p className="mt-3 text-text-2 text-sm leading-relaxed">2× margin exposure if read at face value vs the cross-reference in Section J.</p>
            </div>
            <div className="bg-bg p-7">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-red mb-3">P0 · Liability</p>
              <p className="font-display text-lg text-text leading-snug">FOB designation conflict</p>
              <p className="mt-3 text-text-2 text-sm leading-relaxed">FOB Origin on CLIN 0001 contradicts FOB Destination on the master clause.</p>
            </div>
            <div className="bg-bg p-7">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-red mb-3">P0 · DFARS Trap</p>
              <p className="font-display text-lg text-text leading-snug">252.223-7008 hexavalent chromium</p>
              <p className="mt-3 text-text-2 text-sm leading-relaxed">Active clause requires representation; one missed checkbox in Section K is automatic disqualification.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-24">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-3">Pricing</p>
          <h2 className="font-display text-3xl md:text-4xl text-text font-light mb-14">Two tiers. No surprise fees.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border max-w-4xl">
            <div className="bg-bg p-10">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-gold mb-5">Design Partner</p>
              <p className="font-display text-5xl text-text font-light">
                $1,250<span className="text-text-2 text-2xl">/mo</span>
              </p>
              <ul className="mt-8 space-y-3 text-sm text-text">
                <li className="flex items-start gap-3"><span className="text-gold">—</span> Unlimited audits</li>
                <li className="flex items-start gap-3"><span className="text-gold">—</span> Direct line to founder</li>
                <li className="flex items-start gap-3"><span className="text-gold">—</span> Roadmap influence</li>
                <li className="flex items-start gap-3"><span className="text-gold">—</span> 12-month commitment, locked rate</li>
              </ul>
            </div>
            <div className="bg-bg p-10">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-text-3 mb-5">Standard</p>
              <p className="font-display text-5xl text-text font-light">
                $2,500<span className="text-text-2 text-2xl">/mo</span>
              </p>
              <ul className="mt-8 space-y-3 text-sm text-text">
                <li className="flex items-start gap-3"><span className="text-text-3">—</span> Unlimited audits</li>
                <li className="flex items-start gap-3"><span className="text-text-3">—</span> KO clarification email drafts</li>
                <li className="flex items-start gap-3"><span className="text-text-3">—</span> SAM.gov daily feed (NAICS 336413)</li>
                <li className="flex items-start gap-3"><span className="text-text-3">—</span> Month-to-month, no commitment</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-6 md:px-10 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="font-display text-lg text-text">FARaudit</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-xs text-text-3 font-mono">
            <span>faraudit.com</span>
            <span>jose@faraudit.com</span>
            <span>© 2026 FARaudit</span>
          </div>
        </div>
      </footer>
      <footer className="border-t border-border bg-surface px-6 md:px-10 py-8 text-xs text-text-3 flex flex-wrap items-center justify-between gap-3">
        <span>© 2026 FARaudit · Woof Management LLC</span>
        <nav className="flex items-center gap-5">
          <Link href="/privacy" className="hover:text-text-2">Privacy</Link>
          <Link href="/terms" className="hover:text-text-2">Terms</Link>
          <a href="mailto:jose@faraudit.com" className="hover:text-text-2">Contact</a>
        </nav>
      </footer>
    </main>
  );
}
