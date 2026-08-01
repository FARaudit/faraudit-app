export {};
import { SITE_VISIT_MANDATORY_ATTENDANCE_RE } from "../../src/lib/audit-site-visit-patterns";
const re = new RegExp(SITE_VISIT_MANDATORY_ATTENDANCE_RE.source, "i");
console.log("__J__" + JSON.stringify({ matched: re.test("A NON-MANDATORY site visit will be held at the Capitol Building, room S-216") }));
