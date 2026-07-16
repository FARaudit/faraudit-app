// §M EVIDENCE-FACTOR DEMOTION + FABRICATED-MECHANIC GUARD (Brain card #538, flag AUDIT_MM_EVIDENCE_FACTOR_DEMOTION,
// default-OFF, Rule 61). Live driver: FA303026Q0020 audit 8d137350 — a §M LPTA technical/evaluation criterion
// ("The Offeror shall demonstrate successful delivery … Chapel/Church, IAW the SOW"; source §M "will not be
// considered for award"; SOW §10.3 "preferred/not required") was mis-typed a NON-CURABLE eligibility bar →
// two P0 show-stoppers → a FALSE NEEDS_HUMAN_REVIEW with the fabricated "lead time exceeds the response window"
// mechanic. Gate-4 /panel unanimously concurred (ex-ko/SSEB/capture/proposal F; red-team CONCUR).
//
// DOCTRINE (Brain #538, allowlist-of-shape — NO bar-vocab blocklists, ambiguity fails toward ESCALATION):
//   R1  a §M evaluation/technical criterion whose substance is EVIDENCED INSIDE THE SUBMITTED QUOTE (capability
//       statement, past-performance / prior-experience narrative, technical approach, references the offeror
//       writes into its quote) is a COMPETITIVE CAUTION → BID_WITH_CAUTION, never an eligibility bar, never a P0
//       show-stopper. The hard advisory ("if you cannot evidence X, expect an Unacceptable rating — treat as
//       no-bid") is preserved IN the caveat, not as the pole.
//   R2  ESCALATION BOUNDARIES (unchanged doctrine) — checked FIRST, they VETO demotion: §M substance COUPLED to a
//       true third-party bar (clearance / QPL/QML / ITAR / facility cert / holder-only / OEM sole-source);
//       POSSESSION-AT-OFFER ("must already hold … at time of offer"); genuine WHO-MAY-BID ambiguity ("only firms
//       that …"). Anything the positive shape cannot cleanly classify is NOT demoted (residual = escalate).
//   R3  CONTRADICTION AWARENESS — where the SOURCE text directly calls the substance optional ("preferred/not
//       required", "desired but not mandatory", "optional"), the contradiction is itself grounds to demote: a
//       criterion the document calls optional can never type as a non-curable bar. Deterministic source check.
//
// Pure & deterministic → $0 gate-testable / bankable. deriveVerdict reads controllability/cautionFloor/
// curableInWindow (never a marker field); this module RE-TYPES those on a matched finding and leaves all else.
import type { TypedFinding } from "./audit-findings";
import { classifyGateShape } from "./panel-findings-bridge";
import { BOA_IDIQ_HOLDER_BAR_RE } from "./audit-site-visit-patterns"; // ratified contract-vehicle holder-only bar (round-7)

export type MmEvidenceVerdict = "demote" | "escalate" | "not_applicable";

// ── R2 ESCALATION VETO — REUSE THE RATIFIED SHAPE ALLOWLIST (card #526/#528, NOT a bar-vocab blocklist) ──
// Gauntlet round-1 (card #538) killed a hand-rolled R2 blocklist: it was both leaky (8(a)/set-aside slipped a
// demote) AND a doctrine violation (#507/#515 — no release may rest on a bar-vocab blocklist). The correct veto is
// the already-ratified, already-banked SHAPE classifier: a held credential/status/clearance/QPL/holder/possession
// types `profile_bar`; a socioeconomic/size set-aside types `set_aside_caution` (its OWN handling — never a §M
// quote-evidence factor); affiliation likewise. BOTH veto this demotion. Only a `do_the_work`/`neither`-shaped
// requirement is even eligible, and then ONLY with positive §M-evidence corroboration below. Escalation is the
// residual — nothing demotes without a clean positive match.

