// $0 REGRESSION — Brain card 285 ROOT: the Anthropic json_schema validator 400s on `minProperties`/`maxProperties`.
// Card 274 shipped `minProperties:1` in the skeptic schema → every skeptic call 400'd → sound=false → EVERY audit
// honest-failed silently. sanitizeSchema deep-strips those keywords so the class can never recur. Prove it strips
// them at any depth while preserving all supported keywords.
import { sanitizeSchema } from "@/lib/anthropic-structured";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

const dirty = {
  type: "object", additionalProperties: false, minProperties: 1, required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array", maxProperties: 9,
      items: { type: "object", minProperties: 1, additionalProperties: false, properties: { index: { type: "integer" }, corrected: { type: "object", minProperties: 1, properties: { c: { type: "string" } } } } },
    },
  },
};

const clean = sanitizeSchema(dirty);
const s = JSON.stringify(clean);
ok("top-level minProperties stripped", s.includes("minProperties"), false);
ok("nested maxProperties stripped", s.includes("maxProperties"), false);
ok("supported keywords preserved (type/required/properties/additionalProperties/items)", clean.type === "object" && Array.isArray(clean.required) && !!clean.properties && clean.additionalProperties === false, true);
ok("deep structure intact (corrected.properties.c survives)", (clean as any).properties.verdicts.items.properties.corrected.properties.c.type, "string");
ok("original object NOT mutated (pure)", (dirty as any).minProperties, 1);
// a plain schema with no unsupported keywords is returned equal
const plain = { type: "object", properties: { a: { type: "string" } } };
ok("no-op on a clean schema", sanitizeSchema(plain), plain);

console.log(`\ncard285 schema sanitizer — ${pass} passed, ${fails.length} failed`);
for (const x of fails) console.log("  ✗ " + x);
process.exit(fails.length ? 1 : 0);
