// RE-EXPORT SHIM. The ownership rules moved to `src/lib/audit-doc-ownership.ts` on 2026-08-19 so
// production code can import them; a rule table in two files is two rules. Every existing importer of
// this path keeps working and there is nothing here to drift.
export { OWNERSHIP_RULES, normalizeDocName, ownerOf } from "../../src/lib/audit-doc-ownership";
export type { LensKey, Owner } from "../../src/lib/audit-doc-ownership";
