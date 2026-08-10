// THE SPEC PLATE — the capability statement set as an engineering drawing.
//
// A ruled frame, numbered sections, and the corporate data as a title block at the foot.
// The form is the argument: a capability statement is a specification of a supplier, and a
// contracting officer reads drawings all day, so the sheet says "this firm works to a
// drawing" before a word is read.
//
// GEOMETRY IS PORTED FROM THE PLATE, IN POINTS. The reference is authored in CSS px on an
// 8.5in sheet at 96dpi; a point is px × 0.75. Converting by eye is how a type scale ends up
// a third out, so every figure below is the plate's px value times 0.75 and the px value is
// named beside it where it is not obvious.
//
// THE GRID IS FLEX. @react-pdf/renderer has no CSS grid, so the plate's 12-track title block
// becomes rows of flex children with percentage widths — 1 track = 8.3333%. That is the same
// arrangement, expressed in the only primitive available here.
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import React from "react";
import { PAST_PERFORMANCE_EXPORT_LIMIT } from "@/lib/capability-statement-limits";
import { formatPhone } from "@/lib/capability-statement-format";
import { naicsLines } from "@/lib/capability-statement-naics";
import { orderForAgency } from "@/lib/capability-statement-tailoring";
import { resolveCompetencies, resolveDifferentiators } from "@/lib/capability-statement-sections";
import { imageSize, fitWithin, LOGO_BOX } from "@/lib/capability-statement-logo";
import { DISPLAY, MONO } from "@/lib/capability-statement-fonts";
import type { CapStmt } from "@/lib/capability-statement-pdf-doc";

// Palette — the plate's own values. Not the review sheet's warm greys, which are the
// chrome around the document rather than the document.
const INK = "#0f172a", INK2 = "#475569", INK3 = "#5f6e80";
const LINE = "#b3bfcd", LINE2 = "#dbe2ec";
const ACCENT = "#185FA5", PAPER = "#E9EDF2", PLATE = "#F7F9FB", NAVY = "#0A1628", ONNAVY = "#F6F8FA", NAVYKEY = "#9fb0c4";

// The three ruled floors: sentences 10pt, title-block values 9.4pt, keys 9pt.
const S = { name: 19.5, sentence: 10, capHead: 10.5, difHead: 10.1, value: 9.4, key: 9 };

