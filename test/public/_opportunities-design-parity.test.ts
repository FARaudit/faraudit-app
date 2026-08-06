// DESIGN-PARITY GATE — card 775, opportunities row card + triage hero.
//
// Design has no repo access. The CEO hand-carries files, so Design's chat message
// and Design's delivered file routinely disagree — and porting from the message
// already cost one silent drift (VERDICTS.READ.rule quietly gained "sole-source
// intent"; found only by differencing the two files, not by reading them).
//
// This gate makes that reconciliation re-runnable instead of a one-off: it extracts
// every PROSE literal from the design-owned region of Design's delivered file and
// from the shipped render layer, and asserts the two sets are equal.
//
// Why prose literals specifically: the port applies a deliberate field-name remap
// (o.g->o.stage, o.s->o.sa, o.y->o.days). Those are identifiers, never string
// literals, so comparing literals compares exactly what Design owns — the words a
// customer reads — and is blind to what Code owns. The previous hand-rolled pass
// compared raw source slices and had to wave off four "differences" as remap
// artifacts; this one has none to wave off.
//
// Run: npx tsx test/public/_opportunities-design-parity.test.ts

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

// Design's delivered file is VENDORED into the repo. The hand-carried original
// lives in a CEO comms folder that gets archived once a card is sent, and it is
// outside the repo entirely — so a gate pointed at it is unrunnable in CI and goes
// red the moment the CEO files the card. The vendored copy is the source of truth;
// the original is treated as a drift check when it happens to still be there.
const DESIGN_FILE = path.join(process.cwd(), "test", "fixtures", "design",
  "card-775-opportunities-LIVE-rev-2026-07-30.html");
const DESIGN_ORIGINAL = path.join(
  "/Users/josearodriguezjr./faraudit-app/ceo/redesign-final/Communication/Send to Code",
  "card-790-1to1-confirm-2026-07-30",
  "Card 775 - Opportunities -LIVE- (rev 2026-07-30).html"
);
const SHIPPED_FILE = path.join(process.cwd(), "public", "dso-app.js");

// The design-owned region: the classifier and everything it labels. Starts at the
// VERDICTS table, ends where per-row composition ends and app state begins.
const REGION_START = "const VERDICTS = {";
const REGION_END = "/* ── state ── */";

function region(src: string, whose: string): string {
  const a = src.indexOf(REGION_START);
  const b = src.indexOf(REGION_END, a);
  if (a < 0) throw new Error(`${whose}: region start anchor "${REGION_START}" not found`);
  if (b < 0) throw new Error(`${whose}: region end anchor "${REGION_END}" not found`);
  return src.slice(a, b);
}

// Strip comments before extracting: Design's file carries review-only commentary
// (e.g. the C17 block that QUOTES the banned "Nothing to audit" string to explain
// the doctrine). Code does not port that block, and a quoted string inside a
// comment is not a string the customer ever reads. Counting it would manufacture a
// false drift — the exact false positive the last reconciliation had to rule out
// by hand.
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

// A "prose literal" is a single-quoted string a human reads: it contains a space,
// or it is a multi-word-ish label. Bare enum tokens ('notice', 'SoleSource',
// 'vd-read') are Code's wiring, not Design's copy, and are excluded so that
// renaming a CSS class never reads as a copy change.
function proseLiterals(src: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const v = m[1];
    if (!v.includes(" ")) continue;            // enum token / class name
    // Whitespace-only is not copy. `.replace(/_+/g, ' ')` passes the space test
    // above while carrying no words at all, so it was reported as "invented copy"
    // — noise that would recur for any separator argument. Prose has at least one
    // non-space character; this excludes nothing a human reads.
    if (!/\S/.test(v)) continue;
    if (/^[a-z-]+$/.test(v)) continue;         // defensive: kebab wiring
    out.push(v);
  }
  return out.sort();
}

console.log("═══ 0 · BOTH SOURCES PRESENT ═══");
ok(existsSync(DESIGN_FILE), "Design's delivered file is vendored in-repo", "test/fixtures/design/");
if (!existsSync(DESIGN_FILE)) {
  // Fail loudly rather than skipping. A missing reference file is exactly the
  // condition that produced the drift this gate exists to catch.
  console.log("\n✗ Design's vendored file is absent — cannot certify parity. This is a FAIL, not a skip.");
  console.log(`\n══════ ${pass} passed · ${fail + 1} failed ══════`);
  process.exit(1);
}
ok(existsSync(SHIPPED_FILE), "the shipped render layer is on disk", "public/dso-app.js");

// Drift check: while the hand-carried original is still on disk, the vendored copy
// must equal it byte for byte. This is what stops the fixture from quietly becoming
// a stale snapshot of a file Design has since re-dropped — the vendoring would
// otherwise just relocate the message-vs-file problem one layer down.
if (existsSync(DESIGN_ORIGINAL)) {
  const a = readFileSync(DESIGN_FILE);
  const b = readFileSync(DESIGN_ORIGINAL);
  ok(a.equals(b), "the vendored copy is byte-identical to the hand-carried original",
    a.equals(b) ? `${a.length} bytes` : `vendored ${a.length}B vs original ${b.length}B — RE-VENDOR`);
} else {
  console.log("  · hand-carried original not on disk (card archived) — vendored copy stands alone");
}

