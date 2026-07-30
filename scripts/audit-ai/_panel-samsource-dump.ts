// PANEL SOURCE DUMP — pull the REAL SAM record for a notice id through the LIBRARY paths
// (src/lib/sam*.ts — never a hand-rolled fetch; see [[feedback_use_library_paths_never_adhoc_api]]),
// so every panel lens reviews against one verified, identical source of truth.
// Writes: /tmp/panel-src-<notice>.{notice.json,description.txt,manifest.json}
import { writeFileSync } from "node:fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const NOTICE = process.argv[2];

(async () => {
  const { fetchSolicitationByNoticeId, fetchLiveSamStatus } = await import("../../src/lib/sam");
  const { resolveSamDescription } = await import("../../src/lib/sam-description");
  const { fetchAttachmentManifest } = await import("../../src/lib/sam-attachments");
  const { fetchNoticeVersionCount } = await import("../../src/lib/sam-history");

  const sol = await fetchSolicitationByNoticeId(NOTICE);
  writeFileSync(`/tmp/panel-src-${NOTICE}.notice.json`, JSON.stringify(sol, null, 2), "utf8");
  console.log("=== NOTICE ===");
  console.log(JSON.stringify(sol, null, 2).slice(0, 3000));

  try {
    const live = await fetchLiveSamStatus(NOTICE);
    console.log("\n=== LIVE STATUS ===\n", JSON.stringify(live));
  } catch (e) { console.log("live status unavailable:", (e as Error).message); }

  try {
    const vc = await fetchNoticeVersionCount(NOTICE);
    console.log("\n=== VERSION COUNT ===", vc);
  } catch (e) { console.log("version count unavailable:", (e as Error).message); }

  try {
    const desc = await resolveSamDescription(NOTICE, (sol as Record<string, any>)?.description ?? null);
    const txt = typeof desc === "string" ? desc : JSON.stringify(desc, null, 2);
    writeFileSync(`/tmp/panel-src-${NOTICE}.description.txt`, txt, "utf8");
    console.log("\n=== DESCRIPTION ===", txt.length, "bytes");
    console.log(txt.slice(0, 2000));
  } catch (e) { console.log("description unavailable:", (e as Error).message); }

  try {
    const man = await fetchAttachmentManifest(NOTICE);
    writeFileSync(`/tmp/panel-src-${NOTICE}.manifest.json`, JSON.stringify(man, null, 2), "utf8");
    console.log("\n=== ATTACHMENT MANIFEST ===");
    const entries: any[] = Array.isArray(man) ? man : ((man as any)?.entries ?? []);
    console.log(`${entries.length} entries`);
    for (const a of entries) console.log(" ·", a.name ?? a.fileName, "|", a.role ?? "", "|", a.size ?? a.bytes ?? "");
  } catch (e) { console.log("manifest unavailable:", (e as Error).message); }
})();
