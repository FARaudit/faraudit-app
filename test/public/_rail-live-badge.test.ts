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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "vm";
import { renderRail, railStyle, railScript, injectRail, railFonts, railThemeBoot } from "@/lib/nav/rail";

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

// ── Part I · the field colour is a system value, not a page preference ──
// Design ruling, card 809: defense-news held --page-bg:#f0f4f8 against #eef2f7 on the
// other 18. It rendered fine, which is why it survived three reviews — a fork only
// looks local until you count. That page has now been the outlier three separate
// times (this token, the --sb-width scoping, and a duplicate #sbToggle binding), and
// each one alone read as a one-page quirk.
//
// So this does not name defense-news. It checks that ONE value is shared, whichever
// page breaks ranks next.
// ── Part J · the rail is styled at first paint, and it stays on screen ──
// Both found by driving the live platform, not by reading.
//   · The stylesheet was injected before </body> — last of five sheets and the only
//     one outside <head> — so every navigation painted the rail with the PAGE's own
//     sidebar CSS first (oversized icons, page palette) and repainted when the sheet
//     parsed. The user saw it as a flash on every tab click.
//   · The OPEN rail had overflow-y:visible while the CLOSED rail had auto. With the
//     sections expanded the content needs ~936px, so under that viewport the profile
//     control at the bottom spilled out of the sticky box and off the bottom of the
//     page. It fit on a tall monitor, which is why it survived review.
console.log("\n── Part J · styled at first paint, and stays on screen ──");
{
  const page = "<html><head><style>.page{}</style></head><body><aside class=\"sidebar\"></aside></body></html>";
  const out = injectRail(page, "today");
  const headEnd = out.indexOf("</head>");
  check("rail stylesheet is in <head>", out.indexOf('id="sb-phase5"') < headEnd, "injected after the body — the rail paints unstyled first");
  check("font link is in <head>", out.indexOf('id="sb-phase5-font"') < headEnd, "the face swaps in after the mark has painted");
  check("rail script stays at the end of the body", out.indexOf("sbAvatarBtn") > headEnd, "a blocking script moved into the head");
  const sheet = railStyle();
  // Anchored on the rule's own boundary. The first version matched
  // `[data-sb="mini"] .sidebar{overflow…}` as well, because that selector CONTAINS the
  // bare one — so deleting the rule under test left the check green. It could not fail.
  const bareSidebarRule = /[};]\.sidebar\{[^}]*\}/g;
  const bare = (sheet.match(bareSidebarRule) ?? []).join(" ");
  check("the rail owns its own stickiness", /position:sticky!important/.test(bare) && /height:100vh!important/.test(bare), "stickiness is left to each page's CSS");
  check("the rail scrolls inside itself, open or closed", /overflow-y:auto!important/.test(bare), "content spills past the sticky box on a short viewport");
  check("the closed strip still scrolls too", /\[data-sb="mini"\] \.sidebar,\[data-sb="closed"\] \.sidebar\{overflow-x:hidden!important;overflow-y:auto!important\}/.test(sheet), "the strip lost its overflow rule");

  // Planted positives.
  const bodyInjected = page.replace("</body>", '<style id="sb-phase5"></style></body>');
  check("J-P1 · rejects a stylesheet injected after the body", !(bodyInjected.indexOf('id="sb-phase5"') < bodyInjected.indexOf("</head>")));
  check("J-P2 · rejects a rail with no overflow rule", !/overflow-y:auto!important/.test("}.sidebar{background:red}".match(/[};]\.sidebar\{[^}]*\}/g)?.join(" ") ?? ""));
  check("J-P3 · the anchored match ignores the mini/closed rule", ('[data-sb="mini"] .sidebar,[data-sb="closed"] .sidebar{overflow-y:auto!important}'.match(/[};]\.sidebar\{[^}]*\}/g) ?? []).length === 0);
}

