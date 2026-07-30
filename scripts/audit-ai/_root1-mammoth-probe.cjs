// ROOT-1 step-2 (Brain #645): retrieval is PROVEN OK in-container; test the DOCX→TEXT conversion (mammoth) that
// assembleSamDocumentSet runs after download. Downloads the real primary .docx, runs mammoth.extractRawText, reports
// chars/error. Local baseline ≈ 113K chars; if the container yields ~0 / throws → docx extraction is the root.
const { createRequire } = require("module");
(async () => {
  const KEY = process.env.SAM_API_KEY || "";
  const NOTICE = "d6d5f76b635a46ad937a2b0895b9c95f";
  const m = await fetch(`https://sam.gov/api/prod/opps/v3/opportunities/${NOTICE}/resources?api_key=${KEY}`, { headers: { accept: "application/hal+json" }, signal: AbortSignal.timeout(30000) });
  const j = await m.json();
  const att = j?._embedded?.opportunityAttachmentList?.[0]?.attachments?.[0];
  if (!att) { console.log("no manifest att"); return; }
  const url = `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${att.resourceId}/download?api_key=${KEY}`;
  const d = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await d.arrayBuffer());
  console.log(`downloaded "${att.name}" bytes=${buf.length} magic="${buf.subarray(0,4).toString("latin1")}"`);
  // resolve mammoth from candidate app node_modules
  let mammoth = null, resolvedFrom = null;
  for (const base of ["/app/", "/usr/src/app/", process.cwd() + "/", __dirname + "/"]) {
    try { const req = createRequire(base); mammoth = req("mammoth"); resolvedFrom = base + " (v" + req("mammoth/package.json").version + ")"; break; }
    catch (e) { /* try next */ }
  }
  if (!mammoth) { console.log("MAMMOTH REQUIRE FAILED from all candidate paths"); return; }
  console.log(`mammoth resolved from ${resolvedFrom}`);
  try {
    const r = await mammoth.extractRawText({ buffer: buf });
    console.log(`extractRawText chars=${(r.value || "").length} messages=${JSON.stringify(r.messages || []).slice(0,180)}`);
  } catch (e) { console.log(`extractRawText THREW: ${String(e && e.stack || e).slice(0,300)}`); }
})();