const st = StyleSheet.create({
  page: { backgroundColor: PAPER, padding: 18.72, fontFamily: DISPLAY, color: INK },
  plate: { flexGrow: 1, borderWidth: 1.1, borderColor: INK, borderStyle: "solid", backgroundColor: PLATE, padding: 2.25 },
  field: { flexGrow: 1, borderWidth: 0.75, borderColor: LINE, borderStyle: "solid", paddingTop: 14.4, paddingHorizontal: 18.72, paddingBottom: 4.32 },

  head: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 10.5, borderBottomWidth: 1.1, borderBottomColor: INK, borderBottomStyle: "solid" },
  co: { fontSize: S.name, fontWeight: 800, letterSpacing: -0.585, lineHeight: 1.02 },
  ttl1: { fontFamily: MONO, fontSize: S.key, fontWeight: 700, letterSpacing: 1.08, color: INK, textAlign: "right" },
  ttl2: { fontFamily: MONO, fontSize: S.key, letterSpacing: 0.54, color: INK3, lineHeight: 1.5, marginTop: 4.5, textAlign: "right" },

  sh: { flexDirection: "row", alignItems: "center", marginTop: 16.5, marginBottom: 6.75 },
  shN: { fontFamily: MONO, fontSize: S.key, fontWeight: 700, color: "#fff", backgroundColor: ACCENT, paddingVertical: 3, paddingHorizontal: 4.5, letterSpacing: 0.54 },
  shT: { fontFamily: MONO, fontSize: S.key, fontWeight: 700, letterSpacing: 1.53, marginLeft: 6.75 },
  shR: { flexGrow: 1, height: 0.75, backgroundColor: LINE, marginLeft: 6.75 },

  caps: { flexDirection: "row" },
  capT: { fontFamily: MONO, fontSize: S.key, fontWeight: 500, color: ACCENT, letterSpacing: 0.72, marginBottom: 4.5 },
  capH: { fontSize: S.capHead, fontWeight: 700, lineHeight: 1.22, letterSpacing: -0.147, marginBottom: 3 },
  capB: { fontSize: S.sentence, lineHeight: 1.36, color: INK2, marginBottom: 5.25 },
  capS: { fontFamily: MONO, fontSize: S.key, color: INK3, lineHeight: 1.4, paddingTop: 3, borderTopWidth: 0.75, borderTopColor: LINE, borderTopStyle: "dashed", marginTop: "auto" },

  difRow: { flexDirection: "row" },
  dif: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.75, borderBottomColor: LINE2, borderBottomStyle: "solid" },
  difM: { fontFamily: MONO, fontSize: S.key, fontWeight: 700, color: ACCENT, width: 13.68 },
  difH: { fontSize: S.difHead, fontWeight: 700, lineHeight: 1.24 },
  difB: { fontSize: S.sentence, lineHeight: 1.34, color: INK2, marginTop: 1.5 },

  pp: { borderWidth: 0.75, borderColor: LINE, borderStyle: "solid", backgroundColor: "#fff" },
  ppRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: LINE2, borderBottomStyle: "solid" },
  ppHead: { backgroundColor: PAPER, borderBottomWidth: 0.75, borderBottomColor: LINE },
  ppHeadCell: { fontFamily: MONO, fontSize: S.key, fontWeight: 500, letterSpacing: 1.08, color: INK2, paddingVertical: 2.25, paddingHorizontal: 6 },
  ppT: { fontSize: S.difHead, fontWeight: 700, lineHeight: 1.24, paddingVertical: 2.25, paddingHorizontal: 6 },
  ppA: { fontSize: S.sentence, lineHeight: 1.26, color: INK2, paddingVertical: 2.25, paddingHorizontal: 6 },
  ppM: { fontFamily: MONO, fontSize: S.key, color: INK2, lineHeight: 1.28, paddingVertical: 2.25, paddingHorizontal: 6 },
  ppNote: { fontFamily: MONO, fontSize: S.key, color: INK3, lineHeight: 1.45, marginTop: 6.75 },

  tb: { marginTop: "auto", borderTopWidth: 1.1, borderTopColor: INK, borderLeftWidth: 0.75, borderLeftColor: LINE, borderStyle: "solid" },
  tbRow: { flexDirection: "row" },
  cell: { borderRightWidth: 0.75, borderRightColor: LINE, borderBottomWidth: 0.75, borderBottomColor: LINE, borderStyle: "solid", paddingVertical: 6, paddingHorizontal: 7.5 },
  k: { fontFamily: MONO, fontSize: S.key, letterSpacing: 1.17, color: INK3, marginBottom: 3 },
  v: { fontFamily: MONO, fontSize: S.value, fontWeight: 500, letterSpacing: -0.094 },
  sub: { fontFamily: MONO, fontSize: S.key, color: INK3, marginTop: 2.25, lineHeight: 1.3 }
});

const TRACK = 100 / 12;
const span = (n: number) => ({ width: `${(TRACK * n).toFixed(4)}%` });

/** One title-block cell. `hi` is the single inverted cell the plate uses to anchor the
 *  block; it carries the first field present, not a fixed one, because which fields exist
 *  varies by profile. */
function Cell({ k, v, sub, tracks, hi }: { k: string; v: string; sub?: string | null; tracks: number; hi?: boolean }) {
  return (
    <View style={[st.cell, span(tracks), hi ? { backgroundColor: NAVY } : {}]}>
      <Text style={[st.k, hi ? { color: NAVYKEY } : {}]}>{k.toUpperCase()}</Text>
      <Text style={[st.v, hi ? { color: ONNAVY } : {}]}>{v}</Text>
      {sub ? <Text style={[st.sub, hi ? { color: NAVYKEY } : {}]}>{sub}</Text> : null}
    </View>
  );
}

interface Field { k: string; v: string; sub?: string | null; tracks: number }

