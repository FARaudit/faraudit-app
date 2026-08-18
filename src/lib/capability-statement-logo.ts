// THE BYTES DECIDE WHAT A FILE IS.
//
// A browser sets Content-Type from the file extension and a caller can set it to
// anything at all, so neither is evidence. This reads the magic bytes instead.
//
// SVG is refused, and that is the reason this function exists rather than a MIME
// allowlist: SVG is XML, it can carry <script>, and a logo is served from a public
// bucket and rendered inside a document. There is no signature to sniff for it either —
// it is just text — so "not one of these three" is the check that keeps it out.
export const LOGO_BUCKET = "company-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export interface SniffedImage {
  mime: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
}

/**
 * A LOGO HAS TO BE SIZED BY ITS OWN DIMENSIONS, NOT BY A CSS HOPE.
 *
 * The first attempt set `maxHeight`/`maxWidth` in the PDF and `max-height` in the pasted
 * copy, and never sized it at all in Word. All three failed differently: react-pdf's
 * Image does not honour max-* the way a browser does, Word discards CSS max-height on a
 * pasted image and renders at natural size, and a 1024px-square favicon therefore filled
 * most of a page. The only reliable answer is to read the intrinsic size and scale it.
 *
 * Parses the header, not the whole image — enough for width and height.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const be32 = (o: number) => (bytes[o] << 24 | bytes[o + 1] << 16 | bytes[o + 2] << 8 | bytes[o + 3]) >>> 0;
  const le16 = (o: number) => bytes[o] | (bytes[o + 1] << 8);
  const kind = sniffImageType(bytes);
  if (!kind) return null;

  if (kind.ext === "png") {
    // IHDR is always the first chunk: 8-byte signature, 4 length, 4 type, then w/h.
    if (bytes.length < 24) return null;
    return { width: be32(16), height: be32(20) };
  }

  if (kind.ext === "jpg") {
    // Walk the segment chain to the first start-of-frame, which carries the dimensions.
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      // SOF0-SOF15, excluding DHT (c4), JPG (c8) and DAC (cc), which are not frames.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len <= 0) return null;
      i += 2 + len;
    }
    return null;
  }

  // WebP: three sub-formats, each storing the size in a different place.
  const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (fourcc === "VP8 ") return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
  if (fourcc === "VP8L") {
    const b = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === "VP8X") {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    };
  }
  return null;
}

/**
 * Scale to fit inside a box, preserving aspect ratio, and NEVER enlarging. A small logo
 * stays small rather than being stretched into a blurry banner.
 */
export function fitWithin(
  size: { width: number; height: number } | null,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (!size || size.width <= 0 || size.height <= 0) return { width: maxHeight, height: maxHeight };
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/** The box a logo occupies on the letterhead, in points. Shared by both exports. */
export const LOGO_BOX = { width: 150, height: 42 };

/**
 * Fetches the stored logo for a document render.
 *
 * THE DOCUMENT MUST NOT FAIL BECAUSE OF A LOGO. Handing a renderer a URL makes it fetch
 * mid-render, and a 404, a slow bucket or a DNS blip throws out of the render — the
 * customer clicks Download and gets a 500 for a decoration. Fetched here with a timeout;
 * a failure returns null and the statement renders without it.
 *
 * Re-sniffed even though the upload route already did: this URL comes out of a database
 * row, and the only thing that should reach a renderer from there is one of three image
 * formats.
 */
export async function fetchLogoBytes(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > LOGO_MAX_BYTES) return null;
    return sniffImageType(buf) ? buf : null;
  } catch {
    return null;
  }
}

export function sniffImageType(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((b, i) => bytes[i] === b)) return { mime: "image/png", ext: "png" };

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  // WebP: "RIFF" .... "WEBP" — the size field sits between the two, so both must match
  // or a RIFF container that is not WebP (a .wav, say) would be accepted as an image.
  const ascii = (from: number, s: string) =>
    [...s].every((c, i) => bytes[from + i] === c.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { mime: "image/webp", ext: "webp" };

  return null;
}
