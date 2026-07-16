'use client';

/**
 * A tiny side-channel to the ONE <audio> element GlobalPlayer owns.
 *
 * The progress bar needs currentTime at ~2Hz; routing that through the
 * React store would re-render the whole card tree every tick. Instead
 * GlobalPlayer registers its element here and the ProgressBar polls it
 * directly (and seeks by writing currentTime).
 */

export const audioBus: { el: HTMLAudioElement | null } = { el: null };
