// PROGRESS-PAGE ELAPSED SEED — the refetch run-start regression (2026-07-30).
//
// Live defect: the progress page printed "443:47 ELAPSED" over a run that was 2
// minutes old, and the CEO reached for a kill switch on a healthy $1.47 audit.
// Cause: POST /api/audit/[id]/refetch re-runs an EXISTING audits row, so
// created_at is the ORIGINAL audit's birthday — 7h23m stale on the live run —
// while the actual run began at compliance_json.last_refetched_at.
//
// Asserted on the RENDERED HTML (the data-start attribute the client ticks from),
// not on an internal variable. Tonight's other two defects both shipped because a
// check inspected inputs instead of the result.
//
// Run: npx tsx "src/app/audits/[id]/_render-states-elapsed.test.ts"
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAuditTransitionalState } from "./_render-states";

const template = readFileSync(join(process.cwd(), "src/app/audits/[id]/_states-template.html"), "utf8");

let failures = 0;
const assert = (c: boolean, m: string) => {
  console.log(`${c ? "✅" : "❌"} ${m}`);
  if (!c) failures++;
};

const CREATED = "2026-07-29T19:00:48.039Z"; // the real row's created_at
const REFETCH = "2026-07-30T02:23:07.413Z"; // the real refetch enqueue stamp — 7h23m later

function startEpochOf(audit: Record<string, unknown>): number | null {
  const html = renderAuditTransitionalState(template, audit, { state: "progress" });
  const m = html.match(/<body[^>]*\sdata-start="(\d+)"/);
  return m ? Number(m[1]) : null;
}

// ── 1. THE LIVE DEFECT: refetch run must date from the refetch, not row creation ──
{
  const epoch = startEpochOf({
    id: "a5ed7e44-92f1-4056-b97b-83a293022f09",
    created_at: CREATED,
    compliance_json: { last_refetched_at: REFETCH },
  });
  assert(epoch !== null, "refetch run: data-start is emitted");
  assert(epoch === new Date(REFETCH).getTime(), "refetch run: data-start is the REFETCH stamp, not created_at");

  // The property that actually bit us — what the counter would display.
  const shownMinutes = Math.round((new Date("2026-07-30T02:25:00Z").getTime() - (epoch ?? 0)) / 60000);
  assert(shownMinutes < 10, `refetch run: counter shows ${shownMinutes} min (was 443 — the runaway-looking number)`);
}

// ── 2. FIRST RUN (no stamp): unchanged behaviour ──
{
  const epoch = startEpochOf({ id: "x", created_at: CREATED });
  assert(epoch === new Date(CREATED).getTime(), "first run: data-start still falls back to created_at");
}

// ── 3. STALE STAMP (older than created_at): never move the clock BACKWARD ──
{
  const epoch = startEpochOf({
    id: "x",
    created_at: REFETCH, // row created AFTER the stamp
    compliance_json: { last_refetched_at: CREATED },
  });
  assert(epoch === new Date(REFETCH).getTime(), "stale stamp: ignored, created_at wins");
}

// ── 4. GARBAGE STAMP: must not poison the attribute with NaN ──
{
  const epoch = startEpochOf({
    id: "x",
    created_at: CREATED,
    compliance_json: { last_refetched_at: "not-a-date" },
  });
  assert(epoch === new Date(CREATED).getTime(), "unparseable stamp: falls back to created_at, no NaN");
}

// ── 5. NEITHER: attribute omitted rather than emitted as NaN ──
{
  const html = renderAuditTransitionalState(template, { id: "x" }, { state: "progress" });
  assert(!/data-start="NaN"/.test(html), "no dates: never emits data-start=\"NaN\"");
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
