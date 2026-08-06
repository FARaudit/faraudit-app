// ─────────────────────────────────────────────────────────────────────────────
// Gate — the DETAILS panel's attachment list.
//
// The panel renders the feed's `resource_links` first, then replaces that list
// with SAM's own. It has to, because the feed is not always complete: notice
// 98d55b83… carried 4 links where SAM listed 5, so `Dunnage Kit for POL
// Airlift.pdf` never reached a customer deciding whether to bid. THAT is the
// defect this gate exists for, and section B drives it directly.
//
// The opposite failure matters just as much: a read that fails must never empty
// a list that had working links in it. Sections C and D hold that line.
//
// Drives the SHIPPED functions out of public/dso-app.js, extracted by name the
// same way _opportunities-row-integrity.test.ts does. `fetch` and the DOM are
// shimmed — the point is to drive response shapes a live call cannot be made to
// produce on demand.
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

// ── a DOM shim covering only what these functions touch ─────────────────────
class El {
  tagName: string;
  className = "";
  href = ""; target = ""; rel = ""; title = "";
  dataset: Record<string, string> = {};
  children: El[] = [];
  private attrs: Record<string, string> = {};
  private _text = "";
  constructor(tag: string) { this.tagName = tag; }
  set textContent(v: string) { this._text = v; if (v === "") this.children = []; }
  get textContent(): string {
    return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text;
  }
  appendChild(c: El) { this.children.push(c); return c; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  querySelector(sel: string): El | null {
    const want = sel.replace(/^\./, "").replace(/^\[|\]$/g, "");
    const hit = (e: El): El | null => {
      if (e.className.split(/\s+/).includes(want)) return e;
      if (sel.startsWith("[") && e.getAttribute(want) !== null) return e;
      for (const c of e.children) { const r = hit(c); if (r) return r; }
      return null;
    };
    for (const c of this.children) { const r = hit(c); if (r) return r; }
    return null;
  }
}

const ROOT_NOTICE = "fc06f70293264e82a61d9d6699f1af4c";
const IDS = [
  "41a807a93262480ab32a2a68fe60d060",
  "0b53312d536249470667842538686aaa",
  "1d319a3844db445fb1a8abcc89cb74cc",
  "6ad63607833b47b3a88dede662a223c5",
  "da47a2a00f624c8b803facc899fba5c4"
];
const url = (id: string) => `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${id}/download`;
const NAMES = [
  "Solicitation - N0042126R1024.pdf",
  "M1_SECTION M - Evaluation Factors for Award.docx",
  "Att 07_WD 2015-4279 Rev32.pdf",
  "C1_Cost Workbook.xlsx",
  "Dunnage Kit for POL Airlift.pdf"
];

let attachmentRow: (a: any) => El | null;
let loadAttachmentNames: (card: any) => void;
let lastUrl: string | null = null;
let calls = 0;
let impl: () => Promise<any> = () => Promise.reject(new Error("not set"));

try {
  const sandbox: any = {
    __out: {}, console, Array, encodeURIComponent, JSON,
    document: { createElement: (t: string) => new El(t) },
    fetch: (u: string) => { calls++; lastUrl = u; return impl(); }
  };
  vm.createContext(sandbox);
  sandbox.esc = (s: string) => String(s == null ? "" : s);
  vm.runInContext(extractFn(DSO, "attachmentRow") + "\n" + extractFn(DSO, "loadAttachmentNames"), sandbox);
  attachmentRow = sandbox.__out.attachmentRow;
  loadAttachmentNames = sandbox.__out.loadAttachmentNames;
} catch (e: any) {
  console.log(`\n  ✗ FATAL — cannot load the attachment seam: ${e.message}`);
  console.log(`    attachmentRow(a) and loadAttachmentNames(card) must stay top-level`);
  console.log(`    functions in public/dso-app.js for this gate to reach them.\n`);
  process.exit(1);
}

// A card as detailHTML renders it: the FEED's links, before SAM is consulted.
function makeCard(feedCount = 4) {
  const card = new El("div");
  card.className = "pcard";
  card.setAttribute("data-notice", ROOT_NOTICE);
  const box = new El("div");
  box.className = "pd-atts";
  for (let i = 0; i < feedCount; i++) {
    const a = new El("a");
    a.className = "pd-att";
    a.href = url(IDS[i]);
    const n = new El("span");
    n.className = "att-nm";
    n.textContent = `Document ${i + 1}`;
    a.appendChild(n);
    box.appendChild(a);
  }
  const label = new El("span");
  label.setAttribute("data-att-count", "");
  label.textContent = `${feedCount} documents`;
  card.appendChild(label);
  card.appendChild(box);
  return { card, box, label };
}
const rowNames = (box: El) => box.children.map((a) => a.querySelector(".att-nm")?.textContent ?? "");
const settle = () => new Promise((r) => setTimeout(r, 25));
const jsonOk = (b: any) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(b) });
const samList = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: IDS[i], name: NAMES[i], url: url(IDS[i]), restricted: false }));

