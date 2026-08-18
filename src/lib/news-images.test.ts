// $0 REGRESSION for DEFENSE NEWS PHOTOGRAPHS. The property under test is not
// "an image was produced" — it is that the ONLY image this module can produce is
// one the publisher published. Every fixture below is transcribed verbatim from
// the live feed response on 2026-08-11, not written by hand, so a carrier that
// changes shape upstream shows up here as a red line rather than as pictures
// quietly disappearing from the page.
// Run: npx tsx src/lib/news-images.test.ts
import { extractFeedImage, extractOgImage, usableImageUrl } from "./news-images";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// ── FIXTURES · transcribed from the live feeds 2026-08-11 ────────────────────

// Defense News (Arc Publishing). Note the ORDER: media:thumbnail is emitted
// BEFORE media:content in the real item, and both carry the same URL. The
// preference for media:content is what makes the carrier label truthful.
const DEFENSE_NEWS = `<item><title><![CDATA[DOGE said it saved $1.7 billion by terminating a military health IT contract.]]></title>` +
  `<link>https://www.defensenews.com/news/pentagon-congress/2026/08/10/doge-said-it-saved-17-billion/</link>` +
  `<media:thumbnail url="https://cloudfront-us-east-1.images.arcpublishing.com/archetype/LSSYL5P6JRGILIU6QG22NAMKEE.jpg" type="image/jpeg"/>` +
  `<media:content url="https://cloudfront-us-east-1.images.arcpublishing.com/archetype/LSSYL5P6JRGILIU6QG22NAMKEE.jpg" type="image/jpeg" height="3707" width="5554"/>` +
  `</item>`;

// DoD News. One <enclosure>, already sized 825x780 by the publisher.
const DOD_NEWS = `<item>
<title>U.S., Moroccan Forces Leverage Africa's Multidomain Experimentation Center</title>
<link>https://www.war.gov/News/News-Stories/Article/Article/4567934/</link>
<enclosure url="https://media.defense.gov/2026/Aug/10/2003977127/825/780/0/260805-A-UT471-9175.JPG" type="image/jpeg" />
</item>`;

// FedScoop. No image element at all — the article's og:image is what resolves it.
const FEDSCOOP = `<item>
<title>IT cuts led to delays in IRS's processing of paper returns, GAO finds</title>
<link>https://fedscoop.com/irs-paper-returns-processing-gao-report/</link>
<dc:creator><![CDATA[mbracken]]></dc:creator>
<pubDate>Mon, 10 Aug 2026 21:24:48 +0000</pubDate>
<description><![CDATA[<p>Agency officials told the watchdog that the "recent loss of experienced IT acquisition staff" resulted in paper-processing systems not being ready.</p>]]></description>
</item>`;

const FEDSCOOP_ARTICLE_HEAD = `<head><meta property="og:type" content="article" />` +
  `<meta property="og:image" content="https://fedscoop.com/wp-content/uploads/sites/5/2026/05/GettyImages-2268181960.jpg" />` +
  `<meta name="twitter:card" content="summary_large_image" /></head>`;

// Federal Register. It publishes documents, not photographs — no carrier, and
// its article pages carry no og:image either. Zero images is the CORRECT result
// for this source, and the test asserts it rather than tolerating it.
const FEDERAL_REGISTER = `<item>
<title>Defense Federal Acquisition Regulation Supplement: Small Business Set-Asides</title>
<link>https://www.federalregister.gov/documents/2026/08/10/2026-15012/defense-federal-acquisition-regulation-supplement</link>
</item>`;

// ── the four wired sources ───────────────────────────────────────────────────
const dn = extractFeedImage(DEFENSE_NEWS);
assert(dn?.url === "https://cloudfront-us-east-1.images.arcpublishing.com/archetype/LSSYL5P6JRGILIU6QG22NAMKEE.jpg",
  "Defense News: the publisher's media:content URL is carried through verbatim");
assert(dn?.carrier === "media:content",
  "Defense News: carrier is media:content, NOT the thumbnail that precedes it in the item");

const dod = extractFeedImage(DOD_NEWS);
assert(dod?.url === "https://media.defense.gov/2026/Aug/10/2003977127/825/780/0/260805-A-UT471-9175.JPG",
  "DoD News: the <enclosure> photograph is carried through verbatim");
assert(dod?.carrier === "enclosure", "DoD News: carrier is enclosure");

assert(extractFeedImage(FEDSCOOP) === null,
  "FedScoop: no feed carrier → null from the feed (the article's og:image resolves it)");
assert(extractOgImage(FEDSCOOP_ARTICLE_HEAD) === "https://fedscoop.com/wp-content/uploads/sites/5/2026/05/GettyImages-2268181960.jpg",
  "FedScoop: og:image is read out of the article head");

assert(extractFeedImage(FEDERAL_REGISTER) === null,
  "Federal Register: a documents feed yields no photograph — zero is the correct answer");
assert(extractOgImage("<head><title>Federal Register :: DFARS</title></head>") === null,
  "Federal Register: no og:image → null, never a stand-in");

// ── THE PROPERTY · nothing but a published photograph can get out ────────────
// These are the shapes that would let a manufactured image reach the page.
assert(usableImageUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=") === null,
  "PROPERTY: a data: URL is refused — a drawn image could only have come from us");
assert(usableImageUrl("blob:https://faraudit.com/9f3c") === null,
  "PROPERTY: a blob: URL is refused");
assert(usableImageUrl("/img/placeholder.png") === null,
  "PROPERTY: a same-origin path is refused — nothing we host is a news photograph");
assert(usableImageUrl("http://media.defense.gov/photo.jpg") === null,
  "PROPERTY: plain http is refused");
assert(usableImageUrl("") === null && usableImageUrl(null) === null && usableImageUrl(undefined) === null,
  "PROPERTY: empty/absent yields null, not a default");

// A media:content carrying audio must not be shown as a photograph.
assert(extractFeedImage(`<item><media:content url="https://example.com/brief.mp3" type="audio/mpeg"/></item>`) === null,
  "PROPERTY: media:content typed audio is not an image");
assert(extractFeedImage(`<item><enclosure url="https://example.com/ep12.mp3" type="audio/mpeg" /></item>`) === null,
  "PROPERTY: an audio <enclosure> is not an image");
// …but an untyped element whose extension is an image still counts, because
// several feeds omit the type attribute.
assert(extractFeedImage(`<item><enclosure url="https://media.defense.gov/2026/x.JPG" /></item>`)?.carrier === "enclosure",
  "untyped <enclosure> with an image extension is accepted");

// Entity-encoded URLs (query strings arrive as &amp; in XML) survive intact.
assert(extractFeedImage(`<item><media:content url="https://cdn.example.com/p.jpg?w=800&amp;h=600" type="image/jpeg"/></item>`)?.url
  === "https://cdn.example.com/p.jpg?w=800&h=600",
  "XML entities in an image URL are decoded, not passed through as &amp;");

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
