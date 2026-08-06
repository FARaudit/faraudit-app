// Gate for the notice-attachments reader.
//
// This module exists because of a defect the previous approach could not see: the
// feed's `resourceLinks` is not always complete (4 links where SAM listed 5), so
// a document the government posted never reached the customer. Everything below
// is aimed at the two ways that can happen again — dropping a file SAM listed, or
// rendering one SAM withdrew.
//
// Fixtures are TRANSCRIBED from the live hal+json response, not invented.
//
// Run: npx tsx src/lib/sam-attachment-names.test.ts

import {
  MAX_ATTACHMENTS,
  SAM_FILE_ID_RE,
  downloadUrlForFileId,
  parseAttachments
} from "./sam-attachment-names";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

const ID_A = "6ad63607833b47b3a88dede662a223c5";
const ID_B = "da47a2a00f624c8b803facc899fba5c4";
const ID_C = "41a807a93262480ab32a2a68fe60d060";

// Shape transcribed from the live response.
const att = (over: Record<string, unknown> = {}) => ({
  attachmentId: "x".repeat(32),
  resourceId: ID_A,
  attachmentOrder: 10,
  fileExists: "1",
  name: "FA811926R0011 0006.pdf",
  type: "file",
  postedDate: "2026-07-13T00:00:00.000+0000",
  accessLevel: "public",
  exportControlled: "0",
  explicitAccess: "0",
  mimeType: "application/pdf",
  size: 180049,
  deletedFlag: "0",
  ...over
});
const body = (attachments: unknown[]) => ({
  _embedded: { opportunityAttachmentList: [{ opportunityId: "n".repeat(32), attachments }] }
});

console.log("[parse] a normal response yields every attachment SAM listed");
const three = parseAttachments(body([
  att({ resourceId: ID_A, name: "Solicitation.pdf", attachmentOrder: 3 }),
  att({ resourceId: ID_B, name: "SOW.pdf", attachmentOrder: 1 }),
  att({ resourceId: ID_C, name: "Wage Determination.pdf", attachmentOrder: 2 })
]));
check("all three parsed", three.length, 3);
check("sorted by SAM's attachmentOrder", three.map((a) => a.name), [
  "SOW.pdf", "Wage Determination.pdf", "Solicitation.pdf"
]);
check("url is rebuilt from resourceId", three[0].url, downloadUrlForFileId(ID_B));
check("size carried", three[0].size, 180049);
check("mimeType carried", three[0].mimeType, "application/pdf");
check("not restricted by default", three[0].restricted, false);

console.log("\n[completeness] nothing SAM listed may be dropped — the defect this module exists for");
// Missing/odd optional fields must NOT cost the customer a document.
const sparse = parseAttachments(body([
  { resourceId: ID_A, name: "Only a name.pdf" },
  { resourceId: ID_B },                                   // no name at all
  att({ resourceId: ID_C, attachmentOrder: undefined })   // no order
]));
check("sparse records are all kept", sparse.length, 3);
check("a nameless attachment survives with name null", sparse.find((a) => a.id === ID_B)?.name, null);
check("unknown order does not drop it", sparse.some((a) => a.id === ID_C), true);
// Unrecognised flag values fail OPEN — showing a stale file beats hiding a real one.
check("unknown fileExists value keeps the file", parseAttachments(body([att({ fileExists: "maybe" })])).length, 1);
check("unknown deletedFlag value keeps the file", parseAttachments(body([att({ deletedFlag: "?" })])).length, 1);
check("absent flags keep the file", parseAttachments(body([{ resourceId: ID_A, name: "x.pdf" }])).length, 1);

console.log("\n[withdrawal] only an EXPLICIT SAM signal removes a file");
check("deletedFlag=1 is dropped", parseAttachments(body([att({ deletedFlag: "1" })])).length, 0);
check("fileExists=0 is dropped", parseAttachments(body([att({ fileExists: "0" })])).length, 0);
check(
  "one dropped file does not take the others with it",
  parseAttachments(body([att({ resourceId: ID_A }), att({ resourceId: ID_B, deletedFlag: "1" }), att({ resourceId: ID_C })])).length,
  2
);

console.log("\n[restricted] access-controlled files are flagged, never hidden");
check("exportControlled=1 flags restricted", parseAttachments(body([att({ exportControlled: "1" })]))[0].restricted, true);
check("explicitAccess=1 flags restricted", parseAttachments(body([att({ explicitAccess: "1" })]))[0].restricted, true);
check("a restricted file is still LISTED", parseAttachments(body([att({ explicitAccess: "1" })])).length, 1);