async function main() {
  // ═══ A · a single row ═════════════════════════════════════════════════════
  console.log("\nA · attachmentRow — only a real SAM download URL becomes a link");
  const good = attachmentRow({ id: IDS[0], name: "Section M.docx", url: url(IDS[0]), restricted: false })!;
  ok(!!good, "a canonical URL renders");
  ok(good.querySelector(".att-nm")?.textContent === "Section M", "extension is split off the name");
  ok(good.querySelector(".att-ext")?.textContent === "docx", "extension gets its own muted slot");
  ok(good.title === "Section M.docx", "the FULL filename is preserved in the title");
  ok(attachmentRow({ url: "https://evil.example.com/x", name: "x.pdf" }) === null, "a non-SAM URL is refused");
  ok(attachmentRow({ url: "https://sam.gov/../../etc/passwd", name: "x" }) === null, "a traversal URL is refused");
  ok(attachmentRow({ name: "no url.pdf" }) === null, "a row with no URL is refused");
  const noname = attachmentRow({ id: IDS[0], url: url(IDS[0]), name: null })!;
  ok(noname.querySelector(".att-nm")?.textContent === "Document", "a nameless file still renders as a link");
  const locked = attachmentRow({ id: IDS[0], name: "CUI.pdf", url: url(IDS[0]), restricted: true })!;
  ok(locked.querySelector(".att-lock")?.textContent === "request access",
    "an access-restricted file is FLAGGED, not hidden");

  // ═══ B · THE DEFECT ═══════════════════════════════════════════════════════
  // The feed gave 4. SAM says 5. The fifth must appear.
  console.log("\nB · a document the FEED omitted still reaches the customer");
  let { card, box, label } = makeCard(4);
  impl = jsonOk({ attachments: samList(5) });
  loadAttachmentNames(card); await settle();
  ok(box.children.length === 5, "the list rebuilds to SAM's count, not the feed's", `${box.children.length} rows`);
  ok(rowNames(box).some((n) => n.startsWith("Dunnage Kit")),
    "the attachment the feed omitted is now listed", rowNames(box).join(" | "));
  ok(label.textContent === "5 documents", "the count label follows SAM, not the feed", label.textContent);
  ok(card.dataset.attState === "ok", "state is 'ok'");
  ok(rowNames(box)[0] === "Solicitation - N0042126R1024", "names come from SAM's list");

  // ═══ C · a failed read must not destroy a working list ════════════════════
  console.log("\nC · a failed read NEVER empties a list that had working links");
  const failures: Array<[string, () => Promise<any>, string]> = [
    ["attachments is null (read failed)", jsonOk({ attachments: null, reason: "http-500" }), "err"],
    ["network rejects", () => Promise.reject(new Error("offline")), "err"],
    ["401 session expired", () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }), "err"],
    ["body has no attachments key", jsonOk({ reason: "bad-notice-id" }), "err"],
    ["attachments is not an array", jsonOk({ attachments: "nope" }), "err"],
    ["SAM listed none", jsonOk({ attachments: [] }), "none"]
  ];
  for (const [labelText, i, expectState] of failures) {
    const m = makeCard(4);
    impl = i;
    loadAttachmentNames(m.card); await settle();
    ok(
      m.box.children.length === 4 &&
        JSON.stringify(rowNames(m.box)) === JSON.stringify(["Document 1", "Document 2", "Document 3", "Document 4"]) &&
        m.card.dataset.attState === expectState,
      labelText,
      `${m.box.children.length} rows kept, state=${m.card.dataset.attState}`
    );
  }

  // ═══ D · a poisoned response cannot blank the panel ═══════════════════════
  console.log("\nD · rows that fail validation do not take the existing list with them");
  const m2 = makeCard(4);
  impl = jsonOk({ attachments: [{ id: "x", name: "evil", url: "https://evil.example.com/a" }] });
  loadAttachmentNames(m2.card); await settle();
  ok(m2.box.children.length === 4 && m2.card.dataset.attState === "none",
    "an all-invalid list leaves the feed's links in place", `${m2.box.children.length} rows`);

  const m3 = makeCard(4);
  impl = jsonOk({ attachments: [
    { id: IDS[0], name: NAMES[0], url: url(IDS[0]), restricted: false },
    { id: "x", name: "evil", url: "javascript:alert(1)" }
  ] });
  loadAttachmentNames(m3.card); await settle();
  ok(m3.box.children.length === 1 && rowNames(m3.box)[0] === "Solicitation - N0042126R1024",
    "a mixed list keeps the valid row and drops the bad one", rowNames(m3.box).join(" | "));

  // ═══ E · cost ═════════════════════════════════════════════════════════════
  console.log("\nE · one request per card, keyed by NOTICE not by file id");
  const m4 = makeCard(4);
  calls = 0; lastUrl = null;
  impl = jsonOk({ attachments: samList(5) });
  loadAttachmentNames(m4.card); loadAttachmentNames(m4.card); await settle();
  loadAttachmentNames(m4.card); await settle();
  ok(calls === 1, "three opens produced exactly one request", `calls=${calls}`);
  ok(lastUrl === "/api/notice-attachments?noticeId=" + ROOT_NOTICE,
    "asks by noticeId — the only key that can surface a feed-omitted file", String(lastUrl));
  const m5 = makeCard(0);
  calls = 0;
  loadAttachmentNames(m5.card); await settle();
  ok(calls === 1, "a card with no feed links STILL asks — SAM may have documents the feed lacked");

  // ═══ F · markup + CSS ═════════════════════════════════════════════════════
  console.log("\nF · the shipped markup and stylesheet still carry this seam");
  ok(/loadAttachmentNames\(card\)/.test(DSO), "loadAttachmentNames is actually CALLED (not just defined)");
  ok(DSO.includes("data-att-toggle"), "the list sits behind a disclosure toggle");
  ok(DSO.includes("data-att-count"), "the count label is addressable so it can follow SAM");
  ok(/\.pd-atts\{[^}]*display:none/.test(HTML), "the list is COLLAPSED by default");
  ok(/\.pd-atts\.is-open\{display:block\}/.test(HTML), "opening it reveals the list");
  const cap = HTML.match(/\.pd-atts\{[^}]*max-height:(\d+)px/);
  ok(!!cap && /\.pd-atts\{[^}]*overflow-y:auto/.test(HTML),
    `the open list scrolls inside a fixed height (${cap ? cap[1] + "px" : "unset"}) — 6 documents and 25 cost the same space`);
  ok(/<button type="button" class="att-tog" data-att-toggle aria-expanded="false">/.test(DSO),
    "the toggle is a real button carrying aria-expanded");
  ok(/\.pd-att \.att-lock\{/.test(HTML), "the access-restricted flag is styled");
  const attCss = (HTML.match(/\.pd-att[^{]*\{[^}]*\}/g) || []).join(" ");
  ok(!/text-overflow:\s*ellipsis/.test(attCss) && /overflow-wrap/.test(attCss),
    "long filenames wrap rather than being cut off");
  // No exit ramp. Checked against CODE — the comment explaining the removal
  // necessarily quotes it, and a gate that fails on its own documentation
  // teaches people to delete the documentation.
  const code = DSO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/more on SAM\.gov/i.test(code), "no '+N more on SAM.gov' exit ramp remains in code");
  ok(!/resource_links\.slice\(/.test(code), "the feed list is not sliced — every link renders");
  // The upstream is government-populated and we do not control it; a filename is
  // exactly the field that eventually contains a quote mark.
  ok(!/box\.innerHTML\s*=/.test(code), "rows are built with DOM methods, not an innerHTML string");

  // ═══ G · falsifiability ═══════════════════════════════════════════════════
  // A gate that cannot go red proves nothing. Plant the exact defect this file
  // exists for — keeping the feed's list instead of SAM's — and require B to
  // reject it.
  console.log("\nG · gate falsifiability (planted positive)");
  const planted: any = {
    __out: {}, console, Array, encodeURIComponent, JSON,
    document: { createElement: (t: string) => new El(t) },
    fetch: () => impl()
  };
  vm.createContext(planted);
  vm.runInContext(
    extractFn(DSO, "attachmentRow") + "\n" +
    extractFn(DSO, "loadAttachmentNames").replace(
      "const rows = list.map(attachmentRow).filter(Boolean);",
      "const rows = [];"   // the regression: never rebuild from SAM's list
    ),
    planted
  );
  const bad = makeCard(4);
  impl = jsonOk({ attachments: samList(5) });
  planted.__out.loadAttachmentNames(bad.card); await settle();
  ok(bad.box.children.length === 4,
    "an implementation that ignores SAM's list IS caught by the B check",
    `${bad.box.children.length} rows — the omitted document would stay hidden`);

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
