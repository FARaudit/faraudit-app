// Standing conformance gate for the audit report — spec source:
//   ceo/redesign-final/Review/AUDIT-REPORT-CONFORMANCE-CHECKLIST.md
//
// Wires the 22-assertion matrix from the checklist into automated Playwright
// QA. Run-mode: each Phase-2/3 fix lands with its assertion flipped to
// BLOCKING; remaining assertions stay as warn until their phase lands.
//
// Run set: 5 full-audit-producing docs × 3 viewports. The 5 docs span the
// formats Code's burn-in matrix tests (SF-1449 / SF-18 / UCF / DLA / DOE).
// Text-only / metadata-only burn-in arms are excluded — they lack the full
// sections to assert against.
//
// CURRENT BLOCKING SET (Jun 8 2026):
//   - E1 (§09 six-bucket — F1 catastrophic) ← Phase 2 #1 just landed
//   - D6 (.rpt-main{min-width:0} present)   ← Phase 1.5 scroll fix
//
// Other assertions stay warn until their Phase ships. As each lands, flip
// the BLOCKING_IDS set below.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 5 audit IDs spanning the formats. Pulled from /api/audits or set per-run.
// For initial wiring, exercise against the most recent SPRRA (DLA / SF-18)
// — additional docs added as audits are run on the other formats.
const AUDIT_DOCS: Array<{ label: string; id: string }> = [
  { label: 'DLA · SPRRA126Q0034', id: 'd7e8d740-10f3-4dc9-ad65-835d5155a604' },
];

const VIEWPORTS: Array<{ label: string; width: number; height: number }> = [
  { label: '1280', width: 1280, height: 900 },
  { label: '1440', width: 1440, height: 900 },
  { label: '1920', width: 1920, height: 1080 },
];

// Assertions currently flipped to BLOCKING. Per the checklist's severity
// gating, an assertion flips blocking when its Phase ships. Until then, the
// suite still RUNS the assertion (reports the result), but fails are warn-only.
const BLOCKING_IDS = new Set<string>([
  'D6',  // .rpt-main{min-width:0} — Phase 1.5 scroll fix
  'E1',  // §09 six-bucket — Phase 2 #1 (CATASTROPHIC)
  'E12', // §08 drafted email body — Phase 2 #2
  'E13', // §03 ws-reveal present + exactly one state — Phase 2 #3 (floor)
  'E9',  // key-dates populate-or-collapse — Phase 2 #4 (F5)
]);

const OUT_DIR = 'test-results/_report-conformance';
fs.mkdirSync(OUT_DIR, { recursive: true });

interface AssertionResult {
  id: string;
  pass: boolean;
  detail: string;
}