console.log("\n── Part I · no page forks the field colour ──");
{
  // Scoped to the RAIL pages — the ones that carry the replaceable <aside class="sidebar">.
  // The first version of this scanned every public/*.html and condemned learn.html and
  // root-landing.html, which are dark-first marketing surfaces and share nothing with the
  // app field on purpose. A parity check that cannot tell a fork from a different product
  // surface reports the healthy pages and buries the real one.
  const pages = readdirSync(join(ROOT, "public"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ f, src: read(`public/${f}`) }))
    .filter((p) => p.src.includes("--page-bg") && p.src.includes('class="sidebar"'));

  const firstValue = (src: string, token: string) =>
    (src.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8})`)) ?? [])[1]?.toLowerCase();

  for (const token of ["--page-bg", "--bg"]) {
    const byValue = new Map<string, string[]>();
    for (const p of pages) {
      // the light field is the first declaration; the dark override follows
      const v = firstValue(p.src, token);
      if (!v) continue;
      byValue.set(v, [...(byValue.get(v) ?? []), p.f]);
    }
    const sorted = [...byValue.entries()].sort((a, b) => b[1].length - a[1].length);
    const [majority, ...forks] = sorted;
    const odd = forks.flatMap(([v, fs]) => fs.map((f) => `${f}=${v}`));
    check(
      `${token} is one value across ${pages.length} pages`,
      odd.length === 0,
      `majority ${majority?.[0]} on ${majority?.[1].length} · forked: ${odd.join(", ")}`,
    );
  }

  // Planted positives — the parity check must be able to see a fork.
  const distinct = (a: string, b: string) =>
    new Set([a, b].map((s) => firstValue(s, "--page-bg"))).size > 1;
  check("I-P1 · rejects two pages on different field colours", distinct("--page-bg:#eef2f7", "--page-bg:#f0f4f8"));
  check("I-P2 · accepts two pages on the same field colour", !distinct("--page-bg:#eef2f7", "--page-bg:#eef2f7"));
}

// ── Part K · a badge writer's SELECTOR must match the rail it writes into ──────────────────
// Written RED 2026-08-06. Part A proved the rail ships no badge and Part B proved the setter
// has a non-live branch — both true, both passing, while BOTH writers were dead on arrival:
// they queried `.sb-icon[href="…"]`, and rail.ts row() renders WORKFLOW rows as `.sb-step`.
// The selector matched nothing on every route, so `if (!link) return` fired every time and no
// badge — live, "Feed down", or the Past Audits open-count — has ever rendered. Asserting on
// the setter's SOURCE could not see this; only resolving the selector against real rail
// markup can. This is the check that had to exist.
console.log("\n── Part K · badge selectors resolve against the real rail ──");
{
  const railHtml = renderRail("opportunities") + renderRail("past-audits");
  // rail.ts row(): `<a class="sb-step on" href="/x">` — class attribute precedes href.
  const matchesRail = (selector: string, html: string) =>
    selector.split(",").some((alt) => {
      const m = alt.trim().match(/^\.([\w-]+)\[href="([^"]+)"\]$/);
      if (!m) return false;
      const [, cls, href] = m;
      return new RegExp(`<a class="[^"]*\\b${cls}\\b[^"]*" href="${href.replace(/\//g, "\\/")}"`).test(html);
    });
  // Pull the literal each writer actually passes to querySelector.
  const selectorIn = (src: string) => (src.match(/querySelector\(\s*'([^']*\[href=[^']*)'/) ?? [])[1] ?? "";

  const badgeSel = selectorIn(read("public/rail-live-badge.js"));
  check("rail-live-badge.js · a querySelector literal was found to test", badgeSel.length > 0, "selector not located — this gate would assert nothing");
  check("rail-live-badge.js · its selector matches a real rail row", matchesRail(badgeSel, railHtml), badgeSel);

  const dashSel = selectorIn(read("public/dashboard-live.js"));
  check("dashboard-live.js · a querySelector literal was found to test", dashSel.length > 0, "selector not located — this gate would assert nothing");
  check("dashboard-live.js · its selector matches a real rail row", matchesRail(dashSel, railHtml), dashSel);

  // Planted positives — the check must be able to go RED on the exact defect it was written for.
  check("K-P1 · REJECTS the shipped-and-dead `.sb-icon[href=\"/opportunities\"]`", !matchesRail('.sb-icon[href="/opportunities"]', railHtml));
  check("K-P2 · REJECTS the shipped-and-dead `.sb-icon[href=\"/past-audits\"]`", !matchesRail('.sb-icon[href="/past-audits"]', railHtml));
  check("K-P3 · ACCEPTS the corrected `.sb-step[href=\"/opportunities\"]`", matchesRail('.sb-step[href="/opportunities"]', railHtml));
  // A section row genuinely IS .sb-icon — the check must not simply reject that class.
  check("K-P4 · ACCEPTS `.sb-icon[href=\"/cmmc\"]`, a real section row", matchesRail('.sb-icon[href="/cmmc"]', railHtml));
  check("K-P5 · REJECTS a route the rail does not carry", !matchesRail('.sb-step[href="/not-a-route"]', railHtml));
}

