// ============================================================================================
// RETIRED 2026-07-01 (Brain card 188). SUPERSEDED BY: scripts/audit-ai/verify-gold-integrity.ts
//   (registry-wide integrity verifier — `npm run verify:gold-integrity`).
//
// This verifier was hardcoded to the FA860126 V1 NO_BID key (card 72): it asserted V1 routing and an
// empty supersedes[]. The FA860126 key migrated V1→V2 (cards 75-R1/76-R1) and then V2→V3 (card 188,
// chain-of-custody repair), so every original assertion is stale by design. The successor validates the
// WHOLE registry generically — every active key's keySha256/sourceSha256 self-consistency and every
// supersedes[] retired_sha256 — so no single-key verifier can go stale again.
//
// The original implementation is preserved in git history (last live at the commit before card 188).
// Retained here as a pointer per no-delete discipline; it no longer runs.
// ============================================================================================
console.log("RETIRED (card 188) — superseded by `npm run verify:gold-integrity` (scripts/audit-ai/verify-gold-integrity.ts). Not run.");
process.exit(0);
