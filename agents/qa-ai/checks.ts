// Check definitions. Each check has:
//   - name        : human-friendly label
//   - kind        : route_status | auth_wall | api_endpoint | html_marker
//   - url         : full URL to fetch
//   - expect      : status code or array of acceptable codes
//   - bodyContains: optional substring(s) the response body must contain (kind=html_marker)
//   - method      : default "GET"

export type CheckKind = "route_status" | "auth_wall" | "api_endpoint" | "html_marker";

export interface CheckSpec {
  name: string;
  kind: CheckKind;
  url: string;
  expect: number | number[];
  bodyContains?: string[];
  method?: "GET" | "HEAD";
}

export interface CheckResult {
  spec: CheckSpec;
  status: number | null;
  ok: boolean;
  reason?: string;
  bodySnippet?: string;
  durationMs: number;
}

// Public-routability — domain must respond. 307 (auth-wall redirect) is
// acceptable; anything 5xx or non-responding is a regression. Today's
// production has the global auth lockdown engaged, so these all 307 by
// design.
const ROUTE_STATUS: CheckSpec[] = [
  { name: "faraudit.com /",                kind: "route_status", url: "https://faraudit.com/",                expect: [200, 307, 308] },
  { name: "faraudit.com /landing.html",    kind: "route_status", url: "https://faraudit.com/landing.html",    expect: [200, 307, 308] },
  { name: "faraudit.com /access.html",     kind: "route_status", url: "https://faraudit.com/access.html",     expect: [200, 307, 308] },
  { name: "faraudit.com /signin.html",     kind: "route_status", url: "https://faraudit.com/signin.html",     expect: [200, 307, 308] },
  { name: "bullrize.com /",                kind: "route_status", url: "https://bullrize.com/",                expect: [200, 307, 308] },
  { name: "lexanchor.ai /",                kind: "route_status", url: "https://lexanchor.ai/",                expect: [200, 307, 308] },
  { name: "lexanchor.ai /pricing",         kind: "route_status", url: "https://lexanchor.ai/pricing",         expect: [200, 307, 308] },
  { name: "lexanchor.ai /lifecycle/",      kind: "route_status", url: "https://lexanchor.ai/lifecycle/",      expect: [200, 307, 308] }
];

// Auth-walled routes — these MUST redirect / 4xx, NEVER 200.
// 200 here means the auth wall broke and CEO content is publicly accessible.
// Failure here is a P0 SECURITY regression.
const AUTH_WALL: CheckSpec[] = [
  { name: "faraudit.com /home.html — auth wall",       kind: "auth_wall", url: "https://faraudit.com/home.html",       expect: [307, 401, 403, 404] },
  { name: "faraudit.com /ceo-digest.html — locked",    kind: "auth_wall", url: "https://faraudit.com/ceo-digest.html", expect: [307, 401, 403, 404] },
  { name: "faraudit.com /vertex-hub-v6.html — locked", kind: "auth_wall", url: "https://faraudit.com/vertex-hub-v6.html", expect: [307, 401, 403, 404] },
  { name: "faraudit.com /org-chart.html — locked",     kind: "auth_wall", url: "https://faraudit.com/org-chart.html",     expect: [307, 401, 403, 404] },
  { name: "faraudit.com /one-pager.html — locked",     kind: "auth_wall", url: "https://faraudit.com/one-pager.html",     expect: [307, 401, 403, 404] }
];

// API endpoints — should respond (200 if reachable past auth, 307 if walled).
// Anything 5xx or 0 is a regression.
const API_ENDPOINT: CheckSpec[] = [
  { name: "faraudit.com /api/audit responds",          kind: "api_endpoint", url: "https://faraudit.com/api/audit",     expect: [200, 307, 401, 405] },
  { name: "faraudit.com /api/telegram responds",       kind: "api_endpoint", url: "https://faraudit.com/api/telegram",  expect: [200, 307, 401, 405] }
];

// HTML markers — for the few routes that DO reach 200 (the sign-in page
// surfaces a real HTML body), confirm key markers are present so a build
// regression that strips brand/copy gets caught. Skipped silently if the
// route 307s (auth-wall path).
const HTML_MARKER: CheckSpec[] = [
  // Placeholder — once any public route reliably returns 200 with stable
  // markup, add it here. With current full-lockdown auth, all routes 307,
  // so there is no scrapable HTML body. Re-enable when public landing
  // returns 200 again (e.g. when /landing.html exits the auth wall).
];

export const ALL_CHECKS: CheckSpec[] = [
  ...ROUTE_STATUS,
  ...AUTH_WALL,
  ...API_ENDPOINT,
  ...HTML_MARKER
];

const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS) || 15000;

export async function runCheck(spec: CheckSpec): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(spec.url, {
      method: spec.method || "GET",
      redirect: "manual", // critical: we want to see 307s explicitly
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const durationMs = Date.now() - t0;
    const expectArr = Array.isArray(spec.expect) ? spec.expect : [spec.expect];
    const statusOk = expectArr.includes(res.status);

    if (!statusOk) {
      return {
        spec,
        status: res.status,
        ok: false,
        reason: `expected ${expectArr.join("|")} got ${res.status}`,
        durationMs
      };
    }

    if (spec.bodyContains && spec.bodyContains.length > 0) {
      const body = await res.text();
      const missing = spec.bodyContains.filter((needle) => !body.includes(needle));
      if (missing.length > 0) {
        return {
          spec,
          status: res.status,
          ok: false,
          reason: `body missing markers: ${missing.join(", ")}`,
          bodySnippet: body.slice(0, 200),
          durationMs
        };
      }
    }

    return { spec, status: res.status, ok: true, durationMs };
  } catch (err) {
    const durationMs = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    return { spec, status: null, ok: false, reason: `fetch failed: ${message}`, durationMs };
  }
}