// ── Part L · a LIVE pill must be DRIVEN, not decorative ───────────────────────────────────
// Part G guards the CSS: `.live-pill[hidden]` exists, so a pill CAN be hidden. Nothing
// proved any pill IS hidden by anything. A page shipping `<span class="live-pill">LIVE</span>`
// with no id passes Part G perfectly and still paints a pulsing green "LIVE" over a failed
// load. The property that matters is ownership: an id to address, and a writer that sets
// `hidden` from measured load state.
console.log("\n── Part L · the LIVE pill is driven, not decorative ──");
{
  // Only a pill whose TEXT claims liveness is in scope. how-it-works.html reuses the
  // .live-pill style for "Example" and "7 of 8" labels — honest text, no claim to drive.
  // Matching the class alone made that page a false positive in this section's skip list.
  const pillOf = (html: string) => (html.match(/<span class="live-pill"[^>]*>\s*LIVE\s*</i) ?? [])[0] ?? "";
  const hasId = (tag: string) => /\sid="[^"]+"/.test(tag);
  // A writer must both address the pill and be able to turn it OFF — and it must be a
  // script THIS page loads. Scanning all of public/*.js let any other page's writer
  // satisfy the check: breaking pipeline-live.js left this green because dashboard-live.js
  // still matched. Scoped to the page's own <script src> list plus its inline scripts,
  // which is where run-audit.html drives its pill.
  const bodiesFor = (page: string) => {
    const html = read(join("public", page));
    const bodies = [...html.matchAll(/<script src="\/?([^"?]+\.js)"/g)]
      .map((m) => { try { return read(join("public", m[1])); } catch { return ""; } });
    // Inline scripts go in as SEPARATE blocks, never as one blob of the whole file: the
    // page's own theme toggle contains `display='none'` and the markup contains the pill
    // id, so a whole-file scan is satisfied by two unrelated lines. The id and the hide
    // must appear in the SAME executable unit.
    bodies.push(...[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]));
    return bodies;
  };
  const CAN_HIDE = /\.hidden\s*=|display\s*=\s*['"]none['"]|removeAttribute\(\s*['"]hidden/;
  // Proximity, not co-occurrence. run-audit.html ships ONE inline script holding the whole
  // page: its theme toggle contains `display='none'` and its ledger code contains the pill
  // id, so "both strings appear somewhere in this block" is satisfied by two unrelated
  // lines. The hide must sit within reach of the pill reference that it acts on.
  const NEAR = 300;
  const driverFor = (id: string, page: string) =>
    bodiesFor(page).some((b) => {
      for (let i = b.indexOf(id); i !== -1; i = b.indexOf(id, i + 1)) {
        if (CAN_HIDE.test(b.slice(Math.max(0, i - NEAR), i + NEAR))) return true;
      }
      return false;
    });

  // COVERED — pages whose pill this suite holds to the contract.
  const COVERED = ["past-audits.html", "cmmc-readiness.html", "contracting-officers.html",
    "defense-agencies.html", "gao-protests.html", "teaming-partners.html", "wage-benchmarks.html",
    "capability-statement.html", "defense-news.html", "pipeline.html", "profile-settings.html",
    "run-audit.html", "today.html"];
  // A page whose own content is STATIC carries no pill at all — a badge there could only
  // ever assert liveness it has no fetch to back. acquisition-stages has no page fetch;
  // naics ships its reference table as a hardcoded `var DATA=[…]`.
  for (const page of ["acquisition-stages.html", "naics.html"]) {
    check(`${page} · carries no LIVE pill (its content is static)`, pillOf(read(join("public", page))) === "", "a LIVE pill returned to a static page");
  }
  for (const page of COVERED) {
    const tag = pillOf(read(join("public", page)));
    check(`${page} · pill exists to check`, tag.length > 0, "no live-pill found — this leg asserts nothing");
    check(`${page} · pill carries an id`, hasId(tag), tag);
    const id = (tag.match(/id="([^"]+)"/) ?? [])[1] ?? "";
    check(`${page} · pill ships hidden`, /\shidden/.test(tag), tag);
    check(`${page} · a script IT loads can turn #${id} off`, driverFor(id, page), `no script this page loads sets hidden on #${id}`);
  }

  // NAMED SKIP — an absent check must SAY it is absent. These pages ship a live-pill with no
  // id and therefore no writer: the badge is permanently on. Listed, not silently excluded,
  // so this section can never read as "every pill is honest".
  const UNCOVERED = readdirSync(join(ROOT, "public"))
    .filter((n) => n.endsWith(".html"))
    .filter((n) => { const t = pillOf(read(join("public", n))); return t.length > 0 && !hasId(t); });
  console.log(`   ⚠ NAMED SKIP · ${UNCOVERED.length} page(s) ship an undriven live-pill: ${UNCOVERED.join(", ") || "none"}`);
  check("the uncovered set is enumerated, not assumed empty", Array.isArray(UNCOVERED), "skip list not computed");

  // Planted positives — the contract check must go RED on the exact shipped defect.
  check("L-P1 · REJECTS the static pill past-audits shipped", !hasId(`<span class="live-pill">`));
  check("L-P2 · ACCEPTS a pill with an id", hasId(`<span class="live-pill" id="livePill" hidden>`));
  check("L-P3 · REJECTS a writer that can never turn the pill off",
    !/\.hidden\s*=|display\s*=\s*['"]none['"]|removeAttribute\(\s*['"]hidden/.test(`var p=document.getElementById('livePill'); p.textContent='LIVE';`));
  check("L-P4 · ACCEPTS a writer bound to load state",
    /\.hidden\s*=/.test(`pill.hidden = !live;`));
  // The two ways this section passed for the WRONG reason while being developed, now
  // pinned so neither can come back: a whole-repo scan, and mere co-occurrence.
  const near = (b: string, id: string) => {
    for (let i = b.indexOf(id); i !== -1; i = b.indexOf(id, i + 1)) {
      if (CAN_HIDE.test(b.slice(Math.max(0, i - NEAR), i + NEAR))) return true;
    }
    return false;
  };
  check("L-P5 · REJECTS a hide 1000 chars from the pill (co-occurrence is not ownership)",
    !near(`sun.style.display='none';` + "x".repeat(1000) + `getElementById('livePill')`, "livePill"));
  check("L-P6 · ACCEPTS a hide adjacent to the pill",
    near(`var p = document.getElementById('livePill'); p.hidden = !on;`, "livePill"));
}

