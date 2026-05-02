const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendAlert(text: string): Promise<{ ok: boolean; reason?: string }> {
  if (!TOKEN || !CHAT_ID) {
    return { ok: false, reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }
  const body = {
    chat_id: CHAT_ID,
    text: text.slice(0, 3900),
    parse_mode: "Markdown",
    disable_web_page_preview: true
  };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, reason: `telegram ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
