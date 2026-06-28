// Best-in-class package analyzer (deterministic, $0, no AI). The SAFE foundation
// for the large-package architecture: build the coverage ledger, cluster files
// into logical-document groups, and within each group distinguish BYTE-IDENTICAL
// duplicates (safe to read once) from DIFFERENT VERSIONS (must keep / resolve via
// the amendment chain — never drop by assumption). Validated by the adversarial
// panel: default KEEP, exclude only on proof (identical hash OR Item-14 full
// replacement). This script does the hash/cluster half deterministically.
//
// Run: npx tsx scripts/audit-ai/analyze-package.mjs "<package dir>"
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const dir = process.argv[2];
if (!dir) { console.error("usage: analyze-package.mjs <dir>"); process.exit(1); }

// Anchor key = the stable section/attachment code if present (J-1503010-09,
// C-0200000, "Section F", "Section C"), else the normalized stem. Versions of
// the SAME logical doc share an anchor; that's how we cluster safely.
function anchorKey(name) {
  const n = name.toLowerCase().replace(/\.(pdf|xlsx|docx?|txt)$/i, "");
  // sol-numbered attachment codes: J-0200000, J-1503010-09, C-0200000, J-0200000-06
  const code = n.match(/\b([jc])[-\s]?(\d{6,7})(?:-(\d{2}))?\b/);
  if (code) return `${code[1]}-${code[2]}${code[3] ? "-" + code[3] : ""}`.toUpperCase();
  // "Section C", "Section F ANNEXES"
  const sec = n.match(/\bsection\s+([a-z])\b/);
  if (sec) return `SECTION-${sec[1].toUpperCase()}`;
  // SF-30 amendment cover sheets
  if (/amendment.*sf\s*30|solicitation amendment/.test(n)) return "SF30-AMENDMENT-COVER";
  if (/^solicitation\b/.test(n) || /solicitation - n\d/.test(n)) return "SOLICITATION-FORM";
  // fallback: strip amendment/revised/sol tokens → normalized stem
  return n
    .replace(/\bamendment\s*\d+\b/g, "")
    .replace(/\brevised\b/g, "")
    .replace(/\bn\d{6,8}[a-z]\d{4}\b/g, "")
    .replace(/\bsf\s*30\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().toUpperCase() || "UNKEYED";
}
const isSF30 = (n) => /amendment.*sf\s*30|solicitation amendment n\d/i.test(n);

const files = fs.readdirSync(dir, { recursive: true })
  .map((f) => path.join(dir, f))
  .filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } })
  .filter((f) => /\.(pdf|xlsx|docx?|txt)$/i.test(f));

const recs = files.map((f) => {
  const buf = fs.readFileSync(f);
  return {
    name: path.basename(f),
    kb: Math.round(buf.length / 1024),
    hash: crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12),
    key: anchorKey(path.basename(f)),
    sf30: isSF30(path.basename(f)),
  };
});

// cluster by anchor key
const clusters = {};
for (const r of recs) (clusters[r.key] ??= []).push(r);

console.log("══════════════════════════════════════════════════════════════════════");
console.log(`  PACKAGE LEDGER · ${path.basename(dir)} · ${recs.length} files · ${Object.keys(clusters).length} logical docs`);
console.log("══════════════════════════════════════════════════════════════════════");

let trueDupTokensSaveable = 0, versionGroups = 0, identicalGroups = 0;
for (const [key, group] of Object.entries(clusters).sort((a, b) => b[1].length - a[1].length)) {
  const hashes = new Set(group.map((g) => g.hash));
  let verdict;
  if (group.length === 1) verdict = "single";
  else if (hashes.size === 1) { verdict = `✅ ${group.length} BYTE-IDENTICAL copies → read ONE (safe to collapse)`; identicalGroups++; }
  else { verdict = `⚠ ${group.length} DIFFERENT VERSIONS (${hashes.size} distinct) → KEEP all / resolve via amendment Item-14 (NEVER drop blind)`; versionGroups++; }
  console.log(`\n[${key}]  ${verdict}`);
  for (const g of group) {
    console.log(`    ${g.hash}  ${String(g.kb).padStart(5)}KB  ${g.sf30 ? "(SF-30 cover) " : ""}${g.name.slice(0, 60)}`);
  }
}

console.log("\n──────────────────────────────────────────────────────────────────────");
console.log(`  Logical docs with BYTE-IDENTICAL copies (safe single-read): ${identicalGroups}`);
console.log(`  Logical docs with DIFFERENT VERSIONS (must keep/resolve):   ${versionGroups}`);
console.log(`  SF-30 amendment cover sheets: ${recs.filter((r) => r.sf30).length}`);
console.log(`  → SAFE dedup acts ONLY on byte-identical copies. Versions go to the`);
console.log(`    amendment-resolution pass (parse Item 14), never dropped by filename.`);
