<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- The block above is generated territory (BEGIN/END markers). Corrections go
     BELOW it so a regeneration cannot clobber them. -->

## Correction — that docs path does not exist here

`node_modules/next/dist/docs/` is **absent** in this install. Next **16.2.4** ships no bundled docs,
and no generator for the block above exists anywhere in this repo — so its one actionable
instruction cannot be followed as written. Verified 2026-08-02.

The premise still holds, and it is the part that matters: **16.2.4 is well past most training data**,
and App Router APIs, caching defaults and config have moved. So:

- Read the actual source under `node_modules/next/` when an API's behaviour is load-bearing, and
  check `node_modules/next/package.json` for the version you are really on.
- Trust the running app over recollection — type errors and `next build` output are evidence;
  memory of an older Next is not.
- Deprecation warnings in build output are current and specific. Act on them.

This applies to Next-facing code. It is not a reason to stall on work that never touches the
framework.
