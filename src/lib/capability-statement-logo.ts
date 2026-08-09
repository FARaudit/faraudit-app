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
