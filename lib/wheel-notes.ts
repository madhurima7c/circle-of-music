/**
 * Wheel-card notes — what the back of a country/genre card says when the
 * selected card is clicked (it flips to reveal this). Short, grounded
 * blurbs: the country's music scene, or what the genre is and where it
 * comes from. Rendered onto a canvas (drawNoteCanvas) that Wheel.tsx wraps
 * in a THREE.CanvasTexture for the card's back face.
 */

export const COUNTRY_NOTES: Record<string, string> = {
  Argentina:
    'Tango was born in the port neighborhoods of Buenos Aires, and the city still dances it nightly. Rock nacional, cumbia villera and modern trap have each taken turns as the sound of the streets.',
  Brazil:
    'Rio’s hillsides gave the world samba; the beach apartments of 50s Ipanema cooled it into bossa nova. MPB carried poetry through dictatorship, and funk carioca and sertanejo rule today’s charts.',
  France:
    'From Piaf’s chanson to Daft Punk’s filtered house, France pairs romance with rigor. Paris doubles as a global hub for African and Arab music, and French touch electro reshaped dance floors everywhere.',
  Ghana:
    'Highlife — jazzy guitars over Akan rhythms — is the root of much West African pop. Ghana fused it with rap into hiplife, and today drives the Afrobeats wave alongside Nigeria.',
  India:
    'Hindustani and Carnatic classical traditions run back centuries, built on raga and tala. Bollywood turned film song into the national pop form; indie, rap and electronic scenes now thrive across its cities.',
  Iran:
    'Persian classical music rests on the radif, a repertoire memorized master to student. Pre-revolution Tehran had a golden pop age; the scene now spans underground rock, rap and a vast diaspora.',
  Japan:
    'The world’s second-largest music market: koto and taiko traditions, city pop’s neon glide, Shibuya-kei’s collage and the J-pop idol machine. Its 70s–80s city pop found a huge second life online.',
  Mexico:
    'Mariachi, norteño, banda and son are living regional traditions. Corridos have told the news in song for a century — and corridos tumbados just took Mexican music to the top of the global charts.',
  Nigeria:
    'Fela Kuti forged Afrobeat in Lagos from highlife, jazz and funk. His heirs — Burna Boy, Wizkid, Davido — made Afrobeats (with an s) the defining sound of a new pop decade.',
  Norway:
    'Beyond Grieg, Norway gave metal its most extreme chapter — black metal — and pop some of its slickest writing. Its jazz scene, the cool “Nordic sound” around ECM, is quietly world-class.',
  Pakistan:
    'Qawwali — Sufi devotional song — reached the world through Nusrat Fateh Ali Khan’s voice. Coke Studio Pakistan turned the country’s classical-folk-pop fusion into an international phenomenon.',
  Poland:
    'Chopin distilled Polish folk dances into the piano canon. Under communism Poland built serious jazz and avant-garde scenes; today its hip hop and electronic underground run deep.',
  Portugal:
    'Fado — “fate” — is Lisbon’s blues: saudade sung over Portuguese guitar. The city is now also a hub for lusophone African music, from Cape Verdean morna to kuduro-charged club sounds.',
  'South Africa':
    'From mbaqanga and mbube to Hugh Masekela’s jazz, South Africa’s sound carried the anti-apartheid struggle. Kwaito soundtracked freedom; amapiano now moves dance floors worldwide.',
  'South Korea':
    'Korea built a pop industry with planetary reach — K-pop’s idol system — atop traditions like pansori epic song. Seoul’s indie, rap and electronic scenes push far beyond the charts.',
  Spain:
    'Flamenco — cante, guitar, palmas — grew from Andalusia’s Roma communities into a national art. Spain’s range runs from movida-era rock to today’s flamenco-pop crossovers heard around the globe.',
  Sweden:
    'Sweden exports pop the way it exports design: ABBA, Robyn, and the writer-producers behind countless global #1s. Stockholm also shaped house music, and Gothenburg named a whole school of melodic metal.',
  Turkey:
    'Where Ottoman classical, Sufi ritual and Anatolian folk meet Europe. Turkey’s 70s Anadolu rock made psychedelic funk from village tunes — and its diaspora keeps remixing the tradition.',
  'United Kingdom':
    'From the Beatles through punk, new wave, jungle, grime and drill — Britain reinvents pop roughly once a decade, with pirate radio and club culture as its engine room.',
  'United States':
    'Blues, jazz, gospel, country, rock and roll, funk, hip hop, house and techno were all born here — largely in Black American communities — and became the vocabulary of global pop.',
};

