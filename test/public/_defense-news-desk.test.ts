// /defense-news must not claim to be tailored to the reader when it is not.
// Run: npx tsx test/public/_defense-news-desk.test.ts
//
// Written RED against the pre-fix files (2026-08-11). What was live, measured, not
// hypothetical:
//
//   1. The masthead read "Updated 6 min ago" as LITERAL TEXT in the markup. No
//      script wrote it. It said six minutes on a page whose freshest available
//      story was 16 hours old (median across the four feeds: 88 hours), and it
//      said six minutes on a tab that had been open since morning.
//   2. The divider over the feed read "Latest — Your NAICS" above a plain
//      reverse-chronological list of every wire story. Nothing in the request path
//      had ever scored a story against a code. It read that way on accounts with
//      no codes on file at all.
//   3. defense-news-live.js mapped the route's `relevance` — a fixed sentence per
//      category, a STRING — through `typeof it.relevance === 'number' ? … : 0`,
//      so the field was 0 for every story ever served and nothing read it.
//   4. The route's Federal Register URL answered 302 to an empty body. One of the
//      four sources named in the sidebar had nothing behind it.
//   5. The route read the first 6 items of each feed. Defense News publishes 25.
//
// Part F plants known positives so a vacuous pass is impossible, and Part G proves
// this harness can go red at all.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const HTML = read("public/defense-news.html");
const LIVE = read("public/defense-news-live.js");
const ROUTE = read("src/app/api/defense-news/route.ts");
// The judgement layer lives in its own module so a probe can call it. A gate that
// greps only the route would go green the moment that code moved out of it.
const JUDGE = read("src/lib/defense-news-judge.ts");
const SERVER = ROUTE + "\n" + JUDGE;

// ── A · no fabricated freshness ──
console.log("\n── A · the freshness stamp is computed ──");
{
  check(
    "no hardcoded 'Updated N min ago' in the markup",
    !/Updated\s+\d+\s*(min|minute|hour|h)\b/i.test(HTML),
    (HTML.match(/Updated\s+\d+\s*\w+\s*ago/i) || [])[0] || ""
  );
  check("the stamp has an id to write into", HTML.includes('id="dn-updated"'));
  check("something writes it", LIVE.includes("dn-updated") && LIVE.includes("paintUpdated"));
  check(
    "it is derived from the route's fetched_at",
    /DN_FETCHED_AT\s*=\s*data\.fetched_at/.test(LIVE),
    "the stamp must come from the response, not from page-load time"
  );
  check("the stamp is cleared when the feed is unavailable", /renderUnavailable[\s\S]{0,240}DN_FETCHED_AT\s*=\s*null/.test(LIVE));
}

