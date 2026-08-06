// ─────────────────────────────────────────────────────────────────────────────
// Gate — the DETAILS panel's attachment filenames.
//
// SAM publishes real names ("M1_SECTION M - Evaluation Factors for Award.docx")
// but only in a Content-Disposition header, so they are resolved server-side and
// patched into the panel after it opens. That leaves a specific failure the
// customer would never catch: a name landing on the WRONG link. The panel is
// where someone decides whether to spend $1.25–1.50 on an audit, and "Section M
// is attached" is exactly the kind of claim that must not be misplaced.
//
// So this gate drives the SHIPPED functions out of public/dso-app.js — extracted
// by name, the same way _opportunities-row-integrity.test.ts does — rather than
// a copy. A rename on either side of the seam goes red here.
//
// WHAT IS REAL AND WHAT IS STUBBED. The functions are the shipped ones. `fetch`
// is stubbed, because the point is to drive the response shapes the route can
// actually return (nulls, 401, reject, id mismatch) which a live call cannot be
// made to produce on demand. The DOM is a minimal shim over the four APIs these
// functions touch; the same eight cases were also run against a real browser DOM
// on 2026-08-06 and agreed exactly, so the shim is not carrying the result.
//
// Run: npx tsx test/public/_opportunities-attachment-names.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const DSO = readFileSync(path.join(process.cwd(), "public", "dso-app.js"), "utf8");
const HTML = readFileSync(path.join(process.cwd(), "public", "opportunities.html"), "utf8");

