import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.TELEGRAM_CHAT_ID || '';

  const tokenLen = token.length;
  const chatLen = chatId.length;

  if (!tokenLen || !chatLen) {
    return NextResponse.json({
      ok: false,
      reason: 'env_missing',
      tokenLen,
      chatLen,
    });
  }

  // getMe
  const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const getMe = await getMeRes.json();

  // sendMessage
  const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `Sprint 2.2.1 diag · ${new Date().toISOString()}`,
    }),
  });
  const send = await sendRes.json();

  return NextResponse.json({
    ok: getMe.ok && send.ok,
    tokenLen,
    chatLen,
    getMe: { ok: getMe.ok, username: getMe.result?.username },
    send: { ok: send.ok, error: send.description },
  });
}
