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

export interface BuildRefusal { field: "core_competencies" | "differentiators"; count: number; message: string; }

/** Returns every reason the document cannot be built, or [] when it can. Never mutates and
 *  never trims — a caller that wants to ship anyway has to say so in its own code, where the
 *  decision is visible. */
export function refusalsFor(row: {
  core_competencies?: string | null; core_competencies_json?: unknown;
  differentiators?: string | null; differentiators_json?: unknown;
}): BuildRefusal[] {
  const out: BuildRefusal[] = [];
  const comp = resolveCompetencies(row).items.length;
  if (comp !== COMPETENCY_COUNT) {
    out.push({
      field: "core_competencies", count: comp,
      message: comp < COMPETENCY_COUNT
        ? `The capability statement prints exactly ${COMPETENCY_COUNT} core competencies and ${comp} ${comp === 1 ? "is" : "are"} on file. Add ${COMPETENCY_COUNT - comp} more.`
        : `The capability statement prints exactly ${COMPETENCY_COUNT} core competencies and ${comp} are on file. Choose the ${COMPETENCY_COUNT} to print — a fourth runs off the page, so this is an editorial call rather than something the export should make for you.`
    });
  }
  const dif = resolveDifferentiators(row).items.length;
  if (dif > DIFFERENTIATOR_MAX) {
    out.push({
      field: "differentiators", count: dif,
      message: `The capability statement holds up to ${DIFFERENTIATOR_MAX} differentiators and ${dif} are on file. Remove ${dif - DIFFERENTIATOR_MAX} — beyond ${DIFFERENTIATOR_MAX} the section runs past one page.`
    });
  }
  return out;
}