/** THE BLOCK IS BUILT FROM THE FIELDS THAT EXIST, not from a fixed nine-cell template.
 *  The reference plate was measured with every cell populated; a real profile is missing
 *  some, and a cell printed with nothing in it is the "asked and answered: nothing" claim
 *  the empty-section rule exists to prevent. Rows are packed to 12 tracks in the plate's
 *  order, and a row that does not fill is stretched so the block still rules to both edges
 *  — a short final row with a gap reads as a drawing error rather than as a short record. */
function rowsOf(fields: Field[]): Field[][] {
  const rows: Field[][] = [];
  let row: Field[] = [];
  let used = 0;
  for (const f of fields) {
    if (used + f.tracks > 12 && row.length) { rows.push(row); row = []; used = 0; }
    row.push(f); used += f.tracks;
  }
  if (row.length) rows.push(row);
  return rows.map((r) => {
    const total = r.reduce((n, f) => n + f.tracks, 0);
    if (total === 12) return r;
    const grow = (12 - total) / r.length;
    return r.map((f) => ({ ...f, tracks: f.tracks + grow }));
  });
}

export function PlatePage({ stmt, generatedAt, logo, agency }: {
  stmt: CapStmt; generatedAt: string; logo: Buffer | null; agency: string | null;
}): React.ReactElement {
  const company = String(stmt.company_name || "");
  const comps = resolveCompetencies(stmt).items;
  const difs = resolveDifferentiators(stmt).items;
  const past = orderForAgency(stmt.past_performance || [], agency).filter((p) => p.title || p.notice_id);
  const shown = past.slice(0, PAST_PERFORMANCE_EXPORT_LIMIT);
  const logoBox = logo ? fitWithin(imageSize(logo), LOGO_BOX.width, LOGO_BOX.height) : null;
  const codes = naicsLines(stmt.naics_codes || []);
  // TWO REGISTRIES, TWO CELLS — card 825 §3, ruled by Design 2026-08-09.
  // Every certification used to print under one key reading "SBA certified · Verified against
  // SAM". SDVOSB is not an SBA certification: SAM carries it as a self-certified entry in the
  // sibling list, not in `sbaBusinessTypeList`. Printed beside HUBZone under that key it borrows
  // the registry's credibility, which on a document a contracting officer reads is a false
  // credential claim. It is masked today only because this customer's array is empty.
  //
  // Design rejected "HUBZone (SBA certified) · SDVOSB (self-certified)" and the reasoning is the
  // rule the whole card rests on: a qualifier may sit under a value only when it describes the
  // same entity. "Self-certified" does not describe SDVOSB — it describes where the claim came
  // from, and a property of the FIELD belongs in the KEY. Same ruling as UEI versus CAGE: two
  // registries of different reliability are two fields, not one field with a footnote.
  //
  // The split is by an explicit allowlist of the programs SBA itself certifies, and it FAILS
  // TOWARD THE WEAKER CLAIM: anything unrecognised is reported as self-certified. A new program
  // name arriving from SAM is then understated, never overstated — the direction that cannot put
  // an unearned credential on a customer's letterhead.
  const SBA_CERTIFIED = ["8(a)", "8A", "HUBZONE", "WOSB", "EDWOSB", "SDB", "SDVOSB", "VOSB"];
  const allCerts = (stmt.certifications || []).filter(Boolean).map(String);
  const isSbaCertified = (c: string) => {
    const t = c.toUpperCase().replace(/[^A-Z0-9()]/g, "");
    return SBA_CERTIFIED.some((p) => t === p.toUpperCase().replace(/[^A-Z0-9()]/g, ""));
  };
  const certs = allCerts.filter(isSbaCertified);
  const selfCerts = allCerts.filter((c) => !isSbaCertified(c));

  // THE WEB HOST PRINTS ONLY WHEN IT DIFFERS FROM THE EMAIL DOMAIN, or it is the same fact
  // twice in a block where every cell is a different fact.
  const emailDomain = String(stmt.contact_email || "").split("@")[1] || "";
  const host = String(stmt.contact_website || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const webCell = host && host.toLowerCase() !== emailDomain.toLowerCase() ? host : null;

  // The comma belongs to the title, not to the name, so a record with no title does not
  // print "Dana Whitfield," with a trailing comma.
  const contactValue = stmt.contact_name
    ? String(stmt.contact_name) + (stmt.contact_title ? `, ${stmt.contact_title}` : "")
    : null;

  const addr = String(stmt.contact_address || "").trim();
  const addrParts = addr ? addr.split(/,\s*(?=[^,]*$)/) : [];

  const fields: Field[] = [];
  // Only SBA-verified programs reach this cell. cert-sync writes nothing it did not read
  // from SAM, so what is here is a registry fact and the key says which registry.
  if (certs.length) fields.push({ k: "SBA certified", v: certs.join(" · "), sub: "Verified against SAM", tracks: 4 });
  // No "verified" subtitle here, deliberately: nobody verified it. The key is the whole claim.
  if (selfCerts.length) fields.push({ k: "Self-certified", v: selfCerts.join(" · "), tracks: 4 });
  // SAM REGISTRATION — the ninth ruled cell. There is no field for it: the record carries no
  // registration status and no reps-and-certs currency, and neither may be typed by the customer.
  // "Active" is a fact SAM owns, and a firm whose registration lapsed printing "Active" over its
  // own signature is the one error this document cannot make. The cell is wired to a value that
  // does not exist yet, so under the empty-section rule it simply does not render — and when the
  // SAM sync lands it appears without a layout change.
  const samRegistration = typeof stmt.sam_registration_status === "string" ? stmt.sam_registration_status.trim() : "";
  if (samRegistration) fields.push({ k: "SAM registration", v: samRegistration, sub: "Read from SAM, never typed", tracks: 4 });
  if (stmt.uei) fields.push({ k: "UEI", v: String(stmt.uei), tracks: 2 });
  if (stmt.cage_code) fields.push({ k: "CAGE", v: String(stmt.cage_code), tracks: 2 });
  if (addr) fields.push({ k: "Address", v: addrParts[0] || addr, sub: addrParts[1] || null, tracks: 3 });
  if (codes.length) {
    fields.push({
      k: "Primary NAICS",
      v: codes[0].title ? `${codes[0].code}  ${codes[0].title}` : codes[0].code,
      sub: codes.length > 1 ? codes.slice(1).map((c) => c.code).join(" · ") : null,
      tracks: 5
    });
  }
  if (contactValue) fields.push({ k: "Contact", v: contactValue, sub: formatPhone(stmt.contact_phone) || null, tracks: 5 });
  if (stmt.contact_email) fields.push({ k: "Email", v: String(stmt.contact_email), sub: webCell, tracks: 7 });

  const capWidth = comps.length ? `${(100 / comps.length).toFixed(4)}%` : "100%";

  return (
    <Page size="LETTER" style={st.page}>
      <View style={st.plate}>
        <View style={st.field}>

          <View style={st.head}>
            <View style={{ width: "63%" }}>
              {logo && logoBox ? <Image src={logo} style={{ width: logoBox.width, height: logoBox.height, marginBottom: 6 }} /> : null}
              <Text style={st.co}>{company.toUpperCase()}</Text>
            </View>
            <View style={{ width: "34%" }}>
              <Text style={st.ttl1}>CAPABILITY STATEMENT</Text>
              {/* DERIVED, NOT ASSERTED. The plate is designed as a single sheet, but a literal
                  one-of-one becomes false the moment a long record wraps to a second page — and
                  it would be false on the very page asserting it. react-pdf resolves the count
                  per page at render time. */}
              <Text style={st.ttl2} render={({ pageNumber, totalPages }) => `SHEET ${pageNumber} OF ${totalPages}`} fixed />
              <Text style={st.ttl2}>{`ISSUED ${generatedAt}`}</Text>
              {/* Which edition this is — a statement about the document, never about the firm. */}
              {agency ? <Text style={st.ttl2}>{`PREPARED FOR ${String(agency).toUpperCase()}`}</Text> : null}
            </View>
          </View>

          {comps.length ? (
            <>
              <View style={st.sh}>
                <Text style={st.shN}>01</Text>
                <Text style={st.shT}>CORE COMPETENCIES</Text>
                <View style={st.shR} />
              </View>
              <View style={st.caps}>
                {comps.map((c, i) => (
                  <View key={i} style={[
                    { width: capWidth, paddingHorizontal: 10.5, flexDirection: "column" },
                    i === 0 ? { paddingLeft: 0 } : { borderLeftWidth: 0.75, borderLeftColor: LINE2, borderStyle: "solid" },
                    i === comps.length - 1 ? { paddingRight: 0 } : {}
                  ]}>
                    {c.k ? <Text style={st.capT}>{c.k.toUpperCase()}</Text> : null}
                    <Text style={st.capH}>{c.h}</Text>
                    {c.b ? <Text style={st.capB}>{c.b}</Text> : null}
                    {c.s ? <Text style={st.capS}>{c.s}</Text> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {difs.length ? (
            <>
              <View style={st.sh}>
                <Text style={st.shN}>02</Text>
                <Text style={st.shT}>DIFFERENTIATORS</Text>
                <View style={st.shR} />
              </View>
              {/* Two per row, written into the markup: there is no flex line-wrap that
                  would pair them, and the pairing is part of the layout rather than a
                  consequence of the container width. */}
              {Array.from({ length: Math.ceil(difs.length / 2) }, (_, r) => (
                <View key={r} style={st.difRow}>
                  {[difs[r * 2], difs[r * 2 + 1]].map((d, c) => (
                    <View key={c} style={[{ width: "50%" }, c === 0 ? { paddingRight: 11 } : { paddingLeft: 11 }]}>
                      {d ? (
                        <View style={st.dif}>
                          <Text style={st.difM}>{String.fromCharCode(65 + r * 2 + c)}</Text>
                          <View style={{ flexGrow: 1, flexShrink: 1 }}>
                            <Text style={st.difH}>{d.h}</Text>
                            {d.b ? <Text style={st.difB}>{d.b}</Text> : null}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </>
          ) : null}

          {shown.length ? (
            <>
              <View style={st.sh}>
                <Text style={st.shN}>03</Text>
                <Text style={st.shT}>PAST PERFORMANCE</Text>
                <View style={st.shR} />
              </View>
              <View style={st.pp}>
                <View style={[st.ppRow, st.ppHead]}>
                  <Text style={[st.ppHeadCell, { width: "40%" }]}>REQUIREMENT</Text>
                  <Text style={[st.ppHeadCell, { width: "28%" }]}>AWARDING AGENCY</Text>
                  <Text style={[st.ppHeadCell, { width: "20%" }]}>CONTRACT</Text>
                  <Text style={[st.ppHeadCell, { width: "12%" }]}>AWARD</Text>
                </View>
                {shown.map((p, i) => (
                  <View key={i} style={[st.ppRow, i === shown.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                    <Text style={[st.ppT, { width: "40%" }]}>{p.title || p.notice_id}</Text>
                    <Text style={[st.ppA, { width: "28%" }]}>{p.agency || ""}</Text>
                    <Text style={[st.ppM, { width: "20%" }]}>{p.notice_id || ""}</Text>
                    {/* An absent award value stays blank — never a dash, never a zero. */}
                    <Text style={[st.ppM, { width: "12%" }]}>{p.period || ""}</Text>
                  </View>
                ))}
              </View>
              {past.length > shown.length ? (
                <Text style={st.ppNote}>{`The ${shown.length} most recent of ${past.length} awards.`}</Text>
              ) : null}
            </>
          ) : null}

          {fields.length ? (
            <View style={st.tb}>
              {rowsOf(fields).map((row, r) => (
                <View key={r} style={st.tbRow}>
                  {row.map((f, c) => (
                    <Cell key={c} k={f.k} v={f.v} sub={f.sub} tracks={f.tracks} hi={r === 0 && c === 0} />
                  ))}
                </View>
              ))}
            </View>
          ) : null}

        </View>
      </View>
    </Page>
  );
}
