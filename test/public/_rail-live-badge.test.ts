// The rail's "Live" badge and the Week Ahead calendar must ASSERT ONLY WHAT
// THEY KNOW. Run: npx tsx test/public/_rail-live-badge.test.ts
//
// Written RED first (2026-07-30):
//   · src/lib/nav/rail.ts hardcoded badge {text:"Live"} on Opportunities, so
//     EVERY rail-injected route (~10 of them) claimed the SAM feed was live —
//     including during an outage, and on pages that never check feed health.
//   · The Week Ahead panel rendered an empty state while the payload it needs
//     (live response deadlines) was already in hand, under a subtitle
//     promising "the GovCon fiscal calendar" that nothing produces.
//
// Same family as test/public/_today-fabrication.test.ts: a claim with no computation
// behind it. Part D plants positives so a vacuous pass is impossible.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "vm";
import { renderRail, railStyle, railScript, injectRail, railFonts } from "@/lib/nav/rail";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// test/public/ → repo root. This suite gates public/ assets but must not LIVE in public/:
// everything under there is served verbatim, and a gate file is not an asset.
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const rail = read("src/lib/nav/rail.ts");
const ccLive = read("public/command-center-live.js");
const ccApp = read("public/cc-app.js");
const oppLive = read("public/opportunities-live.js");
const todayHtml = read("public/today.html");

// ── Part A · the rail asserts no feed state it has not measured ──
console.log("── Part A · rail badge ──");
{
  // The opportunities NAV entry must not carry a literal status word. Find its
  // declaration line and inspect only that.
  const line = rail.split("\n").find((l) => l.includes('key: "opportunities"')) ?? "";
  check("rail.ts · opportunities entry declares no hardcoded status text", !/text:\s*"(Live|Online|Active|Up)"/i.test(line), line.trim().slice(0, 140));
  // Card 807 removed badges entirely — both went stale because a badge is a claim about
  // time and nobody owns its expiry. The old check guarded an EMPTY badge; the stronger
  // property now is that no badge can render at all, so neither can go stale again.
  check("rail · renders no badge markup at all", !/sb-badge/.test(renderRail("opportunities")), "a badge is back in the rail");
  check("rail.ts · declares no badge classes", !/BADGE_CLASS/.test(rail), "badge machinery returned");
}

