# Music Exploration — TODO / pick-up-here

Working notes for resuming. Full architecture + gotchas: **CLAUDE.md**.
Product plan (research + decisions): `~/.claude/plans/follow-this-guide-to-cryptic-treasure.md`.

---

## ✅ Done (on `main`, pushed)

**Phase 0 — foundation**
- Routes: `/` hub · `/circle` wheels · `/world` globe; store + player in root layout (survive navigation)
- Hand tracking → opt-in dock toggle (default off, `localStorage.handMode`)
- Shareable URLs `/circle?country=X&genre=Y`
- Deep links out (Spotify/Apple/YouTube/Deezer search links)
- GlobalPlayer: one `<audio>` + MediaSession + mini-player pill
- Fixed stale-closure bug (playlists lagged the displayed pairing)
- Mobile portrait Circle (≤640px)
- All copy centralized in `lib/strings.ts`

**Phase 1A — Circle polish**
- GSAP card animation (`@gsap/react` useGSAP, guarded for hidden tab/reduced-motion)
- Shuffle: "surprise me" dice (global + guided by wheel locks)
- Local **finds library** (♥ save, drawer, play-as-queue, JSON export/import)
- **`npm run audit`** — pairing genre-mismatch report (no seed changes)

**Phase 1B — World alpha**
- react-globe.gl globe, Natural Earth countries, our 20 highlighted
- Tap country → instant audio (`store.playPlace`); genre chips; globe-shuffle

---

## ✅ Done this session (2026-07-13, pushed)

**Content wave 1 (was Track A):**
- `RELATED_GENRES` gaps filled (Bossa Nova/Classical/Cumbia/Disco/Punk; Reggae deliberately skipped — borrowed World seeds sound wrong). Mirrored in the audit script.
- +80 Deezer-verified seed artists (worst five countries + slam dunks). Audit: **FALLBACK 104 (26%) → 19 (5%)**, DIRECT 49%→55%.
- Card **origin line**: `lib/stories.ts` + `lib/track-stories.json` (90 curated artist stories) with a grounded facts fallback ("A Disco find from Ghana, released 2022"); album row shows a clean year.

**World Phase 2 (origin dots + any nation):**
- `npm run origins` → `lib/origins.json`: 624/678 seed artists resolved to origin coords via Wikidata (570 city-level; ~35 wrong-entity matches hand-corrected in place — re-runs skip existing keys so fixes persist).
- Globe: origin **dots** per queue artist; playing dot glows + pulse ring; hover = artist · origin city · story; **click a dot to jump playback** to that artist.
- **Every nation tappable** — unseeded countries resolve via MusicBrainz tier (`playPlaceNamed` + `countryName` in store; `/api/musicbrainz` whitelist extended via generated `lib/geo-iso.json`). Verified: Mongolia × Rock → The HU, Altan Urag.
- Genre chips → **vertical scrollable rail on the left** (user-requested).

**Pipelines:**
- `npm run enrich` → `scripts/enrich-seeds.ts`: Wikidata SPARQL ∪ MusicBrainz candidates, Deezer-verified, writes `seed-proposals.json` for review. Never edits seeds directly.

## ▶️ Next up

### A. Content — finish the tail
- [ ] Review `seed-proposals.json` (output of `npm run enrich`) with the user; merge approved rows into seeds.json; re-run `npm run audit` (19 fallbacks remain: mostly Bossa Nova/Reggae in countries without scenes).
- [ ] Axes growth decision pending user: 24×24 or 28×28 EQUAL axes. Candidate countries: Germany, Italy, Colombia, Jamaica, Cuba, Ethiopia, Indonesia, Australia. Genres: Blues, Country, Metal, R&B, Reggaeton, Amapiano, Salsa, Flamenco. User must supply covers (`public/covers/`, kebab-case). After adding: re-run `npm run origins` + `npm run audit`.
- [ ] More stories in `lib/track-stories.json` (keys = normalized artist names; grounded facts only).

### B. World — remaining polish
- [ ] "Reach" **arcs**: genre origin → where it spread.
- [ ] **Layer toggles** UI (countries / origins / reach).
- [ ] Cross-links: Circle track → "see on globe" flyover (globe → Circle already bridges via mini-player).
- [ ] Globe polish: on-demand render loop for battery; touch on a real phone.

### C. Full playback + export (Phase 3, opt-in)
- [ ] Spotify **Embed iframe** panel (full track for Premium users, no app registration) + optional YouTube iframe.
- [ ] Library export → Spotify playlist (personal/dev-mode only; public Spotify blocked by 250k-MAU quota).

