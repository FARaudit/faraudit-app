// What does SAM ACTUALLY answer for the two v3-manifest entries that fail? The reconciliation only excludes on
// a definitive absent status; if these are not 404/410 the fix is inert here and the rule needs re-examining.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { fetchAttachmentManifest } from "../../src/lib/sam-attachments";
const NOTICE = "1e3e02dbe95e4561a522d902824060d5";
(async () => {
  const manifest: any = await fetchAttachmentManifest(NOTICE);
  const entries: any[] = manifest ?? [];
  console.log(`v3 manifest entries: ${entries.length}\n`);
  const key = process.env.SAM_API_KEY!;
  for (const e of entries) {
    const name = String(e.name ?? e.fileName ?? e.resourceId ?? "?");
    const url = String(e.url ?? e.link ?? e.uri ?? "");
    if (!url) { console.log(`  (no url)  ${name}`); continue; }
    const u = url.includes("api_key=") ? url : url + (url.includes("?") ? "&" : "?") + "api_key=" + key;
    try {
      const r = await fetch(u, { redirect: "follow" });
      const ct = (r.headers.get("content-type") || "").slice(0, 24);
      console.log(`  HTTP ${String(r.status).padEnd(4)} ${ct.padEnd(25)} ${name.slice(0, 56)}`);
    } catch (err: any) {
      console.log(`  THREW  ${String(err?.message ?? err).slice(0, 40).padEnd(25)} ${name.slice(0, 56)}`);
    }
  }
})();
