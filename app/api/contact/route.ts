import { NextRequest, NextResponse } from 'next/server';
import { storeSubmission } from '@/lib/db';

/**
 * Contact relay — every submission is (1) stored in the Neon Postgres
 * `submissions` table and (2) emailed via FormSubmit's AJAX API. The
 * destination address lives HERE, server-side only — it is never shipped
 * to the browser or shown to users.
 *
 * FormSubmit gotchas learned the hard way:
 * - It REQUIRES Origin/Referer headers or it returns HTTP 200 with
 *   success:"false" ("open this page through a web server") — so res.ok is
 *   meaningless; the JSON `success` field is the real verdict.
 * - One-time activation: the first accepted submission emails an
 *   'Activate Form' link to the address below; until it's clicked every
 *   send returns success:"false" ("This form needs Activation").
 */

const TO = 'chandanasmekala@gmail.com';
const SITE = 'https://discovery-of-music.vercel.app';

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

  // 2) Email relay.
  let sent = false;
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${TO}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: SITE,
        Referer: `${SITE}/`,
      },
      body: JSON.stringify({
        _subject: subject || 'Music Exploration — message',
        message,
      }),
    });
    if (res.ok) {
      const out = (await res.json().catch(() => null)) as { success?: unknown } | null;
      sent = String(out?.success) === 'true';
    }
  } catch {
    sent = false;
  }

  // The submission "succeeds" for the user if EITHER channel took it —
  // the DB is the source of truth once provisioned; email is a courtesy copy.
  if (!stored && !sent) {
    return NextResponse.json({ error: 'send failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, stored, sent });
}
