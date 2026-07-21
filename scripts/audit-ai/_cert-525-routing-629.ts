/**
 * CERT — #525 commercial routing fix (Brain card #629 Option A, shape-(i)). $0 gauntlet.
 *   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cert-525-routing-629.ts
 *
 * PROVES:
 *   A. REPRO (flag OFF / legacy): N0016726Q1089 routes routed=false → whole-source (#525).
 *   B. FIX (flag ON / v2): N0016726Q1089 places §B/§C/§L/§M/§I, routing is SAFE (no lens starved), and every lens
 *      reads its SLICE — NOT the full 139k (the 5× cost/wall driver is gone).
 *   C. HONEST-FAIL: a commercial source that would STARVE a lens routes routeOk=false → whole-source fallback (never
 *      a silent slicing error that starves a lens — Brain #629).
 *   D. FLAG-OFF byte-identity: v2=false === legacy (same sectionText); the fix is a strict no-op when OFF.
 *   E. NO-STARVED predicate unit: every commercial lens with a producible owned key must receive one.
 *
 * NO Claude calls (SAM fetch + pure routing only).
 */
import { assembleSamDocumentSet } from "@/lib/sam-attachments";
import { routeCommercialSections, FALLBACK_BUNDLE_KEYS } from "@/lib/panel-doc-class";
import { commercialRoutingSafe, buildPanelInputs } from "@/lib/panel-adapter";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); if (!cond) fails++; };

(async () => {
  const set = await assembleSamDocumentSet("fc808094a7504061a4539003d21f887c", "N0016726Q1089");
  if (!set?.primary) { console.log("❌ fixture fetch failed"); process.exit(2); }
  const src = [set.primary, ...set.attachments].map((d) => `\n\n==== DOCUMENT: ${d.name} ====\n\n${d.text ?? ""}`).join("\n\n").trim();

  // ── A: REPRO (legacy) ──
  const legacy = routeCommercialSections(src);                 // no v2
  ok("A REPRO — legacy routeCommercialSections routed=false (whole-source #525)", legacy.routed === false, `placed=[${legacy.placedKeys.join(",")}]`);

  // ── B: FIX (v2) ──
  const v2 = routeCommercialSections(src, { v2: true });
  ok("B v2 places §B §C §L §M §I", ["B", "C", "L", "M", "I"].every((k) => !!v2.sectionText[k]), `placed=[${v2.placedKeys.join(",")}]`);
  ok("B v2 routing is SAFE (no lens starved)", commercialRoutingSafe(v2.placedKeys));
  const maxSlice = Math.max(...Object.values(v2.sectionText).map((t) => t.length));
  ok("B every lens reads a SLICE, not the full source", maxSlice < src.length, `maxSlice=${maxSlice} < ${src.length} chars`);
  // end-to-end via buildPanelInputs under the flag
  process.env.AUDIT_COMMERCIAL_ROUTING_V2 = "true";
  const piOn = buildPanelInputs(src);
  const wholeOn = FALLBACK_BUNDLE_KEYS.every((k) => piOn.sectionText[k] === src);
  ok("B buildPanelInputs(flag ON) = fallback:none (not whole-source)", !wholeOn, `keys=[${Object.keys(piOn.sectionText).join(",")}]`);

  // ── C: HONEST-FAIL — a commercial source that starves the capture lens ([B,C,L,M]) → whole-source ──
  const clausesOnly = `This is a commercial acquisition. Contract clauses incorporated by reference: 52.212-4, 52.212-5, 52.219-6, 52.222-3, 52.204-7012. The clauses apply to this order. ${"Additional clause text. ".repeat(30)}`;
  const starve = routeCommercialSections(clausesOnly, { v2: true });
  ok("C starvation fixture: only §I placeable (capture [B,C,L,M] gets nothing)", !["B", "C", "L", "M"].some((k) => !!starve.sectionText[k]), `placed=[${starve.placedKeys.join(",")}]`);
  ok("C routing is UNSAFE (a lens would be starved) → fallback", commercialRoutingSafe(starve.placedKeys) === false);

  // ── D: FLAG-OFF byte-identity — the precise invariant: v2:false ≡ the no-opts (pre-change) signature ──
  const noOpts = routeCommercialSections(src);
  const v2False = routeCommercialSections(src, { v2: false });
  ok("D routeCommercialSections(src) === (src,{v2:false}) — sectionText/routed/placedKeys identical",
    JSON.stringify(noOpts) === JSON.stringify(v2False));
  process.env.AUDIT_COMMERCIAL_ROUTING_V2 = "false";
  const piOff = buildPanelInputs(src);
  const wholeOff = FALLBACK_BUNDLE_KEYS.filter((k) => piOff.sectionText[k] === src).length >= FALLBACK_BUNDLE_KEYS.length - 1; // whole-source (one key may be ucf-overlaid)
  ok("D flag-OFF buildPanelInputs = whole-source fallback (unchanged #525 behavior)", wholeOff && noOpts.routed === false);

  // ── E: no-starved predicate unit ──
  ok("E all producible {B,C,I,L,M} placed ⇒ safe", commercialRoutingSafe(["B", "C", "I", "L", "M"]));
  ok("E only [M,C,I] placed ⇒ safe (every lens has ≥1 owned; e.g. capture has C,M)", commercialRoutingSafe(["M", "C", "I"]));
  ok("E only [I] placed ⇒ UNSAFE (capture owns B,C,L,M — starved)", commercialRoutingSafe(["I"]) === false);
  ok("E empty ⇒ UNSAFE", commercialRoutingSafe([]) === false);

  console.log(`\n${fails === 0 ? "✅ ALL PASS" : `❌ ${fails} FAIL`} — #525 commercial routing fix cert (Brain #629 Option A)`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