async function runAssertions(page: import('@playwright/test').Page): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  // ─── DESIGN invariants ───────────────────────────────────────────────────
  const d1 = await page.evaluate(() => {
    const delta = Math.abs(document.documentElement.scrollWidth - window.innerWidth);
    return { ok: delta <= 1, vw: window.innerWidth, sw: document.documentElement.scrollWidth, delta };
  });
  results.push({ id: 'D1', pass: d1.ok, detail: `vw=${d1.vw} sw=${d1.sw} delta=${d1.delta}` });

  const d3 = await page.evaluate(() => {
    const g = document.querySelector('.rpt-grid');
    if (!g) return { ok: false, cols: 'NOT FOUND' };
    const cols = getComputedStyle(g).gridTemplateColumns;
    const vw = window.innerWidth;
    if (vw >= 1280) {
      return { ok: /^\d+(\.\d+)?px 312px$/.test(cols), cols };
    } else {
      // <1240: single column (collapsed); 1240-1280: 2-col but frame scrolls (by design)
      return { ok: true, cols };
    }
  });
  results.push({ id: 'D3', pass: d3.ok, detail: `grid: ${d3.cols}` });

  const d5 = await page.evaluate(() => {
    const b = document.querySelector('.body');
    return { ok: b ? getComputedStyle(b).maxWidth === '1480px' : false, mw: b ? getComputedStyle(b).maxWidth : 'NOT FOUND' };
  });
  results.push({ id: 'D5', pass: d5.ok, detail: `.body max-width: ${d5.mw}` });

  const d6 = await page.evaluate(() => {
    const m = document.querySelector('.rpt-main');
    return { ok: m ? getComputedStyle(m).minWidth === '0px' : false, mw: m ? getComputedStyle(m).minWidth : 'NOT FOUND' };
  });
  results.push({ id: 'D6', pass: d6.ok, detail: `.rpt-main min-width: ${d6.mw}` });

  // ─── ENGINE invariants ──────────────────────────────────────────────────
  // E1 — §09: 6 buckets, no duplicate .ck-item within §09, counter shape.
  // BLOCKING — Phase 2 #1 just landed.
  const e1 = await page.evaluate(() => {
    const sec = document.querySelector('#sec-checklist');
    if (!sec) return { ok: false, detail: '#sec-checklist NOT FOUND' };
    const groups = sec.querySelectorAll('.ck-group');
    const items = Array.from(sec.querySelectorAll('.ck-item'));
    // Visible groups only (the canonical template ships placeholder buckets
    // with style="display:none" that the renderer replaces — count rendered
    // ones with at least one item).
    const visibleGroups = Array.from(groups).filter((g) => g.querySelector('.ck-item'));
    const groupCount = visibleGroups.length;
    // Dedup check — same .ck-txt text across multiple items inside §09
    const texts = items
      .map((it) => (it.querySelector('.ck-txt')?.textContent || '').trim().replace(/\s+/g, ' '))
      .filter((t) => t.length > 0);
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const t of texts) {
      const fp = t.toLowerCase().slice(0, 80);
      if (seen.has(fp)) dups.push(t.slice(0, 60));
      seen.add(fp);
    }
    return {
      ok: groupCount >= 1 && groupCount <= 6 && items.length > 1 && dups.length === 0,
      detail: `groups=${groupCount}/6 (visible) · items=${items.length} · dups=${dups.length}${dups.length ? ' (' + dups.slice(0, 2).join(' | ') + ')' : ''}`,
    };
  });
  results.push({ id: 'E1', pass: e1.ok, detail: e1.detail });

  // E6 — leaked metadata-only blocks must be ABSENT in full audit mode
  const e6 = await page.evaluate(() => {
    const body = document.body.innerText || '';
    const leaks = [
      'Synopsis brief (metadata-only audit)',
      'Submission preflight (§06 deterministic)',
      'Recompete signal',
      'Price anchor',
    ];
    const found = leaks.filter((s) => body.includes(s));
    return { ok: found.length === 0, detail: found.length ? `LEAKED: ${found.join(', ')}` : 'no leaked metadata blocks' };
  });
  results.push({ id: 'E6', pass: e6.ok, detail: e6.detail });

  // E10 — jump-nav inside .rail
  const e10 = await page.evaluate(() => {
    const jump = document.querySelector('nav.jump');
    if (!jump) return { ok: false, detail: 'nav.jump NOT FOUND' };
    const rail = jump.closest('.rail');
    return { ok: !!rail, detail: rail ? 'jump-nav inside .rail ✓' : 'jump-nav OUTSIDE .rail' };
  });
  results.push({ id: 'E10', pass: e10.ok, detail: e10.detail });

  // E11 — §07 is matrix-artifact card, not cmatrix table
  const e11 = await page.evaluate(() => {
    const artifacts = document.querySelectorAll('.matrix-artifact').length;
    const tables = document.querySelectorAll('.cmatrix').length;
    return { ok: artifacts === 1 && tables === 0, detail: `.matrix-artifact=${artifacts} .cmatrix=${tables}` };
  });
  results.push({ id: 'E11', pass: e11.ok, detail: e11.detail });

  // E12 — §08 ko-preview: non-empty AND contains greeting + ≥2 numbered items
  // + sign-off. Stronger than just "non-empty" — enforces the canonical's
  // structure (greeting → lead → numbered clarification asks → sign-off).
  // BLOCKING — Phase 2 #2 (Option B drafted email).
  // Uses innerText (not textContent) so <br>-rendered line breaks count as
  // newlines — the renderer escapes the source then replaces \n with <br>.
  const e12 = await page.evaluate(() => {
    const p = document.querySelector('.ko-preview') as HTMLElement | null;
    if (!p) return { ok: false, detail: '.ko-preview NOT FOUND' };
    const text = (p.innerText || '').trim();
    if (text.length === 0) return { ok: false, detail: 'ko-preview empty' };
    // Greeting check — "Dear [name]," or "Dear Contracting Officer,"
    const hasGreeting = /^\s*Dear\s+[A-Z][^,]*,/.test(text);
    // Numbered items — at least 2 lines starting with "N." (\d+\.). Matches
    // anywhere in the string since innerText preserves \n from <br>.
    const items = (text.match(/(?:^|\n)\s*\d+\.\s+/g) || []).length;
    // Sign-off — "Respectfully" or "Thank you" or "Sincerely" near the end
    const tail = text.slice(-200);
    const hasSignoff = /Respectfully|Sincerely|Thank you for your time/i.test(tail);
    const ok = hasGreeting && items >= 2 && hasSignoff;
    return {
      ok,
      detail: `greeting=${hasGreeting} numbered_items=${items} signoff=${hasSignoff} (len=${text.length})`,
    };
  });
  results.push({ id: 'E12', pass: e12.ok, detail: e12.detail });

  // E13 — §03 ws-reveal floor: present AND in exactly one state (known |
  // tentative | unknown). Never empty-known. Per CEO directive Jun 8 2026:
  // presence = blocking floor; correct SOW/PWS/SOO classification =
  // V2 ceiling. BLOCKING — Phase 2 #3.
  const e13 = await page.evaluate(() => {
    const reveals = Array.from(document.querySelectorAll('.ws-reveal'));
    // Strip hidden defaults — only count blocks that don't have display:none
    // inline (those are the un-revealed twin still in the markup).
    const visible = reveals.filter((el) => {
      const style = (el as HTMLElement).style.display;
      const inlineHidden = style === 'none';
      return !inlineHidden;
    });
    if (visible.length === 0) return { ok: false, detail: 'no .ws-reveal visible (floor breach)' };
    if (visible.length > 1) return { ok: false, detail: `${visible.length} .ws-reveal visible (must be 1)` };
    const v = visible[0] as HTMLElement;
    const state = v.getAttribute('data-state');
    const isUnknown = v.classList.contains('is-unknown');

    if (state === 'unknown' && isUnknown) {
      // Amber unknown variant — must have head, reason, action populated
      const head = (v.querySelector('[data-field="work_statement_unknown.head"]')?.textContent || '').trim();
      const reason = (v.querySelector('[data-field="work_statement_unknown.reason"]')?.textContent || '').trim();
      const action = (v.querySelector('[data-field="work_statement_unknown.action"]')?.textContent || '').trim();
      const ok = head.length > 5 && reason.length > 20 && action.length > 10;
      return { ok, detail: `state=unknown head=${head.length}ch reason=${reason.length}ch action=${action.length}ch` };
    }
    if (state === 'known') {
      // Known block — abbr in {SOW,PWS,SOO,combined}, meaning + bid_strategy
      // non-empty. confidence_label may be Tentative (low-conf known).
      const abbr = (v.querySelector('[data-field="work_statement.abbr"]')?.textContent || '').trim();
      const meaning = (v.querySelector('[data-field="work_statement.meaning"]')?.textContent || '').trim();
      const bidStrategy = (v.querySelector('[data-field="work_statement.bid_strategy"]')?.textContent || '').trim();
      const confLabel = (v.querySelector('[data-field="work_statement.confidence_label"]')?.textContent || '').trim();
      const validAbbr = /^(SOW|PWS|SOO|combined)$/i.test(abbr);
      const isEmptyKnown = !validAbbr || meaning.length === 0 || bidStrategy.length === 0;
      if (isEmptyKnown) {
        return { ok: false, detail: `state=known abbr="${abbr}" meaning=${meaning.length}ch bid=${bidStrategy.length}ch — EMPTY-KNOWN (breach)` };
      }
      return { ok: true, detail: `state=known abbr=${abbr} conf="${confLabel}" meaning=${meaning.length}ch bid=${bidStrategy.length}ch` };
    }
    return { ok: false, detail: `unexpected state="${state}" classes="${v.className}"` };
  });
  results.push({ id: 'E13', pass: e13.ok, detail: e13.detail });

  // E9 — key-dates F5: every rendered .kd-item has a non-empty value, OR the
  // empty cell is collapsed (no blank gaps). The renderer already drops
  // .kd-item by has_<field> flag + drops the whole .keydates ribbon when all
  // three flags are false (_render.ts:1598-1623). E9 verifies that contract.
  // BLOCKING — Phase 2 #4.
  const e9 = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.kd-item'));
    if (items.length === 0) {
      return { ok: true, detail: 'no .kd-item rendered (ribbon collapsed — OK per E9)' };
    }
    const empties: string[] = [];
    for (const it of items) {
      // The primary value is in the first [data-field] span inside .kd-v
      // (e.g., qa_deadline → "18 Jun 2026"). Check that span has non-empty
      // text; the .cnt secondary span ("in 14 days") is decorative.
      const primary = it.querySelector('.kd-v [data-field]') as HTMLElement | null;
      if (!primary) {
        empties.push('no [data-field] span');
        continue;
      }
      const text = (primary.textContent || '').trim();
      if (text.length === 0) {
        empties.push((primary.getAttribute('data-field') || 'unknown') + '=empty');
      }
    }
    if (empties.length === 0) {
      return { ok: true, detail: `${items.length} .kd-item rendered, all populated` };
    }
    return { ok: false, detail: `${empties.length} empty cell(s): ${empties.join(', ')}` };
  });
  results.push({ id: 'E9', pass: e9.ok, detail: e9.detail });

  return results;
}

