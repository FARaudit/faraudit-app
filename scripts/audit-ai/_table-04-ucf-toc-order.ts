// $0. ONE sample from the prevalence sweep showed a UCF table-of-contents extracted with its section letters
// in REVERSE order and detached from their descriptions:
//     "…PART II - CONTRACT CLAUSES  PART I - THE SCHEDULE ⏎ H ⏎ G ⏎ F ⏎ E ⏎ D ⏎ C ⏎ B ⏎ A ⏎ SEC. DESCRIPTION…"
// That would matter far more than the SF-30 table, because §L/§M routing depends on the section map. But it is
// ONE document, and one document is an anecdote. This counts it across the whole banked corpus so the claim is
// either solid or dead before it reaches the CEO.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CORPUS = join(process.cwd(), "scripts", "audit-ai", "run-records");

/** A descending run of >=4 consecutive UCF section letters, each alone on its line. Ascending is the correct
 *  order and is the control — measuring BOTH directions, so the number means something. */
function letterRuns(text: string): { desc: number; asc: number } {
  const lines = text.split("\n").map((l) => l.trim());
  let desc = 0, asc = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^[A-M]$/.test(lines[i])) continue;
    let j = i, dir = 0, n = 1;
    while (j + 1 < lines.length && /^[A-M]$/.test(lines[j + 1])) {
      const step = lines[j + 1].charCodeAt(0) - lines[j].charCodeAt(0);
      if (step !== 1 && step !== -1) break;
      if (dir === 0) dir = step; else if (step !== dir) break;
      j++; n++;
    }
    if (n >= 4) { if (dir < 0) desc++; else asc++; }
    i = j;
  }
  return { desc, asc };
}

(async () => {
  if (!existsSync(CORPUS)) { console.log("corpus absent"); return; }
  const files: string[] = [];
  for (const e of readdirSync(CORPUS, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".json")) files.push(join(CORPUS, e.name));
    else if (e.isDirectory()) for (const f of readdirSync(join(CORPUS, e.name))) if (f.endsWith(".json")) files.push(join(CORPUS, e.name, f));
  }

  let recsDesc = 0, recsAsc = 0, totalDesc = 0, totalAsc = 0;
  const hits: string[] = [];
  for (const f of files) {
    let src = "";
    try { src = JSON.parse(readFileSync(f, "utf8"))?.input?.fullSource ?? ""; } catch { continue; }
    if (!src) continue;
    const { desc, asc } = letterRuns(src);
    totalDesc += desc; totalAsc += asc;
    if (desc) { recsDesc++; if (hits.length < 8) hits.push(`${f.split("/").pop()}  desc=${desc} asc=${asc}`); }
    if (asc) recsAsc++;
  }
  console.log(`records scanned .................... ${files.length}`);
  console.log(`records with a DESCENDING A–M run .. ${recsDesc}   (runs: ${totalDesc})   <- the suspected defect`);
  console.log(`records with an ASCENDING A–M run .. ${recsAsc}   (runs: ${totalAsc})   <- the control, correct order`);
  console.log("\nrecords carrying a descending run:");
  for (const h of hits) console.log("  " + h);
  if (!hits.length) console.log("  (none — the single sample does not generalise)");
})();
