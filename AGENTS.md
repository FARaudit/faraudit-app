<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- The block above is generated territory (BEGIN/END markers). Corrections go
     BELOW it so a regeneration cannot clobber them. -->

## The docs ARE here — read them

**Verified 2026-08-03: `node_modules/next/dist/docs/` exists and holds 421 files, 3.5 MB.**
Next **16.2.4** ships them. The block above is followable exactly as written.

> A correction sat here from 2026-08-02 asserting the opposite — *"absent in this install… ships no
> bundled docs… cannot be followed as written"* — and it was wrong. It was marked "Verified" and it was
> loaded into every session, so for a day this file told every agent to skip the documentation for the
> framework we ship on. The lesson is the one the engine keeps re-learning: **a stated fact is a claim.
> `ls` the path before you write that it does not exist.**

Where to look:

- `node_modules/next/dist/docs/01-app/` — App Router. `01-getting-started`, `02-guides`,
  `03-api-reference`. This is the tree that matters for `src/app/**`.
- `node_modules/next/dist/docs/02-pages/` — Pages Router, for reference only; we do not use it.
- `node_modules/next/dist/docs/03-architecture/`, `04-community/`, `index.md`.

`node_modules/` is gitignored, so these exist only after `npm ci`. On a fresh clone or in CI, run the
install first — absent there is expected, absent here is not.

## Why this matters more than usual

**16.2.4 is well past most training data**, and App Router APIs, caching defaults and config have moved.
So, in priority order:

1. **Read the bundled guide** for the API you are about to use. It matches the installed version exactly,
   which no remembered documentation does.
2. Read the actual source under `node_modules/next/` when behaviour is load-bearing and the guide is
   ambiguous, and check `node_modules/next/package.json` for the version you are really on.
3. Trust the running app over recollection — type errors and `next build` output are evidence; memory of
   an older Next is not.
4. Deprecation warnings in build output are current and specific. Act on them.

This applies to Next-facing code. It is not a reason to stall on work that never touches the framework.
