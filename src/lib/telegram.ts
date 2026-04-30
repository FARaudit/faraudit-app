export async function sendTelegram(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[telegram-send] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.length > 4000 ? message.slice(0, 4000) + "\n\n…(truncated)" : message,
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      console.error(`[telegram-send] ${res.status} ${res.statusText} — ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram-send] fetch threw:", err);
    return false;
  }
}
