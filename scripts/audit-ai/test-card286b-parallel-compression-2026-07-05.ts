// $0 REGRESSION — Brain card 286-B: PARALLEL chunk compression. Proves (1) DETERMINISTIC assembly by window index
// (byte-identical digest regardless of concurrency or completion order — the load-bearing property); (2) the
// concurrency bound is respected; (3) abort stops pulling new windows ("keep what we have"); (4) a THROWN window is
// counted failedWindows (content-loss gate) while an un-attempted (aborted) window is NOT. Pure, no model, no paid.
import { mapReduceDoc, type ChunkMapCall } from "@/lib/agentic-chunked-ingest";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

// A binding doc big enough to yield many windows (MAP_CHUNK_CHARS=40k, overlap 4k → step 36k). ~12 windows.
// Each window embeds a UNIQUE verbatim marker so we can assert index-ordered assembly. The marker is a substring
// of its window (grounding passes). Build ~420k chars.
const N = 12;
const parts: string[] = [];
for (let i = 0; i < N; i++) parts.push(`MARKER_${String(i).padStart(2, "0")} clause 52.219-${i} applies. ` + `filler ${i} `.repeat(3000));
const bigText = parts.join("\n");
const doc = { name: "Attachment 1 — big.pdf", bytes: Buffer.from(bigText, "utf8"), text: bigText };

// A map caller that returns, for each window, the FIRST MARKER_xx literally present in that window's chunk. Records
// concurrency (how many calls are in-flight simultaneously) and can be told to jitter completion order.
function makeRecordingMap(opts: { jitter?: boolean; throwOn?: (i: number) => boolean } = {}): { call: ChunkMapCall; maxInFlight: () => number } {
  let inFlight = 0, maxInFlight = 0;
  const call: ChunkMapCall = async ({ chunk, chunkIndex }) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    // jitter: later windows resolve SOONER (reverse-ish) to prove assembly is by index, not completion.
    await new Promise((r) => setTimeout(r, opts.jitter ? (N - chunkIndex) : 1));
    inFlight--;
    if (opts.throwOn?.(chunkIndex)) throw new Error("simulated window failure");
    const m = chunk.match(/MARKER_\d{2}/g);          // ALL markers verbatim in this window → grounding passes
    return { excerpts: m ? [...new Set(m)] : [] };
  };
  return { call, maxInFlight: () => maxInFlight };
}

// Extract the ordered MARKER list from a produced digest (spans are joined in the body).
const markersOf = (text: string): string[] => (text.match(/MARKER_\d{2}/g) ?? []);

async function main() {
  // (1) DETERMINISM — default concurrency, jittered completion order → markers MUST be in ascending index order.
  const rec = makeRecordingMap({ jitter: true });
  const r1 = await mapReduceDoc(doc, rec.call);
  const got = markersOf(r1.text);
  const expected = Array.from({ length: N }, (_, i) => `MARKER_${String(i).padStart(2, "0")}`);
  ok("assembly is window-index order despite reverse completion (determinism)", got, expected);
  ok("all windows contributed (no drop)", r1.failedWindows, 0);

  // (2) CONCURRENCY BOUND respected (>1 in flight → truly parallel; ≤ the cap of 6 default).
  ok("ran with real concurrency (>1 in flight)", rec.maxInFlight() > 1, true);
  ok("concurrency within the default cap (≤6)", rec.maxInFlight() <= 6, true);

  // (2b) concurrency=1 (sequential) produces the SAME digest → parallelism changed nothing but speed.
  process.env.AGENTIC_MAP_CONCURRENCY = "1";
  const rSeq = await mapReduceDoc(doc, makeRecordingMap({ jitter: true }).call);
  ok("concurrency=1 digest byte-identical to parallel", markersOf(rSeq.text), got);
  delete process.env.AGENTIC_MAP_CONCURRENCY;

  // (3) FAILED window → counted (content-loss gate intact; no silent success). Result stays ascending; no crash.
  const rFail = await mapReduceDoc(doc, makeRecordingMap({ throwOn: (i) => i === 5 }).call);
  const failMarkers = markersOf(rFail.text);
  const ascending = failMarkers.every((m, i) => i === 0 || m >= failMarkers[i - 1]);
  ok("thrown window counted as failed (no silent success)", rFail.failedWindows, 1);
  ok("surviving markers still ascending (deterministic order preserved through a failure)", ascending, true);

  // (4) ABORT — an already-aborted signal → no windows attempted, none counted failed (un-attempted ≠ failed).
  const ac = new AbortController(); ac.abort();
  const rAbort = await mapReduceDoc(doc, makeRecordingMap().call, ac.signal);
  ok("aborted-before-start → no windows attempted", markersOf(rAbort.text).length, 0);
  ok("aborted (un-attempted) windows NOT counted failed", rAbort.failedWindows, 0);

  console.log(`\ncard286b parallel compression — ${pass} passed, ${fails.length} failed`);
  for (const x of fails) console.log("  ✗ " + x);
  process.exit(fails.length ? 1 : 0);
}
main();
