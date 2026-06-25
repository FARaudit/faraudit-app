// Per-customer NAICS resolution — the single source of truth for "which NAICS
// codes do we monitor for this customer." Replaces the old hardcoded corridor
// constants in /api/sam-feed and /api/sam.
//
// Brain ruling (2026-06-25):
//   (a) PRIMARY  — seed from the customer's SAM registration via their UEI.
//   (c) FALLBACK — if unresolvable, leave EMPTY (customer configures explicitly).
//   No preset fallback under any condition.
//
// Resolution order:
//   1. capability_statements.naics_codes (the saved/edited list) — wins if set.
//   2. else, if a UEI is on file, pull the registered NAICS from SAM and PERSIST
//      it (one-time seed) so subsequent reads are cheap and the customer can edit.
//   3. else, empty + needsConfig=true → UI shows the "configure your NAICS" prompt.
import type { createServerClient } from "@/lib/supabase-server";
import { fetchEntityByUei } from "@/lib/sam-entity";

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

export interface CustomerNaicsResult {
  /** Resolved NAICS codes. May be empty (no preset fallback). */
  naics: string[];
  /** Where the codes came from — for observability, not control flow. */
  source: "saved" | "sam-seed" | "none";
  /** True when empty → callers surface a "configure your NAICS" prompt. */
  needsConfig: boolean;
}

/** Normalize a raw NAICS list: strings only, trimmed, de-duped, order preserved. */
function cleanCodes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const c = v.trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export async function resolveCustomerNaics(
  sb: ServerClient,
  userId: string
): Promise<CustomerNaicsResult> {
  const { data } = await sb
    .from("capability_statements")
    .select("naics_codes, uei")
    .eq("user_id", userId)
    .maybeSingle();

  // 1. Saved/edited list wins.
  const saved = cleanCodes(data?.naics_codes);
  if (saved.length > 0) return { naics: saved, source: "saved", needsConfig: false };

  // 2. No saved NAICS — seed from the customer's SAM registration (option a).
  const uei = (data?.uei ?? "").toString().trim();
  if (uei) {
    const entity = await fetchEntityByUei(uei);
    if (entity) {
      const seeded = cleanCodes([entity.primary_naics, ...entity.naics_codes]);
      if (seeded.length > 0) {
        // Persist the seed (RLS lets the user write their own row). If this
        // write fails we still return the seeded codes for this request.
        await sb
          .from("capability_statements")
          .upsert(
            { user_id: userId, naics_codes: seeded, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        return { naics: seeded, source: "sam-seed", needsConfig: false };
      }
    }
  }

  // 3. Unresolvable — empty, no preset (option c).
  return { naics: [], source: "none", needsConfig: true };
}
