// Gate for the attachment-filename parser.
//
// The parser is the only place a name can be silently corrupted: everything else
// in the path either works or returns null. Two failure directions matter and
// BOTH are asserted here, because a parser that never returns a name and a
// parser that returns a wrong name both pass a test that only checks "truthy".
//
// Every Content-Disposition string below was TRANSCRIBED from the live probe
// against sam.gov on 2026-08-06, not invented — the quoted-with-real-spaces form
// is what sam.gov's 303 actually sends, and the +-encoded form is what the
// presigned S3 Location actually carries.
//
// Run: npx tsx src/lib/sam-attachment-names.test.ts

import {
  SAM_FILE_ID_RE,
  downloadUrlForFileId,
  filenameFromContentDisposition
} from "./sam-attachment-names";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

console.log("[positive] real headers from the live probe must yield the real name");
// sam.gov's own 303 — quoted, real spaces.
check(
  "sam.gov quoted form",
  filenameFromContentDisposition('attachment; filename="Sources Sought BMS_Eng_Svcs_Final_REV1.pdf"'),
  "Sources Sought BMS_Eng_Svcs_Final_REV1.pdf"
);
check(
  "quoted, parens + spaces",
  filenameFromContentDisposition('attachment; filename="Att 03_EPF_Award Fee Determination Plan (AFDP).docx"'),
  "Att 03_EPF_Award Fee Determination Plan (AFDP).docx"
);
check(
  "quoted, the SECTION M name a bidder is looking for",
  filenameFromContentDisposition('attachment; filename="M1_SECTION M - Evaluation Factors for Award.docx"'),
  "M1_SECTION M - Evaluation Factors for Award.docx"
);
// The presigned S3 query-param form — + for space, %28/%29 for parens.
check(
  "S3 +-encoded form",
  filenameFromContentDisposition("attachment; filename=Att+03_EPF_Award+Fee+Determination+Plan+%28AFDP%29.docx"),
  "Att 03_EPF_Award Fee Determination Plan (AFDP).docx"
);
check(
  "S3 +-encoded, hyphens and digits",
  filenameFromContentDisposition("attachment; filename=Attachment+J-3++-+WD+2015-5635+REV.30.pdf"),
  "Attachment J-3  - WD 2015-5635 REV.30.pdf"
);
check(
  "RFC-5987 filename* wins when present",
  filenameFromContentDisposition("attachment; filename=fallback.pdf; filename*=UTF-8''Sol%C3%ADcitation%20%C3%A9.pdf"),
  "Solícitation é.pdf"
);

console.log("\n[negative] absent / unusable input must yield null, NEVER a guess or \"\"");
check("null", filenameFromContentDisposition(null), null);
check("undefined", filenameFromContentDisposition(undefined), null);
check("empty string", filenameFromContentDisposition(""), null);
check("no filename param", filenameFromContentDisposition("attachment"), null);
check("inline, no filename", filenameFromContentDisposition("inline"), null);
check("filename present but empty", filenameFromContentDisposition('attachment; filename=""'), null);
check("filename whitespace only", filenameFromContentDisposition("attachment; filename=   "), null);
check("not a header at all", filenameFromContentDisposition("application/octet-stream"), null);

console.log("\n[corruption] the parser must not rewrite a name it did keep");
// A quoted name may legitimately contain '+'. Rewriting it renames the file on
// screen — the wrong-name direction, which a truthiness check would miss.
check(
  "quoted + is NOT turned into a space",
  filenameFromContentDisposition('attachment; filename="C++ Coding Standard.pdf"'),
  "C++ Coding Standard.pdf"
);
// A path separator arriving from upstream is not rendered as a path.
check(
  "path is reduced to its leaf",
  filenameFromContentDisposition('attachment; filename="../../etc/Attachment 1.pdf"'),
  "Attachment 1.pdf"
);
check(
  "backslash path is reduced to its leaf",
  filenameFromContentDisposition('attachment; filename="C:\\\\docs\\\\Attachment 1.pdf"'),
  "Attachment 1.pdf"
);
// Undecodable percent sequences must keep the name, not drop it.
check(
  "lone % keeps the name rather than returning null",
  filenameFromContentDisposition('attachment; filename="100% Design Review.pdf"'),
  "100% Design Review.pdf"
);

