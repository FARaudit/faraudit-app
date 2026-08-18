// ━━ Publisher photographs for the Defense News feed ━━
//
// Every picture on that page is the publisher's own, carried from the feed item
// or from the article's og:image. Nothing is generated, nothing is drawn, and
// there is no house placeholder: an item with no publisher image ships null and
// the card renders text-only. The rule lives here rather than in the template,
// because a template that CAN invent a fallback will eventually be asked to.
//
// Measured against the live feeds 2026-08-11: Defense News carries media:content
// on 25/25 items, DoD News an <enclosure> on 20/20, FedScoop none (the article's
// og:image resolves it), Federal Register none — it publishes documents, not
// photographs, and correctly gets no image at all.
//
// Split out of the route so it can be exercised against real feed bytes without
// a request context. Fixtures in news-images.test.ts are transcribed from the
// live responses, not written by hand.

/** Which of the publisher's own carriers an image came from. Recorded so a
 *  regression reads as a carrier disappearing rather than as pictures quietly
 *  vanishing — and so nothing can enter the field from anywhere else. */
export type ImageCarrier = "media:content" | "media:thumbnail" | "enclosure" | "og:image";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** An https URL we are willing to hand to the page as a photograph. Anything
 *  that is not https is refused outright: a data: or blob: URL arriving here
 *  could only have been manufactured on our side, which is the one thing this
 *  module exists to prevent. */
export function usableImageUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const url = decodeEntities(String(raw).trim());
  if (!/^https:\/\/[^\s"']+$/i.test(url)) return null;
  return url;
}

/** The publisher's image for one <item>/<entry> block, or null. Order is
 *  most-specific first; media:content is preferred because it is the only
 *  carrier that states its own type and dimensions. */
export function extractFeedImage(block: string): { url: string; carrier: ImageCarrier } | null {
  const mediaContent = block.match(/<media:content[^>]*\burl="([^"]+)"[^>]*>/i);
  if (mediaContent) {
    const url = usableImageUrl(mediaContent[1]);
    // media:content also carries audio and video. Take it only when the element
    // says image, or when the extension does.
    if (url && (/type="image/i.test(mediaContent[0]) || IMAGE_EXT.test(url))) {
      return { url, carrier: "media:content" };
    }
  }
  const thumb = block.match(/<media:thumbnail[^>]*\burl="([^"]+)"/i);
  if (thumb) {
    const url = usableImageUrl(thumb[1]);
    if (url) return { url, carrier: "media:thumbnail" };
  }
  const enclosure = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*>/i);
  if (enclosure) {
    const url = usableImageUrl(enclosure[1]);
    if (url && (/type="image/i.test(enclosure[0]) || IMAGE_EXT.test(url))) {
      return { url, carrier: "enclosure" };
    }
  }
  return null;
}

/** The og:image out of an article's HTML head. Exported separately from the
 *  fetch so the parse can be tested without a network call. */
export function extractOgImage(html: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  return og ? usableImageUrl(og[1]) : null;
}
