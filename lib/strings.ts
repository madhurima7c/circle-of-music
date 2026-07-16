/**
 * All user-facing UI copy, in one place — i18n-ready.
 *
 * English is the v1 locale; translating later is a data change (swap or
 * branch this module per locale), not a code change. Country and genre
 * names come from seeds.json and are handled separately when the time
 * comes (countries translate; genre names usually stay English).
 *
 * Pure data — no 'use client', importable from server components too.
 */

export const STR = {
  app: {
    name: 'Music Exploration',
    tagline: 'Wander, don’t search — discover the world’s music by place and genre.',
  },

  hub: {
    title: 'Music Exploration',
    thesis:
      'Wander, don’t search. The world’s music, browsable by place and genre — no algorithm, no login, no destination required.',
    circleName: 'Circle of Music',
    circleDesc:
      'The cultural compass. Spin a wheel of countries against a wheel of genres and listen to the intersection.',
    circleCta: 'Start spinning →',
    worldName: 'World of Music',
    worldDesc:
      'The globe. Music anchored to the places it comes from — layers, origins, and the reach a sound has had around the planet.',
    worldCta: 'In the works — preview →',
    foot: '30-second tastings via Deezer · open every find in your own music app',
  },

  world: {
    title: 'World of Music',
    description: 'Music anchored to place, on a globe.',
    thesis:
      'A globe of sound — every beat and melody placed where it was made. The globe is under construction; the wheels are already turning.',
    circleTeaser: 'Explore by country × genre while the globe takes shape.',
    backName: 'Back to the hub',
    backDesc: 'The front door.',
    backCta: 'Home →',
    tapHint: 'Tap any country to hear its music · drag to spin, pinch to zoom',
    surprise: 'Spin to a random country',
    toCircle: 'Open in Circle',
    exploreSuffix: ' · tap to explore',
    dotCta: 'click to play',
    filterToSongs: 'Dots show artists — switch to songs',
    filterToArtists: 'Dots show songs — switch to artists',
    dotsLabel: 'What the dots represent',
    dotsArtists: 'Dots represent artists',
    dotsSongs: 'Dots represent songs',
    handToggle: 'Hand control (webcam)',
  },

  circle: {
    title: 'Circle of Music',
    description: 'Country × Genre, on a circle.',
    backToHub: 'Back to the hub',
  },

  /* Top-center experience switcher. */
  nav: {
    circle: 'Circle',
    world: 'World',
    shades: 'Shades',
    shadesSoon: 'Shades — a color-first way into music. Coming soon.',
  },

  /* Dock "more" menu. */
  menu: {
    more: 'More options',
    language: 'Language',
    handTracking: 'Hand tracking',
    on: 'On',
    off: 'Off',
    contact: 'Contact us',
    about: 'About us',
    aboutTitle: 'Music Exploration',
    aboutBody:
      'Wander, don’t search. The world’s music, browsable by place and genre — no algorithm, no login, no destination required. 30-second tastings via Deezer; open every find in your own music app.',
    translationsSoon: 'coming soon',
    mailSubject: 'Music Exploration — hello',
  },

  /* Language menu — the interaction is offered in all of these; English is
   * the shipped locale, the rest activate as translations land. */
  languages: [
    { code: 'en', label: 'English', ready: true },
    { code: 'es', label: 'Español', ready: false },
    { code: 'fr', label: 'Français', ready: false },
    { code: 'de', label: 'Deutsch', ready: false },
    { code: 'pt', label: 'Português', ready: false },
    { code: 'it', label: 'Italiano', ready: false },
    { code: 'tr', label: 'Türkçe', ready: false },
    { code: 'pl', label: 'Polski', ready: false },
    { code: 'sv', label: 'Svenska', ready: false },
    { code: 'no', label: 'Norsk', ready: false },
    { code: 'ru', label: 'Русский', ready: false },
    { code: 'ar', label: 'العربية', ready: false },
    { code: 'fa', label: 'فارسی', ready: false },
    { code: 'hi', label: 'हिन्दी', ready: false },
    { code: 'ur', label: 'اردو', ready: false },
    { code: 'ja', label: '日本語', ready: false },
    { code: 'ko', label: '한국어', ready: false },
    { code: 'zh', label: '中文', ready: false },
    { code: 'sw', label: 'Kiswahili', ready: false },
  ] as ReadonlyArray<{ code: string; label: string; ready: boolean }>,

  /* Liked-songs popup with playlists (Spotify-style IA). */
  playlists: {
    title: 'Liked songs',
    all: 'All liked',
    yourPlaylists: 'Playlists',
    newPlaylist: 'New playlist',
    namePlaceholder: 'Name your playlist',
    create: 'Create',
    deletePlaylist: 'Delete playlist',
    emptyAll: 'No liked songs yet. Tap the ♥ on a track you love to keep it here.',
    emptyPlaylist: 'Drag songs from All liked into this playlist.',
    dragHint: 'Drag a song onto a playlist to add it',
    removeFromPlaylist: 'Remove from this playlist',
  },

  spotify: {
    connect: 'Connect Spotify',
    connected: 'Spotify ✓ full songs',
    disconnect: 'Disconnect Spotify (back to previews)',
  },

  card: {
    populating: 'Populating music...',
    noResults: 'Could not find music\nfrom these pairing,\ntry something different.',
    upNext: 'Up next:',
    noTracks: 'No tracks.',
    noOtherTracks: 'No other tracks in this queue.',
    openIn: 'open in',
    prev: 'Previous',
    playPause: 'Play / pause',
    next: 'Next',
    shuffle: 'Shuffle',
    save: 'Save to your finds',
    unsave: 'Remove from your finds',
    aboutFallback: (genre: string, country: string, year: string | null) =>
      `A ${genre} find from ${country}${year ? `, released ${year}` : ''}.`,
    listenIn: 'Listen to full song in',
    share: 'Listen in your own app',
    flipHint: 'Tap the card for song info',
    aboutTitle: 'About this song',
    flipBack: 'Tap to flip back',
    factAlbum: 'Album',
    factReleased: 'Released',
    factFound: 'Found in',
    factLength: 'Length',
  },

  library: {
    title: 'Your finds',
    open: 'Your finds',
    empty: 'No finds yet. Tap the ♥ on a track you love to keep it here.',
    playAll: 'Play all',
    export: 'Export',
    import: 'Import',
    remove: 'Remove',
    close: 'Close',
    imported: (n: number) => (n ? `Imported ${n} find${n === 1 ? '' : 's'}.` : 'Nothing new to import.'),
  },

  player: {
    nowPlaying: 'Now playing',
    openInCircle: 'Open in Circle of Music',
  },

  locks: {
    lockCountry:   'Lock the country wheel',
    unlockCountry: 'Unlock the country wheel',
    lockGenre:     'Lock the genre wheel',
    unlockGenre:   'Unlock the genre wheel',
  },

  toasts: {
    play:           '▶ Play',
    pause:          '⏸ Pause',
    next:           '⏭ Next',
    prev:           '⏮ Prev',
    shuffle:        '🔀 Shuffle',
    'lock-left':    '🔒 Country locked',
    'unlock-left':  '🔓 Country unlocked',
    'lock-right':   '🔒 Genre locked',
    'unlock-right': '🔓 Genre unlocked',
    'select-left':  '✓ Country',
    'select-right': '✓ Genre',
  } as Record<string, string>,

  hints: {
    mouse:
      '↕ drag or scroll a wheel to spin it · click a letter to jump · ✋ hand control available in the dock below',
    hand:
      '👆 move your hand to aim the cursor · 🤏 pinch & hold ~1s on a button to press it · pinch over a wheel and move up/down to spin it',
  },

  dock: {
    surprise: 'Surprise me — a random country & genre',
    surpriseCountryOnly: 'Surprise me — random country (genre locked)',
    surpriseGenreOnly: 'Surprise me — random genre (country locked)',
    surpriseBothLocked: 'Both wheels locked — reshuffle this playlist',
    handOn:  'Turn on hand control',
    handOff: 'Turn off hand control',
    handTitleOn:  'Control with your hands (webcam)',
    handTitleOff: 'Turn off hand control',
    info: 'info',
    recommend: 'recommend',
    mailSubject: 'Circle of Music recommendation',
    mailBody: "Add an artist or album you'd recommend: ",
  },

  camera: {
    inUseHeadline: 'Camera in use',
    deniedHeadline: 'Camera blocked',
    noDeviceHeadline: 'No camera found',
    errorHeadline: 'Camera unavailable',
    inUseDetail:
      'Another app (Zoom, Meet, FaceTime…) is using it. Use the mouse to scroll the wheels.',
    deniedDetail: 'Grant camera permission in your browser, then refresh.',
    noDeviceDetail:
      'Plug in a webcam, then refresh. The wheels still respond to mouse scroll & drag.',
    errorDetail: 'Use the mouse to scroll the wheels.',
    hands: (n: number) => `${n} hand${n === 1 ? '' : 's'}`,
  },
} as const;