// HELD-CREDENTIAL / STATUS SHAPE (Gauntlet round-2 BREAK A) — a POSITIVE shape (allowlist, not a bar-vocab
// blocklist) for the classic profile-bar substance classifyGateShape under-catches: a license / bond / insurance /
// registration / clearance / citizenship / ordination the offeror (or its personnel) must HOLD or BE. "Demonstrate
// you hold X" carries BOTH evidence-language AND held-substance — the held-substance must veto the §M demote. Any
// hit on requirement OR excerpt ⇒ escalate (fail toward escalation).
const HELD_CREDENTIAL_SHAPE: RegExp[] = [
  /\b(?:must|shall|required to|are\s+required\s+to)\s+(?:already\s+)?(?:hold|possess|maintain|carry|have|be)\b[^.\n]{0,45}\b(?:licens\w+|bond(?:ed|ing|s)?|insur\w+|certif\w+|accredit\w+|registrat\w+|registered|clearance|citizen\w*|ordain\w+|ordination|endorsement|credential\w*|qualified)\b/i,
  /\b(?:current|valid|active|state|professional|individual|personal)\s+(?:licens\w+|registration|certification|accreditation|bond|credential\w*)\b/i,
  /\b(?:surety|bid|payment|performance|fidelity)\s+bond\b|\bbond\w*\s+(?:required|must\s+be\s+(?:provided|obtained|posted))\b/i,
  /\b(?:U\.?S\.?\s+|United\s+States\s+)?citizen(?:ship|s)?\b|\bpermanent\s+resident\b|\blawful\s+presence\b|\bwork\s+authorization\b/i,
  /\b(?:licensed|bonded|insured|accredited|ordained|credentialed|chartered)\b/i,
  /\b(?:professional|state|occupational|individual)\s+(?:license|licence|registration|certification)\b|\blicensure\b/i,
  // CONFERRED SECURITY / ACCESS STATUS (Gauntlet round-3 BREAK) — a clearance-class bar regardless of the literal
  // word "clearance": TS/SCI eligibility, access to classified/SCI, cleared/adjudicated/read-into. SHAPE = a
  // security STATUS conferred by a third party (the offeror's personnel must HOLD/BE-eligible-for it), never a
  // quote-authored artifact. Not a single-token dependence — the whole access-status family.
  /\b(?:TS\/SCI|SCI|sensitive\s+compartmented\s+information|top[- ]secret|secret|classified|national\s+security)\b[^.\n]{0,30}\b(?:access|eligib\w+|clearance|adjudicat\w+|cleared|billet|read[- ]?in)\b/i,
  /\b(?:access\s+to|eligib\w+\s+for|cleared\s+(?:to|at|for)|granted|adjudicat\w+\s+for|read\s+into)\b[^.\n]{0,30}\b(?:classified|sci|sensitive\s+compartmented|top[- ]secret|secret\b|national\s+security)\b/i,
  /\b(?:security\s+clearance|clearance|access)\s+(?:eligibilit\w+|level|is\s+required|required)\b/i,
  /\b(?:must|shall)\s+be\s+(?:eligible\s+for|granted|cleared|adjudicated|read\s+into)\b/i,
];

