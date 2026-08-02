@AGENTS.md
@ceo/CLAUDE.md

## ⚠ `ceo/` IS GITIGNORED — the import above does NOT resolve everywhere

`.gitignore:45` ignores `ceo/`. That directory exists **only in the primary checkout**
(`~/faraudit-app`). It is absent in every git worktree, on every other machine, and in CI — so
**`@ceo/CLAUDE.md` silently loads nothing there.** The import is kept because it is correct where the
directory exists; it is documented here because a silently-absent instruction file is worse than a
missing one.

That file holds the standing operating rules (response format, rule-number reservations, tool
priority, trigger words). **If you are in a worktree and have not seen those rules, you are running
without them** — say so rather than improvising a substitute.

`git worktree list` names the primary checkout first and marks every worktree with its branch. Use
it rather than a relative path: worktrees live under the **primary checkout's**
`.claude/worktrees/`, so that path does not resolve from inside one.

**The primary checkout is usually NOT on `main`** — it sits on whatever branch was last worked. Check
before running anything that uploads or deploys a working tree from it.

## What this file is for

Durable, verified orientation. **Not** a status log: session state rots, and a stale fact here is
read as current by every future session. Ship state lives in git history and the CEO digest.

## Deploys

One push fans out to two providers. On a commit to `main`, these report status and gate it:

- **Vercel** — the Next.js app (`src/`) and every served asset in `public/`.
- **Railway** — `audit-worker`, `Recompete-AI`, `Regulatory-AI`, `QA-AI`, `PDF Service`,
  `email-ai-v3`. Project `responsible-perfection`.

Railway services build only when a commit touches their **watch paths**, so a service showing no
build for a frontend-only change is expected, not drift. A green Railway build is not proof the
service is running your code — check the deployed sha (`railway ssh printenv
RAILWAY_GIT_COMMIT_SHA`).

`agents/sam-ingest/` is still in the tree, but **the Railway service was deleted**. Do not recreate
it from the directory's existence.

## Served assets have their own gates

`public/*.html` and `public/*.js` are shipped verbatim to the browser — no bundler, no minifier, so
**comments in them are public**. The gates in `test/public/` cover that surface and run with
`npx tsx test/public/<name>.test.ts`. The two that apply to any served-asset change:

- `_public-comment-leak.test.ts` — rationale and internal references must not ship. Explanation of
  *why* a change was made belongs in the commit message.
- `_inline-script-syntax.test.ts` — every inline `<script>` must parse.

The rest are per-surface. Run the ones your diff touches before merging, not after.

## Before merging a long-lived branch

`main` moves daily. A branch proven against an older `main` is not proven — trial-merge it and re-run
the affected gates on the **merged** result.
