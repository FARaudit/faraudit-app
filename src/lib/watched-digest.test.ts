// The digest's one dangerous decision is WHETHER TO SEND AT ALL. A quiet week and a failed
// read must never produce the same email, and "you are still watching 6 things" is not news.
import { buildWatchedDigest, buildWatchedDigestEmail, type WatchedRow } from "./watched-digest";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, got?: unknown) => {
  if (c) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL  ${label}${got === undefined ? "" : `  GOT: ${JSON.stringify(got)}`}`); }
};

const NOW = "2026-08-08T12:00:00.000Z";
const days = (n: number) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();
const OPTS = { nowIso: NOW, appBaseUrl: "https://www.faraudit.com" };

const posted = (over: Partial<WatchedRow> = {}): WatchedRow => ({
  id: "p1", audit_id: "a1", title: "Aircraft engine overhaul", agency: "DLA",
  solicitation_number: "SPE4A1-26-R-0001", status: "posted",
  last_checked_at: days(-2), created_at: days(-30), response_deadline: days(30), ...over,
});

console.log("── when to send ──");
ok(buildWatchedDigest([], OPTS) === null, "no rows at all → nothing to send");
ok(buildWatchedDigest([{ status: "watching", created_at: days(-90) }], OPTS) === null,
  "only long-standing watches → nothing to send (a heartbeat is not news)");
ok(buildWatchedDigest([posted()], OPTS) !== null, "a notice posted this week → send");
ok(buildWatchedDigest([{ status: "watching", created_at: days(-1) }], OPTS) !== null,
  "a newly tracked notice → send");
ok(buildWatchedDigest([{ status: "watching", created_at: days(-90), response_deadline: days(5) }], OPTS) !== null,
  "a deadline inside the window → send");
ok(buildWatchedDigest([{ status: "watching", created_at: days(-90), response_deadline: days(60) }], OPTS) === null,
  "a distant deadline is not this week's news");

console.log("\n── what goes where ──");
{
  const d = buildWatchedDigest([posted({ id: "x", created_at: days(-1) })], OPTS)!;
  ok(d.posted.length === 1 && d.newlyTracked.length === 0,
    "tracked AND posted in the same week appears once, under posted", { p: d.posted.length, n: d.newlyTracked.length });
}
{
  const d = buildWatchedDigest([posted(), { status: "watching", created_at: days(-200) }], OPTS)!;
  ok(d.stillWatching === 1, "stillWatching counts the watching rows", d.stillWatching);
}
{
  const d = buildWatchedDigest([posted({ response_deadline: "not-a-date" })], OPTS)!;
  ok(d.closingSoon.length === 0, "an unparseable deadline is omitted, never guessed into a section");
  ok(d.posted[0].deadline === "not-a-date" && !/Invalid/.test(buildWatchedDigestEmail(d, "u").html),
    "…and the email renders without inventing a date");
}
{
  const d = buildWatchedDigest([posted({ status: "failed", response_deadline: days(3) })], OPTS);
  ok(d === null || d.closingSoon.length === 0, "a failed row is not chased for its deadline");
}
ok(buildWatchedDigest([posted()], { ...OPTS, nowIso: "not-a-clock" }) === null,
  "no usable clock → no claims at all");

console.log("\n── the email ──");
{
  const d = buildWatchedDigest([posted(), { status: "watching", created_at: days(-1), title: "Base ops" }], OPTS)!;
  const e = buildWatchedDigestEmail(d, "https://www.faraudit.com/settings");
  ok(/1 posted/.test(e.subject) && /1 newly tracked/.test(e.subject),
    "the subject names the week rather than reading the same every time", e.subject);
  ok(/faraudit\.com\/settings/.test(e.text), "the footer says how to switch it off");
  ok(/\/audit\/a1/.test(e.html), "a posted row links to its audit");
}
{
  const d = buildWatchedDigest([posted({ title: "<script>alert(1)</script>" })], OPTS)!;
  ok(!/<script>/.test(buildWatchedDigestEmail(d, "u").html), "a title is escaped, not injected");
}

console.log("\n── planted positives — this gate must be able to fail ──");
ok(buildWatchedDigest([posted()], OPTS)!.posted.length === 1,
  "P1 the posted fixture really does land in the posted section — the nulls above are a decision, not an empty fixture");
{
  // P2 · the quiet-week nulls must come from the RULE, not from rows the builder cannot read.
  const stale = buildWatchedDigest([{ status: "watching", created_at: days(-90) }], OPTS);
  const fresh = buildWatchedDigest([{ status: "watching", created_at: days(-1) }], OPTS);
  ok(stale === null && fresh !== null,
    "P2 the SAME row shape sends or does not depending only on its date");
}
ok(buildWatchedDigest(null, OPTS) === null && buildWatchedDigest(undefined, OPTS) === null,
  "P3 null and undefined inputs are tolerated and still send nothing");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed · ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
