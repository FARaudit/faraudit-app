/**
 * hunter-enrich.ts
 * FA-66 — Prospector AI email fallback layer
 *
 * When SAM.gov POC email lookup returns nothing, Hunter.io domain-search
 * finds the best-confidence verified email at that company domain.
 *
 * Free tier: 25 searches/month (~6/week — covers net-new prospects)
 * Paid tier ($34/mo): 500/month when volume justifies it
 *
 * NOTE: Hunter free tier returns emails only — no DM name, title, or
 * LinkedIn URL. Full Layer 4/5/6 (DM discovery) requires paid Apollo
 * Basic ($49/mo) or equivalent. Revisit at customer #1.
 *
 * API docs: https://hunter.io/api-documentation
 */

import fetch from 'node-fetch';

const HUNTER_BASE = 'https://api.hunter.io/v2';
const HUNTER_KEY = process.env.HUNTER_API_KEY || '';

export interface HunterResult {
  found: boolean;
  email?: string;
  confidence?: number;
  domain?: string;
  requestsLeft?: number;
  error?: string;
}

/**
 * Given a company website URL or domain, return the best-confidence
 * verified email Hunter has on file.
 *
 * @param websiteOrDomain  e.g. "southernmachineworks.com" or "https://southernmachineworks.com"
 */
export async function findEmailViaHunter(
  websiteOrDomain: string
): Promise<HunterResult> {
  if (!HUNTER_KEY) {
    return { found: false, error: 'HUNTER_API_KEY not set' };
  }
  if (!websiteOrDomain) {
    return { found: false, error: 'no domain provided' };
  }

  // Normalize to bare domain
  const domain = websiteOrDomain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();

  if (!domain || !domain.includes('.')) {
    return { found: false, error: `invalid domain: "${domain}"` };
  }

  try {
    const url = `${HUNTER_BASE}/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_KEY}&limit=5`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      return { found: false, error: `Hunter ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = (await res.json()) as any;

    if (data.errors?.length) {
      return { found: false, error: data.errors[0]?.details || 'Hunter API error' };
    }

    const emails: any[] = data.data?.emails || [];
    const requestsLeft: number = data.meta?.requests_left ?? -1;

    if (!emails.length) {
      return { found: false, domain, requestsLeft, error: 'no emails found' };
    }

    // Pick highest-confidence email
    const best = emails.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];

    return {
      found: true,
      email: best.value,
      confidence: best.confidence,
      domain,
      requestsLeft,
    };
  } catch (err: any) {
    return { found: false, error: err?.message || String(err) };
  }
}
