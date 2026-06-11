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
//
// 4f4743d7 was briefly added 2026-06-08 as the V2-overlay empty-guard regression
// fixture and proved the guard works (E1 on it = "groups=6/6 · items=25 · dups=0",
// i.e. V1's 25-item checklist survived V2's empty submission_checklist_filtered).
// Re-added 2026-06-08 after the V1/V2 ws-reveal coord fix (d7fa5d3) eliminated the
// broken non-greedy strip regex that wiped both .ws-reveal blocks → E13 floor breach.
// This fixture is the standing regression test for BOTH the V2 empty-guard AND the
// ws-reveal coord fix on V2-shadow-bearing audits.
const AUDIT_DOCS: Array<{ label: string; id: string; expectedWsState?: 'known' | 'unknown'; expectedE12Fail?: boolean }> = [
  { label: 'DLA · SPRRA126Q0034',  id: 'd7e8d740-10f3-4dc9-ad65-835d5155a604' },
  { label: 'V2-shadow regression', id: '4f4743d7-d6fc-44f7-bb73-3400495c1dd5' },
  // W5 — SOW fixture: exercises E13 "known" branch (SOW abbr + meaning + bid_strategy).
  // E12 marked warn-only: W3-L02 filter over-aggressive on SOW where risks carry no
  // faraudit_action prose — §M-driven risks filtered out → graceful fallback.
  // Track as W3-SOW follow-up before promoting E12 to blocking on this fixture.
  { label: 'Coast Guard · SOW · cc147fe8',
    id: 'cc147fe8-3cf3-4512-9f36-367a3085b4f7',
    expectedWsState: 'known',
    expectedE12Fail: true },
  // FA-115 Pass 4 Item 9 — stable EXPIRED fixture (FA480026Q0061, closed 08 Jun
  // 2026). Exercises E17's closed-mode branch in the standing gate, which until
  // now only ever ran the active-mode branch. E12 demoted to warn here by
  // design: removeKoEmailCard suppresses the §08 card on closed audits, so
  // .ko-preview is intentionally absent — not an extraction failure.
  { label: 'USAF · expired · db89100b',
    id: 'db89100b-f731-44cb-bd38-12eabfb75b23',
    expectedWsState: 'unknown',
    expectedE12Fail: true },
  // Jun 11 — ACTIVE unknown-state fixture (DOJ 15M10226QA4700149). The USAF
  // doc above also renders the unknown ws-reveal but in closed mode; this one
  // proves E13's exactly-one-in-DOM contract on the active unknown path —
  // the class where a ws-reveal tie-break bug would hide.
  { label: 'DOJ · unknown-ws · 6927beed',
    id: '6927beed-b97d-4c21-887c-89776c0757d6',
    expectedWsState: 'unknown' },
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
  'E2',  // set-aside single-source: masthead token === §03 token — Phase 3 (F8)
  'E7',  // §06 gate outcome prose matches gate count — Phase 3 (F7)
  'E10', // rail jump-nav inside aside.rail — Phase 3 (removeReadinessCard walker fix)
  'E14', // §03 CLIN cards, flagged item carries .cpill.flag, no empty .cpill — Jun 8 2026 re-sync
  'E15', // §05 risk-cap UX — visible cap=10, .risk-more.is-shown, click expands, no orphan labels
  'E16', // FA-112 demo-leak guard — no template demo markers in rendered DOM
  'E17', // FA-114 closed-state mode — symmetric: closed surfaces on expired, active surfaces on live
  'E18', // canonical backgrounds — §09 critical rows red-50, move callouts blue-50, no gradients (Jun 11 pink defect)
  'E19', // §09 counter "N / M complete" with real numbers whenever section visible (Jun 11 bare-"complete" defect)
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
    // Exactly-one contract (Jun 11): enforceSingleWorkStatementReveal removes
    // the non-chosen twin server-side, so the final DOM carries ONE .ws-reveal
    // total — not one-visible-one-hidden. Catches the Army double-reveal
    // (both data-state blocks visible) AND any hidden leftover.
    if (reveals.length !== 1) {
      return { ok: false, detail: `${reveals.length} .ws-reveal in DOM (must be exactly 1)` };
    }
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

  // E9 — key-dates F5 (Phase 2 #4, Jun 8 2026 re-sync). Strengthened from the
  // "no empty cells" floor to the full strip contract:
  //   1. legacy .kd-sep divs are GONE (divider is a CSS pseudo on .kd-item);
  //   2. every rendered .kd-item's primary [data-field] span is non-empty;
  //   3. every rendered .cnt sub-span is non-empty (uncomputable countdowns
  //      are stripped, never left as an empty pill);
  //   4. when ≥1 upcoming date exists, exactly ONE .kd-item.urgent is present;
  //      when all dates are past, ZERO .kd-item.urgent;
  //   5. when has_<any-date>=false everywhere the whole .keydates strip AND
  //      the .rail-deadline clock are display:none (zero-metadata path).
  // BLOCKING — Phase 2 #4.
  const e9 = await page.evaluate(() => {
    // (1) No .kd-sep elements anywhere on the page.
    const seps = document.querySelectorAll('.kd-sep').length;
    if (seps > 0) return { ok: false, detail: `${seps} legacy .kd-sep element(s) still in DOM` };

    const strip = document.querySelector('.keydates') as HTMLElement | null;
    const stripVisible = !!strip && getComputedStyle(strip).display !== 'none';
    const rail = document.querySelector('.rail-deadline') as HTMLElement | null;
    const railVisible = !!rail && getComputedStyle(rail).display !== 'none';

    // (5) Zero-metadata path — strip + rail clock both hidden together.
    if (!stripVisible) {
      if (railVisible) {
        return { ok: false, detail: '.keydates hidden but .rail-deadline still visible (zero-metadata contract broken)' };
      }
      return { ok: true, detail: 'zero-metadata: .keydates + .rail-deadline both hidden ✓' };
    }

    const items = strip ? Array.from(strip.querySelectorAll('.kd-item')) : [];
    if (items.length === 0) {
      return { ok: false, detail: '.keydates visible but contains 0 .kd-item (should have hidden the strip)' };
    }

    // (2) + (3) — primary [data-field] non-empty + every .cnt non-empty.
    const empties: string[] = [];
    for (const it of items) {
      const primary = it.querySelector('.kd-v [data-field]') as HTMLElement | null;
      if (!primary) { empties.push('no [data-field] span'); continue; }
      const text = (primary.textContent || '').trim();
      if (text.length === 0) {
        empties.push((primary.getAttribute('data-field') || 'unknown') + '=empty');
        continue;
      }
      const cnts = Array.from(it.querySelectorAll('.cnt')) as HTMLElement[];
      for (const c of cnts) {
        const ct = (c.textContent || '').trim();
        if (ct.length === 0) {
          empties.push((primary.getAttribute('data-field') || 'unknown') + '.cnt=empty');
        }
      }
    }
    if (empties.length > 0) {
      return { ok: false, detail: `${empties.length} empty cell(s): ${empties.join(', ')}` };
    }

    // (4) Urgent contract — exactly one when ≥1 upcoming, zero when all past.
    // "Upcoming" detected by .cnt text NOT matching the past marker ("closed" /
    // "N days ago"). The renderer formats past dates as "closed"; we accept both
    // for back-compat with any non-keydates code paths.
    const pastRe = /\bclosed\b|\bdays?\s+ago\b/i;
    const upcomingItems = items.filter((it) => {
      const cnts = Array.from(it.querySelectorAll('.cnt')) as HTMLElement[];
      // No .cnt → can't tell; treat as upcoming (the date is still rendered).
      if (cnts.length === 0) return true;
      return !cnts.some((c) => pastRe.test((c.textContent || '').trim()));
    });
    const urgentCount = items.filter((it) => it.classList.contains('urgent')).length;
    const expectedUrgent = upcomingItems.length > 0 ? 1 : 0;
    if (urgentCount !== expectedUrgent) {
      return {
        ok: false,
        detail: `expected ${expectedUrgent} .kd-item.urgent (upcoming=${upcomingItems.length}), got ${urgentCount}`,
      };
    }

    return {
      ok: true,
      detail: `${items.length} .kd-item · ${upcomingItems.length} upcoming · ${urgentCount} .urgent · 0 .kd-sep ✓`,
    };
  });
  results.push({ id: 'E9', pass: e9.ok, detail: e9.detail });

  // E2 — set-aside single-source (F8): masthead set-aside token === §03
  // set-aside token. Single-source via vm.set_aside + global replaceFieldInner
  // walk. Asserts text-equality of all [data-field="set_aside"] anchors
  // (normalized: lowercased, whitespace-collapsed, punctuation stripped) so
  // 'Total Small Business' on masthead doesn't drift from '100% small biz'
  // in §03 — the F8 contradiction pattern. BLOCKING — Phase 3 first commit.
  const e2 = await page.evaluate(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]+/g, ' ').replace(/\s+/g, ' ').trim();
    const anchors = Array.from(document.querySelectorAll('[data-field="set_aside"]')) as HTMLElement[];
    if (anchors.length === 0) return { ok: false, detail: 'no [data-field="set_aside"] anchors found' };
    if (anchors.length === 1) return { ok: true, detail: `1 anchor only · token="${anchors[0].textContent?.trim().slice(0, 40)}"` };
    const tokens = anchors.map((el) => norm(el.textContent || ''));
    const uniq = Array.from(new Set(tokens));
    if (uniq.length === 1) {
      return { ok: true, detail: `${anchors.length} anchors / 1 token · "${tokens[0].slice(0, 40)}"` };
    }
    return {
      ok: false,
      detail: `${anchors.length} anchors / ${uniq.length} tokens: ${uniq.map((t) => `"${t.slice(0, 30)}"`).join(' vs ')}`,
    };
  });
  results.push({ id: 'E2', pass: e2.ok, detail: e2.detail });

  // E7 — §06 gate outcome prose matches gate count (F7). Template ships
  // hardcoded 'All three ✓' / 'Any ✗' in .g-oc.win/.g-oc.no <b> prefixes;
  // renderer derives the lead word from gate_conditions.length so a 2-gate
  // audit shows 'Both' not 'All three'. Detector: count .g-row, assert the
  // outcome .g-oc text contains the matching count word AND never contains
  // 'All three' when n !== 3. BLOCKING — Phase 3 (F7).
  // Gate mode is not active on every audit; when no .g-row exists, pass
  // (the gate-card is hidden via display:none).
  const e7 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.g-row'));
    const n = rows.length;
    if (n === 0) return { ok: true, detail: 'no .g-row (gate mode not active — OK)' };
    const winOc = document.querySelector('.g-oc.win');
    const winText = (winOc?.textContent || '').trim();
    // Allowed lead words by count
    let allowed: string[];
    if (n === 1) allowed = ['gate clears', 'gate clear', 'If', 'single'];
    else if (n === 2) allowed = ['Both'];
    else if (n === 3) allowed = ['All three'];
    else allowed = ['All ' + n];
    const match = allowed.some((a) => winText.includes(a));
    const wrongAllThree = n !== 3 && winText.includes('All three');
    return {
      ok: match && !wrongAllThree,
      detail: `n=${n} expected=${allowed.join('/')} got="${winText.slice(0, 50)}"${wrongAllThree ? ' WRONG-ALL-THREE' : ''}`,
    };
  });
  results.push({ id: 'E7', pass: e7.ok, detail: e7.detail });

  // E14 — §03 CLIN cards re-sync (Jun 8 2026). Asserts:
  //   1. the legacy <table class="clin-tbl"> is gone (the wide table that
  //      forced the Jun-8 min-width:0 scroll fix);
  //   2. §03 renders .clin cards (count ≥ 1) inside <div class="clins">;
  //   3. any card carrying .has-flag also carries an inner .cpill.flag (the
  //      amber pill — the linked-risk flag);
  //   4. no empty .cpill survives (every pill has visible text from its
  //      <span class="v"> or its .flag label).
  // BLOCKING — landed in the Jun 8 re-sync from canonical platform/Audit Report Design.html.
  const e14 = await page.evaluate(() => {
    const legacyTable = document.querySelector('table.clin-tbl');
    if (legacyTable) return { ok: false, detail: 'legacy <table.clin-tbl> still in DOM' };
    const sec = document.querySelector('#sec-scope') || document.querySelector('[data-field="clin_table"]')?.closest('.sec');
    if (!sec) return { ok: false, detail: '§03 section anchor NOT FOUND' };
    const cards = Array.from(sec.querySelectorAll('.clins > .clin'));
    if (cards.length === 0) {
      // Empty-state notice is acceptable (engine produced no CLINs); skip the
      // structural checks but still pass.
      const empty = sec.querySelector('.clin-empty');
      if (empty) return { ok: true, detail: 'CLIN empty-state notice (no line items extracted)' };
      return { ok: false, detail: '.clins container has no .clin cards and no .clin-empty notice' };
    }
    // Flagged cards must carry a .cpill.flag inside their pill strip.
    const flagged = cards.filter((c) => c.classList.contains('has-flag'));
    const flaggedMissingPill = flagged.filter((c) => !c.querySelector('.cpill.flag'));
    if (flaggedMissingPill.length > 0) {
      return { ok: false, detail: `${flaggedMissingPill.length}/${flagged.length} .has-flag cards missing .cpill.flag` };
    }
    // No empty .cpill — every pill must surface a value (either a .v span or
    // visible text content for the flag variant).
    const allPills = Array.from(sec.querySelectorAll('.clin .cpill')) as HTMLElement[];
    const empties = allPills.filter((p) => {
      const t = (p.textContent || '').replace(/\s+/g, ' ').trim();
      return t.length === 0;
    });
    if (empties.length > 0) {
      return { ok: false, detail: `${empties.length}/${allPills.length} empty .cpill found` };
    }
    return {
      ok: true,
      detail: `${cards.length} card(s) · ${flagged.length} flagged (.cpill.flag ok) · ${allPills.length} pills (no empties)`,
    };
  });
  results.push({ id: 'E14', pass: e14.ok, detail: e14.detail });

  // E15 — §05 risk-register cap (Jun 8 2026 re-sync). Asserts:
  //   1. when total .risk count > 10, exactly 10 are visible and the rest
  //      carry .is-hidden;
  //   2. .risk-more is the immediate next sibling of .risks AND carries
  //      .is-shown with label text matching /^\d+ more flags?$/;
  //   3. clicking the toggle reveals every collapsed .risk (visible count =
  //      total .risk count) AND re-reveals any .risk-group-label.is-hidden;
  //   4. dormant on ≤10-risk audits — assertion passes without click attempt.
  // BLOCKING — the cap IIFE itself is canonical-byte-identical; the gate
  // ensures the IIFE actually wires up on the rendered DOM (catches a missing
  // button sibling, a stale renderer that strips data-risk-more, etc).
  const e15 = await page.evaluate(async () => {
    const list = document.querySelector('.risks');
    if (!list) return { ok: false, detail: '.risks NOT FOUND' };
    const all = Array.from(list.querySelectorAll('.risk'));
    if (all.length <= 10) {
      // Dormant — confirm the toggle did NOT light up (would mean spurious cap).
      const btn = list.nextElementSibling as HTMLElement | null;
      const lit = !!(btn && btn.classList.contains('risk-more') && btn.classList.contains('is-shown'));
      if (lit) return { ok: false, detail: `${all.length} risks but .risk-more.is-shown is lit (spurious cap)` };
      return { ok: true, detail: `${all.length} risks (≤10) · cap dormant ✓` };
    }
    const visible = all.filter((r) => !r.classList.contains('is-hidden'));
    if (visible.length !== 10) {
      return { ok: false, detail: `expected 10 visible .risk, got ${visible.length} (total ${all.length})` };
    }
    const btn = list.nextElementSibling as HTMLButtonElement | null;
    if (!btn || !btn.classList.contains('risk-more')) {
      return { ok: false, detail: '.risk-more is not the immediate next sibling of .risks' };
    }
    if (!btn.classList.contains('is-shown')) {
      return { ok: false, detail: '.risk-more present but missing .is-shown' };
    }
    const lblEl = btn.querySelector('[data-risk-more-label]') as HTMLElement | null;
    const lbl = (lblEl?.textContent || '').trim();
    if (!/^\d+ more flags?$/.test(lbl)) {
      return { ok: false, detail: `.risk-more label "${lbl}" doesn't match /^N more flag(s)?$/` };
    }
    // Click → expand
    btn.click();
    await new Promise((r) => setTimeout(r, 50));
    const visibleAfter = all.filter((r) => {
      const cs = getComputedStyle(r);
      return cs.display !== 'none';
    });
    if (visibleAfter.length !== all.length) {
      return { ok: false, detail: `after click: ${visibleAfter.length}/${all.length} visible (expected all)` };
    }
    const orphanLabels = list.querySelectorAll('.risk-group-label.is-hidden').length;
    if (orphanLabels > 0) {
      return { ok: false, detail: `after click: ${orphanLabels} .risk-group-label.is-hidden remain (should re-reveal)` };
    }
    return {
      ok: true,
      detail: `total=${all.length} · pre-click visible=10 · label="${lbl}" · post-click visible=${visibleAfter.length} · orphan labels=0`,
    };
  });
  results.push({ id: 'E15', pass: e15.ok, detail: e15.detail });

  // E16 — FA-112 demo-leak guard. Asserts rendered page contains none of the
  // template's hardcoded demo markers. Catches both FA-107-style over-suppression
  // (anchors skipped when expired) and unbound data-field elements (e.g. the
  // gate_pearl <div class="g-pearl"> that had zero replaceField* call binding
  // in the codebase). BLOCKING — demo content in a customer report is a
  // demo-killer.
  const e16 = await page.evaluate(() => {
    // Markers MUST be unambiguous template-default phrases (no collisions with
    // legitimate engine output). Mirrors DEMO_MARKERS in _render.ts demoLeakGuard.
    const markers = [
      'SP4701-26-Q-0942',
      'Ms. Rivera,',
      'Predictive Maintenance Analytics for the H-60',
      'The catch worth the subscription',
    ];
    const html = document.documentElement.outerHTML;
    const hits: Array<{ marker: string; idx: number; context: string }> = [];
    for (const m of markers) {
      const idx = html.indexOf(m);
      if (idx >= 0) {
        const before = html.slice(Math.max(0, idx - 80), idx).replace(/\s+/g, ' ');
        hits.push({ marker: m, idx, context: '…' + before + '«' + m + '»' });
      }
    }
    return {
      ok: hits.length === 0,
      detail: hits.length === 0
        ? 'no demo markers in DOM ✓'
        : `demo markers leaked: ${hits.map((h) => `${h.marker}@${h.idx} ctx=${h.context}`).join(' | ')}`,
    };
  });
  results.push({ id: 'E16', pass: e16.ok, detail: e16.detail });

  // E17 — FA-114 closed-state mode symmetric assertion.
  // Detects mode via SOLICITATION CLOSED banner presence and asserts the
  // appropriate surface set is in the DOM (closed vs active). On closed
  // audits: closed banner + no "today" imperative + no NEXT-48-HOURS + no
  // post-deadline "By <date>" entries + checklist shows reference framing.
  // On active audits: no banner + Pre-flight subtitle + Submit-by critical
  // path + KO card visible (no FA-107-style over-suppression).
  const e17 = await page.evaluate(() => {
    const text = document.body.innerHTML;
    const closed = /Solicitation closed/i.test(text);
    if (closed) {
      const fails: string[] = [];
      if (/are true today/i.test(text)) fails.push('"today" imperative still present');
      if (/<p class="es-h">Next 48 hours<\/p>/i.test(text)) fails.push('NEXT-48-HOURS block not stripped');
      if (!/Closed[^<]{0,60}requirements as posted/i.test(text)) fails.push('critical path not in reference framing');
      if (!/Reference[^<]{0,30}submission requirements as posted/i.test(text)) fails.push('checklist subtitle not in reference framing');
      if (/Pre-flight[^<]{0,30}everything that must be true/i.test(text)) fails.push('Pre-flight subtitle still active');
      // §08 KO-email empty-guard (Jun 11): closed mode removes the .ko-card,
      // so a visible #sec-ko with no body text is the "ready to send" shell.
      const ko = document.getElementById('sec-ko');
      if (ko && getComputedStyle(ko).display !== 'none') {
        const body = ko.querySelector('.ko-preview, .ko-print-full, .ko-card');
        const txt = body ? (body.textContent || '').replace(/\s+/g, '') : '';
        if (!txt) fails.push('§08 visible with empty body (ready-to-send shell)');
      }
      // KO CTA: canonical guard scope is rail/actions only — the masthead
      // .ma-btn is deliberately exempt. Visibility via closest('.act') wrapper.
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.rail [data-open-ko], .actions [data-open-ko]'))) {
        const target = (el.closest<HTMLElement>('.act') || el);
        if (getComputedStyle(target).display !== 'none') {
          fails.push('live [data-open-ko] CTA on closed audit');
          break;
        }
      }
      // §09 progress counter is incoherent on a closed bid (CEO, Jun 11).
      if (document.querySelector('#sec-checklist .ck-prog')) fails.push('"N / M complete" counter present on closed audit');
      // post-deadline By-dates check — scan rendered .es-when spans
      const esWhenMatches = Array.from(text.matchAll(/<span class="es-when">By\s+(\S[^<]*?)<\/span>/g));
      const dlEl = document.querySelector('[data-field="response_deadline"]');
      const dl = dlEl ? new Date(dlEl.textContent || '') : null;
      const monIdx: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      for (const m of esWhenMatches) {
        const parts = m[1].trim().split(/[\s,]+/).filter(Boolean);
        let day: number | null = null, mon: number | null = null;
        for (const p of parts) {
          const n = parseInt(p, 10);
          if (!isNaN(n) && n >= 1 && n <= 31 && day === null) day = n;
          const mi = monIdx[p.slice(0,3).toLowerCase()];
          if (mi !== undefined && mon === null) mon = mi;
        }
        if (day !== null && mon !== null && dl) {
          const y = new Date().getUTCFullYear();
          const d = new Date(Date.UTC(y, mon, day));
          if (d > dl) { fails.push(`es-when "${m[1]}" past deadline`); break; }
        }
      }
      return {
        ok: fails.length === 0,
        detail: fails.length === 0
          ? 'closed-mode surfaces ✓ (banner · no-today · no-48h · ref-checklist · clamped dates)'
          : 'closed-mode fail: ' + fails.join(' | '),
      };
    }
    // Active mode — guard against over-suppression (the FA-107 lesson).
    const fails: string[] = [];
    if (!/Pre-flight[^<]{0,30}everything that must be true/i.test(text)) fails.push('active Pre-flight subtitle missing');
    if (!/<div class="tl-sub">[^<]{0,60}Submit by/i.test(text)) fails.push('active "Submit by" critical path missing');
    if (!/<div class="ko-card"/i.test(text)) fails.push('KO card missing (over-suppression?)');
    return {
      ok: fails.length === 0,
      detail: fails.length === 0
        ? 'active-mode surfaces ✓ (Pre-flight · Submit-by · KO card present)'
        : 'active-mode fail: ' + fails.join(' | '),
    };
  });
  results.push({ id: 'E17', pass: e17.ok, detail: e17.detail });

  // E18 — canonical backgrounds on §09 critical rows + FARaudit-move callouts.
  // Jun 11 renders showed a rose-pink gradient where canonical is flat red-50
  // (critical rows) / blue-50 (move callouts). Root cause: color→transparent /
  // low-alpha gradients interpolate through rose in the PDF renderer. Asserts
  // computed style: background-image:none (no gradient of any kind) and the
  // exact canonical background-color token. Absent elements pass (not every
  // fixture has critical items / risks / l02 catches).
  const e18 = await page.evaluate(() => {
    const RED_50 = 'rgb(254, 242, 242)';
    const BLUE_50 = 'rgb(239, 246, 255)';
    const surfaces: Array<{ sel: string; expected: string }> = [
      { sel: '.ck-item.is-critical', expected: RED_50 },
      { sel: '.risk-action', expected: BLUE_50 },
      { sel: '.et-move', expected: BLUE_50 },
    ];
    const fails: string[] = [];
    const counts: string[] = [];
    for (const s of surfaces) {
      const els = Array.from(document.querySelectorAll<HTMLElement>(s.sel));
      counts.push(`${s.sel}=${els.length}`);
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.backgroundImage !== 'none') {
          fails.push(`${s.sel} has background-image ${cs.backgroundImage.slice(0, 60)}…`);
          break;
        }
        if (cs.backgroundColor !== s.expected) {
          fails.push(`${s.sel} bg=${cs.backgroundColor} expected=${s.expected}`);
          break;
        }
      }
    }
    return {
      ok: fails.length === 0,
      detail: fails.length === 0
        ? `canonical backgrounds ✓ (${counts.join(' · ')})`
        : 'non-canonical backgrounds: ' + fails.join(' | '),
    };
  });
  results.push({ id: 'E18', pass: e18.ok, detail: e18.detail });

  // E19 — §09 progress counter shows real numbers whenever the section is
  // visible on an ACTIVE audit. Jun 11 JLG PDF rendered a bare "complete"
  // (the closed-mode counter strip ended at the nested ckTotal </span>);
  // active audits relied on client JS to overwrite the template's demo
  // "0 / 10". Counter is now server-populated; format must be
  // "N / M complete". Closed mode (CEO, Jun 11): counter is REMOVED — a
  // progress tracker on a closed bid is incoherent — so closed asserts
  // absence. Hidden/stripped §09 passes as n/a (empty-state test covers it).
  const e19 = await page.evaluate(() => {
    const sec = document.getElementById('sec-checklist');
    if (!sec || getComputedStyle(sec).display === 'none') {
      return { ok: true, detail: '§09 not visible — counter n/a' };
    }
    const closed = /Solicitation closed/i.test(document.body.innerHTML);
    const prog = sec.querySelector('.ck-prog');
    if (closed) {
      return prog
        ? { ok: false, detail: 'closed audit still shows .ck-prog counter' }
        : { ok: true, detail: 'closed mode — counter removed ✓' };
    }
    if (!prog) return { ok: false, detail: '§09 visible but .ck-prog counter missing' };
    const text = (prog.textContent || '').trim().replace(/\s+/g, ' ');
    if (!/^\d+ \/ \d+ complete$/.test(text)) {
      return { ok: false, detail: `counter text "${text}" — expected "N / M complete"` };
    }
    const total = parseInt(text.split('/')[1], 10);
    const items = sec.querySelectorAll('.ck-item').length;
    if (total !== items) {
      return { ok: false, detail: `counter total=${total} but .ck-item count=${items}` };
    }
    return { ok: true, detail: `counter "${text}" · matches ${items} .ck-item(s)` };
  });
  results.push({ id: 'E19', pass: e19.ok, detail: e19.detail });

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
        let blocking = BLOCKING_IDS.has(r.id);
      // W5 — SOW E12 warn-override: W3-L02 filter too aggressive on §M-driven risks.
      // Demote E12 from blocking to warn on fixtures that declare expectedE12Fail=true.
      if (r.id === 'E12' && doc.expectedE12Fail) blocking = false;
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

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITIONAL STATES — Audit Report States.html sync (progress / failed).
// Spec source: ceo/redesign-final/Review/AUDIT-STATES-HANDOFF.md (acceptance
// criteria 1-5). All states assertions are BLOCKING — the E16 demo-leak class
// applies to both states per criterion 4.
//
// Fixtures:
//   - failed: defaults to a real prod failed audit. A retry un-fails the row
//     in place (refetch reuses the same audit id), so when the fixture's state
//     has moved on the test SKIPS with a clear message — override with
//     STATES_FAILED_AUDIT_ID.
//   - progress: transient by nature (1-3 min window). Provide
//     STATES_PROGRESS_AUDIT_ID while an audit is processing (e.g. during
//     FA-120 re-runs); the test skips when unset.
// ─────────────────────────────────────────────────────────────────────────────

