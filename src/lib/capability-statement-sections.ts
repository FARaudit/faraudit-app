// CORE COMPETENCIES AND DIFFERENTIATORS — the one place that decides what a section contains.
//
// Two representations coexist and will for as long as profiles written before the structured
// columns existed are still on file:
//
//   core_competencies      TEXT   prose, split on newlines — one head per line, nothing else
//   core_competencies_json JSONB  [{k,h,b,s}] — the shape the card-825 plate actually draws
//
// Every reader must resolve them the same way or the page, the PDF and the pasted copy will
// disagree about the same profile. That is why this is a module and not a helper repeated in
// three renderers.
//
// NULL IS NOT []. A null structured column means "nobody has structured this yet", and the
// prose column is the answer. An empty array means "structured, and there is nothing in it",
// and the section is omitted under the empty-section rule. Collapsing the two would either
// resurrect prose the customer deleted or print a heading over nothing.

/** One competency as the plate draws it: kicker, head, body, spec line. Only `h` is required —
 *  an item with no head is not an item. */
export interface Competency { k?: string | null; h: string; b?: string | null; s?: string | null; }
/** One differentiator: head and body. */
export interface Differentiator { h: string; b?: string | null; }

export type SectionSource = "structured" | "legacy-text" | "empty";

export interface ResolvedSection<T> {
  items: T[];
  /** Where the items came from. `legacy-text` items carry a head and nothing else, which is
   *  all a single line of prose honestly is — the renderer must not invent the other fields. */
  source: SectionSource;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const orNull = (v: unknown): string | null => str(v) || null;

/** Split prose the way the exports have always split it, so a legacy profile renders exactly
 *  as it does today rather than being silently re-flowed by the new path. */
function linesOf(text: unknown): string[] {
  return String(text ?? "").split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
}

export function resolveCompetencies(row: {
  core_competencies?: string | null;
  core_competencies_json?: unknown;
}): ResolvedSection<Competency> {
  const raw = row.core_competencies_json;
  if (Array.isArray(raw)) {
    // Structured and present. A row with no head is dropped rather than printed as a blank
    // card — the same rule the exports already apply to a past-performance row with no title.
    const items = raw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({ k: orNull(x.k), h: str(x.h), b: orNull(x.b), s: orNull(x.s) }))
      .filter((x) => x.h.length > 0);
    return { items, source: items.length ? "structured" : "empty" };
  }
  const heads = linesOf(row.core_competencies);
  if (!heads.length) return { items: [], source: "empty" };
  return { items: heads.map((h) => ({ k: null, h, b: null, s: null })), source: "legacy-text" };
}

export function resolveDifferentiators(row: {
  differentiators?: string | null;
  differentiators_json?: unknown;
}): ResolvedSection<Differentiator> {
  const raw = row.differentiators_json;
  if (Array.isArray(raw)) {
    const items = raw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({ h: str(x.h), b: orNull(x.b) }))
      .filter((x) => x.h.length > 0);
    return { items, source: items.length ? "structured" : "empty" };
  }
  const heads = linesOf(row.differentiators);
  if (!heads.length) return { items: [], source: "empty" };
  return { items: heads.map((h) => ({ h, b: null })), source: "legacy-text" };
}

// ── the caps, enforced by REFUSING ────────────────────────────────────────────────────────
//
// Measured on the plate, card 825: a fourth competency is 78px off the page because the grid
// has three tracks; differentiators fit to 6 with 1px to spare and are 47px over at 8.
//
// The build REFUSES rather than truncating. Truncation is the silent overflow the whole card
// exists to prevent, and naming the remainder the way past performance does ("the 5 most
// recent of 12") reads as strength for awards and as "we cut your material" for competencies.
// Stopping puts the editorial decision — which three — with the only person who can make it.
export const COMPETENCY_COUNT = 3;
export const DIFFERENTIATOR_MAX = 6;

