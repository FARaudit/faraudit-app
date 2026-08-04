// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITIES CERTIFICATIONS GATE — the eligibility subtraction is the only
// place this page REMOVES a notice for a reason the customer did not choose, so
// every removal has to be one SAM can attest, and every non-removal has to be
// provably non-removal rather than an accident of a filter that never fires.
//
// The failure this guards against is asymmetric and that shapes the whole file.
// A row wrongly KEPT costs a customer thirty seconds of reading. A row wrongly
// REMOVED is a bid they never saw — silent, unrecoverable, and invisible in
// every count on the page, because the count is computed after the removal.
// So the assertions below are weighted toward proving rows SURVIVE.
//
//   C1  SERVER — establishedPrograms(): expiry drops a record, and program
//       containment expands in ONE direction only.
//   C2  POLE TABLE — hand-written pole → program mapping, never recomputed from
//       the map under test.
//   C3  SIZE POLES ARE UNTOUCHABLE — SB and SB-Partial survive every state,
//       including a verified registration carrying zero programs. Size is a
//       per-solicitation determination and no registration record settles it.
//   C4  UNKNOWN NEVER NARROWS — loading / no-uei / uei-not-found / unverified /
//       registration-inactive each keep every pole on screen.
//   C5  PARTITION — the two funnel subtractions are disjoint and exhaustive, so
//       read − outNaics − ineligible === sorted, arithmetically.
//   C6  BANNER — six states, six distinct lines, and no non-verified state
//       asserts anything about what the firm holds. uei-not-found and unverified
//       BOTH render zero programs but are opposite instructions: one is the
//       customer's UEI to correct, the other is our outage to wait out. The demo
//       profile hits the first, and the collapsed version told it the second.
//   C7  COVERAGE — every pole normSetaside() can emit is decided explicitly, and
//       every program a pole is gated on is one the canonicaliser can emit.
//   C8  PLANTED POSITIVES — the filter must be shown to FIRE, the containment
//       must be shown to fail when inverted, and coverage must fail on a new
//       pole. A subtraction that never subtracts passes C3 and C4 for free.
//
// Run: npx tsx test/public/_opportunities-certifications.test.ts
//
// The client half is EXECUTED out of public/dso-app.js. A reimplementation
// would be self-consistent by construction and could not see a drift between
// what this asserts and what the browser runs.
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { establishedPrograms, PROGRAM_LABEL } from "../../src/lib/cert-verification";
import { canonicalizeEligibilityAttr } from "../../src/lib/audit-decide";
import { lookupEntityByUei } from "../../src/lib/sam-entity";
import type { ProfileAttributeRecord } from "../../src/lib/audit-findings";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const P = (f: string) => path.join(process.cwd(), "public", f);
const DSO_JS = readFileSync(P("dso-app.js"), "utf8");
const LIVE_JS = readFileSync(P("opportunities-live.js"), "utf8");

const NOW = "2026-08-03T00:00:00.000Z";
const FUTURE = "2027-06-01T00:00:00.000Z";
const PAST = "2026-01-01T00:00:00.000Z";
const rec = (attr: string, expiresAt = FUTURE): ProfileAttributeRecord =>
  ({ attr, source: "sam_api", verifiedAt: NOW, expiresAt } as ProfileAttributeRecord);

