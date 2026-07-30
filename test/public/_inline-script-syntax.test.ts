// PUBLIC INLINE-SCRIPT SYNTAX GATE — every statically served page must actually PARSE.
// Run: npx tsx test/public/_inline-script-syntax.test.ts
//
// WHY THIS EXISTS. `public/run-audit.html` — the Run Audit front door, the entry point to the entire
// product — shipped to production with an unclosed IIFE, and the whole 326-line inline block therefore
// failed to parse. Not "degraded": a SyntaxError aborts the ENTIRE <script> block, so nothing in it ran.
// Pasting a solicitation number did nothing. Clicking "Fetch documents" did nothing. The theme toggle,
// the sidebar, the recently-audited fetch — all dead. The page LOOKED perfect, because the HTML and CSS
// are fine and only the behaviour was gone.
//
// HOW IT GOT THERE — the mechanism is the point, because it will recur. `e349979` deleted dead
// watching-count hydration from 19 static pages. In this file the IIFE's closing `})();` sat on the SAME
// LINE as the last body statement:
//
//     (function(){
//       function setWatching(n){ … }
//       fetch('/api/watched-notices', …).catch(function(){});})();   ← the close lived HERE
//
// Removing the body removed the close with it and left the bare `(function(){` opener behind. The merge
// that carried it to main was `bea5ed9` — "take BOTH removals" — the same resolution already known to
// have dropped additions and cost 2 of 21 notification surfaces. That investigation checked the bell
// badge and never asked whether the file still parsed, so this rode to production unnoticed.
//
// WHY EXISTING GATES MISSED IT. The 7 gates in this directory check served bytes for LEAKED CONTENT
// (comments, demo residue, unbound slots) — semantic properties of text that IS parsed. None of them
// asks the prior question: does the browser accept this file as JavaScript at all? A page whose script
// does not compile is the most complete failure possible, and it was the one thing nothing tested.
//
// SHAPE, NOT A PHRASE LIST. This does not scan for unbalanced-brace patterns or "suspicious" endings —
// a heuristic would certify its author's imagination and miss the next shape. It hands each block to the
// real JS parser (`vm.Script` COMPILES without executing, so browser globals are irrelevant and nothing
// runs) and asks the only question that matters: does this parse? That is the same authority the browser
// applies, so the gate cannot disagree with production about what is valid.
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import vm from "vm";

let failures = 0;
const fail = (m: string) => { console.log(`❌ ${m}`); failures++; };
const pass = (m: string) => console.log(`✅ ${m}`);

const PUBLIC = join(process.cwd(), "public");

/** every .html under public/, recursively — these bytes reach the browser exactly as committed. */
function servedHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) servedHtml(p, out);
    else if (entry.endsWith(".html")) out.push(p);
  }
  return out;
}

/** Inline <script> blocks only (a src= reference is a separate file with its own bytes). Non-JS script
 *  types (application/json, text/template, importmap) are DATA, not code — skipped deliberately. */
const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
const JS_TYPES = new Set(["text/javascript", "application/javascript", "module"]);

const files = servedHtml(PUBLIC);
let blocks = 0;
const dead: Array<{ file: string; line: number; message: string }> = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  SCRIPT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_RE.exec(src)) !== null) {
    const [, attrs, body] = m;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (typeMatch && !JS_TYPES.has(typeMatch[1].trim().toLowerCase())) continue;
    if (!body.trim()) continue;
    blocks++;
    const line = src.slice(0, m.index).split("\n").length;
    try {
      // COMPILE ONLY — never run. A SyntaxError here is exactly what the browser would throw.
      new vm.Script(body, { filename: `${relative(process.cwd(), file)}:${line}` });
    } catch (e) {
      dead.push({ file: relative(process.cwd(), file), line, message: e instanceof Error ? e.message : String(e) });
    }
  }
}

console.log(`scanned ${files.length} served HTML file(s) · ${blocks} inline script block(s)\n`);

if (dead.length) {
  for (const d of dead) {
    fail(`${d.file}:${d.line} — inline script DOES NOT PARSE: ${d.message}`);
    console.log(`     A SyntaxError aborts the WHOLE block: every handler in it is dead in production.`);
  }
} else {
  pass(`every inline script block in public/ parses (${blocks} block(s) across ${files.length} file(s))`);
}

// The gate must be able to FAIL — an always-green gate is indistinguishable from no gate. Plant the exact
// defect that shipped (a bare unclosed IIFE opener) and require the parser to reject it.
console.log("\n── gate falsifiability (planted positive) ──");
const PLANTED = `(function(){\n  var a = 1;\n`;   // the run-audit.html defect, reduced
let plantedRejected = false;
try { new vm.Script(PLANTED); } catch { plantedRejected = true; }
if (plantedRejected) pass("the planted unclosed-IIFE defect IS rejected by this gate");
else fail("PLANTED DEFECT PARSED — this gate cannot detect the bug it exists for");

// And a valid block must be accepted, so the gate is not simply rejecting everything.
let validAccepted = true;
try { new vm.Script(`(function(){ var a = 1; })();`); } catch { validAccepted = false; }
if (validAccepted) pass("a well-formed IIFE is accepted (no false positives)");
else fail("a well-formed IIFE was REJECTED — the gate is broken");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