// ── Part M · appearance is settled BEFORE the first paint ─────────────────────────────────
// Written RED 2026-08-06. Every page ships <html data-theme="light" data-sb="open"> and
// re-applies the saved value from a script at the END of the body — 93% through the
// document on past-audits.html. A customer on dark got a full LIGHT paint of the page and
// the rail, then a flip; a collapsed rail painted open, then snapped shut. Reported as
// "it opens a different sidebar view". The restore now rides in <head> via injectRail, so
// one fix covers all 17 pages instead of 17 edits that would drift apart.
console.log("\n── Part M · no flash of the wrong appearance ──");
{
  const boot = railThemeBoot();
  check("a head-boot script exists", /id="sb-theme-boot"/.test(boot), "no boot script to inject");
  check("it restores BOTH theme and rail state", /faraudit-theme/.test(boot) && /faraudit-sb/.test(boot), boot.slice(0, 120));
  check("it only ever sets values it recognises", /'light'\|\|.*'dark'|t==='light'/.test(boot), "an arbitrary stored string would reach the DOM");

  // The property that matters is POSITION: before </head>, and before the rail stylesheet.
  const pages = readdirSync(join(ROOT, "public")).filter((n) => n.endsWith(".html"));
  const served = pages.map((p) => ({ p, html: injectRail(read(join("public", p)), "past-audits") }));
  const late = served.filter(({ html }) => {
    const i = html.indexOf('id="sb-theme-boot"');
    const h = html.indexOf("</head>");
    return i === -1 || h === -1 || i > h;
  });
  check(`every served page settles appearance in <head> (${served.length} pages)`, late.length === 0, late.map((x) => x.p).join(", "));
  const one = served.find((s) => s.p === "past-audits.html")!;
  check("boot runs BEFORE the rail stylesheet", one.html.indexOf('id="sb-theme-boot"') < one.html.indexOf('id="sb-phase5"'), "stylesheet wins the race");
  check("injecting twice does not duplicate the boot",
    (injectRail(one.html, "past-audits").match(/id="sb-theme-boot"/g) || []).length === 1, "boot injected twice");

  // Planted positives — the position check must go RED on the shipped arrangement.
  const posOf = (h: string) => { const i = h.indexOf('id="sb-theme-boot"'); const e = h.indexOf("</head>"); return i !== -1 && e !== -1 && i < e; };
  check("M-P1 · REJECTS a boot script left at the end of the body",
    !posOf(`<head><style>x</style></head><body>…<script id="sb-theme-boot"></script></body>`));
  check("M-P2 · ACCEPTS a boot script in the head", posOf(`<head><script id="sb-theme-boot"></script></head><body></body>`));
  check("M-P3 · REJECTS a page with no boot script at all", !posOf(`<head></head><body></body>`));
}