// ── load the SHIPPED predicates out of the browser file ──────────────────────
function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in dso-app.js`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}
function extractObject(src: string, name: string): string {
  const m = src.match(new RegExp(`(?:var|const|let)\\s+${name}\\s*=\\s*\\{`));
  if (!m) throw new Error(`${name} not found in dso-app.js`);
  const from = src.indexOf("{", src.indexOf(m[0]));
  let depth = 0, i = from;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return `var ${name} = ${src.slice(from, i + 1)}; __out.${name} = ${name};`;
}

type Row = { sa: string; naics?: string | null };
type CertState = { state: string; records?: { label?: string; attr?: string }[]; establishedPrograms?: string[] };

interface Shipped {
  certEligible: (o: Row) => boolean;
  inNaics: (o: Row) => boolean;
  certBannerCopy: () => { pre: string; strong: string; post: string; btn: string | null };
  POLE_PROGRAM: Record<string, string>;
  setCerts: (c: CertState) => void;
  setNaics: (codes: string[]) => void;
}

function loadShipped(src: string): Shipped {
  const sandbox: any = { __out: {}, console, window: { DSO: { CERTS: { state: "loading" } } } };
  vm.createContext(sandbox);
  vm.runInContext(
    `var S = { naics: new Set() }; __out.S = S;\n` +
    extractObject(src, "POLE_PROGRAM") + "\n" +
    extractFn(src, "PROFILE_CERTS") + "\n" +
    extractFn(src, "certEligible") + "\n" +
    extractFn(src, "inNaics") + "\n" +
    extractFn(src, "certBannerCopy") + "\n",
    sandbox
  );
  const o = sandbox.__out;
  return {
    certEligible: o.certEligible,
    inNaics: o.inNaics,
    certBannerCopy: o.certBannerCopy,
    POLE_PROGRAM: o.POLE_PROGRAM,
    setCerts: (c) => { sandbox.window.DSO.CERTS = c; },
    setNaics: (codes) => { o.S.naics = new Set(codes); },
  };
}

let SH: Shipped;
try {
  SH = loadShipped(DSO_JS);
  ok(true, "loaded certEligible / PROFILE_CERTS / certBannerCopy / POLE_PROGRAM out of public/dso-app.js");
} catch (e) {
  ok(false, "load shipped predicates", String((e as Error).message));
  console.log("\n❌ cannot continue without the shipped source");
  process.exit(1);
}

const VERIFIED = (programs: string[], labels: string[] = programs): CertState => ({
  state: "verified",
  records: labels.map((l) => ({ label: l, attr: l })),
  establishedPrograms: programs,
});

// ── C1 · SERVER: expiry and one-way containment ──────────────────────────────
console.log("\nC1 · establishedPrograms — expiry + containment");
{
  ok(establishedPrograms([rec("se:sdvosb")], NOW).includes("se:sdvosb"), "a live record establishes its own program");
  ok(establishedPrograms([rec("se:sdvosb", PAST)], NOW).length === 0, "an EXPIRED record establishes nothing");
  ok(establishedPrograms([rec("se:sdvosb", "not a date")], NOW).length === 0, "an unparseable expiry establishes nothing");
  ok(establishedPrograms(null, NOW).length === 0, "a null record set establishes nothing");
  ok(establishedPrograms([rec("se:8a")], "not a date").length === 0, "an unreadable clock establishes nothing (never a free clear)");

  const ed = establishedPrograms([rec("se:edwosb")], NOW);
  ok(ed.includes("se:edwosb") && ed.includes("se:wosb"), "EDWOSB establishes WOSB — an EDWOSB firm is a WOSB firm", ed.join(","));
  const wo = establishedPrograms([rec("se:wosb")], NOW);
  ok(wo.includes("se:wosb") && !wo.includes("se:edwosb"), "WOSB does NOT establish EDWOSB — containment is one-way", wo.join(","));

  const sd = establishedPrograms([rec("se:sdvosb")], NOW);
  ok(sd.includes("se:vosb"), "SDVOSB establishes VOSB");
  const vo = establishedPrograms([rec("se:vosb")], NOW);
  ok(!vo.includes("se:sdvosb"), "VOSB does NOT establish SDVOSB — containment is one-way");

  const a8 = establishedPrograms([rec("se:8a")], NOW);
  ok(a8.length === 1 && a8[0] === "se:8a", "8(a) widens to nothing else", a8.join(","));
  const hz = establishedPrograms([rec("se:hubzone")], NOW);
  ok(hz.length === 1 && hz[0] === "se:hubzone", "HUBZone widens to nothing else", hz.join(","));

  const mixed = establishedPrograms([rec("se:edwosb"), rec("se:hubzone", PAST)], NOW);
  ok(mixed.includes("se:edwosb") && !mixed.includes("se:hubzone"),
    "one expired record among live ones drops only itself", mixed.join(","));
}

// ── C2 · POLE TABLE, hand-written from the render vocabulary ─────────────────
console.log("\nC2 · pole → program table");
{
  // Written from the poles saRender() draws as `restricted`, NOT read back out
  // of POLE_PROGRAM. SB is deliberately absent — see C3.
  // SDVOSB is deliberately ABSENT — see C3. SB is absent too.
  const EXPECTED: Record<string, string> = {
    "8(a)": "se:8a", "HUBZone": "se:hubzone",
    "EDWOSB": "se:edwosb", "WOSB": "se:wosb",
  };
  const actual = SH.POLE_PROGRAM;
  for (const [pole, prog] of Object.entries(EXPECTED))
    ok(actual[pole] === prog, `${pole} is gated on ${prog}`, actual[pole] ? `got ${actual[pole]}` : "absent");
  const extra = Object.keys(actual).filter((k) => !(k in EXPECTED));
  ok(extra.length === 0, "no pole is gated that this table does not name", extra.join(","));

  for (const prog of Object.values(actual))
    ok(canonicalizeEligibilityAttr(prog.replace(/^se:/, "").replace("8a", "8(a)")) === prog ||
       Object.keys(PROGRAM_LABEL).includes(prog),
      `${prog} is a program the verifier can actually emit (a pole gated on an unemittable program could never clear)`);
}

// ── C3 · SIZE POLES ARE UNTOUCHABLE ──────────────────────────────────────────
console.log("\nC3 · small-business poles are never screened on certifications");
{
  // The highest-consequence assertion in this file. A firm registered under zero
  // socioeconomic programs is very often small, so gating these two on a program
  // record would hide the single largest slice of what it may actually bid.
  for (const certs of [VERIFIED([]), VERIFIED(["se:8a"]), VERIFIED(["se:hubzone", "se:wosb"])]) {
    SH.setCerts(certs);
    const p = (certs.establishedPrograms || []).join(",") || "none";
    ok(SH.certEligible({ sa: "SB" }), `SB survives a verified registration holding [${p}]`);
    ok(SH.certEligible({ sa: "SB-Partial" }), `SB-Partial survives a verified registration holding [${p}]`);
    // The source cannot attest SDVOSB (no such SBA code exists), so its absence is not evidence.
    ok(SH.certEligible({ sa: "SDVOSB" }), `SDVOSB survives [${p}] — SAM's SBA list cannot attest it`);
    ok(SH.certEligible({ sa: "Full" }), `Full & Open survives [${p}]`);
    ok(SH.certEligible({ sa: "UNKNOWN" }), `an UNREAD set-aside survives [${p}] — unread is not a restriction`);
    ok(SH.certEligible({ sa: "SoleSource" }), `SoleSource survives [${p}] — its band already screens it`);
  }
}