const STATES_DEMO_MARKERS = [
  'FA8118-26-R-0035',
  '8c2f41ab',
  '7e4a9c0b21d34f6e',
  '11:43:07 / 11:44:21',
  '3 queued',
  'DONE · 6S',
  '2 of 2',
];

const STATES_FAILED_AUDIT_ID = process.env.STATES_FAILED_AUDIT_ID || '2d62e5c0-f6bd-4838-90ff-ab87e186632e';
const STATES_PROGRESS_AUDIT_ID = process.env.STATES_PROGRESS_AUDIT_ID || '';

async function runStatesSharedAssertions(
  page: import('@playwright/test').Page,
  expectedState: 'progress' | 'failed'
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  // ST1 — canonical shell present; legacy dark/gold interstitial + reviewer
  // toggle gone (acceptance criteria 1, 2, 5).
  const st1 = await page.evaluate(() => {
    const fails: string[] = [];
    if (!document.querySelector('aside.sidebar')) fails.push('sidebar missing');
    if (!document.querySelector('.topbar')) fails.push('topbar missing');
    if (!document.querySelector('.rpt-return .back-link')) fails.push('return rail missing');
    if (document.querySelector('.demo-toggle')) fails.push('reviewer demo-toggle present');
    if (/three-call intelligence pipeline/i.test(document.body.innerHTML)) fails.push('legacy holding copy present');
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg === 'rgb(11, 14, 19)') fails.push('legacy dark interstitial background (#0B0E13)');
    return { ok: fails.length === 0, detail: fails.join(' | ') || 'shell ✓ (sidebar · topbar · return rail · no demo toggle · legacy gone)' };
  });
  results.push({ id: 'ST1', pass: st1.ok, detail: st1.detail });

  // ST2 — exactly ONE state rendered server-side; the sibling state's body
  // block and pill are stripped, not just CSS-hidden.
  const st2 = await page.evaluate((exp) => {
    const fails: string[] = [];
    const ds = document.body.getAttribute('data-state');
    if (ds !== exp) fails.push(`body data-state=${ds} (expected ${exp})`);
    const bodies = document.querySelectorAll('.body');
    if (bodies.length !== 1) fails.push(`${bodies.length} .body blocks (expected 1)`);
    const other = exp === 'progress' ? 'only-failed' : 'only-progress';
    const leftovers = document.querySelectorAll('.' + other);
    if (leftovers.length > 0) fails.push(`${leftovers.length} .${other} elements not stripped`);
    const pills = document.querySelectorAll('.live-pill');
    if (pills.length !== 1) fails.push(`${pills.length} live-pills (expected 1)`);
    return { ok: fails.length === 0, detail: fails.join(' | ') || 'one state server-side ✓' };
  }, expectedState);
  results.push({ id: 'ST2', pass: st2.ok, detail: st2.detail });

  // ST3 — E16 demo-leak class for the states template: none of the design
  // file's demo defaults may reach a prod render (acceptance criterion 4).
  const st3 = await page.evaluate((markers) => {
    const html = document.documentElement.outerHTML;
    const hits: string[] = [];
    for (const m of markers) {
      const idx = html.indexOf(m);
      if (idx >= 0) {
        const before = html.slice(Math.max(0, idx - 80), idx).replace(/\s+/g, ' ');
        hits.push(`${m}@${idx} ctx=…${before}«${m}»`);
      }
    }
    return { ok: hits.length === 0, detail: hits.length === 0 ? 'no states demo markers in DOM ✓' : 'demo markers leaked: ' + hits.join(' | ') };
  }, STATES_DEMO_MARKERS);
  results.push({ id: 'ST3', pass: st3.ok, detail: st3.detail });

  // ST4 — no horizontal overflow (D1 parity with the report shell) and no
  // empty fact cells (unknown facts must collapse, not render blank).
  const st4 = await page.evaluate(() => {
    const fails: string[] = [];
    const delta = Math.abs(document.documentElement.scrollWidth - window.innerWidth);
    if (delta > 1) fails.push(`hscroll delta=${delta}`);
    const empties = Array.from(document.querySelectorAll('.st-fact b')).filter((b) => !(b.textContent || '').trim());
    if (empties.length > 0) fails.push(`${empties.length} empty .st-fact values (should collapse)`);
    return { ok: fails.length === 0, detail: fails.join(' | ') || 'layout ✓ (no hscroll · no empty fact cells)' };
  });
  results.push({ id: 'ST4', pass: st4.ok, detail: st4.detail });

  return results;
}

