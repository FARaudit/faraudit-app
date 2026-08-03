// $0. The prevalence pass said 2,037 of 3,326 shred runs sit in "other attachment" — a bucket, not an answer.
// Volume is not harm. This asks the only question that decides whether #7 is worth building:
//   does the shredding land on DECISION-BEARING text (a price/CLIN row, a wage rate, a submission instruction,
//   a deadline), or on table HEADERS and boilerplate a reader can already parse?
// Reports the actual document names carrying the most shredding, and the surrounding CONTEXT verbatim, because
// a count cannot distinguish "Identifie/r" from a severed wage rate.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CORPUS = join(process.cwd(), "scripts", "audit-ai", "run-records");

const isShredFragment = (l: string): boolean => {
  const t = l.trim();
  if (!t || t.length > 12 || /\s/.test(t)) return false;
  return /^[A-Za-z][A-Za-z-]*$/.test(t);
};

/** Decision-bearing vocabulary — if a shred run sits within a few lines of one of these, it is touching
 *  something a bidder acts on. Deliberately broad: a false positive costs me a read, a false negative
 *  would let me close the task on a wrong number. */
const DECISION_RE = /\b(shall|must|price|cost|rate|wage|hour|CLIN|line item|due|deadline|submit|offer|quot|bond|insur|certif|NAICS|set[- ]aside|evaluat|award)\w*/i;

(async () => {
  if (!existsSync(CORPUS)) { console.log("corpus absent"); return; }
  const files: string[] = [];
  for (const e of readdirSync(CORPUS, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".json")) files.push(join(CORPUS, e.name));
    else if (e.isDirectory()) for (const f of readdirSync(join(CORPUS, e.name))) if (f.endsWith(".json")) files.push(join(CORPUS, e.name, f));
  }

  const byName = new Map<string, number>();
  let decisionAdjacent = 0, total = 0;
  const samples: string[] = [];

  for (const f of files) {
    let src = "";
    try { src = JSON.parse(readFileSync(f, "utf8"))?.input?.fullSource ?? ""; } catch { continue; }
    if (!src) continue;
    const lines = src.split("\n");
    // Track which document region each line belongs to.
    let owner = "(primary / unlabelled)";
    const ownerOf: string[] = [];
    for (const l of lines) {
      const m = l.match(/^====\s*DOCUMENT:\s*(.+?)\s*====$/);
      if (m) owner = m[1];
      ownerOf.push(owner);
    }
    let i = 0;
    while (i < lines.length) {
      if (!isShredFragment(lines[i])) { i++; continue; }
      let j = i;
      while (j < lines.length && isShredFragment(lines[j])) j++;
      if (j - i >= 3) {
        total++;
        byName.set(ownerOf[i], (byName.get(ownerOf[i]) ?? 0) + 1);
        const ctx = lines.slice(Math.max(0, i - 4), Math.min(lines.length, j + 4)).join(" ⏎ ");
        if (DECISION_RE.test(ctx)) {
          decisionAdjacent++;
          if (samples.length < 14) samples.push(`[${ownerOf[i].slice(0, 40)}] ${ctx.slice(0, 240)}`);
        }
      }
      i = j;
    }
  }

  console.log(`shred runs total ................. ${total}`);
  console.log(`…adjacent to decision vocabulary . ${decisionAdjacent} (${(100 * decisionAdjacent / Math.max(1, total)).toFixed(1)}%)`);
  console.log("\n=== the 20 document names carrying the most shredding ===");
  for (const [n, c] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(c).padStart(5)}  ${n.slice(0, 88)}`);
  console.log("\n=== decision-adjacent samples, verbatim (this is the only thing that decides #7) ===");
  for (const s of samples) console.log("  " + s + "\n");
})();
