import { detectQuantityAmbiguities } from "../../src/lib/audit-decide";

// R11 Family 1 — R10 second-subject seam. R10 rejects the noun-headed content clause when the embedded
// second subject is (a) a subject PRONOUN (i/you/we/they/he/she/it) with other content, OR (b) adds a 2nd
// determiner-headed NP (≥2 of the|a|an|this|that|these|those). Hunt an embedded second subject that is
// NEITHER a pronoun NOR determiner-headed: a BARE PLURAL NOUN, a PROPER NOUN, or a POSSESSIVE-headed NP
// (your/our/their are NOT in QA_DETERMINER_G_RE and NOT subject pronouns). Embedded verb base/irregular
// (no -s/-es/-ed). One determiner on the head noun only ("the assumption" = 1 det). Terminal pair.
// Every FIRE here is an OVER-FIRE.

const probes: Array<{ tag: string; s: string; benign: boolean }> = [
  // head "the assumption" (1 det) + BARE PLURAL noun 2nd subject + base verb (no morph)
  { tag: "1a the assumption + bare-plural 'staff' + base 'bill'", s: "Is the assumption staff bill 520 hours or 1,040 hours?", benign: true },
  { tag: "1b the premise + bare-plural 'crews' — wait -s", s: "Is the premise crews set 520 hours or 1,040 hours?", benign: true },
  { tag: "1c the assumption + bare NONCOUNT 'personnel' + base 'log'", s: "Is the assumption personnel log 520 hours or 1,040 hours?", benign: true },
  // head "the assumption" + POSSESSIVE-headed 2nd subject (your/our/their ∉ determiner set, ∉ pronoun set)
  { tag: "1d your understanding + POSSESSIVE 'our staff' + base 'bill'", s: "Is your understanding our staff bill 520 hours or 1,040 hours?", benign: true },
  { tag: "1e the premise + POSSESSIVE 'your team' + irregular 'put'", s: "Is the premise your team put 520 hours or 1,040 hours?", benign: true },
  { tag: "1f their reading + POSSESSIVE-only, base 'owe'", s: "Is their reading staff owe 520 hours or 1,040 hours?", benign: true },
  // head "the assumption" + PROPER NOUN 2nd subject + base verb
  { tag: "1g the assumption + proper 'Acme' + base 'bill'", s: "Is the assumption Acme bill 520 hours or 1,040 hours?", benign: true },
  { tag: "1h the premise + proper 'the Government' — 2 det", s: "Is the premise Government staff 520 hours or 1,040 hours?", benign: true },
  // possessive head (no determiner) + bare plural 2nd subject
  { tag: "1i your premise + bare-plural 'workers' — -s", s: "Is your premise workers put 520 hours or 1,040 hours?", benign: true },
  { tag: "1j our understanding + bare NONCOUNT 'staff' + irregular 'cut'", s: "Is our understanding staff cut 520 hours or 1,040 hours?", benign: true },
  // gerund/appositive head (no determiner) + bare 2nd subj
  { tag: "1k gerund head 'billing' + staff + base", s: "Is billing staff owe 520 hours or 1,040 hours?", benign: true },
  // GENUINE control — real which-quantity question (MUST fire)
  { tag: "CTRL genuine which-qty (fire expected)", s: "Is the total requirement 520 hours or 1,040 hours?", benign: false },
  { tag: "CTRL genuine bare 'estimate' (fire expected)", s: "Is the estimate 520 hours or 1,040 hours?", benign: false },
];

let overFires = 0;
for (const p of probes) {
  const amb = detectQuantityAmbiguities(p.s);
  const fired = amb.length > 0;
  const bad = p.benign && fired;
  const missGenuine = !p.benign && !fired;
  if (bad) overFires++;
  const tag = bad ? "★OVER" : missGenuine ? "×MISS" : fired ? "(ok) " : "     ";
  console.log(`${fired ? "FIRE " : "quiet"} ${tag}  [${p.tag}]  ${JSON.stringify(p.s)}`);
}
console.log(`\nOVER-FIRES (benign that fired): ${overFires}`);
