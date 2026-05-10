export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function extractEmail(headerValue: string): string {
  const m = headerValue.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase().trim();
  return headerValue.toLowerCase().trim();
}

export function extractDomain(email: string): string {
  const parts = email.toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

export function extractLocalPart(email: string): string {
  const parts = email.toLowerCase().split("@");
  return parts.length === 2 ? parts[0].split("+")[0] : "";
}
