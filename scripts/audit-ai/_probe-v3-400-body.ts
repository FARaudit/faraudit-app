import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { fetchAttachmentManifest } from "../../src/lib/sam-attachments";
const NOTICE = "1e3e02dbe95e4561a522d902824060d5";
(async () => {
  const entries: any[] = (await fetchAttachmentManifest(NOTICE)) ?? [];
  const key = process.env.SAM_API_KEY!;
  for (const e of entries) {
    const name = String(e.name ?? e.fileName ?? "?");
    const url = String(e.url ?? e.link ?? "");
    if (!url) continue;
    const u = url.includes("api_key=") ? url : url + (url.includes("?") ? "&" : "?") + "api_key=" + key;
    const r = await fetch(u, { redirect: "follow" });
    if (r.status === 200) continue;
    const body = await r.text();
    console.log(`\n=== HTTP ${r.status} · ${name}`);
    console.log(body.slice(0, 500));
  }
})();
