import { NextRequest, NextResponse } from 'next/server';
import { storeSubmission } from '@/lib/db';
import { sendEmail } from '@/lib/email';

/**
 * Contact relay — every submission is (1) stored in the Neon Postgres
 * `submissions` table and (2) emailed via Resend. The destination address
 * lives HERE, server-side only — it is never shipped to the browser.
 *
 * Why Resend and not FormSubmit: FormSubmit sits behind Cloudflare, which
 * bot-challenges Vercel's datacenter IPs (verified 403 "Just a moment…"), so
 * it can't be called from a serverless function. Resend's REST API is built
 * for exactly this. Both the API key and the destination are server-only.
 */

const TO = 'chandanasmekala@gmail.com';

export async function POST(req: NextRequest) {
  let body: {
    subject?: unknown;
    message?: unknown;
    kind?: unknown;
    country?: unknown;
    genre?: unknown;
    song?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const subject = String(body.subject ?? '').slice(0, 200).trim();
  const message = String(body.message ?? '').slice(0, 5000).trim();
  const kind = body.kind === 'song' ? 'song' : 'note';
  const field = (v: unknown) => {
    const s = String(v ?? '').slice(0, 120).trim();
    return s || null;
  };
  if (!message) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }

  // 1) Persist (anonymous; soft-fails if the DB isn't provisioned yet).
  const stored = await storeSubmission({
    kind,
    subject,
    message,
    country: field(body.country),
    genre: field(body.genre),
    song: field(body.song),
  });

  // 2) Email notification via Resend (best-effort; DB is the record of truth).
  const sent = await sendEmail(TO, subject || 'Music Exploration — message', message);

  if (!stored && !sent) {
    return NextResponse.json({ error: 'send failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, stored, sent });
}
