// $0 regression lock for the INGEST DENOMINATOR RECONCILIATION (flag AUDIT_INGEST_DENOMINATOR_RECONCILE).
// Run: npx tsx src/lib/sam-attachments-denominator-reconcile.test.ts
//
// WHAT BROKE (live pre-screen of W50S6U26QA019, 2026-08-02, before any paid run). SAM exposes TWO enumerations of a
// notice's documents: the v3 attachments manifest and the v2 opportunity `resourceLinks`. On an AMENDED
// solicitation the v3 manifest RETAINS superseded versions SAM no longer serves. Measured on the worker:
//   v3 manifest 12 · v2 resourceLinks 10 · all 10 v2 links HTTP 200 · all 10 ingested
//   the 2 extras: "Solicitation - …0001.pdf" and "Attachment_0001_…_20260428.pdf" (…0002 / …_v2 ingested fine)
// Those 2 counted as unretrieved, flipping BOTH `files_ingested >= files_total` AND `overflow` in
// agenticManifestComplete → documents_complete=false → verdict capped to INCOMPLETE. A guaranteed FALSE DECLINE on
// any solicitation whose v3 manifest keeps old versions — precisely the amended ones.
//
// THE SUBJECT IS THE EVIDENCE RULE, NOT ARITHMETIC. ROOT-2 deliberately never reduces the total, and that is right:
// if v2 lags and two REAL documents fail, trusting v2 manufactures a false COMPLETE. So exclusion requires SAM's
// own error body to say "The resource has been deleted." — the server asserting absence — plus two guards. The
// first cut keyed on 404/410 and was INERT here: SAM answers HTTP **400** for a superseded attachment, and
// widening to "400 means gone" would have been the false-COMPLETE direction. Most tests below exist to prove the
// UNSAFE directions are refused.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

type F = {
  name: string; role: "form" | "amendment" | "attachment"; bytes: number | null;
  ingested: boolean; reason?: string; http_status?: number; sam_deleted?: boolean; superseded?: boolean;
};
// `deleted` = SAM's error body said "The resource has been deleted." — the only admissible evidence.
const f = (name: string, ingested: boolean, http_status?: number, deleted = false): F =>
  ({ name, role: "attachment", bytes: 1000, ingested, ...(http_status != null ? { http_status } : {}), ...(deleted ? { sam_deleted: true } : {}) });

(async () => {
  const { supersededManifestEntries } = await import("./sam-attachments");

  // ---- 1. THE REAL SHAPE: W50S6U26QA019 — 12 enumerated, 10 posted, 10 ingested, 2 answered 400 + "deleted" --
  const real = [
    ...Array.from({ length: 10 }, (_, i) => f(`posted_${i}.pdf`, true)),
    f("Solicitation - W50S6U26QA0190001.pdf", false, 400, true),
    f("Attachment_0001_Drawing_C1.01_Site_Mowing_Mulching_Plan_20260428.pdf", false, 400, true),
  ];
  const got = supersededManifestEntries(real as never, 10, 10);
  ok("the two superseded entries are identified", got.length === 2);
  ok("and they are the RIGHT two (never a posted doc)", got.every((x) => /0190001\.pdf|20260428\.pdf/.test(x.name)));

  // ---- 2. THE UNSAFE DIRECTIONS — each must exclude NOTHING ------------------------------------------------
  // (a) An UNKNOWN failure is not evidence of absence. A timeout or 5xx could be a real doc we failed to get.
  for (const [label, status] of [["timeout / no status", undefined], ["500", 500], ["503", 503], ["403", 403], ["400 WITHOUT the deleted sentence", 400], ["404 WITHOUT the deleted sentence", 404]] as Array<[string, number | undefined]>) {
    const set = [...Array.from({ length: 10 }, (_, i) => f(`posted_${i}.pdf`, true)), f("mystery.pdf", false, status)];
    ok(`unknown failure (${label}) excludes NOTHING — it may be a real document`, supersededManifestEntries(set as never, 10, 10).length === 0);
  }

  // (b) A currently-posted document is MISSING ⇒ a real retrieval gap; exclude nothing, even when SAM says deleted.
  const gap = [...Array.from({ length: 9 }, (_, i) => f(`posted_${i}.pdf`, true)), f("gone.pdf", false, 400, true)];
  ok("a REAL gap (ingested 9 < posted 10) excludes nothing even when SAM says deleted", supersededManifestEntries(gap as never, 10, 9).length === 0);

  // (c) No independent v2 enumeration ⇒ nothing to reconcile against ⇒ do nothing (uploads / v2-lag watcher).
  ok("resourceLinks=0 excludes nothing", supersededManifestEntries(real as never, 0, 10).length === 0);

  // (d) THE CATASTROPHIC ONE, stated explicitly: v2 LAGS (reports 10) while 12 real docs exist and 2 genuinely
  // fail with an unknown error. Trusting the count alone would drop them and publish a false COMPLETE.
  const v2Lag = [...Array.from({ length: 10 }, (_, i) => f(`posted_${i}.pdf`, true)), f("real_a.pdf", false), f("real_b.pdf", false)];
  ok("v2-lag + unknown failures ⇒ excludes nothing (no false COMPLETE)", supersededManifestEntries(v2Lag as never, 10, 10).length === 0);

  // ---- 3. An ingested doc is never touched, whatever status it carries ---------------------------------------
  const weird = [...Array.from({ length: 10 }, (_, i) => f(`posted_${i}.pdf`, true)), { ...f("odd.pdf", true), http_status: 400, sam_deleted: true }];
  ok("an INGESTED doc is never excluded (bytes arrived — it is not absent)", supersededManifestEntries(weird as never, 10, 11).length === 0);

  // ---- 4. The arithmetic the fix exists to correct ----------------------------------------------------------
  // agenticManifestComplete needs files_ingested >= files_total AND !overflow. Both were flipped by the phantoms.
  const before = { files_total: 12, files_ingested: 10, overflowSet: true };
  const excluded = supersededManifestEntries(real as never, 10, 10).length;
  const after = { files_total: 12 - excluded, files_ingested: 10, overflowSet: (real.filter((x) => !x.ingested).length - excluded) > 0 };
  ok("BEFORE: 10 >= 12 is false → documents_complete=false → INCOMPLETE", !(before.files_ingested >= before.files_total));
  ok("AFTER:  10 >= 10 is true", after.files_ingested >= after.files_total);
  ok("AFTER:  overflow is no longer set (skipped count drops to 0)", after.overflowSet === false);
  ok("the denominator moved by exactly 2 — not to zero, not to the v2 count by fiat", before.files_total - after.files_total === 2);

  const { agenticManifestComplete } = await import("./audit-executor-v3");
  ok("agenticManifestComplete: false BEFORE",
    agenticManifestComplete({ files_total: 12, files_ingested: 10, overflow: "2 of 12 …", files: [] } as never, false, true) === false);
  ok("agenticManifestComplete: true AFTER",
    agenticManifestComplete({ files_total: 10, files_ingested: 10, files: [] } as never, false, true) === true);

  console.log(`\ningest denominator reconciliation: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
