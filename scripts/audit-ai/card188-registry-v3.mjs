// Card 188 — SURGICAL text replacement of ONLY the FA860126 registry block → v3 chain
// (v3 active → v2 retired → v1 retired), appending the dated correction to the v1 "NOT mutated" note.
// Text-surgical (not JSON.stringify of the whole file) so every other line — incl. the compact
// keyTypeEnum + guard lines — stays byte-for-byte identical (keeps the diff isolated from the carry). $0.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const G = "scripts/audit-ai/gold-sets";
const R = `${G}/gold-set-registry.json`;
const fileSha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const v2sha = fileSha(`${G}/FA860126Q00260001.judgment.frozen.SYNTHETIC.v2.json`);
const v1sha = fileSha(`${G}/FA860126Q00260001.judgment.frozen.SYNTHETIC.json`);

let text = readFileSync(R, "utf8");
const reg = JSON.parse(text);
const origV1reason = reg.keys["FA860126Q00260001"].supersedes[0].reason;

const entry = {
  active_version: "v3",
  key_type: "full_verdict",
  pole: "CAUTION",
  file: "FA860126Q00260001.judgment.frozen.SYNTHETIC.v3.json",
  synthetic: true,
  _synthetic_note: "Real unrestricted commercial base package (fetched from SAM, source of record) + a clearly-labeled [SYNTHETIC-ADVERSARIAL] SECTION-F First Article contradiction. v3 (Brain card 188 custody repair): the RATIFIED Step-7 BID_WITH_CAUTION judgment (Option-1 temporal doctrine, cards 141/143) re-frozen through the real stamp tooling with a VALID keySha256 (444a9818). Supersedes v2 (NO_BID, keySha d08c3017) which commit 7974b2c mutated IN PLACE without re-stamping; v2 restored to its frozen bytes and retired. Source unchanged (FA860126Q00260001-FULL-SOURCE.v2.complete.txt, 70251625).",
  supersedes: [
    {
      file: "FA860126Q00260001.judgment.frozen.SYNTHETIC.v2.json",
      key_type: "full_verdict",
      status: "retired",
      retired_sha256: v2sha,
      reason: "card 188 chain-of-custody repair: v2 was the properly-frozen NO_BID pole (keySha d08c3017, recompute==stamped once restored). Commit 7974b2c (2026-06-29, Step 7 Option 1 — demote temporal arm to CAUTION-only) mutated this FROZEN v2 IN PLACE — edited expectedVerdict NO_BID to BID_WITH_CAUTION and stripped the trailing newline — WITHOUT re-running the stamp tooling, so content drifted from its stamp (recompute 76b4f66c not equal to stamped d08c3017). Card 188 git-restored v2 to its d08c3017-era frozen bytes (this retired_sha256) and retired it; the ratified CAUTION judgment is re-frozen as v3 under a valid stamp.",
    },
    {
      file: "FA860126Q00260001.judgment.frozen.SYNTHETIC.json",
      key_type: "full_verdict",
      status: "retired",
      retired_sha256: v1sha,
      reason: origV1reason + " [CORRECTION 2026-07-01 (Brain card 188): the 'v1 frozen artifact NOT mutated' claim above was FALSIFIED by commit 7974b2c (2026-06-29, Step 7), which mutated this RETIRED v1 IN PLACE (NO_BID to CAUTION, newline stripped) yielding 9fe099bf. Card 188 git-restored v1 to its 47b9f7a2 retirement bytes (this retired_sha256). Original note preserved above per no-delete discipline.]",
    },
  ],
};

// build the replacement block at the keys-entry indentation (key line 4 spaces, props +4 over JSON.stringify's 2)
const entryStr = JSON.stringify(entry, null, 2);
const block = '    "FA860126Q00260001": ' + entryStr.split("\n").map((l, i) => (i === 0 ? l : "    " + l)).join("\n");

// old block: from the FA860126 key line to its matching close `    }` right before the keys-closing `  },`
const re = /    "FA860126Q00260001": \{[\s\S]*?\n    \}(?=\n  \},)/;
if (!re.test(text)) { console.error("FA860126 block not found — ABORT"); process.exit(1); }
text = text.replace(re, block);

// sanity: still valid JSON + nothing else moved (keyTypeEnum + guard still compact)
JSON.parse(text);
if (!text.includes('"keyTypeEnum": ["full_verdict", "oos_detection"],')) { console.error("keyTypeEnum compact line changed — ABORT"); process.exit(1); }
if (!/"guard": \{ "flag": "AUDIT_SETASIDE_OVERTYPE_GUARD"/.test(text)) { console.error("guard compact line changed — ABORT"); process.exit(1); }
writeFileSync(R, text);
console.log("v2 retired sha256:", v2sha);
console.log("v1 retired sha256:", v1sha);
console.log("registry FA860126 → v3 (surgical). valid JSON, compact lines preserved.");
