// REPORT-TRUTH #4 — DETERMINISTIC CLIN SCHEDULE EXTRACTION (flag AUDIT_CLIN_SCHEDULE_EXTRACT, default OFF).
//
// WHAT THE GAUNTLET GOT HALF-RIGHT. It reported "the SF-1449 field layer yields LABELS WITHOUT VALUES (blocks
// 8/9/10/12)". The symptom is real — on run 95698f91 the SF-1449 cover page extracts as ~60 lines of pure form
// labels ("8. OFFER DUE DATE/LOCAL TIME", "21. QUANTITY", "23. UNIT PRICE") with not one value beside them. But the
// cause is not a broken field layer: the agency posted a BLANK SF-1449 template. There are no values in those blocks
// to extract, and nothing was dropped.
//
// WHAT IS ACTUALLY WRONG. The real schedule is sitting in the continuation sheets, fully extracted, and the engine
// never reads it. §B of that same source carries 26 line items with titles, quantities, units, pricing arrangement
// and NAICS:
//     0001 Moving and Edging   52 Each   Firm Fixed Price   NAICS 561730
//     0002 Weeding             52 Each
//     0003 Pruning and Tree Trimming     2 Each        … plus option CLINs 1005 / 2002 / 3005 / 4001
// Meanwhile the report's CLIN panel was scraping four-digit tokens out of finding PROSE a few hundred lines away and
// rendering a street number as a line item (REPORT-TRUTH #3). This module reads the schedule that is actually there.
//
// SHAPE, not vocabulary. A CLIN block is: a line beginning with a 4-digit item number, followed by attribute lines
// until the next item number. Attributes are matched by their own shape (a quantity is <digits> <unit-noun>; a
// pricing arrangement is the text after "Pricing Arrangement:"). Nothing here enumerates procurement concepts.
//
// BOUNDED TO §B — this is load-bearing. §E ("0001 Inspection and Acceptance Location") and §F ("0001 52 Each
// Quantity") restate the SAME item numbers for different purposes. An unbounded scan produces three conflicting
// blocks per CLIN and silently keeps whichever came last. The scan therefore runs ONLY between the §B header and the
// next UCF section header; the period of performance is read separately from §F, keyed by item number.
//
// FAILURE DIRECTION: every attribute is OMITTED when not found, never defaulted (REPORT-TRUTH #3's compute-or-absent
// rule). An extractor that guesses is worse than the panel it replaces.

/** One extracted line item. Every field except `clin` is optional and absent when the source did not state it. */
export interface ClinScheduleRow {
  clin: string;
  title?: string;
  qtyUnit?: string;
  type?: string;
  period?: string;
}

const SECTION_HEADER = /^\s*Section\s+([A-M])\b\s*[-–—]/i;
/** A schedule item number: exactly 4 digits at line start, optional 2-letter SLIN suffix, then end-of-line or text. */
const ITEM_LINE = /^\s*(\d{4}[A-Z]{0,2})(?:\s+(.*))?$/;
/** <count> <unit-noun> — the unit set is closed over federal schedule units, and is matched only INSIDE a §B item
 *  block, so it cannot pick up a stray quantity from prose elsewhere in the document. */
const QTY_UNIT = /\b(\d{1,6}(?:,\d{3})*)\s+(Each|EA|Lot|LO|Job|JB|Month|MO|Months|Hour|HR|Hours|Day|DY|Days|Year|YR|Years|Week|WK|Square Feet|SF|Acre|AC|Gallon|GL|Pound|LB|Ton|Unit|Set)\b/i;
const PRICING = /Pricing\s+Arrangement:\s*(.*)$/i;
const PERIOD_FROM = /^\s*From\s*$/i;

/** Line index range [start, end) of a UCF section's body, or null when the header is absent. */
function sectionRange(lines: string[], letter: string): { start: number; end: number } | null {
  const start = lines.findIndex((l) => { const m = SECTION_HEADER.exec(l); return !!m && m[1].toUpperCase() === letter; });
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = SECTION_HEADER.exec(lines[i]);
    if (m && m[1].toUpperCase() !== letter) { end = i; break; }
  }
  return { start: start + 1, end };
}

/** Page furniture the PDF extractor interleaves into the table — never part of an item's attributes. */
const NOISE = /^\s*(?:--\s*\d+\s+of\s+\d+\s*--|Page\s+\d+\s+of\s+\d+|[A-Z0-9]{10,}|)\s*$/;