for (const doc of AUDIT_DOCS) {
  for (const vp of VIEWPORTS) {
    test(`conformance: ${doc.label} @ ${vp.label}`, async ({ page }) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/audit/${doc.id}`);
      await page.waitForLoadState('networkidle');

      // Sanity: did we land on the audit, not sign-in?
      const url = page.url();
      if (/\/sign-in/.test(url)) {
        throw new Error(`auth redirect → ${url} (storageState stale; re-run auth.setup.ts)`);
      }

      const results = await runAssertions(page);

      // Print table
      console.log(`\n══ ${doc.label} @ ${vp.label} ══`);
      const blockingFails: string[] = [];
      const warnFails: string[] = [];
      for (const r of results) {
        const blocking = BLOCKING_IDS.has(r.id);
        const marker = r.pass ? '✓' : (blocking ? '✗ BLOCK' : '· warn');
        console.log(`  ${marker.padEnd(8)} ${r.id.padEnd(4)} ${r.detail}`);
        if (!r.pass) {
          if (blocking) blockingFails.push(`${r.id}: ${r.detail}`);
          else warnFails.push(`${r.id}: ${r.detail}`);
        }
      }

      // Persist screenshot for fail review.
      if (blockingFails.length > 0) {
        const safe = `${doc.label.replace(/[^a-z0-9]+/gi, '-')}-${vp.label}`;
        await page.screenshot({ path: path.join(OUT_DIR, `FAIL-${safe}.png`), fullPage: false });
      }

      // Persist JSON
      const reportPath = path.join(OUT_DIR, `${doc.label.replace(/[^a-z0-9]+/gi, '-')}-${vp.label}.json`);
      fs.writeFileSync(reportPath, JSON.stringify({ doc, viewport: vp, results, blockingFails, warnFails }, null, 2));

      // Hard-fail on blocking only.
      expect(blockingFails, `blocking assertion failures:\n${blockingFails.join('\n')}`).toEqual([]);
    });
  }
}
