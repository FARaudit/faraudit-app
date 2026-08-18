-- STRUCTURED CORE COMPETENCIES AND DIFFERENTIATORS — the shape the spec plate needs.
--
-- Applied BEFORE the code that reads it ships, per Rule 65.
--
-- WHY. `core_competencies` and `differentiators` are single TEXT columns, rendered by
-- splitting on newlines into flat paragraphs. The card-825 plate does not draw flat
-- paragraphs: each competency is FOUR fields — a kicker, a head, a body and a spec line —
-- and each differentiator is two. Splitting a blob on newlines yields N strings, which is
-- enough to COUNT the items and not enough to FILL the card. The cap ruled in card 825
-- ("exactly 3 competencies, 6 differentiators, refuse the build otherwise") was therefore
-- enforceable against the old column while the design it exists to protect was not
-- renderable from it.
--
-- ADDITIVE, NOT A TYPE CHANGE. The TEXT columns stay and keep their data. Changing TEXT to
-- JSONB in place would have to reinterpret every existing customer's prose during the
-- migration, and every reader would break for the window between the migration and the
-- deploy. Instead the readers prefer the structured column and fall back to the prose one,
-- so a profile written before this migration still renders — as heads only, which is what
-- a single line honestly is — and nothing is lost or guessed at.
--
-- SHAPE, mirroring the plate's own class names so the document and the record cannot drift:
--   core_competencies_json  [{ "k": kicker, "h": head, "b": body, "s": spec }]
--   differentiators_json    [{ "h": head, "b": body }]
-- `k`, `b` and `s` are optional; `h` is the one field an item cannot be without, because an
-- item with no head is not an item.
--
-- NULL means "not structured yet" and is distinct from `[]`, which means "structured, and
-- deliberately empty". The exports must not treat those alike: the first falls back to the
-- prose column, the second prints no section at all under the empty-section rule.
ALTER TABLE public.capability_statements
  ADD COLUMN IF NOT EXISTS core_competencies_json JSONB,
  ADD COLUMN IF NOT EXISTS differentiators_json   JSONB;

COMMENT ON COLUMN public.capability_statements.core_competencies_json IS
  'Structured core competencies: [{k,h,b,s}] — kicker, head, body, spec line, mirroring the card-825 plate. Only `h` is required. NULL = not structured yet, so readers fall back to the core_competencies TEXT column; [] = structured and empty, so the section is omitted. Capped at 3 items at generation: the plate grid has three tracks and a fourth is 78px off the page.';

COMMENT ON COLUMN public.capability_statements.differentiators_json IS
  'Structured differentiators: [{h,b}] — head and body. Only `h` is required. NULL = not structured yet, so readers fall back to the differentiators TEXT column; [] = structured and empty, so the section is omitted. Capped at 6 items at generation: 4→6 fits with 1px of headroom, 4→8 is 47px over.';