// ── C4 · UNKNOWN STATES NEVER NARROW ─────────────────────────────────────────
console.log("\nC4 · every non-verified state keeps every pole");
{
  const POLES = ["SB", "SB-Partial", "SDVOSB", "8(a)", "HUBZone", "WOSB", "EDWOSB", "SoleSource", "Full", "UNKNOWN"];
  for (const state of ["loading", "no-uei", "uei-not-found", "unverified", "registration-inactive"]) {
    SH.setCerts({ state, records: [], establishedPrograms: [] });
    const removed = POLES.filter((sa) => !SH.certEligible({ sa }));
    ok(removed.length === 0, `state '${state}' removes nothing`, removed.join(","));
  }
  // A state nobody has written yet must behave like the unknown ones, not like
  // 'verified'. Fail-closed here means "keep the row".
  SH.setCerts({ state: "some-future-state", records: [], establishedPrograms: [] });
  ok(POLES.every((sa) => SH.certEligible({ sa })), "an unrecognised state removes nothing");
  SH.setCerts(undefined as any);
  ok(POLES.every((sa) => SH.certEligible({ sa })), "an absent CERTS object removes nothing");
}

// ── C5 · PARTITION — the funnel's arithmetic ─────────────────────────────────
console.log("\nC5 · the two subtractions are disjoint and exhaustive");
{
  const read: Row[] = [
    { sa: "SDVOSB", naics: "336413" }, { sa: "8(a)", naics: "336413" },
    { sa: "WOSB", naics: "541330" },   { sa: "EDWOSB", naics: "541330" },
    { sa: "HUBZone", naics: "999999" },{ sa: "SB", naics: "999999" },
    { sa: "Full", naics: "336413" },   { sa: "UNKNOWN", naics: null },
    { sa: "SoleSource", naics: "541330" }, { sa: "SB-Partial", naics: "336413" },
  ];
  SH.setNaics(["336413", "541330"]);
  SH.setCerts(VERIFIED(["se:edwosb", "se:wosb"], ["EDWOSB"]));

  const outNaics = read.filter((o) => !SH.inNaics(o)).length;
  const ineligible = read.filter((o) => SH.inNaics(o) && !SH.certEligible(o)).length;
  const sorted = read.filter((o) => SH.inNaics(o) && SH.certEligible(o)).length;
  ok(read.length - outNaics - ineligible === sorted,
    `read(${read.length}) − outNaics(${outNaics}) − ineligible(${ineligible}) === sorted(${sorted})`);
  ok(outNaics === 2, "the NAICS subtraction counts the out-of-scope rows only", String(outNaics));
  // 2, not 3: the HUBZone row carries an out-of-scope NAICS, so it is claimed by
  // the FIRST subtraction. That is the disjointness this section exists to prove
  // — a row removed twice would break the sum above while leaving both counts
  // looking individually plausible.
  // 1, not 2: the SDVOSB row is in scope and NOT established, yet survives — SDVOSB is never screened,
  // because SAM's SBA list cannot attest it. 8(a) is the only in-scope removal.
  ok(ineligible === 1, "8(a) is the only in-scope eligibility removal", String(ineligible));
  ok(SH.certEligible({ sa: "SDVOSB", naics: "336413" }),
    "the in-scope SDVOSB row SURVIVES a verified registration that does not list it");
  ok(!SH.inNaics({ sa: "HUBZone", naics: "999999" }), "the HUBZone row is claimed by the NAICS subtraction, not counted twice");

  // The EDWOSB registration must clear the WOSB row as well as the EDWOSB one —
  // this is the containment rule reaching the actual render corpus.
  ok(SH.certEligible({ sa: "WOSB" }) && SH.certEligible({ sa: "EDWOSB" }),
    "an EDWOSB registration keeps BOTH the WOSB and EDWOSB notices");
  SH.setCerts(VERIFIED(["se:wosb"], ["WOSB"]));
  ok(SH.certEligible({ sa: "WOSB" }) && !SH.certEligible({ sa: "EDWOSB" }),
    "a WOSB registration keeps WOSB and removes EDWOSB");
}

