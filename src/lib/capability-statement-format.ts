// A PHONE IS READ, NOT PARSED — and it is read the same way everywhere.
//
// The page and the clipboard formatted the number through the client's fmtPhone(). The
// PDF printed `contact_phone` straight off the record. So one field had two renderings,
// and the raw one — `12034567890` — was the one that reached a contracting officer,
// while the customer had just checked `(203) 456-7890` on screen.
//
// The record keeps exactly what was typed; this only changes how it is SHOWN. Anything
// that is not a plain 10-digit US number is passed through UNTOUCHED rather than forced
// into a shape it does not have, so an extension, a foreign number, and a deliberate
// formatting choice all survive intact.
//
// Mirrors fmtPhone() in public/capability-statement-live.js. That file is served
// verbatim to the browser and cannot import from here, so the two are kept in step by a
// gate that runs the same inputs through both and compares.
export function formatPhone(value: string | null | undefined): string {
  const raw = String(value ?? "");
  if (!raw.trim()) return raw;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
