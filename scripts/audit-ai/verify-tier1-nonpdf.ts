// $0 deterministic gate for T1-5 (nonpdf-extractor unicode corruption).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-nonpdf.ts
//
// textToPdfBuffer wraps extracted .docx/.xlsx text into a minimal PDF, serialized
// latin1 (single-byte) with byte-accurate xref offsets. Pre-fix, a code point
// > 0xFF was truncated to its low byte (a control char), corrupting the text the
// clause/fact extractors read. Fix: transliterate to a WinAnsi-safe form first
// (offsets stay byte-exact) + declare /WinAnsiEncoding so Latin-1 accents decode.

import { textToPdfBuffer } from "@/lib/nonpdf-extractor";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

// Unicode-heavy input: em-dash, en-dash, curly quotes, bullet, ellipsis, euro,
// a Latin-1 accent (é, ≤0xFF → must survive), and a >0xFF non-mappable char (中).
const text = "Period of performance—12 months • café “ready” costs €5…done 中";
const buf = textToPdfBuffer(text, "Title—A");
const latin1 = buf.toString("latin1");

// ── content transliteration (no silent corruption) ──
ok("T1-5 R1: em/en dash → '-' (content carries 'performance-12')", latin1.includes("performance-12 months"));
ok("T1-5 R2: bullet → '*'", latin1.includes("* caf"));
ok("T1-5 R3: curly quotes → straight double-quotes around 'ready'", latin1.includes('"ready"'));
ok("T1-5 R4: ellipsis → '...'", latin1.includes("...done"));
ok("T1-5 R5: euro → 'EUR'", latin1.includes("EUR5"));
ok("T1-5 R6: Latin-1 accent é (U+00E9) preserved as byte 0xE9", buf.includes(0xe9) && latin1.includes("café"));
ok("T1-5 R7: >0xFF non-mappable char (中) → '?' (never a truncated control byte)", latin1.includes("done ?"));
ok("T1-5 R8: NO stray 0x14 byte (the em-dash's truncated low byte) anywhere", !buf.includes(0x14));

// ── font encoding ──
ok("T1-5 R9: font declares /WinAnsiEncoding", latin1.includes("/BaseFont /Helvetica /Encoding /WinAnsiEncoding"));

// ── the byte-accurate xref survives transliteration (the offset-drift guard) ──
// Parse the xref offsets from the table and confirm each points at 'N 0 obj'.
const xm = latin1.match(/xref\n0 (\d+)\n([\s\S]*?)\ntrailer/);
ok("T1-5 R10: xref table present", !!xm);
if (xm) {
  const count = Number(xm[1]);
  const lines = xm[2].split("\n"); // line 0 is the free entry; 1..count-1 are objects
  let offsetsOk = true;
  for (let i = 1; i < count; i++) {
    const off = Number(lines[i].slice(0, 10));
    // byte offset must point at the start of "i 0 obj" in the actual serialized bytes
    if (buf.toString("latin1", off, off + `${i} 0 obj`.length) !== `${i} 0 obj`) { offsetsOk = false; break; }
  }
  ok("T1-5 R11: every xref offset still points at its object after transliteration (no drift)", offsetsOk);
}
ok("T1-5 R12: structurally intact (%PDF header + %%EOF)", latin1.startsWith("%PDF-1.4") && latin1.trimEnd().endsWith("%%EOF"));

console.log(`\nTier1 nonpdf (T1-5): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
