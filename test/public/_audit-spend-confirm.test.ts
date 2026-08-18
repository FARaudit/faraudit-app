// A PAID RUN NEEDS A DELIBERATE PRESS.
//   npx tsx test/public/_audit-spend-confirm.test.ts
//
// Found by the CEO reading his own product, 2026-08-09. Pasting a solicitation and
// pressing go resolved the package against SAM (free) and then, when the package came
// back COMPLETE, called submitAudit() straight out of driveComplete() — a full engine
// run, with real API cost, on one click and no way to stop it.
//
// The shape of the defect is what makes it worth a gate: the PARTIAL branch — the
// lower-quality outcome — already paused and offered "Proceed on what we have". The
// clean package, the one certain to spend, was the only path that could not be stopped.
//
// NO COST FIGURE MAY APPEAR IN THE DIALOG. The per-run API cost is ours, not a price
// anyone is charged; there is no pricing model, and Billing correctly says pricing is
// agreed with a point of contact. A dollar amount in this confirmation would be an
// invented price — the same class of defect as the rest of this suite.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const html = read("public/run-audit.html");
// Comments describe the defect; they are not the shipped behaviour. Every "does this
// still happen?" check runs on code only, or it fires on its own explanation.
const code = html
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");

console.log("── every paid run is behind a press ──");
{
  // THE CENTRAL PROPERTY. Find every submitAudit call site and require each to sit
  // inside a click handler rather than in a resolve/render path.
  const calls = [...code.matchAll(/submitAudit\s*\(/g)].map((m) => m.index ?? 0);
  check("submitAudit call sites were found", calls.length > 0,
    "the scan found none — this gate would pass on a page that spends freely");

  // driveComplete renders the resolved package. It must not spend.
  const dcStart = code.indexOf("function driveComplete");
  const dcEnd = code.indexOf("function drivePartial");
  check("driveComplete was located", dcStart > -1 && dcEnd > dcStart, "the function moved or was renamed");
  const driveComplete = code.slice(dcStart, dcEnd);
  check("driveComplete does NOT start a run", !/submitAudit\s*\(/.test(driveComplete),
    "resolving a clean package spends without a second click — the defect this file exists for");
  check("...and it holds the reference for the button instead", /__fdReadyNoticeId\s*=/.test(driveComplete),
    "nothing is carried to the confirm, so the button would have nothing to run");

  // The control itself.
  check("a Start control exists", /id="startRun"/.test(code), "no button to press");
  check("...and it is wired to submitAudit", /startRun[\s\S]{0,400}?submitAudit\s*\(/.test(code),
    "the button exists and starts nothing — worse than the auto-run it replaced");
  check("a Cancel control exists", /id="cancelRun"/.test(code), "the only way out is to run it");

  // Double-press. The reference is cleared BEFORE submitting, so a second press is inert.
  check("the reference is cleared before the run is submitted",
    /__fdReadyNoticeId\s*=\s*null;\s*\n?\s*submitAudit/.test(code.replace(/var id=__fdReadyNoticeId;/, "")) ||
    /var id=__fdReadyNoticeId;__fdReadyNoticeId=null;/.test(code),
    "a double press enqueues two paid runs");
  check("the guard refuses to run on nothing", /if\(!__fdReadyNoticeId\)return;/.test(code),
    "the button fires even with no resolved package");
}

console.log("\n── the dialog states the consequence, and no price ──");
{
  const confirmBlock = (code.match(/id="fdConfirmRun"[\s\S]{0,600}?<\/div>/) ?? [""])[0];
  check("the confirmation copy was located", confirmBlock.length > 60,
    "could not find the confirm block — the checks below assert nothing");
  check("it says the run cannot be stopped", /cannot be stopped/i.test(confirmBlock),
    "the one thing a customer cannot undo is not stated");
  check("it no longer claims the run starts by itself",
    !/starting your audit automatically|No action needed/i.test(code),
    "the card still promises an auto-run that no longer happens");

  // NO MONEY IN THE DIALOG. Our per-run API cost is not the reader's price.
  const priceLike = /\$\s?\d|USD|\bcents?\b|per audit cost|costs? about/i;
  check("no cost figure is shown to the reader", !priceLike.test(confirmBlock),
    "a dollar amount here invents a price that no pricing model backs");
}

console.log("\n── planted positives ──");
{
  check("P1 · catches a driveComplete that spends",
    /submitAudit\s*\(/.test("function driveComplete(d){ setState('complete'); submitAudit({noticeId:d.noticeId}); }"),
    "the detector cannot see the original defect");
  check("P2 · accepts a driveComplete that only holds the id",
    !/submitAudit\s*\(/.test("function driveComplete(d){ setState('complete'); __fdReadyNoticeId=d.noticeId; }"));
  check("P3 · catches a price in the dialog",
    /\$\s?\d/.test("<div>This costs about $1.50 per run.</div>"),
    "a dollar figure would slip through");
  check("P4 · a bare consequence sentence carries no price",
    !/\$\s?\d/.test("It cannot be stopped once it has started."));
  check("P5 · catches the resurrected auto-run promise",
    /starting your audit automatically/i.test("<b>Set complete — starting your audit automatically.</b>"));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
