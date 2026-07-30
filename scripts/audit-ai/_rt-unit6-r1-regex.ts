// RT Unit6 R1 — FD_CLAUSE_RE collision + key-extraction family.
// Re-derive the same regex the gate uses and probe every collision class the brief names.
const FD_CLAUSE_RE = /\b(?:2?52|[0-9]{3})\.\d{3}-\d{1,4}\b/g;

const cases: Array<{ label: string; text: string; wantKey: boolean; note?: string }> = [
  { label: "FAR 52.217-8", text: "FAR 52.217-8 Option to Extend", wantKey: true },
  { label: "DFARS 252.204-7012", text: "DFARS 252.204-7012 cyber", wantKey: true },
  { label: "agency 652.242-70", text: "DOSAR 652.242-70", wantKey: true },
  { label: "agency 952.204-70", text: "DEAR 952.204-70", wantKey: true },
  { label: "FAR subpart no-hyphen 17.207", text: "per 17.207 the CO evaluates options", wantKey: false, note: "must NOT key" },
  { label: "CFR 13 CFR 121.406(b)", text: "13 CFR 121.406(b) nonmanufacturer", wantKey: false, note: "must NOT key" },
  { label: "bare 121.406 (no paren)", text: "see 121.406 rule", wantKey: false, note: "3-digit.3-digit-... only if -\\d suffix" },
  { label: "version year (Nov 1999)", text: "clause dated (Nov 1999)", wantKey: false },
  { label: "CLIN 0001", text: "CLIN 0001 base year", wantKey: false },
  { label: "date 52 weeks", text: "delivery in 52 weeks-3 days", wantKey: false, note: "52 weeks-3?" },
  { label: "dollar $252.204-7012-like", text: "cost was 252.199-1 units", wantKey: true, note: "collides! 3-digit.3-digit-1" },
  { label: "phone-ish 252.555-1212", text: "call 252.555-1212 for info", wantKey: true, note: "PHONE collides as clause!" },
  { label: "Alternate: 52.212-4 Alternate I", text: "52.212-4 Alternate I applies", wantKey: true },
  { label: "range 52.219-6 to 52.219-30", text: "clauses 52.219-6 to 52.219-30", wantKey: true, note: "TWO keys" },
  { label: "excerpt-only cite", text: "", wantKey: false },
  { label: "CFR 48 CFR 252.204-7012", text: "48 CFR 252.204-7012", wantKey: true, note: "same as DFARS, fine" },
  { label: "IP-address-ish 252.204.7012", text: "252.204.7012 (dot not hyphen)", wantKey: false },
  { label: "big suffix 252.204-70129", text: "252.204-70129 (5-digit suffix)", wantKey: false, note: "\\d{1,4} so -7012 then boundary? 70129 → -\\d{1,4} matches 7012 then 9 breaks \\b" },
  { label: "long clause 52.204-21", text: "52.204-21 basic safeguarding", wantKey: true },
];

for (const c of cases) {
  const keys = [...new Set(c.text.match(FD_CLAUSE_RE) ?? [])];
  const got = keys.length > 0;
  const singleKeyOK = keys.length === 1;
  const flag = got === c.wantKey ? "ok " : "*** MISMATCH";
  console.log(`${flag} [${c.label}] keys=${JSON.stringify(keys)} want=${c.wantKey} single=${singleKeyOK}${c.note ? "  // " + c.note : ""}`);
}

// ReDoS probe: pathological input.
const evil = "252." + "9".repeat(200000) + "-";
const t0 = Date.now();
FD_CLAUSE_RE.lastIndex = 0;
const m = evil.match(FD_CLAUSE_RE);
console.log(`ReDoS: matched=${(m??[]).length} in ${Date.now() - t0}ms on ${evil.length}-char input`);

const evil2 = ("2".repeat(3) + ".").repeat(50000);
const t1 = Date.now();
evil2.match(FD_CLAUSE_RE);
console.log(`ReDoS2: ${Date.now() - t1}ms on ${evil2.length}-char alt input`);
