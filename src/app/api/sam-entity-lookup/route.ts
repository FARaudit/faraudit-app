import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { searchEntitiesByName, lookupEntityByUei } from "@/lib/sam-entity";
import { syncCertifications } from "@/lib/cert-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* FIND YOUR OWN SAM RECORD, THEN CONFIRM IT.
 *
 * The certification sync has been built for months and has never run, because it keys on a UEI and
 * nothing acquires one. On the live profile `uei`, `cage_code` and `sam_registration_status` are all
 * NULL, `attributes_v2` is empty, and five of the nine ruled title-block cells render blank as a
 * direct result. FPDS past performance has no key at all — which is why `past_performance` is empty,
 * and why the RFI draft page had nothing real to cite.
 *
 * GET  ?q=<company name>   → candidates. Reads only. Writes nothing.
 * POST { uei }             → re-reads that UEI from SAM, stores it, then runs the existing sync.
 *
 * ⛔ SEARCHING NEVER BINDS. A name is fuzzy by construction, and binding the top hit would attest
 * another firm's SBA certifications onto this profile — which is what clears a set-aside bar. The
 * customer picks; the pick is a separate, explicit request; and the POST re-reads the chosen UEI
 * from SAM rather than trusting anything the client sends back.
 *
 * ⛔ QUOTA. The entity API has a small DAILY allowance shared by everything we run, and it resets at
 * 00:00 UTC. Both paths here are user-initiated. Neither may be called on page load or per keystroke.
 */

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") || "";
  const r = await searchEntitiesByName(q);

  if (r.outcome === "unconfigured") {
    return NextResponse.json({ state: "unconfigured", message: "SAM lookup is not configured on the server." }, { status: 503 });
  }
  if (r.outcome === "too-short") {
    return NextResponse.json({ state: "too-short", message: "Type at least three characters of the registered business name." }, { status: 400 });
  }
  if (r.outcome === "unreachable") {
    /* An outage is OUR problem and says nothing about their registration. Reported as a distinct
       state so the page never tells a registered firm it is not registered. */
    return NextResponse.json({ state: "unreachable", message: "SAM could not be reached. This is an outage, not an answer about your registration." }, { status: 502 });
  }
  if (r.candidates.length === 0) {
    return NextResponse.json({
      state: "none-found",
      message: "SAM has no ACTIVE registration under that name. Check the legal business name exactly as registered, or confirm the registration has not lapsed.",
      candidates: [], total: 0
    });
  }
  return NextResponse.json({
    state: "ok",
    /* Only what a person needs to recognise their own firm. No certifications here — those are
       written by the sync after a confirmed pick, never carried through an unconfirmed search. */
    candidates: r.candidates.map((e) => ({
      uei: e.uei, name: e.legal_business_name, cage: e.cage_code,
      state: e.state, zip: e.zip, primary_naics: e.primary_naics,
      registration_status: e.registration_status, registration_expiration: e.registration_expiration
    })),
    total: r.total,
    /* SAM's v3 search rejects pageSize, so it returns roughly ten rows whatever the total. Saying
       so is the difference between a shortlist and a claim about the whole register. */
    truncated: r.total > r.candidates.length
  });
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { uei?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const uei = String(body.uei ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(uei)) {
    return NextResponse.json({ state: "bad-uei", message: "A UEI is twelve letters and digits." }, { status: 400 });
  }

  /* RE-READ FROM SAM, DO NOT TRUST THE CLIENT. The search result travelled through a browser; the
     record we bind must come from SAM in this request, or a tampered payload could attach any
     firm's registration to this profile. */
  const check = await lookupEntityByUei(uei);
  if (check.outcome === "unreachable") {
    return NextResponse.json({ state: "unreachable", message: "SAM could not be reached, so nothing was saved." }, { status: 502 });
  }
  if (check.outcome === "not-registered" || !check.entity) {
    return NextResponse.json({ state: "uei-not-found", message: "SAM has no registration under that UEI, so nothing was saved." }, { status: 404 });
  }

  const e = check.entity;
  /* `.select()` IS THE CONTROL. PostgREST reports no error when an UPDATE matches zero rows, so an
     RLS policy that filters this row out returns exactly what a success returns. Asking for the row
     back turns a silent no-op into something we can see and say. */
  const { data: rows, error } = await supabase
    .from("capability_statements")
    .update({
      uei: e.uei,
      cage_code: e.cage_code,
      sam_registration_status: e.registration_status
    })
    .eq("user_id", user.id)
    .select("uei, cage_code, sam_registration_status");

  if (error) return NextResponse.json({ state: "write-failed", message: error.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ state: "write-failed", message: "Nothing was written — no profile row matched." }, { status: 500 });
  }

  /* Now the sync has a key for the first time. It is the same function the profile save and the
     certifications endpoint call, so there is one author of this rule. */
  const sync = await syncCertifications(supabase, user.id);

  return NextResponse.json({
    state: "linked",
    profile: rows[0],
    registration_expiration: e.registration_expiration,
    certifications: "error" in sync ? { state: "sync-failed", message: sync.error } : sync
  });
}
