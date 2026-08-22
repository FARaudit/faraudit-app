// ── CODE-TO-SOLICITATION SCOPE CHECK ────────────────────────────────────────────────────────────────────────
//
// Nothing in the platform compared the bidder's declared NAICS codes to the package's. A customer could run a
// solicitation entirely outside their line of business and the engine would answer it confidently, because the
// audit route never even SELECTED `naics_codes` (it reads company_name, certifications, attributes_v2 and
// size_facts, and the NAICS it uses comes from the SOLICITATION, to pick an SBA size standard). Measured
// 2026-08-22 on our own R&D profile: 3 of the 4 solicitation families in the corpus sat outside the declared
// codes, including the 55-document flagship — an aerospace machine-shop profile being asked about highway paving.
//
// ⛔ THIS IS ADVISORY AND MAY NEVER BECOME A BAR. A declared NAICS list is SELF-ASSERTED marketing, not a legal
// qualification: firms bid outside their listed codes routinely and lawfully, and SBA scope is decided by the
// solicitation's assigned code against the firm's SIZE, not against a list the firm typed into a profile. So this
// module returns a DISCLOSURE — never an eligibility attribute, never a token, never a verdict. It exports no
// value that `deriveVerdict` or the bar machinery can consume, deliberately: the way this feature turns into a
// false NO_BID is by someone downstream treating OUT_OF_SCOPE as a disqualifier, and the type system is the place
// to make that impossible rather than the place to write a comment asking politely.
//
// Honest-fail (Rule 61): a missing solicitation code or an empty declared list is UNKNOWN and says so. It is
// never silently read as "in scope", which is the failure mode that let this drift for months unnoticed.
//
// Pure, deterministic, $0. No model call, no network.

/** IN_SCOPE — exact 6-digit match. ADJACENT — shares the 5-digit NAICS industry, so the firm works next door to
 *  this requirement but has not declared it. OUT_OF_SCOPE — no relation to anything declared. UNKNOWN — we lack
 *  one side of the comparison and will not guess. */
export type NaicsScopeVerdict = "IN_SCOPE" | "ADJACENT" | "OUT_OF_SCOPE" | "UNKNOWN";

export interface NaicsScopeResult {
  verdict: NaicsScopeVerdict;
  /** normalized solicitation code, or null when the package did not carry one */
  solicitationNaics: string | null;
  /** normalized declared codes, order preserved, duplicates dropped */
  declared: string[];
  /** declared codes sharing the solicitation's 5-digit industry — the evidence behind ADJACENT */
  adjacent: string[];
  /** one plain sentence for a human. Never empty. */
  disclosure: string;
  /** the code the customer would ADD to bring this package in scope. Null when there is nothing to add
   *  (already in scope, or we do not know the package's code). Adding is the only remedy this offers —
   *  the profile is append-only in practice: a firm's other lines of business do not stop existing. */
  addCode: string | null;
}

/** A NAICS national industry code is exactly six digits. Anything else is not a code, and is dropped rather
 *  than coerced — "23731" must never match "237310" by prefix. Federal text defeats substring matching; this
 *  file learned that from the token-collision class, not from first principles. */
const normalize = (raw: unknown): string | null => {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  return /^[0-9]{6}$/.test(s) ? s : null;
};

const industry = (code: string): string => code.slice(0, 5);

export function checkNaicsScope(
  solicitationNaicsRaw: unknown,
  declaredRaw: unknown,
): NaicsScopeResult {
  const sol = normalize(solicitationNaicsRaw);
  const declared: string[] = [];
  if (Array.isArray(declaredRaw)) {
    for (const d of declaredRaw) {
      const n = normalize(d);
      if (n && !declared.includes(n)) declared.push(n);
    }
  }

  if (!sol && !declared.length) return {
    verdict: "UNKNOWN", solicitationNaics: null, declared, adjacent: [], addCode: null,
    disclosure: "This package carries no NAICS code and your profile declares none, so no scope comparison was possible.",
  };
  if (!sol) return {
    verdict: "UNKNOWN", solicitationNaics: null, declared, adjacent: [], addCode: null,
    disclosure: `This package carries no NAICS code, so it could not be compared against the ${declared.length} code(s) on your profile.`,
  };
  if (!declared.length) return {
    verdict: "UNKNOWN", solicitationNaics: sol, declared, adjacent: [], addCode: sol,
    disclosure: `This package is NAICS ${sol}. Your profile declares no NAICS codes, so nothing could be compared — add ${sol} to bring it in scope.`,
  };

  if (declared.includes(sol)) return {
    verdict: "IN_SCOPE", solicitationNaics: sol, declared, adjacent: [], addCode: null,
    disclosure: `This package is NAICS ${sol}, which is on your profile.`,
  };

  const adjacent = declared.filter((d) => industry(d) === industry(sol));
  if (adjacent.length) return {
    verdict: "ADJACENT", solicitationNaics: sol, declared, adjacent, addCode: sol,
    disclosure: `This package is NAICS ${sol}, which is not on your profile, though you do declare ${adjacent.join(", ")} in the same industry. Add ${sol} if you work in it — this is a note about your profile, not a limit on bidding.`,
  };

  return {
    verdict: "OUT_OF_SCOPE", solicitationNaics: sol, declared, adjacent: [], addCode: sol,
    disclosure: `This package is NAICS ${sol}, which is not on your profile (${declared.join(", ")}). You can still bid it — add ${sol} if this is work you do, so packages like it reach you.`,
  };
}
