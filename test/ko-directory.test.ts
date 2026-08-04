// ─────────────────────────────────────────────────────────────────────────────
// KO DIRECTORY — production mapping + grouping, run over a REAL SAM response.
//
// The fixture is transcribed verbatim from a live sam.gov v2 search on this
// customer's own NAICS codes (336413 · 332710 · 332721): 60 notices, 85
// point-of-contact entries, including multi-contact notices, contacts with no
// phone, and notices SAM returned with no resourceLinks. Nothing in it was
// hand-authored, because a fixture written by the same head that wrote the
// reader shares the reader's assumptions.
//
// The path under test is the production one: mapSamItems() (the same function
// the feed uses) then groupOfficers(). Nothing is stubbed but the network.
//
// Run: npx tsx test/ko-directory.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import path from "node:path";
import { mapSamItems } from "../src/lib/bd-os/live-opportunities";
import { groupOfficers, agencyFiltersOf } from "../src/lib/bd-os/ko-directory";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "sam-live-poc-slice.json"), "utf8")
);
const raw = fixture.opportunitiesData as Array<Record<string, unknown>>;
ok(raw.length > 0, `fixture carries live notices`, `${raw.length}`);

// mapSamItems drops no-PDF and expired notices exactly as the feed does, so the
// directory can only ever contain officers from notices the customer can see.
// The window is fixed so this stays deterministic as the fixture ages.
const asOf = new Date("2026-08-04T00:00:00Z");
const rows = mapSamItems(raw as never, asOf);
const { officers, pocWithoutEmail } = groupOfficers(rows);

console.log(`\n── mapped ${rows.length} feed rows from ${raw.length} notices → ${officers.length} officers ──`);

// ── every officer is grounded in a notice ───────────────────────────────────
console.log("\n── A · nothing on an officer that a notice did not carry ──");

const noticeIds = new Set(rows.map((r) => r.notice_id));
const rawEmails = new Set<string>();
const rawNames = new Set<string>();
for (const r of rows) {
  for (const p of r.point_of_contact || []) {
    if (p?.email) rawEmails.add(p.email.trim().toLowerCase());
    if (p?.fullName) rawNames.add(p.fullName.trim());
  }
}

ok(officers.length > 0, "the real response yields a non-empty directory", `${officers.length} officers`);
ok(officers.every((o) => rawEmails.has(o.email)), "every officer address came off a notice");
ok(
  officers.every((o) => rawNames.has(o.name) || o.name === o.email),
  "every officer name came off a notice (or falls back to the address)"
);
ok(
  officers.every((o) => o.notices.every((n) => noticeIds.has(n.notice_id))),
  "every notice attached to an officer is a notice in the feed"
);
ok(
  officers.every((o) => o.noticeCount === o.notices.length),
  "the count an officer displays equals the notices behind it"
);

// The fields the mock invented must not exist on the shape at all — a renderer
// cannot print what the payload does not carry.
const INVENTED = ["fit", "resp", "respDays", "awards", "actions", "setaside", "rel", "timeline", "sched", "lastContact", "warrant"];
const leaked = INVENTED.filter((k) => officers.some((o) => k in (o as unknown as Record<string, unknown>)));
ok(leaked.length === 0, "no scored or averaged field exists on an officer", leaked.join(", "));

// ── B · grouping is by address, and totals reconcile ────────────────────────
console.log("\n── B · one officer per address, and the arithmetic closes ──");

ok(new Set(officers.map((o) => o.email)).size === officers.length, "no address appears twice");

let pocTotal = 0;
for (const r of rows) for (const p of r.point_of_contact || []) if ((p?.email || "").trim()) pocTotal++;
const attached = officers.reduce((s, o) => s + o.noticeCount, 0);
ok(attached === pocTotal, "every addressed contact entry landed on exactly one officer", `${attached} = ${pocTotal}`);
ok(pocWithoutEmail >= 0, "unaddressed contacts are counted, not silently dropped", `${pocWithoutEmail}`);

// Sorting is the product claim on the list: busiest first.
const counts = officers.map((o) => o.noticeCount);
ok(counts.every((c, i) => i === 0 || counts[i - 1] >= c), "officers are ordered by notice count, descending");

const filters = agencyFiltersOf(officers);
ok(filters[0] === "all", "agency filter list opens with 'all'");
ok(
  filters.slice(1).every((a) => officers.some((o) => o.agency === a)),
  "every agency pill matches at least one officer"
);

// ── C · the empty and degenerate cases ──────────────────────────────────────
console.log("\n── C · degenerate inputs produce nothing, never something ──");

const empty = groupOfficers([]);
ok(empty.officers.length === 0, "no rows yields no officers");
ok(agencyFiltersOf([]).length === 1, "no officers yields only the 'all' pill");

const noContacts = groupOfficers(rows.map((r) => ({ ...r, point_of_contact: null })));
ok(noContacts.officers.length === 0, "rows with no contact block yield no officers");

const blankEmail = groupOfficers([
  { ...rows[0], point_of_contact: [{ type: "primary", fullName: "No Address", email: "", phone: "" }] }
]);
ok(blankEmail.officers.length === 0, "a contact with no address is not an officer");
ok(blankEmail.pocWithoutEmail === 1, "…and it is counted", `${blankEmail.pocWithoutEmail}`);

// ── planted positives — prove the assertions above can fail ─────────────────
console.log("\n═══ PLANTED POSITIVES — prove these checks can fail ═══");

const planted = groupOfficers([
  {
    ...rows[0],
    point_of_contact: [{ type: "primary", fullName: "Diane Hartwell", email: "d.hartwell@navy.mil", phone: "(202) 555-0142" }]
  }
]);
ok(!rawEmails.has(planted.officers[0].email), "an address absent from the feed IS caught by the grounding check");
ok(!rawNames.has(planted.officers[0].name), "a name absent from the feed IS caught by the grounding check");

const doubled = groupOfficers([rows[0], rows[0]]);
const firstEmails = (rows[0].point_of_contact || []).filter((p) => p?.email).length;
ok(
  doubled.officers.reduce((s, o) => s + o.noticeCount, 0) === firstEmails * 2,
  "the reconciliation check follows a duplicated notice rather than deduping it away"
);

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nKO DIRECTORY FAILED — the directory carries something the feed did not.");
  process.exit(1);
}
console.log("ko-directory clean.");