/** Periods of performance from §F, keyed by item number. §F states them as: `<clin> …` then `Period of Performance`
 *  / `From` / `<date>` / `To` / `<date>`. Absent §F ⇒ empty map ⇒ every row simply carries no period. */
function periodsFromSectionF(lines: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const f = sectionRange(lines, "F");
  if (!f) return out;
  let current: string | null = null;
  for (let i = f.start; i < f.end; i++) {
    const m = ITEM_LINE.exec(lines[i]);
    if (m) { current = m[1]; continue; }
    if (!current) continue;
    if (PERIOD_FROM.test(lines[i]) && lines[i + 1] && lines[i + 3] && /^\s*To\s*$/i.test(lines[i + 2])) {
      const from = lines[i + 1].trim(), to = lines[i + 3].trim();
      if (from && to && !out.has(current)) out.set(current, `${from} – ${to}`);
    }
  }
  return out;
}

/** Extract the §B line-item schedule. Pure; deterministic; no model, no I/O. Returns [] when the source carries no
 *  §B section or no item lines within it — never a partial guess. */
export function extractClinSchedule(fullSource: string): ClinScheduleRow[] {
  const lines = (fullSource || "").split("\n");
  const b = sectionRange(lines, "B");
  if (!b) return [];
  const periods = periodsFromSectionF(lines);

  // Collect item blocks: an item line opens a block, the next item line (or the section end) closes it.
  const starts: Array<{ i: number; clin: string; rest: string }> = [];
  for (let i = b.start; i < b.end; i++) {
    const m = ITEM_LINE.exec(lines[i]);
    if (m) starts.push({ i, clin: m[1], rest: (m[2] ?? "").trim() });
  }
  if (!starts.length) return [];

  const rows: ClinScheduleRow[] = [];
  const seen = new Set<string>();
  for (let k = 0; k < starts.length; k++) {
    const { i, clin, rest } = starts[k];
    if (seen.has(clin)) continue;            // first statement of an item wins; §B should not restate, but never merge two
    seen.add(clin);
    const end = k + 1 < starts.length ? starts[k + 1].i : b.end;
    const block = lines.slice(i, end);

    // TITLE — the remainder of the item line, minus a quantity that shares it ("0004 Preventive Maintenance 2 Each").
    // A remainder that is ONLY an attribute fragment is not a title: option-year items extract as
    // "1005 North American Industry", where the NAICS label wrapped onto the item line and the title column is empty.
    let title: string | undefined;
    const restNoQty = rest.replace(QTY_UNIT, "").trim();
    if (restNoQty && !/^(North American Industry|Classification System|Product Service Code|Pricing Arrangement|Option|Line|Quantity)\b/i.test(restNoQty)) {
      title = restNoQty;
    }

    // QUANTITY / UNIT — from the item line if it carried one, else the first qty-shaped line in the block.
    let qtyUnit: string | undefined;
    const qOnLine = QTY_UNIT.exec(rest);
    if (qOnLine) qtyUnit = `${qOnLine[1]} ${qOnLine[2]}`;
    else {
      for (const l of block.slice(1)) {
        if (NOISE.test(l)) continue;
        const q = QTY_UNIT.exec(l.trim());
        // Only a line that is ENTIRELY a quantity — a qty embedded in prose is not this item's schedule quantity.
        if (q && l.trim() === q[0]) { qtyUnit = `${q[1]} ${q[2]}`; break; }
      }
    }

    // PRICING ARRANGEMENT — the value wraps across lines in the extracted text ("Pricing Arrangement: Firm Fixed" /
    // "Price"), so join the label's tail with following non-noise lines until the next attribute label.
    let type: string | undefined;
    for (let j = 0; j < block.length; j++) {
      const p = PRICING.exec(block[j]);
      if (!p) continue;
      const parts = [p[1].trim()];
      for (let n = j + 1; n < block.length; n++) {
        const t = block[n].trim();
        if (!t || NOISE.test(t) || QTY_UNIT.test(t) || /:/.test(t) || /^(Option|Line|Item)\b/i.test(t)) break;
        parts.push(t);
      }
      const joined = parts.join(" ").replace(/\s+/g, " ").trim();
      if (joined) type = joined;
      break;
    }

    const period = periods.get(clin);
    rows.push({ clin, ...(title ? { title } : {}), ...(qtyUnit ? { qtyUnit } : {}), ...(type ? { type } : {}), ...(period ? { period } : {}) });
  }
  return rows;
}