// ── B · the page refreshes ──
console.log("\n── B · live means live ──");
{
  check("a refresh timer exists", /setInterval\(\s*refresh/.test(LIVE));
  check("the stamp re-renders on its own", /setInterval\(\s*paintUpdated/.test(LIVE));
  check("returning to the tab re-checks", LIVE.includes("visibilitychange"));
  check(
    "a hidden tab does not poll",
    /if\s*\(\s*refreshing\s*\|\|\s*document\.hidden\s*\)/.test(LIVE),
    "background tabs must not fan out eight RSS fetches every five minutes"
  );
}

// ── C · the desk claim is backed ──
console.log("\n── C · 'your codes' is earned, not asserted ──");
{
  check(
    "the divider no longer hardcodes 'Latest — Your NAICS'",
    !HTML.includes("Latest — Your NAICS"),
    "the label must be written from state, not from markup"
  );
  check("the divider is written at runtime", HTML.includes('id="dn-section-label"') && HTML.includes("renderSectionLabel"));
  check(
    "the no-codes state has its own sentence",
    /add your NAICS codes/i.test(HTML) || /no NAICS codes on file/i.test(LIVE)
  );
  check("the route scores stories against the codes", ROUTE.includes("scoreArticle") && ROUTE.includes("resolveFeedScope"));
  check("the route ships a per-story desk relevance", ROUTE.includes("desk_relevance"));
  check("the page reads it", LIVE.includes("desk_relevance") && HTML.includes("deskScore"));
}

// ── D · the dead numeric coercion is gone ──
console.log("\n── D · relevance is not silently zero ──");
{
  check(
    "the string `relevance` is no longer coerced to a number",
    !/typeof\s+it\.relevance\s*===\s*'number'/.test(LIVE),
    "this was false for every story the route has ever served"
  );
  check(
    "an unjudged story is null, not 0",
    /desk_relevance\s*===\s*'number'\s*\)\s*\?\s*it\.desk_relevance\s*:\s*null/.test(LIVE.replace(/typeof\s+/g, "")),
    "not-scored and scored-irrelevant must stay distinguishable"
  );
  check(
    "the route also keeps them distinct",
    /desk_relevance:\s*j\s*\?\s*j\.relevance\s*:\s*null/.test(ROUTE)
  );
}

// ── E · the model may not invent a code ──
console.log("\n── E · grounding ──");
{
  check("the model's code is validated against the customer's own", SERVER.includes("allowedCodes.has"));
  check(
    "a cached code is re-validated on read",
    /allowedCodes\.has\(row\.matched_code\)/.test(SERVER),
    "codes change on the capability statement after a row is written"
  );
  check("the insight cache is keyed by desk, not by article alone", ROUTE.includes('onConflict: "url_key,scope_key"'));
  check("the scope key is applied to the cache read", /\.eq\("scope_key",\s*scope_key\)/.test(ROUTE));
}

// ── F · feed coverage ──
console.log("\n── F · sources ──");
{
  // Assert against the FEEDS array, not against the whole file. A URL named in a
  // comment explaining why it was dropped is not a URL the route fetches, and a
  // gate that cannot tell those apart is matching prose rather than behaviour.
  const feedsBlock = (ROUTE.match(/const FEEDS[\s\S]*?\n\];/) || [""])[0];
  check("the FEEDS array was located", feedsBlock.length > 100, `${feedsBlock.length} chars`);
  check(
    "no feed URL answering 302-to-empty is still fetched",
    !feedsBlock.includes("documents/search.rss"),
    "Federal Register's search.rss redirects to an empty body"
  );
  check("the working Federal Register API feed is used", feedsBlock.includes("api/v1/documents.rss"));
  check(
    "the per-feed item cap is not 6",
    !/blocks\.slice\(0,\s*6\)/.test(ROUTE),
    "Defense News publishes 25 items per feed"
  );
  const feedCount = (feedsBlock.match(/source:\s*"/g) || []).length;
  check("more than the original four sources", feedCount > 4, `found ${feedCount}`);

  // KNOWN POSITIVES — if these fail, the assertions above are reading the wrong file.
  check("(positive control) the route still aggregates RSS", ROUTE.includes("parseItems") && ROUTE.includes("FEEDS"));
  check("(positive control) the page still declares LIVE_ARTICLES", HTML.includes("LIVE_ARTICLES"));
  check("(positive control) the live pill still exists", LIVE.includes("setLivePill"));
}

// ── H · this round: summary, taxonomy, freshness, duplicates ──
console.log("\n── H · scroll-read summary, domains, freshness ──");
{
  // The label must state what wrote the line. The fallback is one fixed sentence
  // per category; calling that "AI Insight" is false on exactly the cards where
  // nothing read the story.
  check("the AI label is conditional, not blanket", /ai\s*\?\s*'AI Insight'\s*:\s*'Why it matters'/.test(HTML),
    "both states must be distinguishable on the card");
  check("the fallback sentence still exists for unjudged stories", HTML.includes("insightForCat"));

  // Domains, not agencies, are the tabs — 85% placed vs 46% on the live corpus.
  check("tabs are built from the domain set", HTML.includes("DN_DOMAINS") && HTML.includes("dnDomainKey"));
  check("the judge returns a domain", JUDGE.includes("domain:") && JUDGE.includes("DOMAINS"));
  check("domain is validated against a closed set",
    /\(DOMAINS as readonly string\[\]\)\.includes\(dom\)/.test(JUDGE),
    "a free-text domain would mint a tab nobody defined");
  check("agency is validated against a closed set",
    /\(AGENCIES as readonly string\[\]\)\.includes\(ag\)/.test(JUDGE));
  check("agency renders as a chip, not a tab",
    HTML.includes("dnAgencyHTML") && !/\['agency'/.test(HTML),
    "46% coverage is fine for a chip and fatal for a tab");

  // Every rendered story is judged, or the tail falls back to the canned line.
  const judgeLimit = Number((ROUTE.match(/const JUDGE_LIMIT = (\d+)/) || [])[1]);
  check("the judge limit covers a full page of stories", judgeLimit >= 100, String(judgeLimit));

  // Freshness: the page has to turn over.
  check("a maximum age is applied", /const MAX_AGE_DAYS = \d+/.test(ROUTE));
  const maxAge = Number((ROUTE.match(/const MAX_AGE_DAYS = (\d+)/) || [])[1]);
  check("the window is a week or less", maxAge > 0 && maxAge <= 7, String(maxAge));
  check("the window fails open when too little is published", ROUTE.includes("MIN_ITEMS") && ROUTE.includes("window_applied"),
    "a quiet week must not empty the page silently");

  // Duplicates: two shapes, and text can only catch one of them.
  check("syndicated copies are dropped by normalised title", ROUTE.includes("seenTitles"));
  check("same-event repeats are collapsed from the judgement", ROUTE.includes("collapsedSet") && JUDGE.includes("duplicateOf"));
  check("a duplicate reference may only point BACKWARD",
    /row!\.dup as number\) < idx \+ 1/.test(JUDGE),
    "two stories naming each other would remove the event from the page entirely");

  // The description bug that shipped entity-encoded markup onto the cards.
  check("feed text is decoded before tags are stripped",
    /decodeEntities\(cleanCdata\(s\)\)/.test(ROUTE),
    "stripping first leaves &lt;span&gt; to be decoded into visible markup");

  // Story volume is derived, not blank and not invented.
  check("no per-day publication histogram ships", !HTML.includes("volumeSeries") && !HTML.includes("dn-vol-svg"),
    "it charted when publishers published — a newsroom metric the reader cannot act on");
  check("no per-day history is claimed", !HTML.includes("Story Volume"));

  // Code-driven sources — the only feed whose content depends on who is asking.
  check("Google News feeds are built from the customer's codes",
    ROUTE.includes("googleNewsFeeds") && ROUTE.includes("distinctiveTerms"));
  check("a code with no distinctive terms gets no feed",
    /if \(terms\.length === 0\) continue;/.test(ROUTE),
    "otherwise every such code yields the same generic query dressed as personalisation");
}

// ── I · desk default, agency links, images ──
console.log("\n── I · landing tab, agency chip, pictures ──");
{
  const DCO = read("public/dco-app.js");

  // The page opens on the reader's own codes — but never onto an empty tab.
  check("a default landing tab is computed", HTML.includes("dnDefaultCat"));
  check("it lands on the desk only when the desk has stories",
    /dnDeskCount\(\) > 0\) \? 'desk' : 'all'/.test(HTML),
    "landing on an empty personalised lane is worse than landing on the wire");
  check("the reader's own tab choice is not overridden", HTML.includes("DN_CAT_TOUCHED"));

  // Agency chip -> the officers who buy for that agency.
  check("the agency chip carries a target", /data-agency="/.test(HTML));
  check("it is not an anchor inside the card's anchor",
    !/<a[^>]*class="dn-agency/.test(HTML),
    "a nested <a> is invalid and breaks in browsers");
  check("it is keyboard reachable", /role="link" tabindex="0"/.test(HTML));
  check("it navigates to contracting officers", HTML.includes("/contracting-officers?agency="));

  // The receiving page must RESOLVE the name, not assume the vocabularies match.
  check("the destination reads the agency parameter", DCO.includes("requestedAgency"));
  check("the name is resolved against agencies that actually exist", DCO.includes("resolveAgency") && DCO.includes("AGENCY_FILTERS"));
  check("an unresolved agency is stated, not silently ignored",
    /No officers in your feed are from/.test(DCO),
    "filtering to a value no officer carries would render an empty list");
  check("the filter is applied only on a hit", /if \(hit\) S\.agency = hit;/.test(DCO));

  // Pictures: every card gets one, and none of them is a fabricated photograph.
  check("a tile is drawn when the publisher shipped no photo", HTML.includes("dnTileHTML") && HTML.includes("dn-tile"));
  check("the tile is typographic, not an image element",
    !/dn-tile[\s\S]{0,200}<img/.test(HTML),
    "a stock photograph in this slot would be the house placeholder this codebase refuses");
  check("side stories get one too", /dn-side-img dn-tile/.test(HTML));

  // A site-wide og:image is not a story photograph.
  check("shared og:image assets are detected", ROUTE.includes("useCount") && ROUTE.includes("bannersDropped"));
  check("the rule is measured, not a blocklist",
    !/open_graph_site_banner/.test(ROUTE.split("const FEEDS")[0]) || ROUTE.includes("(useCount.get(url) ?? 0) > 1"),
    "naming publishers would miss the next one that does this");
  const ogLimit = Number((ROUTE.match(/const OG_LOOKUP_LIMIT = (\d+)/) || [])[1]);
  check("og lookup covers a page of stories", ogLimit >= 40, String(ogLimit));
}

// ── J · panels must not restate what the tabs already say ──
console.log("\n── J · desk panel, sources, attribution ──");
{
  check("the intel panel breaks down the reader's OWN codes", HTML.includes("deskRows") && HTML.includes("agencyRows"));
  check(
    "it no longer re-counts stories by domain",
    !HTML.includes("topicCounts"),
    "the tab strip already prints those six numbers one row above"
  );
  check("a code with no hits stays on the chart at zero", /A code with no hits this week is a real answer/.test(HTML));

  // The per-source counts were the per-feed cap, identical on every row forever.
  check(
    "the sidebar no longer prints a per-source count",
    !/esc\(!s\.ok \? 'down' : String\(s\.count/.test(HTML),
    "every feed is read to the same cap, so the number could not move"
  );
  check("a dead source is still surfaced", /responding/.test(HTML) && HTML.includes("dead.length"));

  // Aggregated stories must be credited to the outlet, not to the query.
  check("the publisher is parsed off aggregated items", ROUTE.includes("<source") && ROUTE.includes("attributed"));
  check("the ' - Publisher' suffix is stripped from the headline", /cleanTitle\.endsWith\(suffix\)/.test(ROUTE));
  check("the surfacing feed is kept separately", ROUTE.includes("via:") && LIVE.includes("via:"));

  // AI Insight rides the house palette and carries a mark.
  check("the AI variant uses the accent palette", /\.dn-insight\.is-ai\{border-left-color:var\(--accent\)/.test(HTML));
  check("it carries a visual mark", /\.dn-insight\.is-ai b::before/.test(HTML));
  check("the fallback is visually quieter", /\.dn-insight:not\(\.is-ai\)\{background:transparent/.test(HTML));
}

// ── G · SELF-ARM ──
console.log("\n── G · self-arm ──");
{
  const before = fail;
  const realLog = console.log;
  console.log = () => {};
  check("(self-arm)", false, "deliberate");
  console.log = realLog;
  const armed = fail === before + 1;
  fail = before;
  pass++;
  if (!armed) {
    console.log("✗ FAIL  the harness cannot record a failure — every result above is meaningless");
    process.exit(1);
  }
  console.log("✓ PASS  a deliberate false assertion was counted as a failure, then retracted");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
