type Params = { id: string };

export default async function AuditResultPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <p className="text-sm text-zinc-500">Audit Result</p>
        <h1 className="text-3xl font-bold mt-1">{id}</h1>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-zinc-800 p-5">
            <p className="text-zinc-400 text-sm">Compliance score</p>
            <p className="text-3xl font-bold mt-2">—/100</p>
          </div>
          <div className="rounded-xl border border-zinc-800 p-5">
            <p className="text-zinc-400 text-sm">Bid recommendation</p>
            <p className="text-3xl font-bold mt-2">—</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-zinc-800 p-6">
          <h2 className="font-semibold text-lg">Findings</h2>
          <p className="text-zinc-500 mt-2 text-sm">Loading audit results...</p>
        </div>
      </div>
    </main>
  );
}