console.log("\n[url] the id→URL rebuild is the only shape we ever fetch");
const ID = "41a807a93262480ab32a2a68fe60d060";
check(
  "canonical download URL",
  downloadUrlForFileId(ID),
  "https://sam.gov/api/prod/opps/v3/opportunities/resources/files/41a807a93262480ab32a2a68fe60d060/download"
);
check("32-hex id accepted", SAM_FILE_ID_RE.test(ID), true);
check("31-hex rejected", SAM_FILE_ID_RE.test(ID.slice(1)), false);
check("33-hex rejected", SAM_FILE_ID_RE.test(ID + "a"), false);
check("non-hex rejected", SAM_FILE_ID_RE.test("41a807a93262480ab32a2a68fe60d06z"), false);
// The id is what stands between the route and an SSRF; a traversal attempt must
// not survive the regex, because it is the ONLY thing validating the id.
check("path traversal rejected", SAM_FILE_ID_RE.test("../../../etc/passwd"), false);
check("url-in-id rejected", SAM_FILE_ID_RE.test("https://evil.example.com/x"), false);
check("id with a query string rejected", SAM_FILE_ID_RE.test(ID + "?x=1"), false);

// ─── the cache ───────────────────────────────────────────────────────────────
// A cache is the classic thing that ships doing nothing: the code reads fine, the
// names still appear, and every open still hits the network. So count the actual
// fetches. The second half matters as much as the first — caching a FAILURE
// would pin a notice to "Document N" for the life of the process.
async function cacheChecks() {
  const { resolveAttachmentNames, __resetAttachmentNameCache } = await import("./sam-attachment-names");
  const ID_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ID_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const realFetch = globalThis.fetch;
  let calls = 0;

  const reply = (cd: string | null, status = 303) =>
    ({
      status,
      headers: { get: (k: string) => (k.toLowerCase() === "content-disposition" ? cd : null) },
      body: null
    }) as unknown as Response;

  console.log("\n[cache] a resolved name is fetched once; a FAILURE stays retryable");
  try {
    __resetAttachmentNameCache();

    // A names, B fails.
    globalThis.fetch = (async (input: any) => {
      calls++;
      const u = String(typeof input === "string" ? input : input?.url ?? "");
      return u.includes(ID_A) ? reply('attachment; filename="Section M.docx"') : reply(null, 404);
    }) as typeof fetch;

    const first = await resolveAttachmentNames([ID_A, ID_B]);
    const callsAfterFirst = calls;
    check("first pass names A", first[0].name, "Section M.docx");
    check("first pass leaves B null", first[1].name, null);
    check("first pass made 2 requests", callsAfterFirst, 2);

    const second = await resolveAttachmentNames([ID_A, ID_B]);
    check("second pass still names A", second[0].name, "Section M.docx");
    // Exactly one more request: A served from cache, B retried.
    check("A is cached — only B is re-fetched", calls - callsAfterFirst, 1);
    check("a failed lookup is NOT cached (stays retryable)", second[1].name, null);

    // Now let B succeed on retry — proves the failure really was retryable.
    globalThis.fetch = (async () => { calls++; return reply('attachment; filename="Wage Determination.pdf"'); }) as typeof fetch;
    const third = await resolveAttachmentNames([ID_A, ID_B]);
    check("B resolves on a later attempt", third[1].name, "Wage Determination.pdf");
    check("A still served from cache", third[0].name, "Section M.docx");
  } finally {
    globalThis.fetch = realFetch;
    __resetAttachmentNameCache();
  }
}

cacheChecks().then(() => {
  console.log(failures === 0 ? "\nPASS — all checks green" : `\nFAIL — ${failures} check(s) red`);
  process.exit(failures === 0 ? 0 : 1);
});
