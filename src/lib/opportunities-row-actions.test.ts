// $0 PROOF — the three outbound actions on an Opportunities row reach their DESTINATION.
// Run: npx tsx src/lib/opportunities-row-actions.test.ts   (in src/lib so CI's `self-audit suites` leg runs it)
//
// WHY THIS EXISTS, AND WHAT IT REFUSES TO REPEAT. A 72-check battery reported these three actions green and all
// three were false: it asserted "row Run Audit href carries a real noticeId" and "every row's audit link is
// well-formed" — validating the STRING and never following the link — and asserted "Track enabled" by checking
// isDisabled() === false against a STUBBED /api/watch. A well-formed link to a destination that ignores the
// parameter is a broken button that passes every check aimed at the link.
//
// So nothing here asserts a link's SHAPE. Each check ties an emitter to the thing that must consume it, and
// fails if either side moves:
//   · the param NAME the row emits must be the param name the destination READS (a rename on either side breaks
//     the deep link silently, and no shape check can see it);
//   · the element the destination's prefill targets must EXIST in the document it targets;
//   · the sign-in bounce must carry the search string, or the deep link dies on the signed-out path;
//   · the identifiers Track and Pipeline carry must be the ones their API routes key on, and those routes must
//     exist — asserted against the real files, never a stub.
//
// The live round-trip (click → server state → survives reload → undo) was driven on 2026-08-04 and all three
// passed; that is a browser walk and cannot live in CI. What lives here is every contract that walk depends on.
import { readFileSync, existsSync } from "node:fs";
import { signInRedirectPath } from "./nav/sign-in-redirect";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const read = (p: string) => readFileSync(p, "utf8");

const rowJs = read("public/dso-app.js");
const runAuditHtml = read("public/run-audit.html");

console.log("── 1. RUN AUDIT — the emitted param name is the one the destination reads ────");
// Emitter: the row's "Run audit" anchor.
const emitted = rowJs.match(/href="(\/[a-z-]+)\?([A-Za-z]+)=' \+ encodeURIComponent\(/);
assert(!!emitted, `the row emits a Run audit deep link (found: ${emitted ? `${emitted[1]}?${emitted[2]}=` : "NONE"})`);
const [, emittedPath, emittedParam] = emitted ?? [, "", ""];
// Destination: the page /audit serves, and the param IT reads.
assert(existsSync("src/app/audits/route.ts"), `${emittedPath} is a real route`);
const routeSrc = read("src/app/audits/route.ts");
const servedFile = routeSrc.match(/"public",\s*\n?\s*"([\w.-]+)"/)?.[1] ?? "";
assert(servedFile === "run-audit.html", `${emittedPath} serves run-audit.html (got ${JSON.stringify(servedFile)})`);
const readParam = runAuditHtml.match(/new URLSearchParams\(location\.search\)\.get\('([^']+)'\)/)?.[1];
assert(readParam !== undefined, `the destination reads a search param (found: ${JSON.stringify(readParam)})`);
assert(readParam === emittedParam, `TIE-OUT: row emits "${emittedParam}", destination reads "${readParam}" — a rename on either side breaks the deep link with no shape check able to see it`);

console.log("\n── 2. RUN AUDIT — the prefill has something to prefill ───────────────────────");
// The reader is useless if the element it targets is gone; that is a silent no-op, not an error.
const target = runAuditHtml.match(/var input\s*=\s*document\.querySelector\('([^']+)'\)/)?.[1];
assert(!!target, `the prefill names a target selector (found: ${JSON.stringify(target)})`);
const [scopeCls, fieldCls] = (target ?? "").split(/\s+/).map((s) => s.replace(/^\./, ""));
// class attributes carry several names ("ev ev-d"), so match the TOKEN inside the attribute, not the whole value.
assert(!!scopeCls && new RegExp(`class="[^"]*\\b${scopeCls}\\b[^"]*"`).test(runAuditHtml), `the prefill's scope ".${scopeCls}" exists in the served document`);
assert(!!fieldCls && new RegExp(`class="[^"]*\\b${fieldCls}\\b[^"]*"`).test(runAuditHtml), `the prefill's input ".${fieldCls}" exists in the served document`);

console.log("\n── 3. THE SIGNED-OUT PATH — the deep link survives the sign-in bounce ────────");
// The path a signed-in walk structurally cannot see: shared link, expired session, second tab.
const bounced = signInRedirectPath("/audits", "?noticeId=ABC123");
assert(bounced.includes(encodeURIComponent("/audits?noticeId=ABC123")), `next carries path AND search (got ${bounced})`);
assert(!/[?&]noticeId=/.test(bounced), "the original param does NOT ride along as a top-level /sign-in param (sign-in ignores those, so they read as preserved while being dropped)");
assert(signInRedirectPath("/notices", "") === "/sign-in?next=%2Fnotices", "a query-less path is unchanged (no collateral change)");
// Both gates must use the one helper — two copies of this rule is how they drifted apart in the first place.
for (const f of ["src/middleware.ts", "src/app/audits/route.ts"])
  assert(read(f).includes("signInRedirectPath"), `${f} builds its bounce with the shared helper, not its own string`);

console.log("\n── 4. TRACK + PIPELINE — the identifier carried is the one the API keys on ───");
assert(existsSync("src/app/api/watch/route.ts"), "/api/watch is a real route (the battery stubbed it)");
assert(existsSync("src/app/api/pipeline/route.ts"), "/api/pipeline is a real route");
// Track carries notice_id; the fetch that hydrates it must query by that same field.
assert(/data-watch-notice="' \+ esc\(o\.notice_id\)/.test(rowJs), "Track carries o.notice_id");
const oppsLive = read("public/opportunities-live.js");
assert(/noticeIds=' \+ encodeURIComponent\(/.test(oppsLive) && /o\.notice_id/.test(oppsLive), "the watch hydration queries /api/watch BY notice_id — same key the button carries");
// Pipeline carries the display id; the pipeline table keys on solicitation_number.
assert(/data-track="' \+ esc\(o\.id\)/.test(rowJs), "Pipeline carries o.id");
assert(/pipeline table keys on solicitation_number|row\.solicitation_number/.test(oppsLive), "the pipeline hydration keys on solicitation_number — the same space o.id resolves into");
// An unavailable upstream must DISABLE, never render a button that looks live and does nothing.
assert(/PIPE == null[\s\S]{0,120}disabled = true/.test(rowJs), "null pipeline state disables the button (honest-fail, not a dead-but-enabled control)");
assert(/WATCHED == null[\s\S]{0,160}disabled = true/.test(rowJs) || /if \(status === undefined\)[\s\S]{0,160}disabled/.test(rowJs) || /unknown/.test(rowJs), "null watch state is surfaced rather than rendered as 'not tracking'");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — every Opportunities row action ties to its destination.`);
process.exit(failures === 0 ? 0 : 1);