console.log("\n[malformed] junk must not become a link");
check("no resourceId -> not rendered", parseAttachments(body([{ name: "orphan.pdf" }])).length, 0);
check("non-hex resourceId rejected", parseAttachments(body([att({ resourceId: "../../etc/passwd" })])).length, 0);
check("short resourceId rejected", parseAttachments(body([att({ resourceId: ID_A.slice(1) })])).length, 0);
check("url-shaped resourceId rejected", parseAttachments(body([att({ resourceId: "https://evil.example.com" })])).length, 0);
check("empty body -> empty list", parseAttachments({}).length, 0);
check("null body -> empty list", parseAttachments(null).length, 0);
check("garbage body -> empty list", parseAttachments({ _embedded: { opportunityAttachmentList: "no" } }).length, 0);
check("attachments not an array -> empty list", parseAttachments({ _embedded: { opportunityAttachmentList: [{ attachments: 5 }] } }).length, 0);

console.log("\n[bound] a pathological response cannot build an unbounded list");
const many = parseAttachments(body(
  Array.from({ length: MAX_ATTACHMENTS + 25 }, (_, i) =>
    att({ resourceId: i.toString(16).padStart(32, "0"), attachmentOrder: i }))
));
check(`capped at MAX_ATTACHMENTS (${MAX_ATTACHMENTS})`, many.length, MAX_ATTACHMENTS);
// The cap must be well clear of anything real — the largest observed is 23.
check("cap leaves generous headroom over the largest observed notice (23)", MAX_ATTACHMENTS >= 100, true);

console.log("\n[url] the id -> URL rebuild is the only shape we ever emit");
check("canonical download URL", downloadUrlForFileId(ID_C),
  "https://sam.gov/api/prod/opps/v3/opportunities/resources/files/41a807a93262480ab32a2a68fe60d060/download");
check("32-hex accepted", SAM_FILE_ID_RE.test(ID_C), true);
check("traversal rejected", SAM_FILE_ID_RE.test("../../../etc/passwd"), false);

// ─── the cache + the null contract ───────────────────────────────────────────
async function liveShapeChecks() {
  const { fetchNoticeAttachments, __resetAttachmentCache } = await import("./sam-attachment-names");
  const NID = "fc06f70293264e82a61d9d6699f1af4c";
  const realFetch = globalThis.fetch;
  let calls = 0;

  const reply = (status: number, json: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => json }) as unknown as Response;

  console.log("\n[contract] a failed read returns NULL, never an empty list");
  try {
    __resetAttachmentCache();
    globalThis.fetch = (async () => { calls++; return reply(500, {}); }) as typeof fetch;
    const bad = await fetchNoticeAttachments(NID);
    check("HTTP 500 -> attachments is null", bad.attachments, null);
    check("and carries a reason", bad.reason, "http-500");

    __resetAttachmentCache();
    globalThis.fetch = (async () => { throw new Error("socket hang up"); }) as typeof fetch;
    const thrown = await fetchNoticeAttachments(NID);
    check("a thrown fetch -> null, not a crash", thrown.attachments, null);

    check("a malformed notice id is rejected before any fetch",
      (await fetchNoticeAttachments("nope")).reason, "bad-notice-id");

    // A genuine empty answer is DIFFERENT from a failure and must stay so.
    __resetAttachmentCache();
    globalThis.fetch = (async () => { calls++; return reply(200, body([])); }) as typeof fetch;
    const none = await fetchNoticeAttachments(NID);
    check("SAM listing none -> [] (a real answer), not null", none.attachments, []);

    console.log("\n[cache] the list is fetched once per notice");
    __resetAttachmentCache();
    calls = 0;
    globalThis.fetch = (async () => { calls++; return reply(200, body([att({ name: "Section M.docx" })])); }) as typeof fetch;
    const first = await fetchNoticeAttachments(NID);
    const second = await fetchNoticeAttachments(NID);
    check("first read hits the network", calls, 1);
    check("second read is served from cache", calls, 1);
    check("and returns the same names", second.attachments?.[0]?.name, first.attachments?.[0]?.name);

    // A FAILURE must not be cached, or one bad minute pins the notice.
    __resetAttachmentCache();
    calls = 0;
    globalThis.fetch = (async () => { calls++; return reply(503, {}); }) as typeof fetch;
    await fetchNoticeAttachments(NID);
    await fetchNoticeAttachments(NID);
    check("a failed read is NOT cached — it retries", calls, 2);
  } finally {
    globalThis.fetch = realFetch;
    __resetAttachmentCache();
  }
}

liveShapeChecks().then(() => {
  console.log(failures === 0 ? "\nPASS — all checks green" : `\nFAIL — ${failures} check(s) red`);
  process.exit(failures === 0 ? 0 : 1);
});
