export default function LegalPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold">LexAnchor</h1>
        <p className="mt-2 text-zinc-400">Federal contract law, protests, and compliance — without LexisNexis</p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold">Recent GAO protests</h2>
            <p className="text-zinc-500 mt-2 text-sm">Loading...</p>
          </div>
          <div className="rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold">FCA / qui tam</h2>
            <p className="text-zinc-500 mt-2 text-sm">Loading...</p>
          </div>
          <div className="rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold">FAR / DFARS updates</h2>
            <p className="text-zinc-500 mt-2 text-sm">Loading...</p>
          </div>
        </div>
      </div>
    </main>
  );
}
