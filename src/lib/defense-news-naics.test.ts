// Run: npx tsx src/lib/defense-news-naics.test.ts
//
// The scorer decides which stories get badged "your codes" on /defense-news, so
// the thing that must be proven is not that it FIRES — a scorer that returns a
// match for everything fires too. Parts C and D are the negative controls: a
// story with nothing to do with the codes must score zero, and the generic words
// every NAICS title shares must be unable to carry a match by themselves.

import {
  scoreArticle,
  distinctiveTerms,
  termWeight,
  scopeKey,
  deskDescription,
  MATCH_FLOOR
} from "./defense-news-naics";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// 336412 Aircraft Engine and Engine Parts Manufacturing
// 332710 Machine Shops
// 541330 Engineering Services
const DESK = ["336412", "332710", "541330"];

// ── A · the corpus derives its own vocabulary ──
console.log("\n── A · derived vocabulary ──");
{
  const t = distinctiveTerms("336412");
  check("336412 keeps 'aircraft'", t.includes("aircraft"), t.join(","));
  check("336412 drops 'manufacturing' as generic", !t.includes("manufacturing"), t.join(","));
  check(
    "'manufacturing' weighs less than 'aircraft'",
    termWeight("manufacturing") < termWeight("aircraft"),
    `mfg=${termWeight("manufacturing").toFixed(2)} air=${termWeight("aircraft").toFixed(2)}`
  );
  check(
    "'services' is below the distinctive floor",
    termWeight("services") < 0.55,
    termWeight("services").toFixed(2)
  );
  check("541330 keeps 'engineering'", distinctiveTerms("541330").includes("engineering"));
  check("a code with no title yields no terms", distinctiveTerms("999999").length === 0);
}

// ── B · real stories in this desk's lane ──
console.log("\n── B · positives ──");
{
  const a = scoreArticle(
    "Air Force awards aircraft engine sustainment contract",
    "The service will overhaul turbine engines across the fleet.",
    DESK
  );
  check("aircraft engine story matches", a.score >= MATCH_FLOOR, String(a.score));
  check("it names 336412", a.matches.some((m) => m.code === "336412"), JSON.stringify(a.matches));
  check(
    "the match carries its reason",
    a.matches[0].terms.includes("aircraft") || a.matches[0].terms.includes("engine"),
    a.matches[0].terms.join(",")
  );
  check(
    "the official title rides along",
    a.matches[0].title === "Aircraft Engine and Engine Parts Manufacturing",
    String(a.matches[0].title)
  );

  const lit = scoreArticle("SBA revises size standard for NAICS 332710", "Machine shops affected.", DESK);
  check("a literal code in the text matches", lit.score >= MATCH_FLOOR, String(lit.score));
  check("literal beats a lone keyword", lit.score > a.score * 0.5, `${lit.score} vs ${a.score}`);

  const head = scoreArticle("Aircraft programs face delay", "", DESK);
  const tail = scoreArticle("Budget news", "A footnote mentions aircraft programs.", DESK);
  check("a headline hit outscores the same word in the body", head.score > tail.score, `${head.score} vs ${tail.score}`);
}

// ── C · NEGATIVE CONTROL · out-of-lane stories must score zero ──
console.log("\n── C · negatives ──");
{
  const offLane = [
    ["Navy christens new destroyer in Mississippi", "The ship enters sea trials next spring."],
    ["Pentagon press secretary briefs reporters on Ukraine aid", "Officials described the latest tranche."],
    ["Federal Register: notice of public meeting", "The committee will convene next month."],
    ["Army selects new physical fitness standard", "Soldiers face revised scoring."]
  ];
  for (const [h, s] of offLane) {
    const r = scoreArticle(h, s, DESK);
    check(`no match: "${h.slice(0, 44)}"`, r.score === 0 && r.matches.length === 0, `score=${r.score} ${JSON.stringify(r.matches)}`);
  }
}

// ── D · NEGATIVE CONTROL · generic NAICS grammar cannot carry a match ──
console.log("\n── D · generic words are inert ──");
{
  const generic = scoreArticle(
    "New manufacturing services and other related products",
    "All other general activities for establishments and equipment.",
    DESK
  );
  check(
    "a sentence built only from NAICS filler words matches nothing",
    generic.score === 0,
    `score=${generic.score} ${JSON.stringify(generic.matches)}`
  );
}

// ── E · NEGATIVE CONTROL · substring collisions ──
console.log("\n── E · whole words only ──");
{
  const sub = scoreArticle("Machinations in the engineered budget", "Aircrafted narratives about enginery.", DESK);
  check("no match inside longer words", sub.score === 0, `${sub.score} ${JSON.stringify(sub.matches)}`);
}

// ── F · no codes on file is not a failed match ──
console.log("\n── F · empty scope ──");
{
  const none = scoreArticle("Air Force awards aircraft engine contract", "", []);
  check("empty code list scores zero", none.score === 0 && none.matches.length === 0);
  check("deskDescription is null with no codes", deskDescription([]) === null);
  check(
    "deskDescription names code and title",
    deskDescription(["336412"]) === "336412 (Aircraft Engine and Engine Parts Manufacturing)",
    String(deskDescription(["336412"]))
  );
  check("an untitled code degrades to the bare code", deskDescription(["999999"]) === "999999");
}

// ── G · the cache key cannot collide across desks ──
console.log("\n── G · scope key ──");
{
  check("order does not change the key", scopeKey(["336412", "332710"]) === scopeKey(["332710", "336412"]));
  check("duplicates do not change the key", scopeKey(["336412", "336412"]) === scopeKey(["336412"]));
  check("different desks get different keys", scopeKey(["336412"]) !== scopeKey(["332710"]));
  check("no codes is the empty scope", scopeKey([]) === "");
  check("whitespace is not a distinct desk", scopeKey([" 336412 "]) === scopeKey(["336412"]));
}

// ── H · SELF-ARM · the suite must be able to go red ──
console.log("\n── H · self-arm ──");
{
  // If check() were inert, every assertion above would print PASS and the exit
  // code below would still be 0. Fire a deliberate false one with the log
  // silenced, confirm the counter moved, then retract it.
  const before = fail;
  const realLog = console.log;
  console.log = () => {};
  check("(self-arm)", false, "deliberate");
  console.log = realLog;
  const armed = fail === before + 1;
  fail = before; // retract the deliberate failure
  pass++;
  if (!armed) {
    console.log("✗ FAIL  the harness cannot record a failure — every result above is meaningless");
    process.exit(1);
  }
  console.log("✓ PASS  a deliberate false assertion was counted as a failure, then retracted");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
