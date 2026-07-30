/**
 * RED-TEAM Unit #12 R1 — under-fire (secondary) control.
 * Genuine OCR mojibake whose obligation verbs are corrupted MUST floor (garbled=true).
 * Tests realistic font-substitution garble (a "present but unreadable" text layer, the
 * CBA/CBP case the discriminator was built for), varying how much residual real English
 * survives — to find where the density floor lets true mojibake through as "read_no_obligation".
 */
import { looksGarbled } from "../../src/lib/pdf-ocr";

// (a) Pure font-dump mojibake — near-zero common words. MUST floor.
const PURE_JUNK = `¬þ Æ¢Ø¡™£¢∞§¶•ªº–≠œ∑´®†¥¨ˆøπåß∂ƒ©˙∆˚¬Ω≈ç√∫˜µ≤≥÷¡™£¢∞§¶•ªºΩ≈ç√∫
€‚ƒ„…†‡ˆ‰Š‹ŒŽ''""•–—˜™š›œžŸ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿þýüûúùø÷öõôóòñ
ðïîíìëêéèçæåäãâáàßÞÝÜÛÚÙØ×ÖÕÔÓÒÑÐÏÎÍÌËÊÉÈÇÆÅÄÃÂÁÀ¬þÆ¢Ø¡™£¢∞§¶•ªº–≠œ∑´®
†¥¨ˆøπåß∂ƒ©˙∆˚¬Ω≈ç√∫˜µ≤≥÷¡™£¢∞§¶•ªºΩ≈ç√∫€‚ƒ„…†‡ˆ‰Š‹ŒŽ''""•–—˜™š›œžŸ`;

// (b) Ligature/encoding garble that keeps a FEW short real words — the danger zone.
const PARTIAL_JUNK = `Ìhe ¢ontra¢tor sha11 pr0vïde a11 1ab0r and mater¡a1s ne¢essary t0 perf0rm
Ìhe w0rk under th¡s ¢0ntra¢t. Ìhe 0ffer0r must submït a11 requïred d0¢uments f0r
the ev@1uat¡0n 0f the pr0p0sa1 as des¢r¡bed ¡n se¢t¡0n 1 and se¢t¡0n m 0f th¡s
s01¡¢¡tat¡0n f0r a11 the serv¡¢es t0 be pr0v¡ded under the ¢0ntra¢t and the`;

function check(name: string, text: string) {
  const nonWs = text.replace(/\s+/g, "").length;
  for (const ingest of [false, true]) {
    process.env.AUDIT_TXT_INGEST = ingest ? "true" : "false";
    const g = looksGarbled(text);
    console.log(`${name.padEnd(16)} ingest=${ingest ? "on " : "off"} nonWs=${nonWs} garbled=${g} ${g ? "(floors — correct)" : "*** UNDER-FIRE: mojibake NOT floored ***"}`);
  }
}

// Double them so they clear the 300 non-ws judge threshold.
console.log("=== Under-fire control: genuine mojibake MUST floor (>=300 non-ws) ===");
check("PURE_JUNK x2", PURE_JUNK + PURE_JUNK);
check("PARTIAL_JUNK x2", PARTIAL_JUNK + PARTIAL_JUNK);
console.log("\n=== Short-mojibake escape (len<300 → never floored) ===");
check("PURE_JUNK 1x", PURE_JUNK);
check("PARTIAL_JUNK 1x", PARTIAL_JUNK);