// R10 THIRD-PARTY-STATUS SHAPE (card #545 ruling — the six red-team round-2/3 leak shapes). Each is a STATUS or
// POSSESSION conferred by a third party (an agency audit, a labor agreement, a physical footprint, a credentialing
// office, a source-approval authority) — never something the offeror AUTHORS INTO THE QUOTE. "Demonstrate your
// DCAA-approved accounting system" carries evidence-language AND conferred-status substance; the status vetoes the
// demote. SHAPE-allowlisted (structural form, position-checked second token — per the no-blocklist doctrine and
// the round-2 comma lesson); over-catch errs toward ESCALATION, the safe pole. Any hit ⇒ escalate.
// Re-shaped after red-team round-1 (grade F, ceo/redteam-545-r10.md): the first cut banked the six SPECIMENS,
// not the FAMILIES — its second-token slots were closed vocab lists (the #507 treadmill inside allowlist
// clothing; "acceptable" — the DFARS clauses' own adjective — leaked all three business-system arms). Each arm
// now anchors on the family's POSITION-CHECKED structural noun and pairs it with a STEM family, both orders.
const R10_THIRD_PARTY_STATUS: RegExp[] = [
  // (i) BUSINESS-SYSTEM STATUS — anchor = the DFARS business-system noun; pair = an acceptability/approval/
  //     review STEM (approv-/accept-/adequa-/validat-/audit-/review/compliant — covers the regulation-verbatim
  //     "acceptable accounting system", DFARS 252.242-7006/252.215-7002), either order. Actor arm widened to any
  //     cognizant office. CPSR review-completion form has its own arm (FAR 44.302).
  //     Round-2 additions: bare "audit" (audit\w* — the \w+ quantifier missed the bare noun), survey/pre-award-
  //     survey determination instruments, SF 1408, MMAS acronym, spelled-out agency names, arm 3 both orders.
  //     Round-3 class-level closes: PREFIX-TOLERANT stems ((?:dis|in|un|non-)? — DFARS 252.215-7002's own
  //     "disapprove/disapproval" and FAR 16.301-3's "adequate→inadequate" flipped the pole on a negation prefix),
  //     the FULL FAR 53.209-1 pre-award survey form RANGE (SF 1403-1408, not the one banked specimen), and the
  //     no-"system"-token CAS grammar (cost accounting practices / disclosure statement / billing rates).
  /\b(?:accounting|billing|purchasing|estimating|property|material\s+management|earned[- ]value(?:\s+management)?|EVMS?|MMAS)\s+system\b[^.\n]{0,60}\b(?:dis|in|un|non[- ]?)?(?:approv\w+|accept\w+|adequa\w+|validat\w+|audit\w*|review\w*|surve\w+|compliant|compliance)\b/i,
  /\b(?:dis|in|un|non[- ]?)?(?:approv\w+|accept\w+|adequa\w+|validat\w+|audit\w*|surve\w+|compliant)\b[^.\n]{0,45}\b(?:accounting|billing|purchasing|estimating|property|material\s+management|earned[- ]value|EVMS?|MMAS)\s+system\b/i,
  /\b(?:DCAA[- ]\w+|DCMA[- ]\w+)\b[^.\n]{0,45}\b(?:accounting|billing|purchasing|estimating|property|material\s+management|earned[- ]value|EVMS?|MMAS)\s+system\b/i,
  /\b(?:DCAA|DCMA|Defense\s+Contract\s+(?:Audit|Management)\s+Agency|cognizant\s+(?:\w+\s+){0,2}(?:agency|auditor|activity|ACO))\b[^.\n]{0,50}\bsystem\b/i,
  /\bsystem\b[^.\n]{0,50}\b(?:DCAA|DCMA|Defense\s+Contract\s+(?:Audit|Management)\s+Agency|cognizant\s+(?:\w+\s+){0,2}(?:agency|auditor|activity|ACO))\b/i,
  /\bCPSR\b|\bcontractor\s+purchasing\s+system\s+review\b|\bSF\s?140[3-8]\b|\bMMAS\b|\bpre[- ]?award\s+survey\b/i,
  /\b(?:dis|in|un|non[- ]?)?(?:approv\w+|accept\w+|adequa\w+|determin\w+)\b[^.\n]{0,40}\b(?:cost\s+accounting\s+practices?|CAS\s+disclosure\s+statement|disclosure\s+statement|billing\s+rates?)\b/i,
  /\b(?:cost\s+accounting\s+practices?|CAS\s+disclosure\s+statement|disclosure\s+statement|billing\s+rates?)\b[^.\n]{0,40}\b(?:dis|in|un|non[- ]?)?(?:approv\w+|accept\w+|adequa\w+|determin\w+)\b/i,
  // (ii) CBA STATUS — relation STEM (signatory/party-to/bound-by/adhere-to) × labor-agreement noun, both orders.
  //      SCA 4(c) judgment carried on the card: "bound by" may read compliance-not-gate — escalate is the safe pole.
  /\b(?:signator(?:y|ies)|party\s+to|bound\s+by|adher\w+\s+to)\b[^.\n]{0,50}\b(?:collective\s+bargaining|CBA\b|union|labor\s+agreement|master\s+labor|trades?\s+council|local\s+\d+|brotherhood|workers'?\s+(?:union|local))/i,
  /\b(?:collective\s+bargaining|CBA\b|union|labor)\s+(?:agreement\s+)?(?:signator(?:y|ies)|part(?:y|ies))\b/i,
  // (iii) FACILITY-GEOGRAPHY — the facility noun is the ABSOLUTE anchor (protects the temporal keep-set:
  //       "within the past five years" has no facility noun). Preposition widened to bare in/at + located/radius;
  //       place tokens widened to area/region/vicinity/metropolitan/commuting (round-1 leaks iii-1/2/5).
  //       Round-3 (class-level, per the round-3 convergence ruling ask): EVERY slot number-tolerant BY
  //       CONSTRUCTION (states?/cit(?:y|ies)/…, not hand-added plurals), family-(iv)'s installation nouns
  //       imported (post/garrison — the on-post leak was an internal inconsistency between sibling arms),
  //       facility-noun class widened with the round-3 open-class leaks (depot/branch/terminal/service center/
  //       on-site presence) + the on-post/on-base compound forms. The noun slot remains ENUMERATED — an
  //       open-class residual is explicitly carried to Brain on the card (round-3 F5 family-iii call).
  /\b(?:facilit(?:y|ies)|offices?|warehouses?|yards?|shops?|plants?|depots?|branch(?:es)?|terminals?|storefronts?|service\s+centers?|dispatch\s+points?|place\s+of\s+business|(?:physical|on[- ]site|local)\s+(?:presence|location))\b[^.\n]{0,45}\b(?:within|in|at|on|near|no\s+(?:more|further)\s+than|located|situated|radius)\b[^.\n]{0,40}\b(?:miles?|kilometers?|km|minutes?|hours?|drive|count(?:y|ies)|states?|cit(?:y|ies)|towns?|installations?|bases?|posts?|garrisons?|sites?|areas?|regions?|vicinit(?:y|ies)|metropolitan|commuting|place\s+of\s+performance)\b/i,
  /\b(?:facilit(?:y|ies)|offices?|warehouses?|yards?|shops?|plants?|depots?|branch(?:es)?|service\s+centers?|(?:physical|on[- ]site)\s+presence)\b[^.\n]{0,30}\b(?:located\s+)?on[- ](?:post|base|site|installation)\b/i,
  /\b(?:maintain|establish|have|possess|operate|staff)\b[^.\n]{0,25}\b(?:a\s+)?(?:local\s+|permanent\s+)?(?:facilit(?:y|ies)|offices?|physical\s+presence|on[- ]site\s+presence|place\s+of\s+business)\b[^.\n]{0,40}\bwithin\b/i,
  // (iv) BASE-ACCESS CREDENTIALING — named credentials (DBIDS/RAPIDGate/CAC) + the installation-access pair in
  //      BOTH orders with verb forms (badged/vetted) and entry nouns (entry/admittance) — round-1 iv-1/iv-2.
  /\b(?:DBIDS|RAPIDGate|common\s+access\s+card)\b|\bCAC\s+(?:card|credential|eligib\w+|required)\b/i,
  /\b(?:badg\w+|vett\w+|credential\w+|cleared)\b[^.\n]{0,40}\b(?:installation|base|post|site|garrison)\s+(?:access|entry|admittance)\b/i,
  /\b(?:installation|base|post|site|garrison)\s+(?:access|entry|admittance)\b[^.\n]{0,40}\b(?:credential\w*|badg\w+|pass(?:es)?\b|clearance|vett\w+|background|registration|control\s+system)\b/i,
  // (v) APPROVED-SOURCE — list forms (QSL/APL/approved-X-list), post-positive "source(s) approved by" and
  //     hyphenated "source-approved" (the dominant DLA/ESA forms, round-1 v-1/v-2), status-as form ("as an
  //     approved source"), and source-approval noun. The bare-narrative over-catch (an ASL-management
  //     past-performance factor) is ACCEPTED and banked as a control — escalate is the safe pole.
  //     Round-3: QPD (DLA's CURRENT name for the QPL — qpldocs.dla.mil), manufacturer/bidder/dealer/contractor
  //     in the list-noun slot + AML, "qualifying activity" as an approval actor, list-noun database sibling.
  /\b(?:approved|qualified)\s+(?:source|supplier|vendor|product|manufacturer|bidder|dealer|contractor)s?\s+(?:list|database)\b|\bQSL\b|\bAPL\b|\bAML\b|\bQPD\b/i,
  /\b(?:sources?|manufacturers?|suppliers?|vendors?|dealers?)\s+(?:approved|qualified)\s+by\b|\bsource[- ]approv\w+\b|\bsource\s+approval\b|\bsource[- ]control(?:led)?\b|\bsource\s+control\s+(?:drawing|document)\b|\bqualifying\s+activity\b/i,
  /\b(?:as|being|be)\s+an?\s+approved\s+(?:source|supplier|vendor)\b|\b(?:must|shall|only)\b[^.\n]{0,30}\bapproved\s+(?:source|supplier|vendor)s?\b/i,
];

// WHO-MAY-BID RESTRICTION SHAPE (Gauntlet round-4 BREAK) — an ACTOR-AGNOSTIC definitive eligibility restriction on
// who may be awarded/compete ("only <any actor> are eligible/considered/awarded", "award limited/restricted to",
// "OEM-authorized distributor"). classifyGateShape's who-may-bid arm only enumerated firms/offerors/contractors, so
// non-standard actors (distributors/manufacturers/dealers) slipped. SCOPED to the RESTRICTIVE "only … eligible" /
// "limited/restricted to" / "authorized-channel" forms — deliberately NOT the bare LPTA "will not be considered for
// award" RATING consequence (that is a §M ratable outcome → demote, MM_EVAL_FRAMING owns it). Any hit ⇒ escalate.
const WHO_MAY_BID_RESTRICTION: RegExp[] = [
  /\bonly\b[^.\n]{0,70}\b(?:are|is|shall\s+be|will\s+be|may\s+be|to\s+be)\s+(?:eligible|considered|awarded|qualified|permitted|allowed|selected)\b/i,
  /\bonly\b[^.\n]{0,60}\b(?:may|can)\s+(?:submit|bid|compete|respond|be\s+awarded|receive\s+an?\s+award)\b/i,
  /\baward\s+(?:is\s+|will\s+be\s+)?(?:limited|restricted|reserved)\s+to\b/i,
  /\b(?:limited|restricted|reserved)\s+to\s+(?:firms?|offerors?|contractors?|distributors?|manufacturers?|dealers?|resellers?|producers?|vendors?|entities|holders?|sources?|those\s+(?:that|who))\b/i,
  /\b(?:OEM|manufacturer|factory)[- ]?authorized\b|\bauthorized\s+(?:distributor|dealer|reseller|representative|partner|source)\b/i,
  // NEGATIVE polarity (Gauntlet round-5) — a CLASS declared INELIGIBLE / not eligible / disqualified / excluded from
  // award. Keys on ELIGIBILITY STATUS ("not eligible" / "ineligible"), NOT the LPTA quote-RATING consequence
  // ("a quote … will not be CONSIDERED for award"), which stays demote-eligible (MM_EVAL_FRAMING owns it).
  /\b(?:ineligible|not\s+eligible|non-?responsib\w+|not\s+(?:be\s+|been\s+)?(?:considered|determined|deemed|found)\s+(?:to\s+be\s+)?responsib\w+|lack\w*\s+responsib\w+|fail\w*\s+(?:the\s+)?responsib\w+\s+determination)\b|\b(?:disqualified|excluded|barred|precluded|prohibited)\s+from\s+(?:award|consideration|competing|the\s+competition)\b/i,
  // MINIMUM-TENURE FLOOR (round-5 sibling) — a hard "N years in business / in operation" minimum is a definitive-
  // responsibility eligibility floor, not a narratable §M factor. Scoped to business tenure ("in business/operation"),
  // NOT "N years of experience" (which can be a ratable capability narrative).
  /\b(?:minimum|at\s+least|no\s+less\s+than|no\s+fewer\s+than)\s+(?:of\s+)?(?:\w+|\d+)\s+years?\b[^.\n]{0,30}\b(?:in\s+business|in\s+operation|of\s+continuous\s+operation|as\s+a\s+going\s+concern|of\s+corporate\s+existence)\b/i,
  // PROHIBITED / NEGATIVE STRUCTURAL STATUS (Gauntlet round-6) — a "<offeror> must not be <structural status>"
  // prohibition: FOCI (foreign ownership/control/influence), debarred/suspended/excluded, foreign-owned. A negative
  // STRUCTURAL eligibility bar (32 CFR 117 / FAR 9.4), never a narratable §M factor.
  /\b(?:offeror|firm|contractor|company|entity|bidder|vendor|awardee|business|concern|it|they)\b[^.\n]{0,20}\b(?:must|shall|may|will)\s+not\s+be\b[^.\n]{0,45}\b(?:under|subject\s+to|owned|controlled|influenced|affiliated|debarred|suspended|excluded|foreign|a\s+foreign)\b/i,
  /\bforeign\s+own\w+|\bforeign\s+control|\bforeign\s+influence|\bFOCI\b|\bforeign\s+ownership,?\s+control,?\s+or\s+influence\b/i,
  /\bmust\s+not\s+be\s+(?:debarred|suspended|excluded|proposed\s+for\s+debarment|on\s+the\s+(?:excluded|SAM\s+exclusion))\b/i,
  // DEFINITIVE-RESPONSIBILITY MAGNITUDE FLOOR (Gauntlet round-8) — a FAR 9.104-2 special-standard experience floor
  // carrying a DOLLAR-VALUE threshold ("≥N prior contracts each valued at not less than $X", "of $X magnitude"). The
  // dollar magnitude is the discriminator from a bare ratable "at least one relevant contract" (the chapel specimen,
  // no $ → stays a §M factor → demote). A quantified prior-award requirement tied to a dollar floor is a definitive-
  // responsibility bar, not a narratable factor.
  /\b(?:not\s+less\s+than|at\s+least|minimum\s+of|no\s+less\s+than|in\s+excess\s+of|exceeding|greater\s+than|valued\s+at|each\s+valued\s+at|worth)\b[^.\n]{0,30}(?:\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*\s?(?:million|billion|thousand|M|K|B)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hundred\s+)?(?:million|billion|thousand))\b/i,
  /\b(?:contracts?|projects?|task\s+orders?|awards?|efforts?|engagements?)\b[^.\n]{0,60}\b(?:valued|worth|each|totaling|of)\b[^.\n]{0,20}(?:\$\s?\d|\b\d[\d,]*\s?(?:million|billion|thousand)\b)/i,
  /\bof\s+\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:million|billion|thousand|M|K|B)?\s+(?:magnitude|in\s+(?:value|magnitude|total\s+contract\s+value))\b/i,
];

