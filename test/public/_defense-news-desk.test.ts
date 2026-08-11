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
// The spend ledger and the migration that backs it. Read here so the gate fails
// if either is deleted, rather than only if the route stops calling it.
const USAGE = read("src/lib/defense-news-usage.ts");
const MIGRATION = read("supabase/migrations/032_defense_news_usage.sql");
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

  // The per-chunk pass compares a story only with its own 20, so two outlets
  // covering one announcement survive whenever they land in different calls.
  check("same-event collapse runs across the WHOLE request, not just a chunk",
    ROUTE.includes("judgeDuplicatesAcrossRequest") && JUDGE.includes("judgeDuplicatesAcrossRequest"),
    "Breaking Defense and Defense News on one Boeing announcement landed in different chunks");
  check("it is skipped when a single chunk already compared everything",
    /if \(chunks\.length > 1\)/.test(ROUTE),
    "a second pass over one chunk is a call that can only repeat the first");
  check("its cost joins the same spend total the ledger writes",
    /judgeDuplicatesAcrossRequest\(client, survivors, spend\)/.test(ROUTE),
    "an unmetered call is spend the cockpit cannot see");
  check("only a fully-readable group may drop anything",
    /idxs\.length !== g\.length \|\| idxs\.length < 2/.test(JUDGE),
    "honouring the readable part of a malformed group drops a real story");
  check("the lowest-numbered story survives a group",
    /const keep = Math\.min\(\.\.\.idxs\)/.test(JUDGE),
    "otherwise a group can remove the event from the page entirely");
  check("a failed dedup call leaves both takes on the page",
    /cross-request dedup failed/.test(JUDGE),
    "dropping stories on a broken reply is worse than showing two of one event");

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

  // Pictures: a story carries the publisher's own photograph or it carries none.
  // CEO ruling 2026-08-11 — "if the article does not have a photo, don't add it."
  check("no drawn panel stands in for a photograph",
    !HTML.includes("dnTileHTML") && !HTML.includes("dn-tile") && !HTML.includes("DN_TILE"),
    "a coloured block in the photo slot is the house placeholder under another name");
  check("a photoless story renders as a text card",
    HTML.includes("dnNoMediaHTML") && /if \(!a\.urlToImage\) return dnNoMediaHTML\(a\);/.test(HTML));
  check("the category badge survives the missing photograph",
    /dn-nomedia[\s\S]{0,160}dnKickerHTML/.test(HTML),
    "the badge is positioned over the image, so removing the image must not remove the badge");
  check("no image element is emitted without a source",
    !/dn-nomedia[\s\S]{0,200}<img/.test(HTML));
  // Geometry: a fixed-height frame crops the photograph to fit the box. Measured
  // live 2026-08-11 — a 1080x720 press photo (1.50) in a 762x300 frame (2.54) lost
  // the same slice top and bottom, which is where faces are.
  check("the photo frame is an aspect ratio, not a fixed height",
    /\.dn-lead-main \.dn-img\{aspect-ratio:16\/9/.test(HTML)
    && /\.dn-card \.dn-img\{aspect-ratio:16\/9/.test(HTML),
    "a pixel height forces the crop to whatever the column happens to be wide");
  check("no pixel height survives on either photo frame",
    !/\.dn-(lead-main|card) \.dn-img\{[^}]*height:\d+px/.test(HTML));
  check("what is cropped is biased away from faces",
    /object-position:50% 32%/.test(HTML),
    "a centred crop on a 3:2 source takes the top of the head and the feet equally");

  check("a photoless side story gets no thumbnail column",
    /s\.urlToImage\s*\?[\s\S]{0,140}:\s*'';/.test(HTML),
    "its own comment already said the headline takes the width");

  // A site-wide og:image is not a story photograph.
  check("shared og:image assets are detected", ROUTE.includes("useCount") && ROUTE.includes("bannersDropped"));
  check("the rule is measured, not a blocklist",
    !/open_graph_site_banner/.test(ROUTE.split("const FEEDS")[0]) || ROUTE.includes("(useCount.get(url) ?? 0) > 1"),
    "naming publishers would miss the next one that does this");
  // The lookup must cover the feed on EVERY future refresh, not the first screen
  // of whatever size the feed happened to be the day the number was chosen. At 40
  // a 56-item page left its last 16 stories permanently photoless.
  check("og lookup is not positionally capped",
    !/OG_LOOKUP_LIMIT/.test(ROUTE) && /const needsOg = items\.filter\(/.test(ROUTE),
    "a fixed cap silently decides that everything past it never gets a picture");
  check("it is bounded by concurrency instead of by count",
    ROUTE.includes("OG_FETCH_CONCURRENCY") && ROUTE.includes("mapWithConcurrency"),
    "unbounded parallel article fetches is the other way to get this wrong");
  check("an unreachable publisher cannot take the other pictures with it",
    /catch \{\s*return null;\s*\}/.test(ROUTE),
    "one rejection inside the pool would abort every lookup in flight");
  check("the fetch costs no model call and is cached for a day",
    /next: \{ revalidate: 86400 \}/.test(ROUTE),
    "re-fetching every article on every 5-minute refresh is the cost this page cannot carry");

  // The unwired panel that printed its own absence at the bottom of the page.
  // CEO ruling 2026-08-11 — deleted, not wired: FAR/DFARS Updates and CMMC
  // Readiness are already tabs, and the Policy tab on this page carries the
  // Federal Register items it claimed were missing.
  check("the unwired regulatory panel is gone",
    !HTML.includes("dn-reg") && !HTML.includes("REG_ITEMS") && !HTML.includes("Regulatory highlights"),
    "a section that states it has no source is a fabricated section with an honest label");
  check("nothing still calls its renderer", !/renderRegFeed/.test(HTML),
    "a splice that leaves a caller behind throws on page load and takes the panels after it");

  // The awards row promises teaming targets, not the reader's own bid list.
  check("the awards row is named for what it actually holds",
    HTML.includes("Who's winning your codes") && !HTML.includes("Recent Awards"),
    "these are PRIME awards — a machine shop subs to them, it does not bid them");
  check("it counts the whole set rather than the slice rendered",
    /AWARDS\.length \+ ' award'/.test(HTML),
    "showing 8 of 25 under no count reads as 8 awards existing");
  check("four to a row, so there is a column to follow down",
    /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(HTML));
}

// ── J · panels must not restate what the tabs already say ──
console.log("\n── J · desk panel, sources, attribution ──");
{
  check("no intel band restates the tab counts", !HTML.includes("topicCounts") && !HTML.includes("deskRows"),
    "the tab strip and the per-card chips already carry that breakdown");
  check("its one irreducible number survives in the masthead", HTML.includes("renderDeskStat") && /match your codes/.test(HTML));
  check("awards render once, at full width", HTML.includes('id="dn-awards"') && !HTML.includes("dn-ticker-inner"),
    "they were a scrolling marquee AND a sidebar card");
  check("the marquee renderer is gone", !HTML.includes("TICKER_ITEMS") && !LIVE.includes("renderTicker"));
  check("the story column is no longer sharing width with a sidebar", !HTML.includes('id="dn-sidebar-col"'));

  // The per-source panel is gone: its counts were the per-feed cap, identical on
  // every row forever, and a single dead feed among eleven is an operator concern
  // rather than something a reader can act on. What must NOT go with it is the
  // ability to notice a feed has died — that is how Federal Register's stayed
  // dead. Both signals are asserted here rather than the panel that showed them.
  check("no per-source panel ships to the reader", !HTML.includes("dn-sw-title"),
    "eleven rows all printing the same cap told the reader nothing");
  check(
    "a failing feed is still logged server-side",
    ROUTE.includes("[defense-news] feed non-OK") && ROUTE.includes("[defense-news] feed threw"),
    "the operator signal must outlive the panel"
  );
  check(
    "the route still reports per-source outcomes to the caller",
    /sources,/.test(ROUTE) && ROUTE.includes("ok: r.ok"),
    "so a monitor can see a dead feed even with no panel on the page"
  );
  check(
    "a total outage still reaches the reader",
    LIVE.includes("news sources responded"),
    "one dead source of eleven is invisible and should be; all eleven is not"
  );

  // Aggregated stories must be credited to the outlet, not to the query.
  check("the publisher is parsed off aggregated items", ROUTE.includes("<source") && ROUTE.includes("attributed"));
  check("the ' - Publisher' suffix is stripped from the headline", /cleanTitle\.endsWith\(suffix\)/.test(ROUTE));
  check("the surfacing feed is kept separately", ROUTE.includes("via:") && LIVE.includes("via:"));

  // AI Insight rides the house palette and carries a mark.
  check("the AI variant uses the accent palette", /\.dn-insight\.is-ai\{border-left-color:var\(--accent\)/.test(HTML));
  check("it carries a visual mark", /\.dn-insight\.is-ai b::before/.test(HTML));
  check("the fallback is visually quieter", /\.dn-insight:not\(\.is-ai\)\{background:transparent/.test(HTML));
}

// ── K · the page's own cost is auditable ──
console.log("\n── K · spend reporting ──");
{
  check("token usage is read from the API response", JUDGE.includes("msg.usage.input_tokens") && JUDGE.includes("msg.usage.output_tokens"),
    "an estimate cannot be checked against a bill");
  check("the route accumulates it per request", ROUTE.includes("const spend: ChunkUsage[]"));
  check("it is reported to the caller", /const requestSpend = \{[\s\S]{0,400}usd:/.test(ROUTE) && ROUTE.includes("spend: requestSpend"));

  // The ledger, so a week of spend can be read without anyone running a query.
  check("the measurement is measured ONCE and both reported and recorded",
    (ROUTE.match(/requestSpend/g) || []).length >= 3,
    "two derivations of the same cost can disagree, and then neither can be trusted");
  check("spend is appended to its own ledger", ROUTE.includes("recordNewsSpend"));
  check("NOT to usage_events, which Cost/Audit divides by",
    !ROUTE.includes("usage_events") && USAGE.includes('from("defense_news_usage")'),
    "a news row in the audit ledger drags the cost of an audit toward zero");
  check("the write is awaited, not fired and forgotten",
    /await recordNewsSpend\(/.test(ROUTE),
    "a serverless function can be killed at response time, silently under-counting");
  check("a fully-cached page view records nothing",
    /spend\.calls > 0/.test(USAGE),
    "a zero-dollar row per pageview is a traffic log, not a cost ledger");
  check("the ledger can never blank the page",
    /catch \(e\)[\s\S]{0,220}console\.warn/.test(USAGE) && !/throw/.test(USAGE.split("export async function recordNewsSpend")[1] ?? ""),
    "this runs on the read path of a page the customer is waiting for");
  check("the table exists as a migration",
    MIGRATION.includes("CREATE TABLE IF NOT EXISTS public.defense_news_usage")
    && MIGRATION.includes("ENABLE ROW LEVEL SECURITY"));
  check("and logged server-side", /\[defense-news\] judged/.test(ROUTE));
  check(
    "the dollar figure is derived from tokens, not hardcoded",
    /RATE_PER_MTOK\.input/.test(ROUTE) && /RATE_PER_MTOK\.output/.test(ROUTE),
    "a fixed number would drift silently from the real rate"
  );
  check("a fully-cached request reports zero calls", ROUTE.includes("calls: spend.length"));
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
