// ── BANKED-CORPUS GUARD ──────────────────────────────────────────────────────────────────────────
// Some suites assert against `scripts/audit-ai/run-records/` — real audit run records banked from paid
// runs. That directory holds ~74 MB and exactly ONE tracked file (a .gitkeep). It is deliberately NOT
// committed: 112 of its files carry government email addresses and several carry token-shaped strings,
// and this repository is PUBLIC.
//
// The consequence, found when CI ran for the first time on 2026-08-03: those suites passed on the author's
// machine and failed everywhere else, and their green had been counted in "130/130" for months. One of
// them did not even fail loudly — it ran its assertions over an EMPTY corpus, reported "0/0 packages",
// and then failed on the arithmetic. A suite that silently asserts over nothing is worse than one that
// refuses to run.
//
// So: a corpus-dependent suite declares itself. `requireCorpus()` exits **3** when the data is absent,
// which self-audit reports as SKIPPED BY NAME — never as a pass, never silently. Any other non-zero exit
// is still a real failure. The skip is narrow by construction: a suite has to call this to get it, so the
// set cannot quietly grow, and where the corpus IS present the suite runs and can fail normally.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Exit code meaning "this suite needs data that is not in the repository." Distinct from 1 (real failure)
 *  so a harness can tell "could not run" apart from "ran and was wrong". */
export const EXIT_CORPUS_ABSENT = 3;

export const CORPUS_ROOT = join(process.cwd(), "scripts", "audit-ai", "run-records");

/** Count the corpus records actually present. Recurses one level, because the records are filed in
 *  cohort subdirectories (`_ua-cohort/…`) as well as at the root. */
export function corpusRecordCount(root: string = CORPUS_ROOT): number {
  if (!existsSync(root)) return 0;
  let n = 0;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".json")) n++;
    else if (e.isDirectory()) {
      const sub = join(root, e.name);
      for (const f of readdirSync(sub)) if (f.endsWith(".json")) n++;
    }
  }
  return n;
}

/** Call at the TOP of a corpus-dependent suite, before any assertion. Present ⇒ returns and the suite runs
 *  normally. Absent ⇒ prints why and exits EXIT_CORPUS_ABSENT, so the harness records a named skip.
 *  `min` guards the empty-directory case: `.gitkeep` makes the directory exist in a fresh checkout, so
 *  existence is not the question — record count is. */
export function requireCorpus(label: string, min = 1): void {
  const n = corpusRecordCount();
  if (n >= min) return;
  console.log(`○ SKIP — ${label}: banked corpus absent (${n} record(s) at scripts/audit-ai/run-records, need ${min}).`);
  console.log("  This data is intentionally untracked: it carries government email addresses and this repo is public.");
  console.log("  Not a pass. This suite asserted NOTHING on this run.");
  process.exit(EXIT_CORPUS_ABSENT);
}
