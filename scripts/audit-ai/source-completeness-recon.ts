// $0 SOURCE-COMPLETENESS RECONCILIATION (Brain card-57). Per anchor: does each internally-named attachment
// map to a SAVED FILE or substantial body content? + §B/§C content-loss guard + sha256 freeze. PASS/GAP.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const ANCHORS = [
  { id: "AOCSSB26R0023", role: "#4 CAUTION", dir: "ceo/Solicitation + Export Reviews/Conservation and Stabilization of the Plaster and Decorative Paint at the Presidents Room Ceiling United States Capitol Building" },
  { id: "FA667024R0001", role: "#5 CAUTION", dir: "ceo/Solicitation + Export Reviews/Repair Roof Bldg. 917" },
];
const diskFiles = (d: string) => { try { return readdirSync(d).filter((f) => !f.startsWith(".") && f !== ".DS_Store"); } catch { return []; } };
function refs(src: string): string[] {
  const r = new Set<string>();
  for (const m of src.matchAll(/\bAttachment\s+([0-9]+[a-c]?)\b/gi)) r.add(`Attachment ${m[1].toLowerCase()}`);
  for (const m of src.matchAll(/\bJ\.([0-9]+)\b/g)) r.add(`J.${m[1]}`);
  return [...r].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
const out: string[] = ["# Source-completeness reconciliation — #4 / #5 (Brain card-57 · $0)", ""];
for (const a of ANCHORS) {
  const fp = `scripts/audit-ai/gold-sets/${a.id}-FULL-SOURCE.txt`;
  const buf = readFileSync(fp); const src = readFileSync(fp, "utf8"); const n = norm(src);
  const sha = createHash("sha256").update(buf).digest("hex");
  const files = diskFiles(a.dir); const nf = files.map(norm);
  const rs = refs(src);
  const rows = rs.map((r) => {
    const num = r.replace(/^(Attachment|J\.)\s*/i, "").toLowerCase();           // "1a" or "3" or J number
    const tok = r.toLowerCase();
    const onDisk = nf.some((f) => f.includes(tok) || new RegExp(`attachment\\s*${num}\\b`).test(f) || (r.startsWith("J.") && f.includes(`j.${num}`)) || (r.startsWith("J.") && f.includes(`j${num}`)));
    const bodyHits = (src.match(new RegExp(tok.replace(".", "\\."), "gi")) || []).length; // total mentions
    const present = onDisk || bodyHits > 3;                                       // file, or substantial body presence
    return { r, onDisk, bodyHits, present };
  });
  const gaps = rows.filter((x) => !x.present).map((x) => x.r);
  // §B/§C content-loss guard (format-tolerant): header present + real following content, not a wage/PWS overwrite
  const hasB = /section b\b|b\s+supplies or services/.test(n);
  const hasC = /section c\b|c\s+description\/specifications|description\/specifications\/work statement|statement of work/.test(n);
  const cAt = n.search(/section c\b|description\/specifications\/(work )?statement/);
  const cOverwrite = cAt >= 0 && /wage determination|davis.?bacon/.test(n.slice(cAt, cAt + 500));
  out.push(`## ${a.role} — ${a.id}`,
    `- sha256: \`${sha}\` (${buf.length.toLocaleString()} bytes)`,
    `- files on disk (${files.length}): ${files.join(" · ")}`,
    `- manifest refs (${rs.length}): ${rs.join(", ")}`,
    `- per-attachment (ref → onDisk / bodyHits): ${rows.map((x) => `${x.r}→${x.onDisk ? "disk" : x.bodyHits + "h"}${x.present ? "" : " ⛔"}`).join("  ")}`,
    `- §B present: ${hasB ? "YES" : "**MISSING**"} · §C present: ${hasC ? "YES" : "**MISSING**"} · §C wage/PWS overwrite: ${cOverwrite ? "**YES**" : "no"}`,
    `- named-but-UNMAPPED (no file, no real body): ${gaps.length ? "**" + gaps.join(", ") + "**" : "none"}`,
    `- **VERDICT: ${(!gaps.length && hasB && hasC && !cOverwrite) ? "PASS" : "GAP — review"}**`, "");
}
const md = out.join("\n");
readFileSync; require("node:fs").writeFileSync("ceo/proofs/source-completeness-4-5.md", md);
console.log(md);