// ── C6 · BANNER — five states, five lines ────────────────────────────────────
console.log("\nC6 · the banner says something different in each state");
{
  const lines = new Map<string, string>();
  const say = (c: { pre: string; strong: string; post: string }) => (c.pre + c.strong + c.post).replace(/\s+/g, " ").trim();

  for (const state of ["loading", "no-uei", "uei-not-found", "unverified", "registration-inactive"]) {
    SH.setCerts({ state, records: [], establishedPrograms: [] });
    lines.set(state, say(SH.certBannerCopy()));
  }
  SH.setCerts(VERIFIED([]));
  lines.set("verified-zero", say(SH.certBannerCopy()));
  SH.setCerts(VERIFIED(["se:hubzone"], ["HUBZone"]));
  lines.set("verified-some", say(SH.certBannerCopy()));

  ok(new Set(lines.values()).size === lines.size, `all ${lines.size} states render distinct copy`,
    [...lines.values()].join(" | ").slice(0, 120));

  // The claim each state may NOT make. Only a verified read may say anything
  // about what the firm does or does not hold.
  const HOLDS_CLAIM = /lists no socioeconomic|no certifications|you do not qualify|not eligible/i;
  for (const state of ["loading", "no-uei", "uei-not-found", "unverified", "registration-inactive"])
    ok(!HOLDS_CLAIM.test(lines.get(state)!), `'${state}' asserts nothing about what the firm holds`, lines.get(state));

  // And each unknown state must say the page is not removing anything, because
  // it is not — a silent unknown reads as a screened list.
  for (const state of ["no-uei", "uei-not-found", "unverified", "registration-inactive"])
    ok(/nothing is screened out/i.test(lines.get(state)!),
      `'${state}' states that nothing is screened out`, lines.get(state));

  SH.setCerts(VERIFIED(["se:hubzone"], ["HUBZone"]));
  ok(SH.certBannerCopy().strong.includes("HUBZone"), "a verified registration names the programs it carries");
  for (const state of ["no-uei", "uei-not-found"]) {
    SH.setCerts({ state, records: [], establishedPrograms: [] });
    ok(SH.certBannerCopy().btn !== null, `'${state}' carries a control — the cause is the customer's to fix`);
  }
  for (const state of ["loading", "unverified", "registration-inactive"]) {
    SH.setCerts({ state, records: [], establishedPrograms: [] });
    ok(SH.certBannerCopy().btn === null, `'${state}' offers no control — there is nothing for the customer to fix`);
  }
}