const designSrc = readFileSync(DESIGN_FILE, "utf8");
const shippedSrc = readFileSync(SHIPPED_FILE, "utf8");

const designRegion = stripComments(region(designSrc, "Design"));
const shippedRegion = stripComments(region(shippedSrc, "shipped"));

const designLits = proseLiterals(designRegion);
const shippedLits = proseLiterals(shippedRegion);

console.log("\n═══ 1 · THE REGION WAS ACTUALLY FOUND ON BOTH SIDES ═══");
ok(designLits.length > 20, "Design region yields a real literal set", `${designLits.length} literals`);
ok(shippedLits.length > 20, "shipped region yields a real literal set", `${shippedLits.length} literals`);
ok(designLits.length === shippedLits.length, "the two sides carry the same NUMBER of prose literals",
  `design ${designLits.length} · shipped ${shippedLits.length}`);

console.log("\n═══ 2 · PROSE PARITY — every word Design wrote is the word we ship ═══");
const dSet = new Set(designLits), sSet = new Set(shippedLits);
const missing = designLits.filter((l) => !sSet.has(l));   // Design wrote it, we dropped it
const added = shippedLits.filter((l) => !dSet.has(l));    // we invented it

ok(missing.length === 0, "no literal Design delivered is missing from the shipped page",
  missing.length ? `DROPPED ${missing.length}: ${missing.slice(0, 3).map((s) => JSON.stringify(s.slice(0, 60))).join(" | ")}` : "0 dropped");
ok(added.length === 0, "the shipped page invents no copy Design did not deliver",
  added.length ? `INVENTED ${added.length}: ${added.slice(0, 3).map((s) => JSON.stringify(s.slice(0, 60))).join(" | ")}` : "0 invented");

console.log("\n═══ 3 · THE KNOWN DRIFT STAYS FIXED ═══");
// The specific regression that reached a commit: the READ rule's enumeration lost
// "sole-source intent" when ported from Design's message instead of their file.
const READ_RULE = designLits.find((l) => l.startsWith("Special Notice — industry day"));
ok(!!READ_RULE, "Design's READ rule is present in the delivered file");
ok(!!READ_RULE && READ_RULE.includes("sole-source intent"),
  "Design's READ rule enumerates sole-source intent");
ok(!!READ_RULE && sSet.has(READ_RULE), "the shipped READ rule matches Design's byte for byte");

console.log("\n═══ 4 · A1 DOCTRINE — the reason slot never names our pipeline ═══");
// Ruled by the CEO 2026-07-29: a reason must state something that would still be
// true if FARaudit did not exist. Asserted here on BOTH sides, so a future Design
// drop that reintroduces it is caught at the door, not after the port.
const AUDIT_SUBJECT = /nothing to audit|no document to audit|cannot be audited/i;
ok(!designLits.some((l) => AUDIT_SUBJECT.test(l)),
  "Design's delivered copy carries no audit-subject reason");
ok(!shippedLits.some((l) => AUDIT_SUBJECT.test(l)),
  "the shipped copy carries no audit-subject reason");

console.log("\n═══ 5 · PLANTED POSITIVES — prove this gate can fail ═══");
{
  // P1 a dropped word (the exact shape of the real drift). Assert the mutation
  // actually applied first — a replace() that silently found nothing would make
  // this planted positive pass for the wrong reason.
  const mutated = designRegion.replace("industry day, amendment, sole-source intent", "industry day, amendment");
  ok(mutated !== designRegion, "P1a the planted mutation actually applied");
  ok(proseLiterals(mutated).some((l) => !sSet.has(l)),
    "P1b a silently dropped enumeration IS caught", "the real 067c65c drift shape");

  // P2 invented copy
  const mutated2 = shippedRegion.replace("these are your bids", "these are the good ones");
  ok(proseLiterals(mutated2).some((l) => !dSet.has(l)),
    "P2 copy invented on the Code side IS caught");

  // P3 the comment-stripper must not hide a REAL string
  const withRealBanned = shippedRegion + "\nconst x = 'Nothing to audit yet';";
  ok(proseLiterals(stripComments(withRealBanned)).some((l) => AUDIT_SUBJECT.test(l)),
    "P3 an audit-subject string in CODE is still caught after comment-stripping");

  // P4 ...but a quoted banned string inside a COMMENT is correctly ignored
  const withCommentedBanned = shippedRegion + "\n/* doctrine: 'Nothing to audit' is banned */";
  ok(!proseLiterals(stripComments(withCommentedBanned)).some((l) => AUDIT_SUBJECT.test(l)),
    "P4 the same string inside a comment is correctly NOT counted");

  // P5 the gate cannot pass vacuously — a missing anchor throws rather than
  // silently comparing two empty sets
  let threw = false;
  try { region("no anchors here", "synthetic"); } catch { threw = true; }
  ok(threw, "P5 a missing region anchor THROWS (no vacuous pass on an empty set)");
}

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail === 0) console.log("design-parity gate clean — shipped copy is 1:1 with Design's delivered file.");
process.exit(fail === 0 ? 0 : 1);
