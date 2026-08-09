// CERT SYNC — establish the customer's verified eligibility, in the ONE place that writes it.
//
// WHY THIS EXISTS. `AUDIT_PROFILE_SCHEMA_V2` refuses to let a customer-asserted certification satisfy a
// floored namespace (`se:*` among them), and requires an authoritative record in
// `capability_statements.attributes_v2` instead. That discipline is correct and it is ARMED. Nothing was
// writing the authoritative alternative, so the result — measured on the production composition — was:
//
//     typed cert only            -> unknown       (an actual SDVOSB firm, on an SDVOSB set-aside)
//     verified sam_api record    -> satisfies
//
// Every customer's certifications were inert inside a paid audit. Fail-SAFE (caution, never a false
// INELIGIBLE), which is exactly why nothing went red. This module is the missing producer.
//
// ONE WRITER, TWO CALLERS. The Opportunities page reads this and the capability-statement save writes
// through it. Authoring the write twice is how the page and the profile would come to disagree about the
// same firm, so both go through `syncCertifications`.
//
// RECORDS ARE BOUND TO THE UEI THEY CAME FROM. Each stored record carries the `uei` it was derived from.
// The engine's validator rebuilds records from `attr/source/verifiedAt/expiresAt` and drops unknown keys,
// so this tag is invisible downstream — but it is what makes a UEI change safe. Without it, changing the
// UEI on a profile would leave the PREVIOUS firm's programs attached to the new one, which is the
// worst failure available here: one firm's certifications attesting for another.
//
// WHAT EACH OUTCOME WRITES, and why they are not the same:
//   verified              → write the derived records. SAM attested them.
//   registration-inactive → write []. A lapsed registration attests nothing.
//   uei-not-found         → write []. SAM answered; nothing is registered under this UEI.
//   no-uei                → write []. Nothing to attest against.
//   unverified            → WRITE NOTHING. We did not read it. Overwriting on our own outage would
//                           silently strip a firm's real eligibility mid-audit-window. The records
//                           already bound to the CURRENT uei survive; any bound to a previous one do
//                           not, because they were never about this firm.
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupEntityByUei } from "./sam-entity";
import { verifiedCertRecords, establishedPrograms, PROGRAM_LABEL } from "./cert-verification";

export type CertState = "no-uei" | "uei-not-found" | "unverified" | "registration-inactive" | "verified";

/** A stored record: the engine's ProfileAttributeRecord shape plus the UEI provenance tag. */
export interface StoredCertRecord {
  attr: string;
  source: "sam_api";
  verifiedAt: string;
  expiresAt: string;
  uei: string;
}

export interface CertSyncResult {
  state: CertState;
  uei: string | null;
  legalName: string | null;
  registrationExpires: string | null;
  records: StoredCertRecord[];
  establishedPrograms: string[];
  /** written = attributes_v2 changed · unchanged = already correct · preserved = our outage, left alone */
  persisted: "written" | "unchanged" | "preserved";
  checkedAt: string;
}

/** Read back what is stored, keeping ONLY records that are well-formed AND bound to `uei`. A record with
 *  no `uei` tag predates this writer (or came from a script) and cannot be shown to describe this firm,
 *  so it is not treated as ours to preserve. */
function storedRecordsFor(raw: unknown, uei: string): StoredCertRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredCertRecord[] = [];
  for (const r of raw) {
    if (r === null || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.attr !== "string" || o.attr.trim() === "") continue;
    if (o.source !== "sam_api") continue;
    if (typeof o.uei !== "string" || o.uei.toUpperCase() !== uei) continue;
    if (typeof o.verifiedAt !== "string" || typeof o.expiresAt !== "string") continue;
    out.push({ attr: o.attr.trim(), source: "sam_api", verifiedAt: o.verifiedAt, expiresAt: o.expiresAt, uei });
  }
  return out;
}

/** Is the column ALREADY exactly this record set? Compared against the RAW column, never against the
 *  UEI-filtered view of it: filtering first makes "nothing of ours is stored" indistinguishable from
 *  "nothing is stored", so a row still holding a PREVIOUS firm's records reads as already-correct and
 *  is never cleared. That is the one comparison that has to see everything in the column. */