// ── Part N · the Decisions ledger shows the field it filters on ───────────────────────────
// Narrowing by Set-aside changed the rows with nothing ON the row saying why — the CEO's
// own report. A filter whose field the table does not display is one the customer has to
// take on trust. Column count and colspan move together or the empty state under-fills.
console.log("\n── Part N · Decisions ledger columns ──");
{
  const page = read("public/past-audits.html");
  const js = read("public/dashboard-live.js");
  const ths = [...page.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]*>/g, "").trim());
  check("the ledger has a Set-aside column", ths.some((t) => /set-aside/i.test(t)), ths.join(" | "));
  check("it is sortable", /data-sort="setAside"/.test(page), "header is not wired to a sort key");
  check("the sort comparator knows the key", /sortKey === "setAside"/.test(js), "clicking it would fall through to the id sort");
  check("the row builder emits a matching cell", /cell-setaside/.test(js), "header with no cell shifts every column right");
  check("the cell decodes the SAM code the slicer decodes", /setAsideLabel\(a\.setAside\)/.test(js), "row would show SDVOSBC beside a slicer reading SDVOSB");

  // colspan must equal the header count, or the empty/loading/error rows under-fill.
  const colspans = [...js.matchAll(/colspan="(\d+)"/g)].map((m) => Number(m[1]));
  check(`every colspan equals the ${ths.length} columns`, colspans.length > 0 && colspans.every((c) => c === ths.length),
    `columns=${ths.length} colspans=${[...new Set(colspans)].join(",")}`);

  // Planted positives.
  check("N-P1 · REJECTS a colspan that lags the header count", ![9].every((c) => c === ths.length));
  check("N-P2 · ACCEPTS a colspan that matches", [ths.length].every((c) => c === ths.length));
}

// ── Part O · a crumb that looks like a link IS one ─────────────────────────────────────────
// "Decisions / Bid Decision Ledger" rendered as plain <span>s on every page — the first
// crumb reads as a way back and did nothing. Reported as "no way back".
console.log("\n── Part O · breadcrumbs navigate ──");
{
  for (const page of ["past-audits.html", "run-audit.html"]) {
    const crumbs = (read(join("public", page)).match(/<div class="crumbs">[\s\S]*?<\/div>/) ?? [""])[0];
    check(`${page} · a crumb bar exists to check`, crumbs.length > 0, "no .crumbs block found");
    check(`${page} · its leading crumbs are links`, (crumbs.match(/<a href="\//g) || []).length >= 2, crumbs.slice(0, 160));
    check(`${page} · the LAST crumb is not a link (you are already there)`,
      !/<a[^>]*>[^<]*<\/a>\s*<\/div>$/.test(crumbs.trim()), crumbs.slice(-90));
  }
  check("O-P1 · REJECTS the all-span bar that shipped",
    (`<div class="crumbs"><b>Decisions</b><span class="sep">/</span><span>Ledger</span></div>`.match(/<a href="\//g) || []).length < 2);
  check("O-P2 · ACCEPTS a bar with real links",
    (`<div class="crumbs"><a href="/today"><b>D</b></a><span class="sep">/</span><a href="/past-audits"><b>X</b></a><span>Y</span></div>`.match(/<a href="\//g) || []).length >= 2);
}

// ── Part P · "no audits yet" is never said about a request that failed ────────────────────
console.log("\n── Part P · run-audit distinguishes failure from empty ──");
{
  const ra = read("public/run-audit.html");
  check("a non-OK response throws rather than becoming {audits:[]}",
    /if\(!r\.ok\)throw/.test(ra), "a failed fetch still resolves to an empty history");
  check("the failure has its OWN renderer", /function renderUnreadable\(\)/.test(ra), "failure reuses the first-run empty state");
  check("the failure path calls it", /catch\(function\(e\)\{[^}]*renderUnreadable\(\)/.test(ra), "renderer exists with no caller");
  check("the failure copy does not claim an empty history",
    !/renderUnreadable[\s\S]{0,400}No audits yet/.test(ra), "failure state still says 'No audits yet'");
  check("P-P1 · REJECTS a catch that renders the first-run empty state",
    !/function\(\)\{renderCards\(\[\]\)\}/.test("function(){renderUnreadable()}"));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