export const GENRE_NOTES: Record<string, string> = {
  Afrobeats:
    'West Africa’s pop lingua franca — log-drum grooves, highlife guitars and R&B melody, centered on Lagos and Accra. Distinct from Fela’s 70s Afrobeat (no s), its political big-band ancestor.',
  Ambient:
    'Music as atmosphere. Brian Eno named it with Music for Airports (1978) — sound “as ignorable as it is interesting” — with roots in Satie’s furniture music and tape-loop minimalism.',
  'Bossa Nova':
    'The “new wave” of late-50s Rio: samba cooled to a whisper. João Gilberto’s guitar and Jobim’s harmony made The Girl from Ipanema one of the most recorded songs ever.',
  Classical:
    'The Western concert tradition, roughly Bach to now — baroque counterpoint, the symphony, opera, and today’s minimalist and film scores. A thousand years of notated music.',
  Cumbia:
    'Born on Colombia’s Caribbean coast from African, Indigenous and Spanish roots, cumbia’s shuffling two-step conquered Latin America — nearly every country has its own dialect of it.',
  Disco:
    'Four-on-the-floor, strings and liberation: disco grew from 70s New York’s Black, Latino and gay club scenes. Its DNA — the DJ, the 12-inch, the dance floor — became modern dance music.',
  Electronic:
    'The broad church of machine music, from musique concrète and Kraftwerk’s synth-pop to today’s bedroom producers. Its real instrument is the studio itself.',
  Folk:
    'Song as memory: traditional melodies passed down and reworked, and the 20th-century revivals — Guthrie, Dylan, and their counterparts worldwide — that turned them into protest and poetry.',
  Funk:
    'James Brown shifted the weight to “the one” and rhythm became the song. Locked drums, syncopated bass, scratch guitar — funk is the groove hip hop and dance music still sample.',
  'Hip Hop':
    'Born at 70s Bronx block parties from two turntables and an MC, now the world’s dominant pop form — and a culture of four elements: DJing, rapping, breaking, graffiti.',
  House:
    'Chicago, early 80s: DJs at clubs like the Warehouse extended disco with drum machines. Four-on-the-floor around 120 BPM with gospel-deep vocals — the mother tongue of dance music.',
  Indie:
    'Independent-label rock and pop — jangly, lo-fi or arty by turns. From post-punk DIY through The Smiths and Pavement, “indie” became as much an aesthetic as an economics.',
  Jazz:
    'Born in New Orleans from blues, ragtime and brass bands, jazz runs on improvisation. Swing, bebop, modal, free and fusion are chapters of one long conversation.',
  Pop:
    'The craft of the three-minute song: hooks, choruses and production polish. Pop absorbs whatever is current — rock, disco, hip hop, Afrobeats — and distills it for everyone.',
  Punk:
    'Three chords, played fast, meant completely. Mid-70s New York and London stripped rock to its raw core; the DIY ethic — start a band, print a zine, book a show — outlived every wave.',
  Reggae:
    'Kingston, late 60s: ska and rocksteady slowed into reggae’s offbeat skank. Bob Marley made it a global voice for the oppressed, and its studio science — dub — invented remix culture.',
  Rock:
    'Electric guitars, backbeat and attitude. Rock and roll fused blues and country in the 50s, then split into a universe: psychedelia, hard rock, metal, punk, grunge and beyond.',
  Soul:
    'Gospel fervor meets secular longing: Ray Charles, Aretha Franklin, Otis Redding. Motown made it pop, Stax kept it raw — soul is still the benchmark of popular singing.',
  Techno:
    'Detroit, mid-80s: Juan Atkins, Derrick May and Kevin Saunderson imagined machine funk for a post-industrial city. Harder and more futurist than house, it became Berlin’s second language.',
  World:
    'A record-store shorthand, not a single sound: the catch-all for traditions outside Anglo-American pop, from Malian griots to gamelan. Best understood as a door, not a genre.',
};

export function noteFor(side: 'left' | 'right', name: string): string | null {
  return (side === 'left' ? COUNTRY_NOTES : GENRE_NOTES)[name] ?? null;
}

/* ---------- canvas rendering ---------- */

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.2;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw the note card: spine-colored background, kicker, name, rule, wrapped
 * body, flip-back hint. 512² canvas — crisp at the wheel's pop scale.
 */
export function drawNoteCanvas(side: 'left' | 'right', name: string, bg: string): HTMLCanvasElement {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;

  const dark = luminance(bg) < 0.5;
  const ink    = dark ? 'rgba(255,255,255,0.92)' : 'rgba(12,12,14,0.9)';
  const dimInk = dark ? 'rgba(255,255,255,0.55)' : 'rgba(12,12,14,0.55)';
  const rule   = dark ? 'rgba(255,255,255,0.35)' : 'rgba(12,12,14,0.3)';

  ctx.fillStyle = bg || '#26262a';
  ctx.fillRect(0, 0, S, S);

  const PAD = 46;
  let y = PAD + 18;

  // Kicker
  ctx.fillStyle = dimInk;
  ctx.font = '500 17px "DM Mono", ui-monospace, monospace';
  ctx.fillText(side === 'left' ? 'THE MUSIC OF' : 'ABOUT THE GENRE', PAD, y);
  y += 44;

  // Name (shrink to fit one line)
  ctx.fillStyle = ink;
  let size = 42;
  do {
    ctx.font = `600 ${size}px "DM Sans", sans-serif`;
    if (ctx.measureText(name.toUpperCase()).width <= S - PAD * 2) break;
    size -= 3;
  } while (size > 22);
  ctx.fillText(name.toUpperCase(), PAD, y);
  y += 26;

  // Rule
  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(S - PAD, y);
  ctx.stroke();
  y += 46;

  // Body
  const note = noteFor(side, name) ?? '';
  ctx.fillStyle = ink;
  ctx.font = '400 23px "DM Sans", sans-serif';
  for (const line of wrapLines(ctx, note, S - PAD * 2)) {
    ctx.fillText(line, PAD, y);
    y += 34;
    if (y > S - PAD - 40) break;   // never collide with the hint
  }

  // Hint
  ctx.fillStyle = dimInk;
  ctx.font = '500 15px "DM Mono", ui-monospace, monospace';
  ctx.fillText('CLICK AGAIN TO FLIP BACK', PAD, S - PAD + 6);

  return c;
}
