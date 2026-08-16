/* THE DEFENCE-NEWS WIRES — ONE LIST, READ BY BOTH SURFACES.
 *
 * The Defense news desk reads these and judges what it finds. The Signals card on
 * Today reads the same wires for a single newest headline and does not judge.
 *
 * They share this list so the card cannot preview a story its own desk never carries.
 * A card that shows a headline you then cannot find on the page it links to is a
 * promise broken one click later, and two copies of a URL list is how that happens.
 *
 * Google News queries built from the customer's OWN codes are NOT here: those are
 * per-reader and belong to the desk that scopes them.
 */
export type NewsTag = "defense" | "policy";

export const NEWS_FEEDS: { source: string; url: string; tag: NewsTag }[] = [
  { source: "Defense News",         url: "https://www.defensenews.com/arc/outboundfeeds/rss/", tag: "defense" },
  { source: "DoD News",             url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=20", tag: "defense" },
  { source: "Federal Register",     url: "https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=defense-department", tag: "policy" },
  { source: "FedScoop",             url: "https://fedscoop.com/feed/", tag: "policy" },
  { source: "Acquisition.gov",      url: "https://www.acquisition.gov/rss.xml", tag: "policy" },
  { source: "Federal News Network", url: "https://federalnewsnetwork.com/category/acquisition-policy/feed/", tag: "policy" },
  { source: "Breaking Defense",     url: "https://breakingdefense.com/feed/", tag: "defense" },
  { source: "DefenseScoop",         url: "https://defensescoop.com/feed/", tag: "defense" }
];
