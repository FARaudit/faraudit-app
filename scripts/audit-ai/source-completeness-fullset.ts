// $0 full-set source-completeness audit (Brain card-58): #1 (re-confirm), #2 (re-confirm), #3 (audit +
// confirm decisive Dillon bar is in PRESENT content → INELIGIBLE robust per the asymmetry). No SAM/model/spend.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
// per anchor: explicit file list (handles loose files + subfolders + zips-as-1)
const ANCHORS = [
  { id: "N4008526R0065", role: "#1 CAUTION", files: () => { try { return readdirSync("ceo/Solicitation + Export Reviews/N4008526R0065/Naval Station Norfolk Custodial Services").filter(f=>!f.startsWith(".")); } catch { return ["(zip: 33 docs)"]; } } },
  { id: "1240LP26Q0067", role: "#2 BID", files: () => { try { return readdirSync("ceo/Solicitation + Export Reviews/BGNF Mini-Excavator").filter(f=>!f.startsWith(".")); } catch { return []; } } },
  { id: "SPRDL125Q0030", role: "#3 INELIGIBLE", files: () => readdirSync("ceo/Solicitation + Export Reviews").filter(f=>/SPRDL125Q0030|machine gun/i.test(f)) },
];
function refs(src: string): string[] {
  const r = new Set<string>();
  for (const m of src.matchAll(/\bAttachment\s+([0-9]+[a-c]?)\b/gi)) r.add(`Attachment ${m[1].toLowerCase()}`);
  for (const m of src.matchAll(/\bJ\.([0-9]+)\b/g)) r.add(`J.${m[1]}`);
  return [...r].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
const out: string[] = ["", "# Full-set source-completeness audit — #1/#2/#3 (Brain card-58 · $0)", ""];
for (const a of ANCHORS) {
  const fp = `scripts/audit-ai/gold-sets/${a.id}-FULL-SOURCE.txt`;
  const buf = readFileSync(fp); const src = buf.toString(); const n = norm(src);
  const sha = createHash("sha256").update(buf).digest("hex");
  const files = a.files(); const nf = files.map(norm);
  const rs = refs(src);
  const gaps = rs.filter(r => { const num = r.replace(/^(Attachment|J\.)\s*/i,"").toLowerCase(); const tok=r.toLowerCase();
    const onDisk = nf.some(f => f.includes(tok) || new RegExp(`attachment\\s*${num}\\b`).test(f) || (r.startsWith("J.") && (f.includes(`j.${num}`)||f.includes(`j${num}`))));
    const bodyHits = (src.match(new RegExp(tok.replace(".","\\."),"gi"))||[]).length;
    return !onDisk && bodyHits <= 3; });
  const hasB = /section b\b|supplies or services/.test(n); const hasC = /section c\b|description\/specifications|statement of work/.test(n);
  let extra = "";
  if (a.id === "SPRDL125Q0030") {
    const dillon = /dgmt1002/i.test(src) && /1pn61|dillon/i.test(src) && /(c\.14|source.controlled|approved.{0,12}part|sole.source)/i.test(n);
    extra = `\n- DECISIVE DILLON BAR present in content (C.14/CLIN-0001AA/L.6c, DGMT1002): ${dillon ? "YES → INELIGIBLE robust to source gaps (asymmetry)" : "**NOT FOUND — investigate**"}`;
  }
  out.push(`## ${a.role} — ${a.id}`,
    `- sha256: \`${sha}\` (${buf.length.toLocaleString()} bytes) · files: ${files.length}`,
    `- manifest refs (${rs.length}): ${rs.join(", ") || "(none parsed — likely single consolidated doc)"}`,
    `- §B: ${hasB?"YES":"**MISSING**"} · §C: ${hasC?"YES":"**MISSING**"} · named-but-unmapped: ${gaps.length?"**"+gaps.join(", ")+"**":"none"}${extra}`,
    `- **VERDICT: ${(!gaps.length && hasB && hasC)?"PASS":"GAP — review"}**`, "");
}
const md = out.join("\n");
const f = "ceo/proofs/source-completeness-full-set.md";
require("node:fs").writeFileSync(f, (existsSync(f)?readFileSync(f,"utf8"):"")+md);
console.log(md);