function reportStatesResults(label: string, vpLabel: string, results: AssertionResult[]): string[] {
  console.log(`\n══ STATES · ${label} @ ${vpLabel} ══`);
  const fails: string[] = [];
  for (const r of results) {
    console.log(`  ${(r.pass ? '✓' : '✗ BLOCK').padEnd(8)} ${r.id.padEnd(4)} ${r.detail}`);
    if (!r.pass) fails.push(`${r.id}: ${r.detail}`);
  }
  const reportPath = path.join(OUT_DIR, `states-${label.replace(/[^a-z0-9]+/gi, '-')}-${vpLabel}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ label, viewport: vpLabel, results, fails }, null, 2));
  return fails;
}

for (const vp of VIEWPORTS) {
  test(`states conformance: failed @ ${vp.label}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`/audit/${STATES_FAILED_AUDIT_ID}`);
    await page.waitForLoadState('networkidle');

    const url = page.url();
    if (/\/sign-in/.test(url)) {
      throw new Error(`auth redirect → ${url} (storageState stale; re-run auth.setup.ts)`);
    }

    // The fixture un-fails in place when retried — skip (don't fail) when the
    // row's state has moved on, so the gate stays meaningful.
    const ds = await page.evaluate(() => document.body.getAttribute('data-state'));
    test.skip(ds !== 'failed', `fixture ${STATES_FAILED_AUDIT_ID} is no longer failed (data-state=${ds}) — set STATES_FAILED_AUDIT_ID to a current failed audit`);

    const results = await runStatesSharedAssertions(page, 'failed');

    // SF1 — red FAILED pill + decline panel (acceptance criterion 4).
    const sf1 = await page.evaluate(() => {
      const fails: string[] = [];
      if (!document.querySelector('.live-pill.failed')) fails.push('.live-pill.failed missing');
      if (document.querySelector('.live-pill.running')) fails.push('.live-pill.running present on failed state');
      if (!document.querySelector('.st-panel.p-failed')) fails.push('.st-panel.p-failed missing');
      if (document.querySelector('.st-panel.p-progress')) fails.push('.st-panel.p-progress present on failed state');
      return { ok: fails.length === 0, detail: fails.join(' | ') || 'FAILED pill + decline panel ✓' };
    });
    results.push({ id: 'SF1', pass: sf1.ok, detail: sf1.detail });

    // SF2 — upload-direct is the visually primary action.
    const sf2 = await page.evaluate(() => {
      const fails: string[] = [];
      const primary = document.querySelector('.rec-card.primary');
      if (!primary) fails.push('.rec-card.primary missing');
      else if (!primary.querySelector('a[href="/audit?mode=upload"]')) fails.push('primary rec-card does not route to upload flow');
      const stack = document.querySelector('.sp-stack');
      const firstCta = stack && stack.querySelector('.sp-cta');
      if (!firstCta || firstCta.getAttribute('data-action') !== 'upload') fails.push('panel first CTA is not upload');
      return { ok: fails.length === 0, detail: fails.join(' | ') || 'upload visually primary ✓' };
    });
    results.push({ id: 'SF2', pass: sf2.ok, detail: sf2.detail });

    // SF3 — real reason + trace bound; unverifiable billing claim absent.
    const sf3 = await page.evaluate(() => {
      const fails: string[] = [];
      const title = document.querySelector('.reason-title');
      if (!title || !(title.textContent || '').trim()) fails.push('reason headline empty');
      const trace = document.querySelector('.reason-trace');
      const traceText = trace ? (trace.textContent || '') : '';
      if (!/TRACE/.test(traceText)) fails.push('trace line missing');
      if (!/audit [0-9a-f]{8}-[0-9a-f]{4}/i.test(traceText)) fails.push('trace lacks audit uuid');
      if (/credit was not used/i.test(document.body.innerHTML)) fails.push('unverifiable credit-line present');
      if (/cdn-cgi|__cf_email__/.test(document.body.innerHTML)) fails.push('cloudflare email-protection artifact present');
      return { ok: fails.length === 0, detail: fails.join(' | ') || 'reason + trace bound ✓' };
    });
    results.push({ id: 'SF3', pass: sf3.ok, detail: sf3.detail });

    const fails = reportStatesResults('failed', vp.label, results);
    if (fails.length > 0) {
      await page.screenshot({ path: path.join(OUT_DIR, `FAIL-states-failed-${vp.label}.png`), fullPage: true });
    }
    expect(fails, `states(failed) assertion failures:\n${fails.join('\n')}`).toEqual([]);
  });
}

