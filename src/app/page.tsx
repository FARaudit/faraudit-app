import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="px-6 py-24 max-w-5xl mx-auto">
        <h1 className="text-5xl font-bold tracking-tight">FARaudit</h1>
        <p className="mt-4 text-xl text-zinc-400">
          Contract intelligence for defense small business. The GovWin alternative built by a former
          Lockheed and Sikorsky engineer.
        </p>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/dashboard" className="rounded-xl border border-zinc-800 p-6 hover:border-zinc-600">
            <h2 className="font-semibold text-lg">FARaudit</h2>
            <p className="text-sm text-zinc-400 mt-2">Solicitation auditing, scoring, and capture intelligence</p>
          </Link>
          <Link href="/capital" className="rounded-xl border border-zinc-800 p-6 hover:border-zinc-600">
            <h2 className="font-semibold text-lg">Capital OS</h2>
            <p className="text-sm text-zinc-400 mt-2">Market intelligence — Bloomberg without the $24K terminal</p>
          </Link>
          <Link href="/legal" className="rounded-xl border border-zinc-800 p-6 hover:border-zinc-600">
            <h2 className="font-semibold text-lg">LexAnchor</h2>
            <p className="text-sm text-zinc-400 mt-2">Legal intelligence — federal contract law, protests, compliance</p>
          </Link>
        </div>
      </section>
    </main>
  );
}
