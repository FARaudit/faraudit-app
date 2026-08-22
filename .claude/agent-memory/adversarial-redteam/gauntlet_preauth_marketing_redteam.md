---
name: gauntlet-preauth-marketing-redteam
description: Red-teaming faraudit.com pre-auth pages — two deploy traps that manufacture FALSE findings (apex→www -L masks the auth wall; /sign-in is a Suspense shell so UI copy is absent from served HTML), plus the durable method that found the real defects
metadata:
  type: feedback
---

Red-teaming the public marketing surface has **two traps that fabricate findings**, and one method that
found the only unbreakable defect. Both traps nearly shipped as alarms.

**Why:** on the 2026-08-03 pre-auth teardown, `curl -L https://faraudit.com/index.html` returned **200**
and I was one step from reporting "the internal 16-tab redesign index and the authenticated product
screens are publicly reachable." They are not. And grepping the served `/sign-in` HTML for its own
marketing copy returned **0 hits**, which read as "the claim isn't there" when the copy is very much
shipped.

**How to apply:**

1. **apex → www is a 307, so `-L` launders the auth wall into a 200.** `faraudit.com/*` redirects to
   `www.faraudit.com/*`; following it and reporting the final status makes every gated page look public.
   Test the **www host directly, without `-L`**, and read the `location` header:
   `curl -s -o /dev/null -w '%{http_code}' https://www.faraudit.com/<path>` then
   `curl -sI ... | grep -i ^location`. Real wall = `307 → /sign-in?next=%2F<path>`.
   Verified gated this way: `index.html`, `past-audits.html`, `opportunities.html`, `run-audit.html`,
   `home.html`. Verified genuinely public: `/privacy`, `/terms` (both 200 — they EXIST, which refuted a
   second candidate finding that FARaudit ships no legal pages).
2. **`/sign-in` is a client component behind `Suspense`, so its served HTML is a ~9 KB shell whose only
   visible text is "Loading…".** Grepping the response for UI strings returns 0 and proves nothing. The
   copy ships in the linked chunk — extract `/_next/static/...js` from the shell and grep **that**.
   The static "Live / 200 on SAM.gov / synced 2m ago / last 24h" block lives in
   `chunks/app/sign-in/page-*.js`. Generalise: **for any client-rendered page, absence in served HTML is
   not absence.**
3. **The method that worked — try to BREAK your own headline finding through every escape hatch.**
   The real defect was the pages claiming "Six independent expert lenses" against a five-entry
   `AUDIT_LENSES`. Before shipping it I checked: any second `ExpertSpec[]` (none), `lens("` count (5),
   whether `auditLenses()` changes length (`.map()` — no), whether a caller injects a 6th (only
   `audit-package.ts` `?? auditLenses(...)`; every other `experts:` is a test), and whether marketing
   could mean the verifier as the 6th (**no** — the same sentence names it separately). Only then did it
   ship. A count claim about your own architecture is the most checkable thing on a marketing page.
4. **Read the flag from Railway, never from the doctrine file.** I asserted Rule 70 "ARMED" from
   CLAUDE.md, then caught myself: the code reads `process.env.X === "true"` (default-OFF), so the
   doctrine file is not authority. `railway variables --service audit-worker --kv` (CLI is linked to
   `responsible-perfection` / `production`) resolved it. Note `timeout` does not exist on this macOS
   shell — use the tool's own timeout, not `timeout 45 ...`.
5. **`grep -c 'href="[^"]*privacy'` returning 0 is not evidence of absence** — landing.html's links are
   `mailto:...subject=Privacy%20Policy%20Request`, so a lowercase pattern misses them. Case and URL-
   encoding both defeat naive href greps; read the lines.

**The one finding worth carrying forward as product truth:** `audit-decide.ts:3310` says
*"INCOMPLETE cap = unreadable ingest; NHR cap = uncovered real disqualifier"* and
`pdf-text-extractor.ts:310` writes a `[PDF_EXTRACTION_FAILED: N bytes received]` placeholder. So the
engine's flagship trust artifact fires on **failed ingestion**, while the pre-auth copy sells it as
epistemic principle. Any future claim that honest-fail is the moat has to answer that seam first.

Related: [[feedback_verify_the_verifier_before_the_finding]] ·
[[feedback_verify_the_rendered_output_not_the_engine]] ·
[[feedback_a_config_named_live_is_not_live]] · [[feedback_a_stated_fact_is_a_claim]] ·
[[feedback_grounding_checks_excerpt_not_claim]]