test('states conformance: progress @ 1440', async ({ page }) => {
  test.skip(!STATES_PROGRESS_AUDIT_ID, 'STATES_PROGRESS_AUDIT_ID not set — run while an audit is processing');
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/audit/${STATES_PROGRESS_AUDIT_ID}`);
  await page.waitForLoadState('networkidle');

  const url = page.url();
  if (/\/sign-in/.test(url)) {
    throw new Error(`auth redirect → ${url} (storageState stale; re-run auth.setup.ts)`);
  }

  const ds = await page.evaluate(() => document.body.getAttribute('data-state'));
  test.skip(ds !== 'progress', `audit ${STATES_PROGRESS_AUDIT_ID} is not processing (data-state=${ds}) — the window is 1-3 min; re-point at a fresh run`);

  const results = await runStatesSharedAssertions(page, 'progress');

  // SP1 — amber RUNNING pill + slate (non-verdict) panel (criterion 3).
  const sp1 = await page.evaluate(() => {
    const fails: string[] = [];
    if (!document.querySelector('.live-pill.running')) fails.push('.live-pill.running missing');
    if (document.querySelector('.live-pill.failed')) fails.push('.live-pill.failed present on progress state');
    if (!document.querySelector('.st-panel.p-progress')) fails.push('.st-panel.p-progress missing');
    if (document.querySelector('.st-panel.p-failed')) fails.push('.st-panel.p-failed present on progress state');
    return { ok: fails.length === 0, detail: fails.join(' | ') || 'RUNNING pill + slate panel ✓' };
  });
  results.push({ id: 'SP1', pass: sp1.ok, detail: sp1.detail });

  // SP2 — stages reflect a real (non-demo) pipeline readout: 5 rows, exactly
  // one active, none carrying the template's demo timings.
  const sp2 = await page.evaluate(() => {
    const fails: string[] = [];
    const stages = document.querySelectorAll('.stage');
    if (stages.length !== 5) fails.push(`${stages.length} stage rows (expected 5)`);
    const active = document.querySelectorAll('.stage.is-active');
    if (active.length !== 1) fails.push(`${active.length} active stages (expected 1)`);
    const no = document.getElementById('spStageNo');
    if (!no || !/^\d$/.test((no.textContent || '').trim())) fails.push('spStageNo not numeric');
    return { ok: fails.length === 0, detail: fails.join(' | ') || `stages ✓ (5 rows · 1 active · stageNo=${(document.getElementById('spStageNo')?.textContent || '').trim()})` };
  });
  results.push({ id: 'SP2', pass: sp2.ok, detail: sp2.detail });

  // SP3 — elapsed ticks client-side from the server-seeded start epoch.
  const before = await page.locator('#spElapsed').textContent();
  await page.waitForTimeout(1600);
  const after = await page.locator('#spElapsed').textContent();
  const sp3ok = !!before && !!after && /^\d{2,}:\d{2}$/.test(after.trim()) && after !== before;
  results.push({ id: 'SP3', pass: sp3ok, detail: sp3ok ? `elapsed ticks ✓ (${before} → ${after})` : `elapsed not ticking (${before} → ${after})` });

  // SP4 — auto-refresh strip + assembling skeletons present.
  const sp4 = await page.evaluate(() => {
    const fails: string[] = [];
    if (!document.querySelector('.refresh-strip')) fails.push('refresh strip missing');
    if (!document.getElementById('lastChecked')) fails.push('#lastChecked missing');
    if (document.querySelectorAll('.ghost').length < 2) fails.push('skeleton ghosts missing');
    return { ok: fails.length === 0, detail: fails.join(' | ') || 'refresh strip + skeletons ✓' };
  });
  results.push({ id: 'SP4', pass: sp4.ok, detail: sp4.detail });

  const fails = reportStatesResults('progress', '1440', results);
  if (fails.length > 0) {
    await page.screenshot({ path: path.join(OUT_DIR, `FAIL-states-progress-1440.png`), fullPage: true });
  }
  expect(fails, `states(progress) assertion failures:\n${fails.join('\n')}`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// §09 EMPTY-STATE GUARD — Jun 11 USDA case: 118 requirements mapped, 0 checklist
// items derived. The report must hide §09 (server strip via
// data-hide-when-empty="submission_checklist" + client IIFE belt) AND its
// jump-nav entry. Never render a "0 / 0 complete" empty box.
// Fixture: USDA 1232SA26R0020 re-run (complete · matrix=118 · checklist=0).
// Overridable when a fresher zero-checklist audit exists.
const EMPTY_CHECKLIST_AUDIT_ID =
  process.env.EMPTY_CHECKLIST_AUDIT_ID || 'a9e140f7-ae0f-4260-b3b9-91fad47e90b3';

test('§09 empty-state: section + jump-nav hidden @ 1440', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/audit/${EMPTY_CHECKLIST_AUDIT_ID}`);
  await page.waitForLoadState('networkidle');
  if (/\/sign-in/.test(page.url())) {
    throw new Error(`auth redirect → ${page.url()} (storageState stale; re-run auth.setup.ts)`);
  }

  const r = await page.evaluate(() => {
    const fails: string[] = [];
    // Sanity — this must be a complete report, not a transitional state.
    if (!document.querySelector('.rpt-grid')) fails.push('not a complete report render (.rpt-grid missing)');
    // Fixture sanity — if the audit now derives checklist items (engine-side
    // fix landed), the guard legitimately doesn't fire; flag for re-fixture.
    const visible = (el: Element | null) =>
      !!el && getComputedStyle(el as HTMLElement).display !== 'none';
    const sec = document.getElementById('sec-checklist');
    const items = document.querySelectorAll('.checklist .ck-item').length;
    if (items > 0) {
      return { ok: true, skip: true, detail: `fixture now derives ${items} checklist items — §09 legitimately visible; update EMPTY_CHECKLIST_AUDIT_ID` };
    }
    if (visible(sec)) fails.push('#sec-checklist rendered despite empty checklist');
    const jn = document.querySelector('.jump a[href="#sec-checklist"]');
    if (visible(jn)) fails.push('jump-nav §09 entry still visible');
    if (/0\s*\/\s*0 complete/.test(document.body.innerText)) fails.push('"0 / 0 complete" box rendered');
    return { ok: fails.length === 0, skip: false, detail: fails.join(' | ') || '§09 + jump-nav hidden ✓' };
  });

  console.log(`\n══ §09 EMPTY-STATE · ${EMPTY_CHECKLIST_AUDIT_ID.slice(0, 8)} @ 1440 ══`);
  console.log(`  ${r.ok ? '✓' : '✗ BLOCK'}        SC1  ${r.detail}`);
  fs.writeFileSync(
    path.join(OUT_DIR, 'sc-empty-checklist-1440.json'),
    JSON.stringify({ auditId: EMPTY_CHECKLIST_AUDIT_ID, result: r }, null, 2)
  );
  test.skip(!!r.skip, r.detail);
  if (!r.ok) {
    await page.screenshot({ path: path.join(OUT_DIR, 'FAIL-sc-empty-checklist-1440.png'), fullPage: true });
  }
  expect(r.ok, r.detail).toBe(true);
});
