import { stripWithholdMarkers } from "../../src/lib/audit-citation-fidelity";
const CIT = 'Section I (FAR Clauses) [citation withheld — "215-2" is not a valid DFARS designation and does not appear in the solicitation]';
const stripped = stripWithholdMarkers(CIT);
console.log("stripped :", JSON.stringify(stripped));
console.log("section scan on RAW      →", CIT.match(/§?\s*(?:section\s+)?([A-M])\b/i)?.[1]);
console.log("section scan on STRIPPED →", stripped.match(/§?\s*(?:section\s+)?([A-M])\b/i)?.[1]);
console.log("no-citation case, raw    →", '[citation withheld — "215-2" is not valid]'.match(/§?\s*(?:section\s+)?([A-M])\b/i)?.[1]);
console.log("no-citation case, stripped →", stripWithholdMarkers('[citation withheld — "215-2" is not valid]').match(/§?\s*(?:section\s+)?([A-M])\b/i)?.[1]);
