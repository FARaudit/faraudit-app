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
  ok(d.posted[0].deadline === "not-a-date" && !/Invalid/.test(buildWatchedDigestEmail(d, "u", NOW).html),
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
  const e = buildWatchedDigestEmail(d, "https://www.faraudit.com/settings", NOW);
  // Keyed on the PROPERTY, not the wording: the subject must lead with what happened and
  // must differ between weeks. Pinning the literal string made an improved subject read as
  // a regression while the property it guards was untouched.
  ok(/posted/i.test(e.subject), "a week with a posting leads with it", e.subject);
  {
    const closingOnly = buildWatchedDigest(
      [{ status: "watching", created_at: days(-90), response_deadline: days(4) }], OPTS)!;
    const b = buildWatchedDigestEmail(closingOnly, "u", NOW);
    ok(b.subject !== e.subject, "a different week produces a different subject", b.subject);
    ok(/closing soon/i.test(b.subject), "a deadline-only week leads with the deadline", b.subject);
  }
  ok(/faraudit\.com\/settings/.test(e.text), "the footer says how to switch it off");
  ok(/\/audits\/a1/.test(e.html), "a posted row links to its audit");
}
{
  const d = buildWatchedDigest([posted({ title: "<script>alert(1)</script>" })], OPTS)!;
  ok(!/<script>/.test(buildWatchedDigestEmail(d, "u", NOW).html), "a title is escaped, not injected");
}

console.log("\n── the verdict badge ──");
{
  const withV = buildWatchedDigest([posted({ verdict: "BID_WITH_CAUTION" })], OPTS)!;
  const e = buildWatchedDigestEmail(withV, "u", NOW);
  ok(/CAUTION/.test(e.html), "a caution verdict renders its badge");
  ok(/\[BID WITH CAUTION\]/.test(e.text), "the plaintext half carries it too");
}
{
  // AN UNKNOWN VERDICT RENDERS NOTHING. A neutral chip would be a verdict of its own, and
  // the one thing this email must never do is invent an answer about eligibility.
  const unknown = buildWatchedDigest([posted({ verdict: "SOMETHING_NEW" })], OPTS)!;
  const e = buildWatchedDigestEmail(unknown, "u", NOW);
  ok(!/SOMETHING_NEW/.test(e.html), "an unrecognized verdict is not printed raw");
  ok(!/border-radius:5px/.test(e.html), "…and no badge is rendered at all");
}
{
  const none = buildWatchedDigest([posted({ verdict: null })], OPTS)!;
  ok(!/border-radius:5px/.test(buildWatchedDigestEmail(none, "u", NOW).html),
    "no audit yet → no badge, rather than a neutral one");
}
{
  // REVIEW must not wear an answer's colour — an honest "we could not settle this" that
  // looks like a GO is the confident-wrong failure this product exists to refuse.
  const rev = buildWatchedDigestEmail(buildWatchedDigest([posted({ verdict: "NEEDS_HUMAN_REVIEW" })], OPTS)!, "u", NOW).html;
  const go = buildWatchedDigestEmail(buildWatchedDigest([posted({ verdict: "GO" })], OPTS)!, "u", NOW).html;
  ok(/REVIEW/.test(rev) && !/#047857/.test(rev), "review is grey, never green");
  ok(/#047857/.test(go), "…and a real GO still is green");
}

console.log("\n── the preheader ──");
{
  // THE ONE LINE EVERY CLIENT SHOWS BEFORE THE EMAIL IS OPENED. It joined with the HTML
  // ENTITY "&middot;" and then ran esc() over the result, which escapes the ampersand — so
  // the inbox preview read the literal text "&middot;". Caught in a real Gmail snippet.
  const d = buildWatchedDigest([posted(), { status: "watching", created_at: days(-1) }], OPTS)!;
  const h = buildWatchedDigestEmail(d, "u", NOW).html;
  const pre = h.slice(h.indexOf('opacity:0">') + 11, h.indexOf("</div>", h.indexOf('opacity:0">')));
  ok(pre.length > 0, "a preheader is emitted at all", pre);
  ok(!/&(amp;)?[a-z]+;/i.test(pre), "the preheader carries no raw HTML entity", pre);
  ok(!/&(amp;)?[a-z]+;/i.test(buildWatchedDigestEmail(d, "u", NOW).text), "nor does the plaintext half");
  // PLANTED: the check must recognise the defect it was written for.
  ok(/&(amp;)?[a-z]+;/i.test("2 newly tracked &amp;middot; 2 closing soon"),
    "PLANTED: an escaped entity is still detectable by this check");
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
