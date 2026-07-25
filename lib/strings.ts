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
    /* How the site introduces itself when a link is shared (browser tab,
     * iMessage/WhatsApp/Slack unfurls, search results). The description is
     * the About copy boiled down to one line. */
    shareTitle: 'Discover Music',
    shareDescription:
      'Streaming algorithms trap us in echo chambers. Explore music hands-on by country and genre — step outside your comfort zone and discover the world’s sound.',
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
    tapHint: 'Pick a genre to light up its songs around the world · tap any country to hear its music',
    learnMore: 'Listen to full song',
    maxGenres: 'Select 5 genres at a time',
    fromLine: (place: string | null, year: string | null) =>
      place && year ? `From ${place} · ${year}`
      : place ? `From ${place}`
      : year ? `Released ${year}` : '',
    surprise: 'Spin to a random country',
    toCircle: 'Open in Circle',
    exploreSuffix: ' · tap to explore',
    dotCta: 'click to play',
    filterToSongs: 'Dots show artists — switch to songs',
    filterToArtists: 'Dots show songs — switch to artists',
    zoom: 'Zoom',
    search: 'Search for a country',
    searchPlaceholder: 'Search for a country...',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    dotsLabel: 'What the dots represent',
    dotsArtists: 'Dots represent artists',
    dotsSongs: 'Dots represent songs',
  },

  circle: {
    title: 'Circle of Music',
    description: 'Country × Genre, on a circle.',
    backToHub: 'Back to the hub',
    /* Arriving from the World with a nation the 20 wheel cards can't
     * represent — the queue diverts to the nearest seed country. Short
     * line on screen; the ⓘ carries the full explanation. */
    divert: (from: string) => `${from} coming soon — brought you nearby.`,
    divertInfo: (from: string, to: string, genre: string | null) =>
      `${from} isn't in our country list yet, so we brought you to the closest one we have: ${to}${
        genre ? ` — now playing ${to} ${genre.toLowerCase()}` : ''}.`,
  },

  /* Top-center experience switcher. */
  nav: {
    circle: 'Circle',
    world: 'World',
    shades: 'Shades',
    shadesSoon: 'Shades — a color-first way into music. Coming soon.',
  },

  /* Phone intro — the 3 swipeable preview panels phones get instead of
   * the desktop tool. */
  phone: {
    ofMusic: 'of Music',
    circle: 'CIRCLE',
    world: 'WORLD',
    shades: 'SHADES',
    circleBlurb: 'Spin a wheel of countries against a wheel of genres — and listen to where they meet.',
    worldBlurb: 'A planet of music. Tap any country and hear what it sounds like.',
    shadesBlurb: 'A color-first way into music.',
    desktop: 'Optimized for desktop — open this address on a computer to play.',
    soon: '👀 COMING SOON',
    hint: 'swipe',
  },

  /* Dock "more" menu. */
  menu: {
    more: 'More options',
    language: 'Language',
    contact: 'Contact us',
    about: 'About us',
    aboutTitle: 'Music Exploration',
    /* Split around the two names so each can carry its own LinkedIn link. */
    aboutIntro: 'This platform was created by ',
    aboutChan: 'Chan 🌻',
    aboutAnd: ' and ',
    aboutMaddy: 'Maddy 🌷',
    aboutBody:
      ' to change how people discover new music. Mainstream streaming algorithms often trap us in echo chambers, endlessly serving up the same styles we already know. Instead, our platform offers a hands-on, interactive way to step outside your comfort zone, dive into diverse cultures, and truly learn about global music. We want this to be an open, evolving experience. If you have suggestions for new features or content, click the contact button and let us know!',
    aboutChanUrl: 'https://www.linkedin.com/in/chandanalovesdesign/',
    aboutMaddyUrl: 'https://www.linkedin.com/in/madhurima-c/',
    aboutApis: 'Music served through Deezer and MusicBrainz APIs',
    aboutMade: 'Made with 💙 in Seattle',
    translationsSoon: 'coming soon',
    mailSubject: 'Music Exploration — hello',
  },

  /* Contact popup (dock ⋮ → Contact us). Two tabs; sends via /api/contact. */
  contact: {
    title: 'Contact us',
    noteTitle: 'Send us a note',
    noteHint: 'Thoughts, wishes, broken things — all welcome.',
    notePlaceholder: 'Write to us…',
    songTitle: 'Add a song',
    songHint: 'Know a song that belongs in a pairing? Suggest it — we verify the match before it joins the playlists.',
    songCountry: 'Country',
    songGenre: 'Genre',
    songPlaceholder: 'Song name — artist',
    send: 'Send',
    sending: 'Sending…',
    close: 'Close',
    sentNote: 'Your note is on its way — thank you.',
    sentSong: 'Suggestion received — we’ll give it a listen.',
    againNote: 'Send another note',
    againSong: 'Suggest another song',
    error: 'Couldn’t send just now — please try again.',
    noteSubject: 'Music Exploration — a note',
    songSubject: (country: string, genre: string) =>
      `Music Exploration — song suggestion (${country} × ${genre})`,
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
    connecting: 'Connecting Spotify…',
    connectDone: 'Connected — you can close this window.',
    connectFail: 'Spotify connection didn’t complete. Close this window and try again.',
  },

  card: {
    populating: 'Populating music...',
    noResults: 'Could not find music\nfrom these pairing,\ntry something different.',
    upNext: 'Up next:',
    playlist: 'Playlist',
    noTracks: 'No tracks.',
    noOtherTracks: 'No other tracks in this queue.',
    openIn: 'open in',
    prev: 'Previous',
    playPause: 'Play / pause',
    next: 'Next',
    shuffle: 'Shuffle',
    shuffleOn: 'Shuffle: on',
    shuffleOff: 'Shuffle: off',
    save: 'Save to your finds',
    unsave: 'Remove from your finds',
    aboutFallback: (genre: string, country: string, year: string | null) =>
      `A ${genre} find from ${country}${year ? `, released ${year}` : ''}.`,
    listenIn: 'Listen to song in',
    share: 'Listen in your own app',
    flipHint: 'Tap the card for artist info',
    flipHintShort: 'Tap for artist info',
    aboutTitle: 'About this song',
    aboutArtist: 'About the artist',
    seeMore: 'see more',
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
    remove: 'Remove',
    close: 'Close',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    clearSelected: 'Clear',
    addToPlaylist: 'Add to playlist',
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
      '↕ drag or scroll a wheel to spin it · click a letter to jump',
  },

  dock: {
    surprise: 'Surprise me — a random country & genre',
    surpriseCountryOnly: 'Surprise me — random country (genre locked)',
    surpriseGenreOnly: 'Surprise me — random genre (country locked)',
    surpriseBothLocked: 'Both wheels locked — reshuffle this playlist',
    info: 'info',
    recommend: 'recommend',
    mailSubject: 'Circle of Music recommendation',
    mailBody: "Add an artist or album you'd recommend: ",
  },

} as const;
