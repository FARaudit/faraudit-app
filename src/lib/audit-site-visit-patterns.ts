// Shared site-visit pattern constants (card #453/#454). The conditional-concluded promotion is a two-file
// contract: the notice-body EMITTER (audit-orchestrator.ts) frames a finding as concluded, and the B3-severity
// GUARD (audit-decide.ts) recognizes that frame to PROMOTE it. Both sides MUST test the SAME regex — a drift
// between two copies would silently break the arc (the emitter emits a frame the guard no longer recognizes →
// the finding is suppressed to human-review instead of promoted). So the contract regex lives here, imported by
// both, never duplicated.

// A UCF/notice site-visit / tour / job-walk / pre-proposal-conference mention (CONTENT match).
export const SITE_VISIT_RE = /\bsite[\s-]?(?:visit|tour|inspection)\b|\bjob[\s-]?walk\b|\bpre[\s-]?(?:proposal|bid)\s+(?:conference|meeting)\b|\bwalk[\s-]?(?:through|thru)\b/i;

// A SAM-body / UPDATE-line past-marker that the site visit already HELD / CONCLUDED / CLOSED. Contract regex:
// the emitter frames against it and the guard recognizes it. Any tuning happens HERE, once.
export const SITE_VISIT_CONCLUDED_RE = /\bsite[\s-]?(?:visit|tour|inspection)\b[^.\n]{0,80}\b(?:was\s+held|has\s+been\s+held|(?:was|is|has\s+been)\s+(?:concluded|closed|conducted)|already\s+(?:past|held|occurred|concluded)|(?:is|are)\s+now\s+(?:closed|concluded|past))\b|\b(?:held\s+and\s+(?:concluded|closed)|now\s+closed|has\s+concluded)\b[^.\n]{0,60}\bsite[\s-]?(?:visit|tour)\b/i;