---

## ✅ Also done (World v3 + Spotify, 2026-07-13, pushed)
- Flat 2D markers replace 3D dots: album-art **avatars** in artist mode, outline **dots** in song mode; playing marker filled + sonar ring; pure-CSS hover popups (artist: origin/songs/story · song: year/album/place/fact).
- Markers appear on country **selection**; click zooms to altitude 0.7 (globe may overflow frame). Hover extrusion halved + grey tint.
- **Filter fab** (person/note icon, above shuffle) toggles artists ⇄ songs, persisted (`localStorage.worldDots`).
- Genre rail → separated **list** with blue-gradient active row (not pills).
- **Playlist panel** = Circle's CenterStack docked right on /world (`dock="right"` prop); mini-player hidden on /world.
- **Hand-tracking fab** on World (same opt-in system; pinch-drag rotates globe).
- Instrument toggle links: World→Circle (right edge, underlined) and Circle→World (under library button).
- **Spotify full songs**: lib/spotify.ts (PKCE + Web Playback SDK), Connect button in card links row, per-track fallback to previews. Needs `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` (see CLAUDE.md) — **user must create the free Spotify app**; untested live until then.
- **Live origins** (lib/origins-live.ts): unknown queue artists resolve via Wikidata at runtime, cached in localStorage — Spain × Jazz shows 13/13 artist dots.

## ✅ World v4 (2026-07-13, pushed)
- Dots restyled to the radio.garden reference: small flat green points in both filter modes; only the playing marker shows album art (avatar + sonar ring). 8px invisible hit area, hover z-bump, 290px popups.
- normKey/normName now Unicode-aware + fold table (Korean names no longer normalize to ''; "Fazıl Say" matches his story/origin). origins.json keys migrated; all 4 normalizer copies synced.
- Playlist fetch retries once on empty (transient Deezer flakes caused false "no results", e.g. US × Rock).
- Deferred by user: axes growth (later version), Spotify client-ID setup (will use the published site URL as redirect).

## ✅ World coverage + v5 (2026-07-14, pushed)
- **world-seeds.json**: 161/175 nations with Deezer-verified, genre-bucketed artists (Wikidata sitelink-ranked; `npm run world-seeds`, resumable, WDQS-backoff). Circle stays curated 20×20; World taps get world-seeds → related genres → MusicBrainz → country-top fallback (no more dead ends). `lib/enao-genres.json` (Every Noise) supplies per-country `featured` genres.
- Globe: world-covered countries mid-tint; wheel countries accent; "tap to explore" only where truly empty.
- **Zoom snap-back fixed**: initial pointOfView ran on every status change (reset the camera right after fly-in); now runs once. Same-country reclick no longer refetches/strips dots.
- Bottom controls → one centered horizontal dock: hand toggle · artists|songs segmented toggle · shuffle.
- World playlist panel height == genre rail (620px verified).
- Dev note: `window.__world.select(name, genreIdx)` (dev-only) drives country taps headless. Turbopack stale-bundle bit twice more (once splitting the store into two module instances — UI dead while network fires). rm -rf .next + restart.

## ✅ Card art + UI v2 (2026-07-15/16, pushed to BOTH remotes)
- **Deploy setup**: Vercel watches `deploy` remote (`chanmekala/discovery-of-music`) — push every commit to origin AND deploy.
- **Card art**: user's country/genre covers (fronts), dedicated spine strips (edges), spine-color solid backs (`lib/spine-colors.json`); lit PBR vinyl shading (locked lighting rig); dial values baked (cardSize 1.25, thickness 0.07, popZ 1.35, popScale 1.55, gap 0.38/0.2); leva dial kit REMOVED (restore from `30306c7` if needed).
- **UI v2** (`a9d1878`): top-center ExperienceNav (user icons; Shades = coming soon); titles/hints/top-right library removed; dock = shuffle · liked · ⋮ (Language 19 langs / Hand tracking On-Off / world dots filter / Contact / About); LikedSongs popup w/ playlists + drag-drop (localStorage `playlists`); card flip (about-side w/ story+facts), progress bar w/ seek (lib/audio-bus), share → "listen to full song in" brand menu, rich queue rows w/ durations + click-to-jump; progressive edge blur replaces glass overlay; DM Sans/DM Mono fonts.
- Raw asset folders gitignored: `covers new/` (2.1GB), `menu icons/`.
- **Nav v2**: frameless (no white pill), original 28px icon size, glow, `position: fixed` so it's identical on every route, per-route `data-theme` (dark labels on Circle, off-white on World), hover motion per instrument w/ spring-overshoot pop + staggered entrance; "Go to Circle/World" edge links removed (nav navigates). The world icon is a REAL 3D mini-globe (`components/NavGlobe.tsx`: three.js sphere, texture rasterized from the same `/geo/countries-110m.geojson`, spins on hover, module-level texture cache); the circle card-ring SVG is inlined in ExperienceNav for currentColor theming (#1d2bdf light / #767dec dark).

