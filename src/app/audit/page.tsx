export default function AuditPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold">Audit a solicitation</h1>
        <p className="mt-2 text-zinc-400">Upload a SAM.gov PDF or paste a notice ID. Get an instant compliance audit.</p>

        <form className="mt-8 space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Notice ID</label>
            <input
              type="text"
              placeholder="e.g. W912DY24R0042"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Upload PDF</label>
            <input type="file" className="w-full text-zinc-300 text-sm" accept=".pdf" />
          </div>
          <button
            type="button"
            className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-200"
          >
            Run audit
          </button>
        </form>
      </div>
    </main>
  );
}