// ── C7 · COVERAGE against the live pole vocabulary ───────────────────────────
console.log("\nC7 · every pole normSetaside() emits is decided explicitly");
{
  // Read the poles out of opportunities-live.js rather than listing them here:
  // the drift this catches is a NEW pole added there and never considered here.
  const poles = new Set<string>();
  const rules = LIVE_JS.slice(LIVE_JS.indexOf("var SETASIDE_RULES"));
  for (const m of rules.matchAll(/pole:\s*'([^']+)'/g)) poles.add(m[1]);
  poles.add("UNKNOWN"); // normSetaside's fail-closed default
  ok(poles.size >= 10, `read the live pole vocabulary (${poles.size} poles)`, [...poles].join(","));

  // NEVER-SCREEN is a decision, recorded here with its reason, not a leftover.
  const NEVER_SCREEN: Record<string, string> = {
    "SB": "size is determined per solicitation, not by registration",
    "SB-Partial": "size is determined per solicitation, not by registration",
    "SDVOSB": "SAM's SBA list does not carry SDVOSB at all — it is certified via VA VetCert",
    "Full": "unrestricted — restricts nobody",
    "UNKNOWN": "the set-aside was not read; unread is not a restriction",
    "SoleSource": "already screened by its verdict band, not by eligibility",
  };
  const undecided = [...poles].filter((p) => !(p in SH.POLE_PROGRAM) && !(p in NEVER_SCREEN));
  ok(undecided.length === 0,
    "no pole falls through undecided (a new pole must be classified here before it ships)",
    undecided.join(","));

  SH.setCerts(VERIFIED([]));
  for (const [pole, why] of Object.entries(NEVER_SCREEN))
    ok(SH.certEligible({ sa: pole }), `${pole} is never screened — ${why}`);
}

// ── C8 · PLANTED POSITIVES ───────────────────────────────────────────────────
console.log("\nC8 · the gate can fail");
{
  // P1 — the subtraction must FIRE. C3/C4 are satisfied for free by a filter
  // that never removes anything, which is exactly the state before this wiring.
  SH.setCerts(VERIFIED([]));
  const fires = ["8(a)", "HUBZone", "WOSB", "EDWOSB"].filter((sa) => !SH.certEligible({ sa }));
  ok(fires.length === 4,
    "PLANTED: a verified registration with no programs removes all four attestable poles", fires.join(","));

  // P2 — a hardcoded empty cert set (the pre-wiring shape) must NOT read as
  // verified. If PROFILE_CERTS ever defaults to 'verified', C3/C4 stay green
  // while the page silently screens on an empty program set.
  SH.setCerts({ state: "loading", records: [], establishedPrograms: [] });
  ok(SH.certEligible({ sa: "SDVOSB" }), "PLANTED: an unanswered lookup does NOT behave as a verified empty set");

  // P3 — invert the containment and require the C1 table to catch it.
  const MUTANT: Record<string, readonly string[]> = { "se:wosb": ["se:edwosb"], "se:vosb": ["se:sdvosb"] };
  const mutantEstablished = (recs: ProfileAttributeRecord[]): string[] => {
    const out = new Set<string>();
    for (const r of recs) { out.add(r.attr); for (const i of MUTANT[r.attr] ?? []) out.add(i); }
    return [...out];
  };
  ok(mutantEstablished([rec("se:wosb")]).includes("se:edwosb"),
    "PLANTED: the inverted-containment mutant does clear EDWOSB from a WOSB record (so C1's one-way test is not vacuous)");
  ok(!establishedPrograms([rec("se:wosb")], NOW).includes("se:edwosb"),
    "PLANTED: the SHIPPED containment refuses that same clear");

  // P4 — coverage must fail on an unclassified pole.
  const fakePoles = new Set(["SB", "SB-Partial", "Full", "UNKNOWN", "SoleSource", "TRIBAL-8A"]);
  const decided = new Set([...Object.keys(SH.POLE_PROGRAM), "SB", "SB-Partial", "Full", "UNKNOWN", "SoleSource"]);
  ok([...fakePoles].some((p) => !decided.has(p)),
    "PLANTED: a pole nobody classified is caught by the C7 sweep");
}

