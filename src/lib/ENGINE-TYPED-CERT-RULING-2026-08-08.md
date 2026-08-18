# ENGINE RULING — a typed certification cannot clear a set-aside bar

**Status:** ratified by the CEO in-terminal 2026-08-08 · shipped in PR #537 · banked here so it is
not re-derived, and not silently reversed.

**Paste this whole file into an engine session before touching `firmStatus`,
`buildBidderProfileFromCapability`, or anything that reads `AUDIT_PROFILE_SCHEMA_V2`.**

---

## The ruling, in one sentence

A certification a customer merely **typed** may never clear a set-aside bar, and that must hold as a
property of the code — not as a consequence of an environment variable being set correctly.

## What was true before

`firmStatus` (`src/lib/audit-decide.ts`) read `!profileSchemaV2Enabled() ||` in **three** places:

1. the closed-world customer-asserted exclusion (`effectiveClosedWorld`),
2. the exact-match fast path,
3. the canonical socioeconomic match.

With `AUDIT_PROFILE_SCHEMA_V2` unset, each returned `"satisfies"` with **no provenance check at
all**. The variable was `true` on both Vercel production and the Railway `audit-worker`, and its
documented default was **OFF** — so the safe behaviour was opt-in and the false BID was the fallback.

Measured, flag unset, before the change:

| bar | firm typed | result |
|---|---|---|
| total SDVOSB set-aside | `"SDVOSB"` | **satisfies** |
| total HUBZone set-aside | `"HUBZone"` | **satisfies** |
| 8(a) set-aside | `"8(a)"` | **satisfies** |

## What changed

- All three escapes are unconditional. The `profileSchemaV2Enabled` read is **deleted** from
  `audit-decide.ts`, not left dangling, so the discipline cannot be reopened by restoring one call
  site.
- Profile **construction** is ungated in the same change (`audit-bidder-profile.ts`). This is not
  scope creep: gating construction while the satisfy discipline is unconditional builds a **wall** —
  the records that *can* clear a bar never reach the profile, so a SAM-verified firm and a firm
  asserting the same string both return `unknown`. **Refusing a claim is the ruling; refusing the
  proof is not.**

Both poles now hold on every flag value: a typed cert never clears, a SAM-verified record always
does.

## ⛔ Do not "fix" these by restoring the old behaviour

Seven test expectations changed. **Every one of them already failed on unmodified `main` when the
flag was set to production's value** — they stayed green only because CI runs the suite with it
unset. They were gates certifying a path production cannot reach.

| file | n | what it asserted |
|---|---|---|
| `audit-n5-bidder-profile.test.ts` | 5 | the pre-flag "benefit preserved" doctrine — an open-world capability statement self-clearing a PURE set-aside bar. One, labelled *"closed-world exact hold"*, **never set `closedWorld`**: it was an open-world profile asserting a named-OEM sole-source attr |
| `audit-decide-sitevisit-severity.test.ts` | 1 | that a profile carrying `"clearance:secret-fcl"` removes an FCL show-stopper — **vector B2 verbatim**, the false-BID path the V2 panel was convened to close |
| `audit-bidder-profile-v2.test.ts` | 1 | that flag-OFF construction degrades to the legacy shape — the wall described above |
| `cert-verification.test.ts` P1 | 1 | a planted positive that the exposure reproduces flag-off. Rewritten per the instruction its own author left: *"if this ever stops being true the flag has been hard-wired and this gate needs rewriting, not muting."* **P1b** replaces the leg it played |

If one of these goes red again, the question is not "which expectation do I update" — it is "has an
escape been reintroduced".

## The gate that holds this

`src/lib/audit-decide-typed-cert-invariant.test.ts`. It **drives** `firmStatus` across `unset` /
`"false"` / `"true"` rather than grepping the source for a string, because a grep proves an author's
phrasing and not a behaviour. It asserts **both poles**, so a change that refuses everything fails it
just as loudly as one that believes everything.

Each escape was planted back individually before shipping: escapes 1 and 2 drove **6 failures each**;
re-gating construction drove the **2 verified-record legs** red. Restored: 15/15.

## Verify it yourself

```bash
npx tsx src/lib/audit-decide-typed-cert-invariant.test.ts
```

```bash
npx tsx scripts/audit-ai/self-audit.ts suites gold parked coverage certs blockers
```

Run the second one **both ways** — bare, and with `AUDIT_PROFILE_SCHEMA_V2=true`. Both must read
152/152. Before this change they disagreed, which is how the divergence survived: **CI was testing a
world production was not in.**

## What is still open

- `AUDIT_PROFILE_SCHEMA_V2` is now read **nowhere in the satisfy or construction path**. It is
  effectively dead. Retiring the variable from Vercel and Railway is a separate, deliberate change —
  do not unset it casually, and do not delete it as "cleanup" without checking for other readers.
- `capability_statements.certifications` is still **accepted by the PATCH allowlist** in
  `src/app/api/capability-statement/route.ts`, while **no screen writes it**. The engine can no
  longer be fooled by its contents, but an API client can still populate a column nothing surfaces.
  Unresolved: keep it as the customer's own marketing list (it prints on the capability-statement
  PDF), or remove it from the allowlist entirely.
- The demo record's persona residue was cleared 2026-08-08 —
  `scripts/audit-ai/_clear-persona-residue.ts` is the record of what was removed and why.