## ✅ Circle fixes batch (2026-07-16, pushed)
- Landing = Circle (`/` renders it; `/circle` redirects); hub removed. Frame edge-to-edge.
- Nav 1.5× + 16px lower; circle-icon hover spin halved (6.4s).
- Letter ladders = all 26 letters A–Z (dim = no item; click cycles same-initial items). Locks moved up for the taller rail.
- Dock: no circle highlights ever — hover/press turns the icon stroke accent-blue; shuffle is a plain single-press button; More menu closes on outside click (scrim moved OUTSIDE the transformed .dock — transform traps position:fixed — and sits at z-39, below the dock).
- CenterStack split into TWO cards: player (3D-flips to artist/song/year/album/facts) + separate scrollable Up Next card (9+ rows visible on tall screens; stack height = min(100dvh−240px, 690px), top-biased 12px below the nav).
- Share "listen in" menu → body-level portal (fixed, z-70) — can't be clipped by the card; closes on outside click.
- Queue-click bug fixed: queue keys now position-qualified (`${j}-${t.id}`), and the pipeline dedupes by normalized artist+title (normTitle strips parentheticals/remaster suffixes) — the same song as single+album cut was filling the queue with repeats and colliding keys.
- Pipeline deepened: QUEUE_MAX 150 (was 22), MB proxy returns 30 artists (score ≥65, was 12@75), artists fetched in batches of 8 w/ 800ms pause (full-parallel burst tripped Deezer's ~50req/5s quota and starved queues), enrich only first 30 tracks. Verified UK×Soul = 90 tracks, 0 dupes.
- Wheel cards: clicking the SELECTED card 3D-flips it to a curated note (`lib/wheel-notes.ts`: 20 country scenes + 20 genre blurbs, canvas-rendered onto the card back in its spine color; texture cached per card). Click again / spin flips back. Clicking selected no longer refetches.
- Connector lines are alive: populating = line grows from wheel edge toward center (repeating); playing = the string SPLITS into 11 nested strands (scaled copies of one waveform, pinned ends) in the platform blues (#1f2bd6→#cdd3ff), rAF, eased attack/release; paused = collapses to a single line. Synthesized — a WebAudio analyser on Deezer's CDN previews would taint the audio graph.
- Player + Up Next rejoined into ONE card (hairline partition; controls end near the divider); the flipper turns alone. Back face = **About the artist**: Deezer portrait (`getArtistPicture`), origin "city, country" (`originForLive`), clamped writeup + "see more" → larger dialog (`.artist-modal`, portaled) w/ full bio + album/year/pairing/length facts.
- Dock hover = circle highlight (blue-tinted) + accent stroke (stroke-only was too subtle).

## ✅ World v6 — genre dots + dot chain + single card (2026-07-16, pushed)
- **Default = no genre** (`genreSel: number|null`, local to WorldGlobe; store untouched). Picking a genre lights up song dots WORLDWIDE: one per artist in that genre from world-seeds (175 nations) + wheel seeds — Jazz ≈ 250 dots/98 countries, Pop ≈ 900. Coords from origins.json, else country label point + deterministic jitter. Rendered as WebGL `pointsData` (green), NOT html elements — cheap at 1000 dots. Clicking the active genre chip clears it.
- **Dot chain playback**: click any dot → that artist's top genre-matched song fetches + plays (`searchArtistTracksStrict` + module cache). Auto-advance = geographically NEAREST unplayed dot (haversine), via rolling prefetch: next song is fetched + `appendTracks`ed before the current ends so GlobalPlayer's normal advance lands on it. Dead dots (no preview) skipped. Verified: Piazzolla → Aznar → Barbieri → Schifrin (all Buenos Aires-ish).
- **Genre-less country taps**: `playPlace/playPlaceNamed(ci, null)` → `anyGenreRef` → `buildPlaylist(genre: null)` = country's notable artists across all buckets (world-seeds `top` / seeds all-genre interleave). MB/LLM/override tiers skipped when genre null.
- **One now-playing card** (`components/WorldNowPlaying.tsx`, bottom-right, reference-styled): cover/title/album—artist/story-or-origin line (uses `originFor(artist).country` — the store pairing country is wrong for roaming chains), progress (reused ProgressBar; `order:0` override), controls, heart, "Listen to full song" toggle → brand links row. CenterStack side panel + dock="right" prop removed; artists/songs filter removed from dock ⋮ (dots are always songs).
- Playing dot = single html avatar marker + sonar ring (dot for the current track; artist origin lookup for country queues).
- Dev hooks: `__world.pickGenre(i|null)`, `__world.dots()`, `__world.playDot(i)`, `__world.select(name, gi|null)`.

## ✅ World v7 — multi-genre colors, dot-first IA, world-songs dataset (2026-07-16, pushed)
- **Multi-genre select (max 5)**: `selectedGenres: number[]` in WorldGlobe; placeholder colors by SELECTION ORDER `['#3ce080','#ffd166','#ff6b9d','#4cc9f0','#c77dff']` (user may supply a real palette later); active rail chips take their color; 6th click ignored w/ tooltip (`STR.world.maxGenres`).
- **Dot-first IA**: clicking a song dot plays it AND highlights its country (`setSelectedGeo(dot.geoKey)`); clicking country space (not a dot) highlights + SHUFFLES within that country (random in-country dot across selected genres); with no genres selected country taps use the pipeline queue (genre-less = country's best). Chain rule: nearest unplayed dot IN THE SAME COUNTRY first (any selected genre), then global nearest.
- **World-songs dataset**: `npm run world-songs` (`scripts/build-world-songs.ts`, resumable via `__done` per genre file) mines MusicBrainz (country×genre tag, score-ordered, 1.1s serialized) ∪ seeds ∪ world-seeds → Deezer top tracks (preview-verified, ≤2/artist, 8 songs/country/genre ≈ 1,400+/genre × 175 nations) → `public/world-songs/<genre>.json` `{country: [{i,t,a,la,ln}], __done}`. Client fetches per-genre files lazily; dataset dots carry real titles + track ids (click = 1 `/track/{id}` jsonp → play); countries not yet built fall back to artist dots. FULL RUN TAKES ~10-12h — left running in background (log: /tmp/world-songs-run.log); re-run `npm run world-songs` anytime to continue. Flags: `--genres`, `--countries`, `--limit`.
- Globe blues legend (for reference): bright accent = 20 wheel countries; faint blue = world-seeds-covered nations; near-grey = no data yet (MusicBrainz tier on tap); light periwinkle = selected; grey = hover.

## ⏳ Waiting on user (blocks next steps)
- [ ] **Shades** experience design (nav slot exists, marked coming soon).
- [ ] **Translations** for the 19 listed languages (only `en` is `ready` in `lib/strings.ts`); countries/genres too.
- [ ] **Contact email** for the "Contact us" mailto (currently blank To:).
- [ ] **About us** copy (currently reuses the hub thesis).
- [ ] Lightweight **vector icons** for World/Shades nav (current = PNGs extracted from raster-embedded SVGs).
- [ ] **Spotify client ID** once the Vercel URL exists (whitelist it as redirect URI; env var must be set in Vercel at build time).
- [ ] `seed-proposals.json` review; axes growth (24×24) decision.

## 🔎 Needs real-device testing (can't verify in the hidden preview tab)
- [ ] Hand mode: toggle on with a real webcam — cursor tracking, pinch-hold click, pinch-drag spin.
- [ ] GSAP card animations actually play (preview tab is hidden → rAF paused).
- [ ] Globe touch: rotate/pinch-zoom + tap-to-play on a phone.
- [ ] iOS Safari: does audio keep playing with the screen locked? (known-unreliable in PWAs.)
- [ ] **Origin dots visually** (data path verified headless; rAF-driven globe canvas doesn't paint in the hidden tab): dot density, glow/ring on the playing artist, hover tooltip, dot-click jump.
- [ ] Vertical genre rail feel: scroll, edge fade, active-chip auto-scroll.

## 🐞 Known, low-priority
- Dev-only console warning `getServerSnapshot should be cached` ×4 → Next's `usePathname` in GlobalPlayer, not our code. Benign.
- Pre-existing eslint findings (ref-assign-during-render idiom, one `as 'pretty'`) — don't gate the build; `next build` runs tsc only.
- `lib/gestures.ts` shape helpers now unused again (VR-cursor model supersedes).
- "from these pairing" typo kept verbatim from Maddy's no-results copy (`lib/strings.ts` `card.noResults`).