// ── Part B · the badge is written only where feed state is actually known ──
console.log("\n── Part B · badge bound to measured state ──");
{
  check("a shared rail-badge setter exists", (() => { try { read("public/rail-live-badge.js"); return true; } catch { return false; } })());
  const setter = (() => { try { return read("public/rail-live-badge.js"); } catch { return ""; } })();
  check("setter distinguishes live from unavailable", /unavailable|error|down/i.test(setter), "no non-live branch");
  check("setter removes/hides the pill when state is not live", /remove\(\)|display\s*=\s*'none'|display\s*=\s*"none"/.test(setter), "cannot un-assert");
  check("command-center-live.js calls the setter", /setRailLiveBadge/.test(ccLive));
  check("opportunities-live.js calls the setter", /setRailLiveBadge/.test(oppLive));
  check("today.html loads the setter", /rail-live-badge\.js/.test(todayHtml));
  // The pages that DO know must pass a state derived from the fetch, not a
  // constant: a call site passing the literal 'live' unconditionally is the
  // same lie moved downstream.
  check(
    "command-center-live.js derives badge state from the payload",
    /setRailLiveBadge\((?!'live'|"live")/.test(ccLive),
    "badge state is a constant at the call site"
  );
}

// ── Part C · Week Ahead is computed from live rows, not invented ──
console.log("\n── Part C · Week Ahead calendar ──");
{
  check("command-center-live.js has a real WEEK builder", /function buildWeek/.test(ccLive), "no builder function");
  check("WEEK rows derive from response_deadline", /response_deadline/.test(ccLive), "no deadline read");
  // No month-name literals anywhere in the builder — dates must be formatted
  // from real timestamps (the old mock hardcoded 'Jun 5', 'Sep 30', …).
  check(
    "no hardcoded month-day literals in the wiring layer",
    !/['"](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ?\d{1,2}['"]/.test(ccLive),
    "a literal calendar date survives"
  );
  // Truncation must be COMPUTED in the wiring layer and SURFACED in the render
  // layer. Checking only one file would let a silent cap through: the count can
  // exist and never reach the screen, or the copy can exist with nothing behind it.
  check("wiring layer computes the dropped count", /dropped/i.test(ccLive), "no cap arithmetic");
  check("wiring layer publishes it to the renderer", /WEEK_DROPPED/.test(ccLive), "count never leaves the fetch");
  check("render layer surfaces the dropped count to the user", /WEEK_DROPPED/.test(ccApp) && /more deadline/i.test(ccApp), "cap is silent on screen");

  // Truncation is PER GROUP (a flat cap below the This-Week volume renders week
  // one only, and the other two designed groups never appear).
  check("caps are per group, not flat", /WEEK_GROUP_CAPS/.test(ccApp), "still a single flat cap");
  check("each truncated group says how many it hid", /more in \$\{g\.label/.test(ccApp), "group truncation is silent");
  // The trap: showing N rows under a header reading N hides that more exist.
  // The header must print the group's TRUE total.
  check(
    "group header count is the true total, not the shown count",
    /<b>\$\{items\.length\}<\/b>/.test(ccApp) && /shown\s*=\s*items\.slice/.test(ccApp),
    "header count derived from the capped slice"
  );
  check("wiring-layer ceiling is a DOM backstop, not the display cap", /WEEK_MAX_ROWS/.test(ccLive), "display cap still lives in the fetch layer");
  // The caps are only safe to raise BECAUSE the list scrolls internally. If the
  // scroll is ever removed, 45 rows silently run the page to ~4,000px and drag
  // the panel beside it — so the two are pinned together here.
  {
    const rule = /\.week-list\{([^}]*)\}/.exec(todayHtml)?.[1] ?? "";
    check("week-list scrolls internally (max-height)", /max-height:\s*\d/.test(rule), "no max-height — page height is unbounded");
    check("week-list scrolls internally (overflow-y)", /overflow-y:\s*auto/.test(rule), "no overflow-y — rows will overflow the panel");
    // Setting overflow-y:auto makes CSS compute overflow-x to auto as well, so
    // ONE unbreakable SAM token ("GENERATOR_End_Item_F16_NSN_6…") overflowed the
    // 519px column by 6px and drew a horizontal scrollbar across the whole
    // calendar on prod. The label must be able to break mid-token.
    const labelRules = [...todayHtml.matchAll(/\.wk-label\{([^}]*)\}/g)].map((m) => m[1]).join(";");
    check(
      "wk-label can break unbreakable tokens (no h-scrollbar from one long title)",
      /overflow-wrap:\s*(anywhere|break-word)|word-break:\s*break-all/.test(labelRules),
      "a single long token will reintroduce the horizontal scrollbar"
    );
  }
  // The panel subtitle may not promise sources that are not wired.
  check(
    "Week Ahead subtitle does not promise an unwired fiscal calendar",
    !/GovCon fiscal calendar/.test(todayHtml),
    "subtitle still promises the fiscal calendar"
  );
  // The empty state may not still say the calendar is unbuilt once it is built.
  check("empty-state copy matches a built calendar", !/Calendar not built yet/.test(ccApp), "stale 'not built' copy");
  // An outage after a SUCCESSFUL load must not leave the previous rows on
  // screen under an "unavailable" banner — the panel would contradict the page.
  // Caught by driving the page through both poles in one session, not by reading.
  {
    const errBlock = /catch \(e\)[\s\S]*?FEED_ERROR = true;[\s\S]*?\}/.exec(ccLive)?.[0] ?? "";
    check("outage path clears previously-loaded WEEK rows", /replaceArr\('WEEK', \[\]\)/.test(errBlock), "stale deadlines survive an outage");
  }
}

