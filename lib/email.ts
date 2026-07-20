/**
 * Email relay via Resend (Vercel Marketplace). Serverless-native — unlike
 * FormSubmit (behind Cloudflare, which 403s Vercel's datacenter IPs), the
 * Resend REST API is designed to be called from functions.
 *
 * The destination and the API key both live server-side only. Lazy/env-gated
 * so a build (or any env without RESEND_API_KEY) never throws — callers get
 * false and fall back to the DB as the record of truth.
 *
 * `from` uses Resend's shared `onboarding@resend.dev` sender, which needs no
 * domain verification but can only deliver to the address that owns the
 * Resend account. Once a domain is verified in the Resend dashboard, swap
 * FROM for an address on it to send anywhere.
 */

const FROM = 'Music Exploration <onboarding@resend.dev>';

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
