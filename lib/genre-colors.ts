/**
 * Per-genre colors, anchored to Every Noise at Once (everynoise.com).
 *
 * ENAO colors encode audio character, so related-sounding genres share
 * nearly identical hues — Pop / Hip Hop / Afrobeats / Cumbia / Disco /
 * Funk / Rock are all the same mustard, and Folk / Soul / Reggae / World
 * are all the same olive. Where the ENAO color was distinct we use it
 * EXACTLY (`adjusted: false`); collisions got hand-picked stand-ins that
 * stay warm-family where possible (`adjusted: true` — swap freely, the
 * `enao` field preserves the original for reference).
 */

export type GenreColor = { hex: string; enao: string; adjusted: boolean };

export const GENRE_COLOR: Record<string, GenreColor> = {
  Afrobeats:    { hex: '#b88806', enao: '#b88806', adjusted: false },
  Ambient:      { hex: '#4f94c4', enao: '#4f94c4', adjusted: false },
  'Bossa Nova': { hex: '#649637', enao: '#649637', adjusted: false },
  Classical:    { hex: '#24a193', enao: '#24a193', adjusted: false },
  Cumbia:       { hex: '#3a86ff', enao: '#a18c10', adjusted: true },  // mustard clone of Pop → royal blue
  Disco:        { hex: '#ff70a6', enao: '#a07912', adjusted: true },  // mustard clone of Funk → disco pink
  Electronic:   { hex: '#9e8982', enao: '#9e8982', adjusted: false }, // ENAO "electronica"
  Folk:         { hex: '#65910e', enao: '#65910e', adjusted: false },
  Funk:         { hex: '#9d4edd', enao: '#9d7713', adjusted: true },  // mustard clone of Disco → purple
  'Hip Hop':    { hex: '#fb8500', enao: '#ac7f08', adjusted: true },  // mustard clone of Pop → orange
  House:        { hex: '#cb806c', enao: '#cb806c', adjusted: false },
  Indie:        { hex: '#a1823a', enao: '#a1823a', adjusted: false }, // ENAO "indie rock"
  Jazz:         { hex: '#50905d', enao: '#50905d', adjusted: false },
  Pop:          { hex: '#ffd166', enao: '#ad8907', adjusted: true },  // same hue, lifted clear of the cluster
  Punk:         { hex: '#d75421', enao: '#d75421', adjusted: false },
  Reggae:       { hex: '#c5d92d', enao: '#8a8f1f', adjusted: true },  // olive clone of World → chartreuse
  Rock:         { hex: '#e5484d', enao: '#ac7119', adjusted: true },  // mustard-brown clone → rock red
  Soul:         { hex: '#d63384', enao: '#698716', adjusted: true },  // olive clone of Folk → magenta
  Techno:       { hex: '#ba89c8', enao: '#ba89c8', adjusted: false },
  World:        { hex: '#00b4d8', enao: '#8f8623', adjusted: true },  // olive clone of Reggae → cyan
};

export const genreColor = (name: string): string =>
  GENRE_COLOR[name]?.hex ?? '#9daaff';

/** Chip/label ink that stays readable on top of a genre color. */
export const genreInk = (name: string): string => {
  const h = genreColor(name);
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0e0f1a' : '#ffffff';
};
