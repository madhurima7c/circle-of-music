export const COUNTRIES = [
  'argentina', 'brazil', 'canada', 'denmark', 'egypt', 'france', 'germany', 'hungary',
  'india', 'japan', 'kenya', 'lebanon', 'mexico', 'nigeria', 'oman', 'peru',
  'qatar', 'romania', 'spain', 'turkey', 'united kingdom', 'vietnam', 'wales', 'xinjiang',
  'yemen', 'zambia',
] as const;

export const GENRES = [
  'ambient', 'blues', 'classical', 'disco', 'electronica', 'funk', 'grime', 'house',
  'indie', 'jazz', 'klezmer', 'lo-fi', 'metal', 'new wave', 'opera', 'punk',
  'qawwali', 'reggae', 'soul', 'techno', 'uk garage', 'vaporwave', 'world', 'xtatic',
  'yacht rock', 'zydeco', 'jungle',
] as const;

export const PALETTES = [
  ['#e7d8c1', '#cf6655', '#274c77', '#f3a712', '#0e1116'],
  ['#f4f1de', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'],
  ['#0a2463', '#fb3640', '#247ba0', '#e9c46a', '#264653'],
  ['#102f26', '#fbf8cc', '#f4978e', '#a4c3b2', '#cce3de'],
  ['#22223b', '#4a4e69', '#9a8c98', '#c9ada7', '#f2e9e4'],
];

export type Track = {
  title: string;
  artist: string;
  image: string;
  preview: string | null;
  uri: string | null;
};