// ── PROSE THAT WAS NEVER SPLIT ────────────────────────────────────────────────────────────
//
// The legacy columns split on NEWLINES. A customer who typed four sentences on one line has
// ONE item whose head is a paragraph, and the plate draws that head as a claim.
//
// Competencies survive this by accident: the count is exact, so a single blob is 1 of 3 and
// refuses. Differentiators have only a CEILING of 6, so one run-on paragraph builds clean and
// downloads. That is how a test string reached a rendered capability statement — the field
// with no floor was the field carrying it.
//
// A COUNT FLOOR WAS REJECTED. One differentiator is legitimate, and a floor of 2 would refuse
// a customer who has exactly one thing to say. The defect is not "too few items", it is "this
// item is a paragraph" — so the recognizer reads SHAPE.
//
// FAILURE DIRECTION, BOTH MEASURED. Requiring a capital after the terminator is what keeps
// abbreviations out: the character before the period in "U.S. Air Force" is uppercase, and a
// decimal has no whitespace after it. The cost is that "fast quotes. always on time." reads as
// one sentence and passes. That miss is deliberate and it is the right way round — this gate
// BLOCKS a customer's export, so a wrong refusal costs more than a paragraph that slips
// through. It fails toward letting the document build.
const SENTENCE_BOUNDARY = /[a-z0-9)\]][.!?]+["')\]]?\s+["'(\[]?[A-Z]/g;

/** How many sentences one entry runs together. 1 means it is a single claim. */
export function sentencesIn(text: string): number {
  return (String(text ?? "").match(SENTENCE_BOUNDARY) || []).length + 1;
}

/** Entries that are paragraphs rather than claims. Scoped to `legacy-text` because that is the
 *  class observed: a structured head was authored as a head by whoever wrote the row, while a
 *  legacy line is only a head because a newline happened to make it one. */
function unsplitEntries<T extends { h: string }>(section: ResolvedSection<T>): number {
  if (section.source !== "legacy-text") return 0;
  return section.items.filter((i) => sentencesIn(i.h) > 1).length;
}

export interface BuildRefusal {
  field: "core_competencies" | "differentiators";
  /** What this refusal counts: items on file when `kind` is `count`, unsplit entries when `prose`. */
  count: number;
  kind: "count" | "prose";
  message: string;
}

function proseMessage(section: string, n: number): string {
  const subject = n === 1 ? "one entry runs" : `${n} entries run`;
  const verb = n === 1 ? "it prints" : "they print";
  return `The ${section} section splits on line breaks, and ${subject} several sentences together on a single line — so ${verb} as a run-on paragraph rather than as separate claims. Put each claim on its own line.`;
}

/** Returns every reason the document cannot be built, or [] when it can. Never mutates and
 *  never trims — a caller that wants to ship anyway has to say so in its own code, where the
 *  decision is visible. */
export function refusalsFor(row: {
  core_competencies?: string | null; core_competencies_json?: unknown;
  differentiators?: string | null; differentiators_json?: unknown;
}): BuildRefusal[] {
  const out: BuildRefusal[] = [];

  // A PROSE REFUSAL SUPERSEDES THE COUNT REFUSAL FOR THE SAME FIELD, and not for tidiness:
  // when the entries have not been separated the count is not yet knowable. Telling a customer
  // holding one four-sentence paragraph to "add 2 more" is wrong advice about a real defect.
  const comps = resolveCompetencies(row);
  const compProse = unsplitEntries(comps);
  const comp = comps.items.length;
  if (compProse) {
    out.push({ field: "core_competencies", count: compProse, kind: "prose", message: proseMessage("core competencies", compProse) });
  } else if (comp !== COMPETENCY_COUNT) {
    out.push({
      field: "core_competencies", count: comp, kind: "count",
      message: comp < COMPETENCY_COUNT
        ? `The capability statement prints exactly ${COMPETENCY_COUNT} core competencies and ${comp} ${comp === 1 ? "is" : "are"} on file. Add ${COMPETENCY_COUNT - comp} more.`
        : `The capability statement prints exactly ${COMPETENCY_COUNT} core competencies and ${comp} are on file. Choose the ${COMPETENCY_COUNT} to print — a fourth runs off the page, so this is an editorial call rather than something the export should make for you.`
    });
  }

  const difs = resolveDifferentiators(row);
  const difProse = unsplitEntries(difs);
  const dif = difs.items.length;
  if (difProse) {
    out.push({ field: "differentiators", count: difProse, kind: "prose", message: proseMessage("differentiators", difProse) });
  } else if (dif > DIFFERENTIATOR_MAX) {
    out.push({
      field: "differentiators", count: dif, kind: "count",
      message: `The capability statement holds up to ${DIFFERENTIATOR_MAX} differentiators and ${dif} are on file. Remove ${dif - DIFFERENTIATOR_MAX} — beyond ${DIFFERENTIATOR_MAX} the section runs past one page.`
    });
  }
  return out;
}