// ── R1 POSITIVE §M-EVIDENCE-FACTOR SHAPE ──────────────────────────────────────────────────────────────
// (i) the SUBSTANCE the offeror writes INTO the quote — a capability statement / past-performance /
//     prior-experience narrative / technical approach / references. This is the "evidenced-inside-the-quote"
//     discriminator: history you narrate, not a status you hold.
const EVIDENCED_IN_QUOTE: RegExp[] = [
  /\b(?:demonstrate|provide|submit|include|show|describe|furnish|address)\b[^.\n]{0,70}\b(?:capability\s+statement|past\s+performance|prior\s+(?:service|experience|delivery|performance)|relevant\s+experience|experience\s+(?:in|with|delivering|providing)|technical\s+(?:approach|narrative|statement|capabilit)|references?)\b/i,
  /\bcapability\s+statement\b|\bpast[- ]performance\s+(?:information|history|references?|narrative|volume)\b/i,
  /\bdemonstrate\s+(?:successful\s+)?(?:delivery|performance|experience|capability)\b/i,
];
// (ii) explicit §M EVALUATION framing — the requirement is a rated factor ("will be evaluated", "technically
//      acceptable", "evaluation criteria", "technical criteria checklist", "not … considered for award").
const MM_EVAL_FRAMING: RegExp[] = [
  /\b(?:will\s+be\s+)?evaluat(?:ed|ion)\b|\bevaluation\s+(?:criteria|factors?)\b/i,
  /\btechnical(?:ly)?\s+(?:acceptab|criteria|suitab)/i,
  /\btechnical\s+criteria\s+checklist\b/i,
  /\bnot\s+(?:be\s+)?(?:technically\s+)?(?:acceptable|considered\s+for\s+award)\b/i,
  /\blowest[- ]price(?:d)?\s+technically\s+acceptable\b|\bLPTA\b/i,
];
// §M POSITION — the citation/section anchor names §M / evaluation. A strong corroborator (not sufficient alone).
const MM_POSITION = /\bsection\s+m\b|\bevaluation\s+(?:criteria|factors?)\b|\btechnical\s+requirements?\b/i;
// The §M arm is SPLIT OUT and CASE-SENSITIVE (ultra #240 Finding C + red-team rounds 1-2): the old `\b§` never
// matched (§ is non-word — \b§ needs a word char GLUED before it, so bare "§M" fell through to escalation). The
// naive `(?:^|\W)§\s?m\b` /i replacement OVER-matched — corroboration widens DEMOTION, so over-match errs against
// the fail-toward-escalation doctrine. Shape (round-2 re-shape — POSITIVE bridge, not a separator blocklist, which
// round 2 punctured with a single comma per the #507 treadmill): uppercase M only (kills "§m(3)" / "§ m"), no
// trailing word/hyphen/paren (kills "§Mod", "§ M-DOT", statute "§M(3)"), and a digit-ANY-bridge lookbehind — a
// digit within 3 chars of the § means a FOREIGN document designator ("AFI 36-2618, § M" / "(§ M)" / "— § M")
// whatever the separator; a genuine cite lost to it ("Item 1 – §M") fails toward escalation, the safe pole.
const MM_POSITION_UCF_ARM = /(?:^|\W)(?<!\d[^§\n]{0,3})§\s?M(?![\w(-])/;
const mmPositionHit = (s: string): boolean => MM_POSITION.test(s) || MM_POSITION_UCF_ARM.test(s);

// ── R3 SOURCE CONTRADICTION — the document itself calls the substance optional/not-required. ────────────
const OPTIONAL_DISCLAIMER: RegExp[] = [
  /\b(?:preferred|desired|desirable|encouraged|beneficial)\b[^.\n]{0,25}\b(?:but\s+)?not\s+(?:required|mandatory)\b/i,
  /\bnot\s+(?:required|mandatory)\b/i,
  /\bpreferred\s*\/\s*not\s+required\b/i,
  /\b(?:is|are)\s+optional\b/i,
];

const anyHit = (res: RegExp[], s: string) => res.some((re) => re.test(s));

// R3 co-reference — GENERIC tokens (shared by unrelated requirements) are NOT distinctive enough to link an
// optional-disclaimer sentence to THIS requirement. Gauntlet round-1 BREAK #3: an unrelated "…not required" false-
// demoted an FAA-145 bar because both merely shared "experience". R3 now requires a DISTINCTIVE content noun in
// common (a domain term the two sentences genuinely co-refer on), never a bare generic.
const R3_GENERIC = new Set(["experience", "performance", "delivery", "deliver", "service", "services", "prior",
  "successful", "demonstrate", "provide", "capability", "capabilities", "technical", "offeror", "required",
  "requirement", "requirements", "contractor", "contract", "quote", "proposal", "statement", "position", "type"]);

/** True when SOURCE text contradicts a bar reading of the requirement (calls the SAME substance optional).
 *  Deterministic. Requires a DISTINCTIVE (non-generic) content noun shared between the requirement and an
 *  optional-disclaimer sentence — a generic overlap ("experience") is NOT enough (Gauntlet BREAK #3). Pure. */
export function sourceContradictsBar(requirement: string, source?: string): boolean {
  if (!source) return false;
  const distinctive = (requirement.toLowerCase().match(/\b[a-z][a-z'-]{4,}\b/g) ?? [])
    .filter((w) => !R3_GENERIC.has(w));
  if (!distinctive.length) return false; // nothing distinctive to co-refer on → never demote via R3
  const sentences = source.split(/(?<=[.!?])\s+|\n+/);
  for (const sent of sentences) {
    if (!anyHit(OPTIONAL_DISCLAIMER, sent)) continue;
    const lower = sent.toLowerCase();
    if (distinctive.some((tok) => lower.includes(tok))) return true; // optional-disclaimer sentence co-refers on the SAME distinctive substance
  }
  return false;
}

/** Classify a finding's requirement/excerpt/citation for §M-evidence-factor demotion (card #538). Pure.
 *  Order: SHAPE-ALLOWLIST veto FIRST (classifyGateShape → profile_bar / set_aside_caution ⇒ escalate) → R1 positive
 *  §M-evidence shape (evidenced-in-quote substance corroborated by §M eval framing / §M position / an R3 source
 *  contradiction) → else not_applicable. Ambiguity ⇒ NOT demoted (fail toward escalation). */
export function classifyMmEvidenceFactor(
  parts: { requirement?: string; excerpt?: string; citation?: string },
  source?: string,
): MmEvidenceVerdict {
  const requirement = parts.requirement ?? "";
  const excerpt = parts.excerpt ?? "";
  const citation = parts.citation ?? "";
  const text = `${requirement}\n${excerpt}`;          // CONTENT only — citation kept separate (position signal, never bar-keying)
  // R2 VETO — the ratified SHAPE allowlist (card #526/#528) over BOTH the requirement AND the grounding excerpt
  // (Gauntlet round-2 BREAK A-excerpt: a held-credential bar whose HOLD-substance lived in the excerpt slipped a
  // requirement-only veto). A held credential/status/clearance/QPL/holder/possession → profile_bar; a socioeconomic/
  // size set-aside or affiliation → set_aside_caution — BOTH have their own handling, never a §M quote-evidence
  // factor. Plus a POSITIVE held-credential/status shape (license/bond/insurance/registration/citizenship) that
  // classifyGateShape under-catches (BREAK A). Any hit ⇒ escalate. Only a clean do_the_work/neither shape demotes.
  const vetoed = (s: string): boolean => { const g = classifyGateShape(s); return g === "profile_bar" || g === "set_aside_caution"; };
  if (vetoed(requirement) || (excerpt && vetoed(excerpt))) return "escalate";
  if (anyHit(HELD_CREDENTIAL_SHAPE, text)) return "escalate";
  if (anyHit(R10_THIRD_PARTY_STATUS, text)) return "escalate";  // conferred third-party status (card #545 R10 — the six leak shapes)
  if (anyHit(WHO_MAY_BID_RESTRICTION, text)) return "escalate"; // actor-agnostic who-may-bid restriction (round-4/5/6)
  if (BOA_IDIQ_HOLDER_BAR_RE.test(text)) return "escalate";      // contract-vehicle holder-only gate (round-7, ratified regex)
  // R1 — positive evidenced-in-quote substance is REQUIRED (the core discriminator). Corroboration then required:
  //   §M eval framing in the text, OR the citation/anchor names §M / evaluation / technical requirements,
  //   OR the source contradicts a bar reading (R3, distinctive co-reference). Substance alone (no §M corroboration,
  //   no contradiction) is NOT enough — it fails toward escalation (a bare "experience" mention is left alone).
  const hasSubstance = anyHit(EVIDENCED_IN_QUOTE, text);
  if (!hasSubstance) return "not_applicable";
  const mmCorroborated = anyHit(MM_EVAL_FRAMING, text) || mmPositionHit(citation) || mmPositionHit(text);
  const r3 = sourceContradictsBar(requirement, source);
  if (mmCorroborated || r3) return "demote";
  return "not_applicable";
}

/** Apply the §M-evidence-factor demotion to a single finding (card #538 R1/R3). A matched DISQUALIFYING finding is
 *  re-typed to a curable competitive caution — bidder_controls + curableInWindow=true + cautionFloor=true — so
 *  deriveVerdict routes it to the BID_WITH_CAUTION floor (branch 5c), never the non-curable/show-stopper poles. The
 *  hard advisory is preserved in `requirement` (unchanged) so the caveat still tells the bidder the rating stakes.
 *  Non-matching findings pass through UNCHANGED (byte-identical when the caller's flag is off). Pure. */
export function demoteMmEvidenceFactor<T extends TypedFinding>(f: T, source?: string): T {
  // only a would-be bar is worth demoting; a gate-to-clear / already-satisfied item is already curable.
  if (f.controllability !== "bidder_cannot_move") return f;
  const v = classifyMmEvidenceFactor({ requirement: f.requirement, excerpt: f.excerpt, citation: f.citation }, source);
  if (v !== "demote") return f;
  return {
    ...f,
    controllability: "bidder_controls",
    curableInWindow: true,
    cautionFloor: true,
    // LOAD-BEARING (ultra #240 Finding B): kind/requiredAttribute survive the demote, so the tristate
    // unverifiedGates filter in audit-decide.ts excludes on THIS marker — without it a demoted factor still
    // clamps eligible=null and names the ML-authored attribute in the customer-facing caution.
    mmEvidenceFactor: true,
  };
}

// ── R4 FABRICATED-MECHANIC GUARD (card #538, unconditional zero-tolerance class; guards ALL bar classes) ──
// A bar/show-stopper justification may only assert a mechanic GROUNDED in source or in a deterministic engine fact.
// The specimen: "lead time exceeds the response window" asserted on findings with NO lead-time/possession basis.
// This predicate is TRUE only when at least one finding carries a genuine long-lead / possession-at-award ground —
// the callers use it to gate the lead-time phrasing (grounded → keep; ungrounded → a neutral grounded caveat form).
const LEAD_TIME_GROUND: RegExp[] = [
  /\blead[- ]time\b|\blong[- ]lead\b|\birreducible\b|\b\d+[- ]day\b[^.\n]{0,20}\b(?:lead|delivery|production)\b/i,
  // DURATION-TO-ACQUIRE SHAPE (Gauntlet round-1 BREAK #4) — a stated processing/acquisition duration is itself a
  // grounded lead-time basis ("takes ~6 months to obtain", "processing time of 90 days", "N weeks to acquire").
  /\b(?:takes?|requires?|processing\s+time\s+of|typically|approximately|~)?\s*\d+\s*(?:business\s+)?(?:day|week|month|year)s?\b[^.\n]{0,40}\b(?:to\s+)?(?:obtain|acquire|process|complete|issue|grant|adjudicat|receive|secure|establish)\w*\b/i,
  /\b(?:security|facility|secret|top[- ]secret)\b[^.\n]{0,15}\bclearance\b|\bfacility\s+clearance\b|\bDD[- ]?254\b/i,
  /\b(?:CMMC|ATO|authority\s+to\s+operate|FedRAMP)\b/i,
  /\bQPL|QML|qualified\s+products?\s+list|approved\s+source\s+list|NADCAP|AS\s?9100\b/i,
  /\b(?:must|shall)\s+(?:already\s+)?(?:hold|possess)\b|\bat\s+time\s+of\s+(?:offer|award)\b|\bprior\s+to\s+(?:award|start|performance)\b[^.\n]{0,30}\b(?:hold|possess|obtain)\b/i,
];
/** R4 — does this set of would-be non-curable findings carry a GROUNDED lead-time / possession-at-award basis?
 *  If false, the "lead time exceeds the response window" mechanic is ungrounded and must not be asserted. Pure. */
export function hasGroundedLeadTimeBasis(findings: Array<{ requirement?: string; excerpt?: string }>): boolean {
  return findings.some((f) => {
    const t = `${f.requirement ?? ""}\n${f.excerpt ?? ""}`;
    return LEAD_TIME_GROUND.some((re) => re.test(t));
  });
}
