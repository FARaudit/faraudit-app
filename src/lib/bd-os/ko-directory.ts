import { resolveOfficeLeaf } from "@/lib/sam";
import type { OpportunityRow } from "@/lib/bd-os/queries";

// The contracting-officer directory is a REGROUPING of the customer's feed —
// it introduces no facts. One officer is one point-of-contact email SAM
// published on a notice; everything attached to that officer (name, phone,
// agency, office, codes, notices) came off the notices they appear on.
//
// Kept in its own module so it can be exercised against a real SAM response
// without a request context: the route is a thin auth + fetch wrapper around
// groupOfficers(), and this is where the shaping lives.

export interface DirectoryNotice {
  notice_id: string;
  solicitation_number: string | null;
  title: string | null;
  naics_code: string | null;
  set_aside: string | null;
  response_deadline: string | null;
  ui_link: string | null;
}

export interface DirectoryOfficer {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  contactType: string | null;
  agency: string | null;
  office: string | null;
  naics: string[];
  noticeCount: number;
  latestPosted: string | null;
  notices: DirectoryNotice[];
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] || "" : "";
  return (first + last).toUpperCase();
}

export function officerIdOf(email: string): string {
  return "co-" + email.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export function groupOfficers(rows: OpportunityRow[]): {
  officers: DirectoryOfficer[];
  pocWithoutEmail: number;
} {
  const byEmail = new Map<string, DirectoryOfficer>();
  let pocWithoutEmail = 0;

  for (const r of rows) {
    const contacts = Array.isArray(r.point_of_contact) ? r.point_of_contact : [];
    for (const p of contacts) {
      const email = (p?.email || "").trim().toLowerCase();
      if (!email) {
        // An unaddressed contact is not an officer this page can identify, and
        // it is counted rather than dropped silently.
        pocWithoutEmail++;
        continue;
      }
      let o = byEmail.get(email);
      if (!o) {
        const name = (p?.fullName || "").trim();
        o = {
          id: officerIdOf(email),
          // An unnamed contact keeps its address as its identity rather than
          // borrowing a name from anywhere — the address is what SAM gave.
          name: name || email,
          initials: initialsOf(name || email),
          email,
          phone: (p?.phone || "").trim() || null,
          contactType: (p?.type || "").trim() || null,
          agency: r.agency ?? null,
          office: resolveOfficeLeaf({ fullParentPathName: r.office_path ?? null }),
          naics: [],
          noticeCount: 0,
          latestPosted: null,
          notices: []
        };
        byEmail.set(email, o);
      }
      if (!o.phone && p?.phone) o.phone = String(p.phone).trim() || null;
      if (r.naics_code && !o.naics.includes(r.naics_code)) o.naics.push(r.naics_code);
      if (r.created_at && (!o.latestPosted || r.created_at > o.latestPosted)) o.latestPosted = r.created_at;
      o.noticeCount++;
      o.notices.push({
        notice_id: r.notice_id,
        solicitation_number: r.solicitation_number,
        title: r.title,
        naics_code: r.naics_code,
        set_aside: r.set_aside,
        response_deadline: r.response_deadline,
        ui_link: r.ui_link ?? null
      });
    }
  }

  const officers = Array.from(byEmail.values()).sort(
    (a, b) => b.noticeCount - a.noticeCount || a.name.localeCompare(b.name)
  );
  for (const o of officers) {
    o.naics.sort();
    o.notices.sort((a, b) => (b.response_deadline || "").localeCompare(a.response_deadline || ""));
  }
  return { officers, pocWithoutEmail };
}

export function agencyFiltersOf(officers: DirectoryOfficer[]): string[] {
  return [
    "all",
    ...Array.from(new Set(officers.map((o) => o.agency).filter((a): a is string => !!a))).sort()
  ];
}
