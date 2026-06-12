// FA-148 gate — the real SAM description reaches the engine.
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY|ANTHROPIC_API_KEY)=" .env.local) && set +a && npx tsx test/verify-fa148-description.ts
//
// Fixture: FA460026Q0047 / notice d612cc613d33400b96cec0a906247382 — proven
// this morning to carry substantive scope text behind the noticedesc URL
// ("Replace (13) windows with bullet resistant level UL752 level 8 …").
//
// Layers (zero LLM cost — resolver + digest + deterministic V2 metadata arm):
//   N — URL detection + HTML stripping.
//   F — live fixture fetch: real text, clean, capped, provenance-labeled.
//   X — failure contract: bogus id → fetched=false + reason, original URL
//       preserved, never fabricated.
//   D — FA-113 facts digest carries the labeled description line (and never
//       a bare URL).
//   M — V2 metadata arm (runAuditV2Metadata, pure TS): real text produces a
//       substantive synopsis + char-count evidence — the render path reflects
//       that real text was available.

const FIXTURE_NOTICE = "d612cc613d33400b96cec0a906247382";
const FIXTURE_URL = `https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=${FIXTURE_NOTICE}`;

import { isNoticedescUrl, stripHtmlToText, resolveSamDescription } from "../src/lib/sam-description";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

async function main(): Promise<void> {
  // ── N · detection + stripping ──────────────────────────────────────────────
  check("N1 noticedesc URL detected", isNoticedescUrl(FIXTURE_URL));
  check("N2 plain prose is not a noticedesc URL", !isNoticedescUrl("Replace 13 windows with ballistic glass."));
  check("N3 sam.gov-host variant detected", isNoticedescUrl("https://sam.gov/prod/opportunities/v1/noticedesc?noticeid=" + FIXTURE_NOTICE));
  const stripped = stripHtmlToText("<p>Amendment&nbsp;0002 &amp; <b>UL752</b> glass&#39;s spec</p><br/>next");
  check("N4 HTML stripped + entities decoded", stripped === "Amendment 0002 & UL752 glass's spec next", JSON.stringify(stripped));

  // ── F · live fixture ───────────────────────────────────────────────────────
  const resolved = await resolveSamDescription(FIXTURE_NOTICE, FIXTURE_URL);
  check("F1 fixture fetch succeeds", resolved.fetched && resolved.provenance === "sam_description", resolved.reason ?? "");
  check("F2 substantive scope text present", /Replace \(13\) windows with bullet resistant/i.test(resolved.text) && /UL752/i.test(resolved.text), resolved.text.slice(0, 120));
  check("F3 no HTML residue", !/<[a-z][^>]*>|&nbsp;/i.test(resolved.text));
  check("F4 capped at 4000", resolved.text.length <= 4000 && resolved.chars === resolved.text.length, `chars=${resolved.chars}`);

  // ── X · failure contract ───────────────────────────────────────────────────
  const bogusUrl = "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=00000000000000000000000000000000";
  const failed = await resolveSamDescription("00000000000000000000000000000000", bogusUrl);
  check("X1 bogus id → fetched=false", !failed.fetched && failed.provenance === "noticedesc_url_unfetched");
  check("X2 reason recorded (loud)", typeof failed.reason === "string" && failed.reason.length > 0, JSON.stringify(failed));
  check("X3 original URL preserved, nothing fabricated", failed.text === bogusUrl);

  // ── D · FA-113 facts digest ────────────────────────────────────────────────
  const { buildV1FactsDigest, runAuditV2Metadata } = await import("../src/lib/audit-engine");
  const sol = {
    noticeId: FIXTURE_NOTICE, solicitationNumber: "FA460026Q0047", title: "SFS Ballistic Glass",
    naicsCode: "561210", typeOfSetAside: "SBA", agency: "DEPT OF THE AIR FORCE",
    responseDeadLine: "2026-06-24T11:00:00-05:00", description: resolved.text
  };
  const digest = buildV1FactsDigest(sol as Record<string, unknown>, new Date("2026-06-24T16:00:00Z"));
  check("D1 digest carries labeled description line", /- description \(sam_description\): /.test(digest));
  check("D2 digest description is the real text", /Replace \(13\) windows/i.test(digest), digest.slice(-200));
  const urlDigest = buildV1FactsDigest({ ...sol, description: FIXTURE_URL } as Record<string, unknown>, null);
  check("D3 unfetched URL never enters the digest", !/noticedesc/.test(urlDigest) && !/- description/.test(urlDigest));

  // ── M · V2 metadata arm (deterministic, zero LLM) ──────────────────────────
  const v2 = await runAuditV2Metadata({
    noticeId: FIXTURE_NOTICE, title: "SFS Ballistic Glass", description: resolved.text,
    naicsCode: "561210", typeOfSetAside: "SBA", postedDate: "2026-06-09",
    responseDeadLine: "2026-06-24T11:00:00-05:00", noticeType: "Solicitation", agency: "DEPT OF THE AIR FORCE"
  });
  const brief = JSON.stringify(v2.metadata_brief ?? {});
  check("M1 metadata brief produced", !!v2.metadata_brief);
  check("M2 brief synopsis carries real scope language", /UL752|bullet resistant|window/i.test(brief), brief.slice(0, 200));
  const evidence = JSON.stringify(v2.judgment ?? {});
  check("M3 judgment evidence cites the synopsis char count", new RegExp(`${resolved.chars} chars`).test(evidence), `expected "${resolved.chars} chars" in evidence`);

  console.log(failures === 0 ? "\nFA-148 gate: ALL PASS" : `\nFA-148 gate: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FA-148 gate crashed:", e.message); process.exit(2); });
