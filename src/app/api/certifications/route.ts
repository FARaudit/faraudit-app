// VERIFIED CERTIFICATIONS — the customer's own SAM registration, read as eligibility.
//
// The Opportunities page needs one question answered: which set-aside pools may this firm compete in?
// The only honest answer comes from SAM's Entity Management record — the programs SBA has actually
// registered the firm under. `capability_statements.certifications` is free text the customer typed; it
// is deliberately NOT read here, because a typed "SDVOSB" is byte-identical to a registered one and must
// never clear a set-aside bar.
//
// FIVE STATES, NOT TWO. "no records" has five different causes and they are not interchangeable on
// screen: a missing UEI is a profile the customer can fix, a UEI SAM has never registered is a DIFFERENT
// profile fix, a failed lookup is our outage, a lapsed registration is their renewal, and an active
// registration carrying no socioeconomic program is a real zero. Collapsing them would tell four of
// those five customers something untrue.
//
// The uei-not-found / unverified split was not theoretical. The demo profile carries a UEI SAM answers
// for with HTTP 200 and totalRecords 0, and the collapsed version of this route told that customer to
// wait out an outage that was not happening. Only driving the signed-in page surfaced it.
//
// THIS ROUTE DOES NOT DECIDE ANYTHING. All of it lives in `syncCertifications`, because the same
// derivation also has to run when the capability statement is saved, and two authors of the same rule
// is how the page and the profile come to disagree about one firm.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { syncCertifications, labelFor } from "@/lib/cert-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const r = await syncCertifications(supabase, user.id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 503 });

  return NextResponse.json({
    state: r.state,
    uei: r.uei,
    legalName: r.legalName,
    registrationExpires: r.registrationExpires,
    // The page renders labels and gates on programs; it is never handed the provenance tag.
    records: r.records.map((rec) => ({ attr: rec.attr, label: labelFor(rec.attr), expiresAt: rec.expiresAt })),
    establishedPrograms: r.establishedPrograms,
    checkedAt: r.checkedAt,
  });
}