function columnEquals(raw: unknown, records: readonly StoredCertRecord[]): boolean {
  if (!Array.isArray(raw) || raw.length !== records.length) return false;
  const canon = (r: Record<string, unknown>) =>
    `${r.attr}|${r.source}|${r.verifiedAt}|${r.expiresAt}|${r.uei}`;
  const a = raw.map((r) => canon((r ?? {}) as Record<string, unknown>)).sort();
  const b = records.map((r) => canon(r as unknown as Record<string, unknown>)).sort();
  return a.every((v, i) => v === b[i]);
}

// Per-instance memo of the SAM ENTITY read only — never of the decision, and never of the write. Keyed by
// UEI so a profile that changes its UEI cannot be served the previous firm's entity.
const TTL_MS = 15 * 60 * 1000;
const entityMemo = new Map<string, { at: number; lookup: Awaited<ReturnType<typeof lookupEntityByUei>> }>();

async function lookupMemoized(uei: string, now: number) {
  const hit = entityMemo.get(uei);
  if (hit && now - hit.at < TTL_MS) return hit.lookup;
  const lookup = await lookupEntityByUei(uei);
  // An outage is NOT cached — retrying in 30 seconds should be able to succeed.
  if (lookup.outcome !== "unreachable") entityMemo.set(uei, { at: now, lookup });
  return lookup;
}

/** Derive the firm's verified eligibility from SAM and persist it to `attributes_v2`.
 *  The single writer. Returns everything a caller needs to render, so no caller re-derives state. */
