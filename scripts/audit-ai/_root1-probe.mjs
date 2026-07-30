// ROOT-1 worker-retrieval probe (Brain #645 seq step 1). Replicates assembleSamDocumentSet's fetch:
//   manifest: GET opps/v3/opportunities/{id}/resources?api_key=  · download: GET .../files/{rid}/download?api_key= (follow S3 302)
// Prints: key set?+len (Rule-32: no value) · manifest status + attachment count/names/sizes · per-download status/bytes/magic.
// Run LOCAL (dotenv) as baseline, then IN the worker container (base64→node) — compare. NO Claude calls.
const KEY = process.env.SAM_API_KEY || "";
const NOTICE = "d6d5f76b635a46ad937a2b0895b9c95f";
const magic = (b) => Buffer.from(b).subarray(0, 8).toString("latin1").replace(/[^ -~]/g, ".");
(async () => {
  console.log(`ENV: SAM_API_KEY set=${!!KEY} len=${KEY.length} node=${process.version}`);
  let mres;
  try {
    mres = await fetch(`https://sam.gov/api/prod/opps/v3/opportunities/${NOTICE}/resources?api_key=${KEY}`, { headers: { accept: "application/hal+json" }, signal: AbortSignal.timeout(30000) });
  } catch (e) { console.log(`MANIFEST FETCH THREW: ${String(e).slice(0, 120)}`); process.exit(0); }
  console.log(`MANIFEST: status=${mres.status}`);
  let j = {};
  try { j = await mres.json(); } catch { console.log("  (manifest body not JSON)"); }
  const atts = j?._embedded?.opportunityAttachmentList?.[0]?.attachments || [];
  console.log(`MANIFEST attachments=${atts.length}`);
  for (const a of atts) console.log(`  att name="${a.name}" size=${a.size} rid=${String(a.resourceId || "").slice(0, 8)}`);
  console.log(`DOWNLOADS:`);
  for (const a of atts) {
    const url = `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${a.resourceId}/download?api_key=${KEY}`;
    try {
      const d = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
      const buf = Buffer.from(await d.arrayBuffer());
      console.log(`  dl name="${a.name}" status=${d.status} bytes=${buf.length} magic="${magic(buf)}" ctype="${d.headers.get("content-type") || "?"}"`);
    } catch (e) { console.log(`  dl name="${a.name}" ERR=${String(e).slice(0, 90)}`); }
  }
  console.log("PROBE DONE");
})();
