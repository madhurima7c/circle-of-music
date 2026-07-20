import { NextRequest, NextResponse } from 'next/server';

/**
 * Contact relay — receives the popup's note / song suggestion and emails it
 * via FormSubmit's AJAX API. The destination address lives HERE, server-side
 * only — it is never shipped to the browser or shown to users.
 *
 * NOTE: FormSubmit requires a ONE-TIME activation — the first submission
 * sends a confirmation link to the address below; click it once and every
 * later submission is delivered normally.
 */

const TO = 'chandanasmekala@gmail.com';

export async function POST(req: NextRequest) {
  let body: { subject?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const subject = String(body.subject ?? '').slice(0, 200).trim();
  const message = String(body.message ?? '').slice(0, 5000).trim();
  if (!message) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${TO}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: subject || 'Music Exploration — message',
        message,
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'send failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'send failed' }, { status: 502 });
  }
}
