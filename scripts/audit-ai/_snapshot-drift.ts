// Is the banked flag snapshot still true? It is the only repo-side record of which behaviors production has ON.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const snapRaw = JSON.parse(readFileSync("scripts/audit-ai/live-flags.snapshot.json", "utf8"));
const snap: Record<string,string> = Array.isArray(snapRaw) ? Object.fromEntries(snapRaw.map((k:string)=>[k,"true"])) : (snapRaw.flags ?? snapRaw);
const live: Record<string,string> = {};
for (const l of execFileSync("railway",["variables","--service","audit-worker","--kv"],{encoding:"utf8",stdio:"pipe"}).split("\n")) {
  const i = l.indexOf("="); if (i>0 && l.startsWith("AUDIT_") && !/\s/.test(l.slice(0,i))) live[l.slice(0,i)] = l.slice(i+1).trim();
}
const isOn = (v?:string)=> v!=null && ["true","1","yes","on"].includes(String(v).toLowerCase());
const snapKeys = Object.keys(snap), liveKeys = Object.keys(live);
console.log(`snapshot dated Jul 23 · ${snapKeys.length} entries · live now ${liveKeys.length}`);
const onlyLive = liveKeys.filter(k=>!(k in snap));
const onlySnap = snapKeys.filter(k=>!(k in live));
const flipped  = liveKeys.filter(k=> k in snap && isOn(live[k]) !== isOn(snap[k]));
console.log(`  live but NOT in snapshot : ${onlyLive.length}`);
console.log(`  in snapshot but NOT live : ${onlySnap.length}`);
console.log(`  value FLIPPED since      : ${flipped.length}${flipped.length?"  "+flipped.slice(0,6).join(", "):""}`);
console.log(`\n  => the repo's only record of production behavior is ${onlyLive.length+onlySnap.length+flipped.length} entries out of date`);
