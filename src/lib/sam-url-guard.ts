// SSRF + credential-leak guard for SAM.gov document fetches.
//
// resourceLinks / attachment URLs arrive from the SAM API response and are
// treated as UNTRUSTED input. Two risks this module closes:
//   (1) SAM_API_KEY leak — the key is appended as a query param, so a poisoned
//       URL pointing at a non-SAM host would hand an attacker the key.
//   (2) SSRF — redirect:"follow" on an unvalidated URL lets the server reach
//       internal endpoints (cloud metadata 169.254.169.254, private services).
//
// The initial request MUST hit a sam.gov host. SAM then 302-redirects to a
// presigned S3 URL, so redirect targets additionally allow amazonaws.com
// (incl. GovCloud regional + path-style S3 hosts). Redirects are followed
// MANUALLY so each hop is re-validated and the api_key is never replayed past
// the first sam.gov request — the presigned redirect target carries its own
// auth, so the key must not leak to S3 either.
//
// Server-side only (Node/undici): redirect:"manual" returns the real 3xx
// response with a readable `location` header (unlike the browser's opaque
// redirect). Both consumers — the Vercel audit route and the Railway
// audit-worker — run on the Node runtime.

const SAM_INITIAL_HOST_RE  = /(^|\.)sam\.gov$/i;
const SAM_REDIRECT_HOST_RE = /(^|\.)(sam\.gov|amazonaws\.com)$/i;
const MAX_SAM_REDIRECTS = 5;

export function assertAllowedSamUrl(raw: string, kind: "initial" | "redirect"): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`SAM fetch blocked: ${kind} target is not a valid absolute URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`SAM fetch blocked: ${kind} target must be https (got "${parsed.protocol}")`);
  }
  const re = kind === "initial" ? SAM_INITIAL_HOST_RE : SAM_REDIRECT_HOST_RE;
  if (!re.test(parsed.hostname)) {
    throw new Error(`SAM fetch blocked: ${kind} host "${parsed.hostname}" not in allowlist`);
  }
  return parsed;
}

// Validate `url` is a sam.gov host, append the api_key, then GET it — following
// SAM's S3 redirect MANUALLY with per-hop revalidation. The api_key rides only
// the first sam.gov request. Returns the final non-redirect Response; the caller
// checks res.ok and reads the body.
export async function samFetchWithKey(
  url: string,
  apiKey: string,
  timeoutMs: number
): Promise<Response> {
  const initial = assertAllowedSamUrl(url, "initial");
  initial.searchParams.set("api_key", apiKey);

  let currentUrl = initial.toString();
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_SAM_REDIRECTS; hop++) {
    res = await fetch(currentUrl, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      // Resolve relative redirects against the current URL, then re-validate.
      // The presigned target carries its own auth — the key is NOT re-appended.
      currentUrl = assertAllowedSamUrl(new URL(location, currentUrl).toString(), "redirect").toString();
      continue;
    }
    return res;
  }
  if (!res) throw new Error("SAM fetch produced no response");
  throw new Error(`SAM fetch exceeded ${MAX_SAM_REDIRECTS} redirects or got a redirect with no Location`);
}