function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in public/dso-app.js`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}

// ── a DOM shim covering only what these two functions touch ─────────────────
class El {
  className = "";
  tagName: string;
  dataset: Record<string, string> = {};
  private attrs: Record<string, string> = {};
  textContent = "";
  children: El[] = [];
  constructor(tag: string) { this.tagName = tag; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  // The only selector used is 'a.pd-att[data-att-id]'.
  querySelectorAll(sel: string) {
    if (sel !== "a.pd-att[data-att-id]") throw new Error(`shim does not implement selector ${sel}`);
    return this.children.filter(
      (c) => c.tagName === "a" && c.className.split(/\s+/).includes("pd-att") && c.getAttribute("data-att-id") !== null
    );
  }
}

const IDS = [
  "41a807a93262480ab32a2a68fe60d060",
  "0b53312d536249470667842538686aaa",
  "1d319a3844db445fb1a8abcc89cb74cc"
];
// Transcribed from the live probe, not invented.
const REAL = [
  "M1_SECTION M - Evaluation Factors for Award.docx",
  "Att 10_SBPCD.docx",
  "Solicitation - N0042126R1024.pdf"
];
const linkFor = (id: string) =>
  `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${id}/download`;

let fileIdFromLink: (u: unknown) => string | null;
let loadAttachmentNames: (card: any) => void;
let lastFetchUrl: string | null = null;
const sentUrl = (): string | null => lastFetchUrl;
let fetchCalls = 0;
let fetchImpl: () => Promise<any> = () => Promise.reject(new Error("not set"));

try {
  const sandbox: any = {
    __out: {},
    console,
    Array,
    encodeURIComponent,
    fetch: (u: string) => { fetchCalls++; lastFetchUrl = u; return fetchImpl(); }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn(DSO, "fileIdFromLink") + "\n" + extractFn(DSO, "loadAttachmentNames"), sandbox);
  fileIdFromLink = sandbox.__out.fileIdFromLink;
  loadAttachmentNames = sandbox.__out.loadAttachmentNames;
} catch (e: any) {
  console.log(`\n  ✗ FATAL — cannot load the attachment-name seam: ${e.message}`);
  console.log(`    fileIdFromLink(u) and loadAttachmentNames(card) must stay top-level`);
  console.log(`    functions in public/dso-app.js for this gate to reach them.\n`);
  process.exit(1);
}

function makeCard() {
  const card = new El("div");
  card.className = "pcard";
  for (let i = 0; i < IDS.length; i++) {
    const a = new El("a");
    a.className = "pd-att";
    a.setAttribute("href", linkFor(IDS[i]));
    a.setAttribute("data-att-id", IDS[i]);
    a.textContent = `Document ${i + 1}`;
    card.children.push(a);
  }
  return card;
}
const texts = (c: El) => c.children.map((a) => a.textContent);
const UNTOUCHED = ["Document 1", "Document 2", "Document 3"];
const settle = () => new Promise((r) => setTimeout(r, 20));
const jsonOk = (body: any) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

async function main() {
  // ═══ A · the id extractor ═════════════════════════════════════════════════
  console.log("\nA · fileIdFromLink — the id is the only thing sent to the server");
  ok(fileIdFromLink(linkFor(IDS[0])) === IDS[0], "canonical link yields its 32-hex id");
  ok(fileIdFromLink("https://sam.gov/whatever") === null, "non-canonical link yields null, not a guess");
  ok(fileIdFromLink(null) === null, "null input yields null");
  ok(fileIdFromLink(12345) === null, "non-string input yields null");
  ok(
    fileIdFromLink("https://evil.example.com/files/" + IDS[0] + "/download") === IDS[0],
    "id is extracted by shape (host is the SERVER's problem, not this function's)"
  );

  // ═══ B · the happy path ═══════════════════════════════════════════════════
  console.log("\nB · names arrive — the links are renamed to what SAM published");
  let card = makeCard();
  fetchImpl = jsonOk({ names: IDS.map((id, i) => ({ id, name: REAL[i] })) });
  loadAttachmentNames(card); await settle();
  ok(JSON.stringify(texts(card)) === JSON.stringify(REAL), "all three renamed", texts(card).join(" | "));
  ok(card.dataset.attState === "ok", "state is 'ok'");

  // ═══ C · every failure direction keeps "Document N" ═══════════════════════
  // This is the failure contract: an unread name must cost the customer nothing.
  // A link that still works and says "Document 2" is correct; a blank or a
  // guessed name is not.
  console.log("\nC · every failure direction falls back to 'Document N' — never blank, never a guess");
  const failures: Array<[string, () => Promise<any>, string]> = [
    ["route returns nulls", jsonOk({ names: IDS.map((id) => ({ id, name: null, reason: "http-400" })) }), "none"],
    ["network rejects", () => Promise.reject(new Error("offline")), "err"],
    ["401 session expired", () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }), "err"],
    ["body has no names[]", jsonOk({ reason: "bad-file-id" }), "err"],
    ["names is not an array", jsonOk({ names: "nope" }), "err"],
    ["empty names[]", jsonOk({ names: [] }), "none"]
  ];
  for (const [label, impl, expectState] of failures) {
    card = makeCard();
    fetchImpl = impl;
    loadAttachmentNames(card); await settle();
    ok(
      JSON.stringify(texts(card)) === JSON.stringify(UNTOUCHED) && card.dataset.attState === expectState,
      label,
      `state=${card.dataset.attState}`
    );
  }

  // ═══ D · the misplacement failure ═════════════════════════════════════════
  // The one a customer could not detect: a real filename on the wrong link.
  console.log("\nD · a name is never placed on a link it does not belong to");
  card = makeCard();
  fetchImpl = jsonOk({ names: REAL.map((name) => ({ id: "deadbeef".repeat(4), name })) });
  loadAttachmentNames(card); await settle();
  ok(
    JSON.stringify(texts(card)) === JSON.stringify(UNTOUCHED),
    "ids that match nothing rename nothing (matched by id, NOT by position)",
    texts(card).join(" | ")
  );

  card = makeCard();
  // Same names, REVERSED order, correct ids. Position-matching would mis-assign
  // all three; id-matching puts each name back on its own link.
  fetchImpl = jsonOk({ names: IDS.map((id, i) => ({ id, name: REAL[i] })).reverse() });
  loadAttachmentNames(card); await settle();
  ok(
    JSON.stringify(texts(card)) === JSON.stringify(REAL),
    "a reordered response still lands each name on its own link",
    texts(card).join(" | ")
  );

  console.log("\nE · a partial answer keeps the rest honest");
  card = makeCard();
  fetchImpl = jsonOk({
    names: [
      { id: IDS[0], name: null, reason: "http-500" },
      { id: IDS[1], name: REAL[1] },
      { id: IDS[2], name: null, reason: "no-filename-header" }
    ]
  });
  loadAttachmentNames(card); await settle();
  ok(
    JSON.stringify(texts(card)) === JSON.stringify(["Document 1", REAL[1], "Document 3"]),
    "only the resolved one is renamed; the others stay 'Document N'",
    texts(card).join(" | ")
  );

  // ═══ F · cost ═════════════════════════════════════════════════════════════
  console.log("\nF · one request per card, no matter how often it is opened");
  card = makeCard();
  fetchCalls = 0;
  fetchImpl = jsonOk({ names: IDS.map((id, i) => ({ id, name: REAL[i] })) });
  loadAttachmentNames(card); loadAttachmentNames(card); await settle();
  loadAttachmentNames(card); await settle();
  ok(fetchCalls === 1, "three opens produced exactly one request", `calls=${fetchCalls}`);

  card = makeCard();
  fetchCalls = 0;
  lastFetchUrl = null;
  fetchImpl = jsonOk({ names: [] });
  loadAttachmentNames(card); await settle();
  // Read through a getter: the stub assigns lastFetchUrl inside a closure that
  // control-flow analysis cannot see, so a direct read here narrows to the `null`
  // it was just set to — and every assertion below it folds into a tautology.
  const sent = sentUrl();
  ok(
    sent === "/api/notice-attachments?ids=" + encodeURIComponent(IDS.join(",")),
    "requests the route with a comma-joined id list",
    String(sent)
  );
  ok(
    !!sent && !sent.includes("http"),
    "sends ids only — never a SAM URL (the server rebuilds it; no SSRF surface)"
  );

  // A card with no attachments must not call the route at all.
  const bare = new El("div");
  bare.className = "pcard";
  fetchCalls = 0;
  loadAttachmentNames(bare); await settle();
  ok(fetchCalls === 0, "a card with no attachments makes no request");

  // ═══ G · the markup + CSS the panel depends on ════════════════════════════
  console.log("\nG · the shipped markup and stylesheet still carry this seam");
  ok(DSO.includes('class="pd-att"'), "detailHTML renders anchors with class pd-att");
  ok(DSO.includes("data-att-id"), "detailHTML carries data-att-id");
  ok(/loadAttachmentNames\(card\)/.test(DSO), "loadAttachmentNames is actually CALLED (not just defined)");
  ok(/\.pd-att\{[^}]*display:block/.test(HTML), "opportunities.html styles .pd-att as a block");
  ok(
    /const ATT_SHOWN\s*=\s*\d+/.test(DSO),
    "ATT_SHOWN is a named constant — it bounds both what is listed and what is requested"
  );

  // The list columnises. Without the wrapper the grid rule has nothing to apply
  // to, and a 23-attachment notice silently goes back to 23 stacked rows —
  // which looks fine in a diff and wrong on the screen.
  ok(DSO.includes('class="pd-atts"'), "the attachment list is wrapped in .pd-atts");
  ok(
    /\.pd-atts\{[^}]*display:grid/.test(HTML) && /\.pd-atts\{[^}]*grid-template-columns:repeat\(3,\s*1fr\)/.test(HTML),
    "opportunities.html lays .pd-atts out as THREE equal columns"
  );
  // Row-major flow is what makes 4 documents read as 3 + 1 rather than columns
  // of uneven length. grid-auto-flow defaults to row; an explicit `column` here
  // would silently reorder the list, so assert nothing set it.
  ok(
    !/\.pd-atts\{[^}]*grid-auto-flow:\s*column/.test(HTML),
    "flow stays row-major — 4 documents fill row 1 then wrap to row 2, column 1"
  );
  // Names must wrap, not clip: a truncated filename is worse than no filename,
  // because it reads as authoritative while hiding which document it is.
  ok(
    !/\.pd-att\{[^}]*text-overflow:\s*ellipsis/.test(HTML) &&
      /\.pd-att\{[^}]*overflow-wrap/.test(HTML),
    "long filenames wrap rather than being cut off"
  );
  // The cap and the server ceiling have to stay compatible: asking for more than
  // the route will answer would render "Document N" for the overflow forever.
  const shown = Number(DSO.match(/const ATT_SHOWN\s*=\s*(\d+)/)?.[1] ?? 0);
  const SERVER_MAX = 40; // MAX_ATTACHMENT_IDS in src/lib/sam-attachment-names.ts
  ok(shown > 0 && shown <= SERVER_MAX, `ATT_SHOWN (${shown}) is within the route's ceiling (${SERVER_MAX})`);

  // ═══ H · falsifiability ═══════════════════════════════════════════════════
  // A gate that cannot go red proves nothing. Plant the exact defect this gate
  // exists to catch — position-matching instead of id-matching — and require
  // that the D-section check rejects it.
  console.log("\nH · gate falsifiability (planted positive)");
  const planted: any = { __out: {}, console, Array, encodeURIComponent, fetch: () => fetchImpl() };
  vm.createContext(planted);
  vm.runInContext(
    extractFn(DSO, "loadAttachmentNames").replace(
      "const nm = byId[a.getAttribute('data-att-id')];",
      "const nm = (names[__i++] || {}).name;"
    ).replace(
      "let named = 0;",
      "let named = 0; let __i = 0;"
    ),
    planted
  );
  const badCard = makeCard();
  fetchImpl = jsonOk({ names: IDS.map((id, i) => ({ id, name: REAL[i] })).reverse() });
  planted.__out.loadAttachmentNames(badCard); await settle();
  const plantedMisplaces = JSON.stringify(texts(badCard)) !== JSON.stringify(REAL);
  ok(plantedMisplaces, "a position-matching implementation IS caught by the D check", texts(badCard).join(" | "));

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
