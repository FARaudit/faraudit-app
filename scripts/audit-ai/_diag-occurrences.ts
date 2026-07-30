import { readFileSync } from "fs";
const r = JSON.parse(readFileSync("scripts/audit-ai/run-records/_fire-45f9bacd.json","utf8"));
const src: string = r.input.fullSource;
let i = -1, n = 0;
const needle = "maintain licensing";
const low = src.toLowerCase();
while ((i = low.indexOf(needle, i+1)) >= 0) {
  n++;
  console.log(`occurrence ${n} @${i}: "...${src.slice(i, i+130).replace(/\n/g,"⏎")}..."`);
}
console.log(`\ntotal "${needle}" occurrences: ${n}`);
