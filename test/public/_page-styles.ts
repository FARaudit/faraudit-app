// THE STYLES A SERVED PAGE ACTUALLY APPLIES — inline <style> blocks PLUS any local stylesheet it links.
//
// WHY THIS EXISTS. Six gates asserted "this CSS rule ships" by reading defense-spending.html and
// grepping its <style> block. The moment 54 KB of that CSS moved into public/dsb.css so a second page
// could share it, all six went red — and not one of them was describing anything that had changed. The
// rules still ship. The page still applies them. Only the file they live in moved.
//
// A gate anchored to WHERE a rule is written rather than WHETHER the page applies it fails on every
// extract-refactor, and the pressure that creates is to loosen the gate, which costs more than the
// drift it was catching. So the question is asked once, here, in the form the browser asks it:
// load the page, follow its <link>s, concatenate.
//
// ⛔ LOCAL STYLESHEETS ONLY. A remote <link> (fonts) is not ours and is not fetched — a gate that
// reached the network would be flaky and would pass on a cache rather than on the bytes.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_DIR = join(process.cwd(), "public");

/** Every stylesheet href on the page that resolves to a file we actually serve. */
export function linkedStylesheets(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href || /^https?:|^\/\//i.test(href)) continue;   // remote: not ours
    out.push(href.replace(/^\//, "").split("?")[0]);
  }
  return out;
}

/**
 * The CSS a page applies: its inline <style> bodies followed by every local
 * stylesheet it links, in document order.
 * @param pageFile file name under public/, e.g. "defense-spending.html"
 */
export function pageStyles(pageFile: string): string {
  const path = join(PUBLIC_DIR, pageFile);
  if (!existsSync(path)) return "";
  const html = readFileSync(path, "utf8");
  const parts: string[] = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) parts.push(m[1]);
  for (const href of linkedStylesheets(html)) {
    const p = join(PUBLIC_DIR, href);
    if (existsSync(p)) parts.push(readFileSync(p, "utf8"));
  }
  return parts.join("\n");
}

/** The page's markup and its styles together — what a grep over "the page" used
 *  to mean back when the two were the same file. */
export function pageSource(pageFile: string): string {
  const path = join(PUBLIC_DIR, pageFile);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8") + "\n" + pageStyles(pageFile);
}
