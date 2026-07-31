---
name: sam-unauthenticated-endpoints
description: SAM.gov hal+json endpoints that re-fetch a notice, its attachment list, and current SCA wage-determination revisions without an API key — the fallback when SAM_API_KEY hits its daily quota
metadata:
  type: reference
---

PANEL-METHOD §0 requires re-fetching the real SAM source by notice_id. `api.sam.gov/opportunities/v2/search` with `SAM_API_KEY` has a **daily quota** that returns HTTP 429 `{"code":"900804","message":"Message throttled out"}` and refuses until 00:00 UTC. When that happens, these unauthenticated endpoints still work:

- Notice detail: `https://sam.gov/api/prod/opps/v2/opportunities/<noticeId>`
- Attachment list: `https://sam.gov/api/prod/opps/v**3**/opportunities/<noticeId>/resources`
- SCA WD current revision: `https://sam.gov/api/prod/sgs/v1/search/?index=wd&q=<wdNumber>&page=0&size=5`

**Every one requires `Accept: application/hal+json`.** Plain `application/json` returns HTTP 406 `"Acceptable representations: [application/hal+json]"`, which reads like a dead endpoint and is not. Note the version skew: notice detail is v2, resources is v3 (v2 `/resources` 404s).

`WebFetch` on `sam.gov/opp/<id>/view` and `sam.gov/wage-determination/<n>/<rev>` returns only the string "SAM.gov" — the UI is a JS app, so it is useless for grounding. Use the APIs.

**Why:** a panel review cannot be graded without an independent source re-fetch, and the key quota is a hard stop mid-review.
**How to apply:** reach for the hal+json routes immediately on a 429 rather than falling back to reviewing the audit against its own stored `raw_pdf_text` — that would be reviewing the audit against itself.

Useful confirmations these yield: `award: {}` on an open solicitation (SAM publishes no ceiling — see [[sam-v2-no-ceiling]]), the true attachment set for checking a coverage denominator, and a WD's live revision number + county list.
