// THE FACES THE DOCUMENT IS SET IN.
//
// Manrope for display, JetBrains Mono for identifiers and keys. Both are already the
// platform's faces — Manrope is on every served page — so this registers what the design
// uses rather than introducing a face for one document.
//
// WOFF, NOT WOFF2. @react-pdf/renderer reads TTF and WOFF and cannot read WOFF2, and
// @fontsource ships both. The .woff files are the ones referenced here for that reason;
// pointing at the .woff2 renders a document in a substituted face with no error.
//
// THE FILES LIVE IN node_modules AND MUST BE TRACED. A path built at runtime is invisible
// to Vercel's file tracer, so the fonts would resolve locally and be absent in the
// serverless bundle — the failure would be a PDF that silently comes back in Helvetica,
// which is exactly the drift this design was corrected for. next.config.ts carries an
// outputFileTracingIncludes entry for @fontsource; the two must be changed together.
import path from "node:path";
import { existsSync } from "node:fs";
import { Font } from "@react-pdf/renderer";

const DIR = (pkg: string) => path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files");
const manrope = (w: number) => path.join(DIR("manrope"), `manrope-latin-${w}-normal.woff`);
const mono = (w: number) => path.join(DIR("jetbrains-mono"), `jetbrains-mono-latin-${w}-normal.woff`);

export const DISPLAY = "Manrope";
export const MONO = "JetBrainsMono";

let done = false;
let registered = false;

/** Registers both families. Idempotent — react-pdf keeps one global registry and
 *  re-registering the same family on every render leaks. Returns whether the faces are
 *  actually available, so a caller can report a substituted document rather than ship one
 *  quietly: the whole point of the ruling was that the face is not a detail. */
export function registerCapabilityFonts(): boolean {
  if (done) return registered;
  done = true;
  const files = [manrope(400), manrope(500), manrope(700), manrope(800), mono(400), mono(500), mono(700)];
  if (!files.every((f) => existsSync(f))) {
    // No throw. A capability statement that fails to download is worse for the customer
    // than one set in the fallback face, and the caller is told which it got.
    console.error("[capability-statement] font files not found — the document will render in a substituted face");
    return false;
  }
  Font.register({
    family: DISPLAY,
    fonts: [
      { src: manrope(400), fontWeight: 400 },
      { src: manrope(500), fontWeight: 500 },
      { src: manrope(700), fontWeight: 700 },
      { src: manrope(800), fontWeight: 800 }
    ]
  });
  Font.register({
    family: MONO,
    fonts: [
      { src: mono(400), fontWeight: 400 },
      { src: mono(500), fontWeight: 500 },
      { src: mono(700), fontWeight: 700 }
    ]
  });
  // A hyphen inserted into a UEI or a contract number by the line breaker would be read as
  // part of the identifier. The plate sets every identifier on one line by construction.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
  return true;
}

export function fontsRegistered(): boolean { return registered; }