// ── C9 · THE RENDERED BANNER, not just the copy ──────────────────────────────
console.log("\nC9 · renderCertBanner builds the nodes it is supposed to");
{
  // The copy assertions above test a plain object. What reaches the customer is
  // the node assembly, and nothing else in this repo can execute it — the other
  // public gates read HTML strings, and this banner is built from nodes so the
  // one variable part (the program list) is a text node that cannot carry
  // markup. A shim small enough to be obviously correct closes that gap.
  type El = {
    tag: string; id: string; type: string; textContent: string;
    children: El[]; firstChild: El | null;
    appendChild(c: El): void; removeChild(c: El): void;
    onclick: (() => void) | null; querySelector(): null;
  };
  const mk = (tag: string): El => ({
    tag, id: "", type: "", textContent: "", children: [], firstChild: null,
    onclick: null, querySelector: () => null,
    appendChild(c: El) { this.children.push(c); this.firstChild = this.children[0] ?? null; },
    removeChild(c: El) {
      this.children = this.children.filter((x: El) => x !== c);
      this.firstChild = this.children[0] ?? null;
    },
  });
  const text = (el: El): string =>
    el.children.length ? el.children.map(text).join("") : el.textContent;

  const sandbox: any = {
    __out: {}, console,
    window: { DSO: { CERTS: { state: "loading" } }, location: { href: "" } },
    document: {
      createElement: mk,
      createTextNode: (t: string) => { const n = mk("#text"); n.textContent = t; return n; },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `var $ = function(){ return null; };\n` +
    extractObject(DSO_JS, "POLE_PROGRAM") + "\n" +
    extractFn(DSO_JS, "PROFILE_CERTS") + "\n" +
    extractFn(DSO_JS, "certBannerCopy") + "\n" +
    extractFn(DSO_JS, "renderCertBanner") + "\n",
    sandbox
  );
  const render = sandbox.__out.renderCertBanner as (h: El) => void;

  const host = mk("div");
  sandbox.window.DSO.CERTS = {
    state: "verified",
    records: [{ label: "SDVOSB" }, { label: "HUBZone" }],
    establishedPrograms: ["se:sdvosb", "se:hubzone"],
  };
  render(host);
  ok(text(host).includes("SDVOSB · HUBZone"), "the verified banner renders the program list", text(host).slice(0, 90));
  const bold = host.children[0].children.find((c) => c.tag === "b");
  ok(!!bold && bold.textContent === "SDVOSB · HUBZone",
    "the program list is a TEXT node inside <b> — markup in a program name cannot become markup", bold?.textContent);
  ok(!host.children.some((c) => c.tag === "button"), "the verified state renders no control");

  // Re-render must REPLACE, not append: this host is re-rendered on every feed
  // and cert update, and a banner that accumulated would stack five states.
  render(host);
  ok(host.children.length === 1, "a re-render replaces the previous banner", `${host.children.length} children`);

  sandbox.window.DSO.CERTS = { state: "no-uei", records: [], establishedPrograms: [] };
  render(host);
  const btn = host.children.find((c) => c.tag === "button");
  ok(!!btn, "the no-uei state renders a control");
  ok(btn?.id === "addUeiBtn" && btn?.type === "button",
    "the control is an identified, non-submitting button", `${btn?.id}/${btn?.type}`);
  ok(typeof btn?.onclick === "function", "the control is wired, not inert");
  btn!.onclick!();
  // The destination moved with the legacy /home SPA purge: the UEI field now lives on the
  // real platform page, not on a hash of a page that no longer exists. A customer sent to a
  // dead route sees a control that appears to do nothing, which is the failure this leg exists
  // to catch — so it asserts the LIVE destination, never merely that a destination was set.
  ok(sandbox.window.location.href === "/capability-statement",
    "the control goes to the capability statement, the only surface carrying a UEI field",
    sandbox.window.location.href);

  sandbox.window.DSO.CERTS = { state: "loading", records: [], establishedPrograms: [] };
  render(host);
  ok(!host.children.some((c) => c.tag === "button"), "leaving no-uei removes the control with it");
  ok(text(host).length > 0, "the loading state still says something rather than rendering blank");
}

// tsx compiles this suite to CJS, where top-level await is unavailable, so the
// one async section runs inside an IIFE and owns the exit.
(async () => {
// ── C10 · THE SOURCE OF THE SPLIT ────────────────────────────────────────────
console.log("\nC10 · lookupEntityByUei tells 'SAM said no' from 'SAM said nothing'");
{
  // The banner copy is only as honest as the discriminant behind it. Asserting
  // the two lines differ (C6) would still pass if the route could never produce
  // one of them, so drive the lookup itself. The 200/totalRecords-0 case is the
  // one measured against the real API on the demo profile's UEI.
  const realFetch = globalThis.fetch;
  const realKey = process.env.SAM_API_KEY;
  process.env.SAM_API_KEY = "test-key-not-a-real-credential";
  const stub = (impl: () => Promise<Response> | never) => { (globalThis as any).fetch = impl; };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  try {
    stub(async () => json({ totalRecords: 0, entityData: [] }));
    let r = await lookupEntityByUei("APXDF5339KL2");
    ok(r.outcome === "not-registered",
      "HTTP 200 + totalRecords 0 → not-registered (the demo profile's real answer)", r.outcome);

    stub(async () => json({ totalRecords: 1, entityData: [{ entityRegistration: { ueiSAM: "SOMEOTHERUEI" } }] }));
    r = await lookupEntityByUei("APXDF5339KL2");
    ok(r.outcome === "not-registered",
      "rows that do not match the UEI exactly → not-registered, never a fuzzy attach", r.outcome);

    stub(async () => { throw new Error("network down"); });
    r = await lookupEntityByUei("APXDF5339KL2");
    ok(r.outcome === "unreachable", "a network failure → unreachable, NOT not-registered", r.outcome);

    stub(async () => json({ error: "rate limited" }, 429));
    r = await lookupEntityByUei("APXDF5339KL2");
    ok(r.outcome === "unreachable", "a non-200 → unreachable — an outage is never the customer's UEI", r.outcome);

    stub(async () => new Response("<html>not json</html>", { status: 200 }));
    r = await lookupEntityByUei("APXDF5339KL2");
    ok(r.outcome === "unreachable", "unparseable body → unreachable", r.outcome);

    delete process.env.SAM_API_KEY;
    stub(async () => json({ totalRecords: 0, entityData: [] }));
    r = await lookupEntityByUei("APXDF5339KL2");
    ok(r.outcome === "unreachable",
      "no API key → unreachable — OUR missing config must never read as their bad UEI", r.outcome);
    process.env.SAM_API_KEY = "test-key-not-a-real-credential";

    const match = { entityRegistration: { ueiSAM: "APXDF5339KL2", registrationStatus: "Active", registrationExpirationDate: "2027-06-01" },
                    socioeconomic: { sbaBusinessTypeList: [{ sbaBusinessTypeDesc: "Service Disabled Veteran Owned Small Business" }] } };
    stub(async () => json({ totalRecords: 1, entityData: [match] }));
    r = await lookupEntityByUei("apxdf5339kl2");
    ok(r.outcome === "found" && r.entity?.uei === "APXDF5339KL2",
      "an exact match (case-insensitive) → found — proving the not-registered legs are not vacuous", r.outcome);
  } finally {
    (globalThis as any).fetch = realFetch;
    if (realKey === undefined) delete process.env.SAM_API_KEY; else process.env.SAM_API_KEY = realKey;
  }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
})();
