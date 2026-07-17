'use client';

/**
 * A tiny side-channel to the ONE <audio> element GlobalPlayer owns.
 *
 * The progress bar needs currentTime at ~2Hz; routing that through the
 * React store would re-render the whole card tree every tick. Instead
 * GlobalPlayer registers its element here and the ProgressBar polls it
 * directly (and seeks by writing currentTime).
 *
 * `ext` is the same idea for the hidden Spotify embed: while a track is
 * sounding through the embed, GlobalPlayer mirrors its clock (seconds)
 * here and the ProgressBar prefers it over the silent <audio>.
 */

export const audioBus: {
  el: HTMLAudioElement | null;
  ext: { pos: number; dur: number; seek: (seconds: number) => void } | null;
} = { el: null, ext: null };