export async function syncCertifications(
  supabase: SupabaseClient,
  userId: string,
): Promise<CertSyncResult | { error: string }> {
  const { data, error } = await supabase
    .from("capability_statements")
    .select("uei, attributes_v2, cage_code")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: `profile lookup failed: ${error.message}` };

  const nowIso = new Date().toISOString();
  const uei = String(data?.uei ?? "").trim().toUpperCase();

  const write = async (records: StoredCertRecord[]) => {
    if (columnEquals(data?.attributes_v2, records)) return "unchanged" as const;
    // `.select()` IS THE CONTROL, not a convenience. PostgREST reports no error when an UPDATE matches
    // ZERO rows — an RLS policy that filters the row out of the update returns exactly what a successful
    // write returns. Without the returned row this function would report "written" while the column was
    // untouched, and the engine would keep scoring the firm on records nobody could correct. Asking for
    // the row back turns a silent no-op into something we can see and say.
    const { data: rows, error: wErr } = await supabase
      .from("capability_statements")
      .update({ attributes_v2: records })
      .eq("user_id", userId)
      .select("user_id");
    if (wErr) {
      console.error("[cert-sync] attributes_v2 write failed:", wErr.message);
      return "preserved" as const;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error("[cert-sync] attributes_v2 update matched ZERO rows (RLS or missing row) — not written");
      return "preserved" as const;
    }
    return "written" as const;
  };

  if (!uei) {
    // No UEI means nothing can be attested, and anything present is bound to a UEI no longer on this
    // profile. Clearing is the whole point, so this compares against the RAW column.
    const persisted = await write([]);
    /* CAGE IS BOUND TO THE REGISTRATION, so it goes with it. Syncing CAGE in on a UEI and
       leaving it behind on a clear would strand another firm's identifier on this document —
       the same defect this branch already prevents for attested programs, one field over. */
    if (String(data?.cage_code ?? "").trim()) {
      const { data: rows, error: cErr } = await supabase
        .from("capability_statements")
        .update({ cage_code: null })
        .eq("user_id", userId)
        .select("user_id");
      if (cErr) console.error("[cert-sync] cage_code clear failed:", cErr.message);
      else if (!Array.isArray(rows) || rows.length === 0) {
        console.error("[cert-sync] cage_code clear matched ZERO rows (RLS or missing row) — not written");
      }
    }
    return {
      state: "no-uei", uei: null, legalName: null, registrationExpires: null,
      records: [], establishedPrograms: [], persisted, checkedAt: nowIso,
    };
  }

  const stored = storedRecordsFor(data?.attributes_v2, uei);
  const lookup = await lookupMemoized(uei, Date.now());

  if (lookup.outcome === "unreachable") {
    // "We could not read it" is a reason to keep THIS firm's records. It is NOT a reason to keep another
    // firm's. Anything in the column not bound to the current UEI is known-wrong without asking SAM
    // anything — and the engine reads the column directly, ignoring the provenance tag, so leaving a
    // previous firm's SDVOSB record there would let it clear a bar for this one. Prune it now; the
    // records that ARE ours survive untouched.
    const persisted = columnEquals(data?.attributes_v2, stored) ? ("preserved" as const) : await write(stored);
    return {
      state: "unverified", uei, legalName: null, registrationExpires: null,
      records: stored, establishedPrograms: establishedPrograms(stored, nowIso),
      persisted, checkedAt: nowIso,
    };
  }

  if (lookup.outcome === "not-registered") {
    return {
      state: "uei-not-found", uei, legalName: null, registrationExpires: null,
      records: [], establishedPrograms: [],
      persisted: await write([]), checkedAt: nowIso,
    };
  }

  const entity = lookup.entity;
  const derived = verifiedCertRecords(entity, nowIso);

  // verifiedCertRecords returns [] for an inactive registration AND for an unparseable expiry. Both are
  // "not attested", but only the first is a state the customer can act on, so they are reported apart.
  const active = /^(a|active)$/i.test(String(entity.registration_status ?? "").trim());
  if (!active) {
    return {
      state: "registration-inactive", uei,
      legalName: entity.legal_business_name, registrationExpires: entity.registration_expiration,
      records: [], establishedPrograms: [],
      persisted: await write([]), checkedAt: nowIso,
    };
  }
  if (Number.isNaN(Date.parse(String(entity.registration_expiration ?? "")))) {
    // No time anchor ⇒ no determination. Not the customer's to fix and not a real zero, so it takes the
    // same "we could not establish it" pole — and, like every unverified path, writes nothing.
    return {
      state: "unverified", uei,
      legalName: entity.legal_business_name, registrationExpires: entity.registration_expiration,
      records: stored,
      establishedPrograms: establishedPrograms(stored, nowIso),
      persisted: columnEquals(data?.attributes_v2, stored) ? "preserved" : await write(stored),
      checkedAt: nowIso,
    };
  }

  // Carry the PRIOR verifiedAt forward when SAM attests the same program with the same expiry. Stamping
  // `now` on every load would rewrite the row on every page view, and — because a read inside the 15-minute
  // entity memo did not re-contact SAM — it would also claim a verification that did not happen. The engine
  // vetoes on `expiresAt` vs `asOf` for these records and never compares `verifiedAt`, so holding it steady
  // costs nothing downstream and keeps it meaning "when SAM last told us this".
  const records: StoredCertRecord[] = derived.map((r) => {
    const expiresAt = String(r.expiresAt ?? "");
    const prior = stored.find((p) => p.attr === r.attr && p.expiresAt === expiresAt);
    return {
      attr: r.attr,
      source: "sam_api" as const,
      verifiedAt: prior?.verifiedAt ?? String(r.verifiedAt ?? nowIso),
      expiresAt,
      uei,
    };
  });

  /* CAGE COMES FROM THE REGISTRATION, NOT FROM TYPING. It was already being fetched —
     SamEntity.cage_code is parsed at sam-entity.ts from er.cageCode — and then dropped on
     the floor, so the capability statement displayed "not on file" forever with no control
     anywhere that could change it. A contracting officer reads CAGE off this document.

     Synced rather than made editable, for the reason certifications are: a hand-typed CAGE
     can be wrong and nothing would catch it, while this one is whatever SAM has against the
     UEI the customer just proved. Written only when it differs, so a page view does not
     rewrite the row. */
  const samCage = String(entity.cage_code ?? "").trim().toUpperCase();
  if (samCage && samCage !== String(data?.cage_code ?? "").trim().toUpperCase()) {
    const { data: cageRows, error: cageErr } = await supabase
      .from("capability_statements")
      .update({ cage_code: samCage })
      .eq("user_id", userId)
      .select("user_id");
    if (cageErr) console.error("[cert-sync] cage_code write failed:", cageErr.message);
    else if (!Array.isArray(cageRows) || cageRows.length === 0) {
      // Same trap as attributes_v2: PostgREST reports no error on a zero-row UPDATE.
      console.error("[cert-sync] cage_code update matched ZERO rows (RLS or missing row) — not written");
    }
  }

  return {
    state: "verified", uei,
    legalName: entity.legal_business_name, registrationExpires: entity.registration_expiration,
    records, establishedPrograms: establishedPrograms(records, nowIso),
    persisted: await write(records), checkedAt: nowIso,
  };
}

/** Display label for a stored record, for the page's banner. */
export const labelFor = (attr: string): string => PROGRAM_LABEL[attr] ?? attr;