// ── Part D · planted positives ──
console.log("\n── Part D · planted positives ──");
{
  const PLANTED_RAIL = `{ key: "opportunities", label: "Opportunities", badge: { text: "Live", kind: "live" } },`;
  check("D1 · catches a hardcoded Live badge", /text:\s*"(Live|Online|Active|Up)"/i.test(PLANTED_RAIL));
  const PLANTED_WEEK = `WEEK.push({ d: 'Jun 5', day: 2, label: 'x' });`;
  check("D2 · catches a literal calendar date", /['"](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ?\d{1,2}['"]/.test(PLANTED_WEEK));
  const PLANTED_CONST = `setRailLiveBadge('live');`;
  check("D3 · catches an unconditional live call site", !/setRailLiveBadge\((?!'live'|"live")/.test(PLANTED_CONST));
}

// ── Part E · the retired single-letter mark must never return to the rail ──────────────────
// Design found it live on ALL 18 rail-injected surfaces after the purge was believed complete.
// It survived precisely because the rail is injected at SERVE time: sweeping the design files
// and public/*.html could not reach this string, and NOTHING here asserted on it. The logo row
// must hold the wordmark and nothing else.
console.log("\n── Part E · retired brand mark ──");
{
  // Card 807 replaced .sb-logo-row with .sb-head (wordmark + collapse control). Asserted on
  // the RENDERED markup so a structural rename cannot make this leg quietly stop looking.
  const row = (renderRail("opportunities").match(/<div class="sb-head">[\s\S]*?<\/div>/) ?? [""])[0];
  check("rail · a head row exists to check", row.length > 0, "sb-head not found — this gate asserted nothing");
  check("rail.ts · no retired single-letter mark beside the wordmark", !/class="sb-logo"/.test(row), row.slice(0, 160));
  check("rail · the head opens with the wordmark, no mark beside it", /^<div class="sb-head"><span class="sb-wordmark">FAR<span class="wm-au">audit<\/span><\/span>/.test(row), row.slice(0, 160));

  // Planted positives — this leg must be able to go red, in BOTH directions.
  const PLANTED_BAD = `<div class="sb-head"><div class="sb-logo">F</div><span class="sb-wordmark">FAR</span></div>`;
  check("E-P1 · the check REJECTS the exact markup Design found", /class="sb-logo"/.test(PLANTED_BAD));
  const PLANTED_GOOD = `<div class="sb-head"><span class="sb-wordmark">FAR<span class="wm-au">audit</span></span></div>`;
  check("E-P2 · the check ACCEPTS the wordmark alone (no false positive)", !/class="sb-logo"/.test(PLANTED_GOOD));
}

// ── Part F · appearance control: light · dark · system ────────────────────────────────────
// The per-page theme toggle is 17 hand-copied inline scripts; Defense News proved that shape
// drifts (it can switch theme but never remembers it). This control is ONE definition in the
// rail. Driven in a browser before shipping: Light/Dark/System all apply, persist across
// reload, and System resolves against the OS in both directions.
console.log("\n── Part F · appearance control ──");
{
  // Asserted on the RENDERED markup, not the source: the choices are built from a template
  // literal, and the source also contains an `aria-checked="true"` CSS SELECTOR. Grepping the
  // file tests the wrong string in both directions — this reads what actually ships.
  const markup = renderRail("opportunities");
  const choices = [...markup.matchAll(/data-theme-choice="([a-z]+)"/g)].map((m) => m[1]);
  check("rail · offers exactly light · dark · auto", JSON.stringify(choices) === JSON.stringify(["light", "dark", "auto"]), choices.join(",") || "(none rendered)");

  // The checked option MUST be set at runtime from the stored preference. A literal
  // aria-checked="true" in the MARKUP would show a choice the user never made.
  check("rail · no hardcoded checked state in markup", !/aria-checked="true"/.test(markup), "a choice is pre-marked in markup");
  check("rail · every choice is a menuitemradio", (markup.match(/role="menuitemradio"/g) ?? []).length === 3, "appearance options are not exposed as a radio group");

  // The WHOLE query, not just the feature name. A negative control caught this: broken to
  // `prefers-color-scheme: nope` the loose form still passed, so the check could not go red
  // for the defect it exists to catch.
  check("rail.ts · System is resolved against the OS", /\(prefers-color-scheme: dark\)/.test(rail), "auto never consults the OS — System would render as light");
  check("rail.ts · the OS listener only acts while the preference is System", /pref\(\)==='auto'/.test(rail), "an explicit light/dark choice could be overridden when the OS flips");

  // Shipping the control must NOT silently switch existing users to System. With nothing
  // stored, the page keeps its own default and nothing is written.
  check("rail.ts · no preference is written on load", /if\(cur\)apply\(cur,false\)/.test(rail), "load path persists a value the user never chose");
  check("rail.ts · shares the existing storage key", /'faraudit-theme'/.test(rail), "a second key would fight the 17 inline page scripts");

  // Planted positives — both directions.
  const PLANTED_HARDCODED = `<button data-theme-choice="dark" aria-checked="true">Dark</button>`;
  check("F-P1 · rejects a pre-marked choice", /aria-checked="true"/.test(PLANTED_HARDCODED));
  const PLANTED_OK = `<button data-theme-choice="dark" aria-checked="false">Dark</button>`;
  check("F-P2 · accepts a runtime-marked choice (no false positive)", !/aria-checked="true"/.test(PLANTED_OK));
  const PLANTED_NO_OS = `var resolve=function(v){return v==='auto'?'light':v};`;
  check("F-P3 · catches a System option that never reads the OS", !/prefers-color-scheme/.test(PLANTED_NO_OS));
}

// ── Part G · the live-pill honesty guard reaches EVERY page ───────────────────────────────
// `.live-pill{display:inline-flex}` outranks the `hidden` attribute, so a page hiding its
// pill while loading/empty/erroring still PAINTS a green LIVE badge. The guard was added to
// six pages; the pill has since spread to 18 and 12 were never covered. Found by Design on
// the card-802 packet — the same shape as the retired mark: a fix recorded as complete that
// reached a third of the surfaces.
// Verified in a browser: with the rail's guard, setting `hidden` yields display:none; with
// that single rule deleted, the pill paints "LIVE" while hidden.
console.log("\n── Part G · live-pill honesty guard ──");
{
  const style = railStyle();
  check("rail · ships the live-pill hidden guard", /\.live-pill\[hidden\]\s*\{[^}]*display:\s*none/.test(style), "pages can paint LIVE while hidden");

  // The point of putting it in the rail is that pages carrying NO guard of their own still
  // get one. Assert that on a page measured to have none — a per-page fix would not.
  const raw = read("public/opportunities.html");
  check("a page with no guard of its own is the right specimen", !/\.live-pill\[hidden\]/.test(raw), "specimen already guarded — this leg proves nothing");
  const served = injectRail(raw, "opportunities");
  check("served page gains the guard from the rail", /\.live-pill\[hidden\]/.test(served), "injection did not supply the guard");

  const PLANTED_NO_GUARD = `.live-pill{display:inline-flex}`;
  check("G-P1 · catches a stylesheet with no guard", !/\.live-pill\[hidden\]/.test(PLANTED_NO_GUARD));
  const PLANTED_GUARDED = `.live-pill{display:inline-flex}.live-pill[hidden]{display:none!important}`;
  check("G-P2 · accepts a guarded stylesheet (no false positive)", /\.live-pill\[hidden\]\s*\{[^}]*display:\s*none/.test(PLANTED_GUARDED));
}

// ── Part H · card 807 workflow rail ───────────────────────────────────────────────────────
// The rail regrouped by workflow. These pin what the handoff required AND the things its own
// files would have broken, so neither can regress silently.
console.log("\n── Part H · card 807 workflow rail ──");
{
  const R = renderRail("opportunities");
  const S = railStyle();
  const J = railScript();
  const ROUTES = ["/command-center","/opportunities","/audit","/past-audits","/pipeline","/cmmc","/capability-statement","/teaming-partners","/defense-news","/defense-spending","/agencies","/contracting-officers","/naics","/far-dfars-updates","/wage-benchmarks"];
  const hrefs = [...R.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h !== "/settings");
  check("15 destinations, exactly the source routes", JSON.stringify(hrefs) === JSON.stringify(ROUTES), hrefs.join(" "));

  // §6: counts derive live or do not ship. The handoff MARKUP shipped 4, 19 and a 72% with no
  // source named anywhere — a stale number in the rail is on every page, all day.
  check("no hardcoded counts in the markup", !/>(4|19)<\/span>|72%/.test(R), "a literal count is back");
  check("a zero count renders nothing", !renderRail("today", { pipeline: "0" }).includes("sb-ct"), "0 rendered as a number");
  check("a live count DOES render", renderRail("today", { pipeline: "19" }).includes(">19</span>"), "the counts argument is ignored");

  // Identity is hydrated, never shipped. The handoff markup carried a real person's name.
  check("no hardcoded identity", !/Jose Rodriguez|>JR</.test(R), "a name is baked into the rail");

  // The collapse control must keep the id that 18 pages bind from OUTSIDE the replaced aside.
  check("collapse control keeps id=sbToggle", /id="sbToggle"/.test(R), "renaming it breaks collapse on every page");
  check("rail does not re-bind faraudit-sb", !/faraudit-sb/.test(J), "double-binding makes every click a no-op");

  check("3 collapsible sections, Readiness open", (R.match(/class="sb-sec"/g) || []).length === 3 && (R.match(/data-open="true"/g) || []).length === 1);
  check("the active page's section is forced open", (renderRail("naics").match(/data-open="true"/g) || []).length === 2, "landing in a collapsed section hides the active row");
  check("sentence-case group headers", !/MARKET INTEL|READINESS/.test(R), "caps headers returned");

  // The base layout block was MISSING from the handoff's rail.css; without it every new class
  // has colour but no geometry.
  for (const c of [".sb-head", ".sb-flow", ".sb-sech", ".sb-secb", ".sb-tip", ".sb-today"]) {
    check(`stylesheet defines ${c}`, S.includes(c), "base layout block missing");
  }
  check("--sb-width declared for open AND closed", /\[data-sb="open"\]\{--sb-width/.test(S) && /--sb-width:66px/.test(S), "an unresolved var() voids the whole grid declaration");
  check("no retired FA monogram", !S.includes('content:"FA"'), "the two-letter mark is back");
  check("no CSS rationale shipped to the browser", !S.includes("/*"), "comments in served CSS are public");
  // Card 808 FIX 1. The old form of this check pinned the literal "31.3px", which made a
  // DERIVED number look like a constant — it asserted the answer instead of the property that
  // makes the answer right. What must hold is that the ruled cut is actually REQUESTED (no
  // served page asked for upright 900, so the mark rendered as a synthesised bold of an italic
  // face or as Georgia) and that the declared size is the one that was derived against it.
  check("wordmark ruled treatment declared", /Fraunces/.test(S) && /font-weight:900/.test(S), "16 of 18 pages hide the wordmark without this");
  const fontLink = railFonts();
  check("the ruled cut is requested, not just declared", /fonts\.googleapis\.com/.test(fontLink) && /Fraunces/.test(fontLink), "a declared face that is never fetched renders as the fallback");
  check("the requested cut is UPRIGHT 900", /wght@72,900/.test(fontLink) && !/ital,/.test(fontLink), "italic-only axes were what shipped; 900 upright is the ruling");
  const declaredPx = (S.match(/\.sb-head \.sb-wordmark\{[^}]*font-size:([\d.]+)px/) || [])[1];
  check("the declared size is the DERIVED size", declaredPx === "31.9", `declared ${declaredPx}px — 31 x (0.720 Manrope cap / 0.700 Fraunces cap) = 31.886`);
  check("injectRail puts the font in <head>", injectRail("<html><head></head><body></body></html>", "today").includes(`${fontLink}</head>`), "a face requested after the body swaps in post-paint");

  // Planted positives for the three checks above — each must be able to go red.
  check("F-P1 · rejects an italic-only request", !/wght@72,900/.test("family=Fraunces:ital,opsz,wght@1,72,500;1,72,600"));
  check("F-P2 · rejects a declaration with no request", !/fonts\.googleapis\.com/.test('.sb-head .sb-wordmark{font-family:"Fraunces"}'));
  check("F-P3 · rejects the superseded 31.3px", (('.sb-head .sb-wordmark{font-size:31.3px'.match(/font-size:([\d.]+)px/) || [])[1]) !== "31.9");

  // The injected script is covered by NO other gate — the inline-script suite reads public/ only.
  // vm.Script COMPILES without executing, so this asks only "does it parse".
  let parses = true;
  try { new vm.Script(J.replace(/^<script>/, "").replace(/<\/script>$/, "")); } catch { parses = false; }
  check("injected rail script parses", parses, "one syntax error kills every rail behaviour at once");

  // Planted positives — both directions.
  check("H-P1 · the count check rejects a literal", /(>(4|19)<\/span>|72%)/.test(`<span class="sb-ct">19</span>`));
  check("H-P2 · the count check accepts a clean rail", !/>(4|19)<\/span>|72%/.test(`<span class="sb-label">Pipeline</span>`));
  check("H-P3 · the monogram check rejects the excluded rule", '.sb-wordmark::after{content:"FA"}'.includes('content:"FA"'));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
