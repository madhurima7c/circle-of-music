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
- [x] Spotify **Embed iframe** panel — BUILT 2026-07-16: "Full song here (Spotify player)" in both share menus opens a root-mounted panel (components/SpotifyEmbed.tsx + lib/embed-bus.ts) with Spotify's IFrame API; full songs for ANY visitor logged in to open.spotify.com (no allowlist), preview otherwise. Track ids resolve via `/api/spotify-search` (client-credentials — needs `SPOTIFY_CLIENT_SECRET` server env in .env.local + Vercel; falls back to a connected user's token until then). Optional YouTube iframe still open.
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

## ✅ This session (2026-07-18, pushed — commits `ad29c9b`..`25b4dda`)

**Spotify full-song mode — end to end** (`lib/spotify-embed.ts`, `GlobalPlayer.tsx`, `lib/spotify.ts`):
- Switched from OAuth/Web-Playback-SDK (5-user dev cap) to the **IFrame Embed** (any logged-in Spotify user, no allowlist). Connect opens a plain Spotify login popup + rebuilds a FRESH iframe (only a new iframe document picks up the just-granted login); rebuilds again on window focus (return from popup).
- Long debugging arc (see commit chain): silent player when the iframe blocked autoplay → liveness-aware watchdog; **stuck end-of-track** (embed pins `pos==dur, isPaused:false` forever, never emits a pause) → second end signature; **double audio** (old preview kept sounding while the embed span up) → silence `<audio>` before the async resolve + zombie-guard a late embed start; **30s-on-track-change** → `loadUri` swallows a too-early `play()`, fixed with a `pumpPlay` retry backoff.
- **Reverts to Deezer previews** when not connected / disconnected / **not logged in** (clip-length duration ⇒ session `clipMode`, bail current track) / lookup miss. The iframe only shows while the embed is the real sounding source.
- Embed is now Spotify's **152px** card (was 80px mini — logo/play/plus were clipped), **nested BELOW our scrubber + transport** in both cards (`[data-spotify-slot]`, `order:4`); center card widened **300→340px**. World slot is a real interactive layer (the ➕ = save to Spotify likes is clickable there now).
- **Rate-limit protection**: the limit is on `/api/spotify-search` (Spotify Search API), NOT playback. Aggressive whole-queue prefetch tripped an escalating ban (~13→22h). Now: server route remembers Spotify's `Retry-After` and answers 429 from memory; client stores the window in `localStorage.spotify_rl_until`; queue sweep is 1 lookup / 1.5s, hard-stops on any 429. Per-song results cache (client `uriCache` + server `matchCache`).
- Creds: `.env.local` (gitignored) `NEXT_PUBLIC_SPOTIFY_CLIENT_ID=1820…e296` + server-only `SPOTIFY_CLIENT_SECRET`; both on Vercel production.

**Wheel cursor interaction** (`components/Wheel.tsx`, Spencer-Gabor-inspired):
- `RIPPLE` — ring cards react to cursor angle + sweep VELOCITY (z-lift + lean-against-sweep + twist, per-card springs that trail the cursor). `RIPPLE_ACTIVE` — the face-on selected card does a "look at cursor" perspective tilt. User-tuned values baked in; a dev dial kit (`RippleDialKit.tsx`) was used to tune then **deleted** (never entered git history).
- Spine art on **all four edges** (top/bottom get quarter-turn-rotated texture clones); note text now lives on **every card back permanently** (visible when the wheel shows a back — a cue that flipping reveals more).

**World↔Circle two-way sync + playlist behaviour** (`lib/store.tsx`, `WorldGlobe.tsx`, `GlobalPlayer.tsx`):
- `setNowPlayingOrigin(country, genreIdx)` — the "FROM" banner and (on the Circle) the country/genre cards follow the currently-playing dot. Fixed the bug where a Taiwan dot showed "FROM JAPAN".
- Queue kinds `pairing | chain | library`. End-of-queue: pairing/chain → **NEXT GENRE, same country** (`endOfQueue`), never repeats; library loops. The World dot chain no longer radiates to other countries — it flips genre in the same country when the country's dots run out.
- **Unrepresented countries**: non-seed country tap with no dots → nearest seed (`lib/geo.nearestSeedIdx`, haversine over GeoJSON label points). World→Circle switch while a non-seed dot plays → `divertAfterCurrent` (current song stays as head, Up Next swaps to the nearest-seed pipeline in the same genre) + **ParticleToast** ("X coming soon — brought you nearby." + ⓘ full explanation, ~5s, particle→text→particle, font sampled from `.center__album`).

**Circle / Liked / Contact:**
- LikedSongs popup: **Export dropdown** (CSV + JSON, per-view), **select-all** + bulk Clear / Add-to-playlist, per-row share, compact icon "listen in". Import removed.
- Circle **Up Next scrolls** (wheels' `wheel` handler ignores events over `.center__stack/.liked/.wnp/.dock/.about-card/.contact-card`).
- **Contact popup** (`components/Contact.tsx`): "Send us a note" (free text) + "Add a song" (Country + Genre dropdowns + song name, pre-tagged with the pairing). Composes a structured `mailto`; `send()` is the seam for a future `/api/contact`.
- Restored the full "listen to song in" menu (with names) on the Circle card; compact icons-only on Liked rows + World. Autoplay fix (explicit `setIsPlaying(true)` after tracks load).

## ✅ Polish batch (2026-07-20, pushed)
- **Spotify VERIFIED WORKING by the user on their real browser** (full songs play). 🎉
- Wheel cards −15% (`DESKTOP_TUNING.cardSize` 1.25 → 1.06).
- **World zoom control**: bottom-left magnifier pill that expands into − · slider · + (drives `pointOfView` altitude 0.35–4.0, 250ms glides; wheel/pinch zoom still works).
- World now-playing card widened 264 → **340px** (same as Circle) so the Spotify embed isn't clipped.
- **Contact popup v2** (`components/Contact.tsx` + new **`/api/contact`**): two TABS (Contact us / Add a song), LIGHT-mode styling, accent #1d2bdf; sends a REAL email via FormSubmit relay to the private address (server-side only, never exposed); post-send the form dissolves → particle confirmation in the same box + "Send another note/Suggest another song"; Add-a-song country dropdown = ALL 175 globe nations (geo-iso), genres = our 20. Sits above every layer (dim scrim 44 + card 46 > embed strip 41). **⚠️ ONE-TIME: FormSubmit sent an activation email to the destination inbox — click its confirm link once or submissions won't deliver.**
- Liked-songs count badge on the dock heart removed (read as an error state).
- **Tablet breakpoint** (641–900px): new `TABLET_CAMERA/TUNING` in Stage (offset 5.6 / radius 3.2 / cardSize 0.85) — desktop camera pushed the wheels fully off-canvas on portrait iPads; + a window-resize fallback for environments where matchMedia change events don't fire. Real-iPad feel check still on the user.

## 🔴 PICK UP HERE (2026-07-27b) — dots now land in CITIES, not centroids

User spotted it on Australia: every Australian town is coastal, yet the dots
piled into the dead centre. **Outback 42% → 1%.** Melbourne 38%, Sydney 24%,
Perth 12%, Adelaide 11%, Brisbane 6%. Three causes, all fixed in
`scripts/recoord-world-songs.ts`:

1. **Centroid fallback → music-city anchors.** Rules 2/3 now anchor on the
   cities where that country's OWN artists are already placed in
   origins.json, weighted by count. No new dataset — the answer was already
   in the file. 43% of all dots anchor this way.
2. **Country-level origins were treated as cities.** Rule 1 checked only
   "inside the country", and a country-level origin's coords ARE the
   centroid. Now requires `precision === 'city'`.
   ⚠️ **This is why "at the artist's real city" reads 56.3%, not 72.6%** —
   the old number counted centroids as cities. It was never 72.6%; do not
   treat the drop as a regression.
3. **Rounding pushed coastal dots into the sea.** `scatter()` tested the
   full-precision point but returned a rounded one. Rounds first now.
   **Dots outside their filing country: 0.42% → 0.03%.**

Generalises: Canada northern interior 5%, Russia Siberia 3%, Brazil Amazon
0%. Countries with no city-level origin still use the interior point —
nothing better to anchor on, and that is honest.

**If a country still clusters wrongly**, check in this order: does it have
city-level origins (`precision:'city'`, `place` ≠ country name)? are its
anchors real cities? is the filing country even right (`npm run audit:dots`
ATTRIBUTION)?

## 🟡 Seed research (2026-07-27) — 11 dead pairings filled

User researched the FALLBACK pairings; ~105 candidates were verified on
Deezer (identity + playable previews + catalog fit) and 60 seeded across 11
pairings (see commit for the full lists). **Audit: FALLBACK 19 → 8, DIRECT
221 → 231.** Dots crawled + recoorded for all new scenes; placement 0.42%.

**Verification rejects worth remembering** (the traps are real):
- Homonyms: Virus→French rapper, Weekend→rock band, Akcent→1-fan shell,
  Begum X→"Begut". But Boys and Ivan LOOKED risky and were right — always
  check the resolved page's tracks ("Szalona", "Fotonovela").
- Wrong home: Jungle Weed is French (artists.csv), despite the sitar.
- Catalog mismatch: never seed an artist whose TOP TRACKS aren't the genre
  (Googoosh under Bossa Nova would play Persian pop mislabeled).
- Unplayable: all Ghana/Nigeria classical composers have 0 Deezer previews —
  historically real, absent from this catalog.

**Still honestly empty (8):** Ghana×Classical, Nigeria×Classical,
Iran×Reggae, Mexico×Bossa Nova (user confirmed empty), Pakistan×Reggae
(dropped per user — candidates were pop/neo-Sufi catalogs), Pakistan×Bossa
Nova, South Korea×Bossa Nova, South Korea×Reggae (last three: unresearched).

### ▶️ Next
- [ ] User to research the last 3 unresearched pairings if desired (South
  Korea has a real bossa scene — "Bossa nostra" cafés; worth one search).
- [ ] The 136 RELATED pairings now rely on MusicBrainz or show the empty
  card — spot-check popular ones.
- [ ] Real-device checks of the empty-state card (verified in preview only).

## 🟡 Empty state (2026-07-26, night)

**The two instruments now give the same answer to the same question.** A
pairing with no verified music shows "No matching results for this pairing :("
plus a linked list of that country's REAL genres (seeds/world-seeds-backed
only, so a suggestion never dead-ends). Circle: click spins the wheel and
populates. World: click re-taps the country with the new genre. Shared
component `NoPairing` (Overlay.tsx), status `noResults` (≠ network `error`).

**Removed from the runtime pipeline:** RELATED_GENRES borrowing (both seed
paths), genre-blind tier 2.5 fill for genre pairings, the LLM guess tier.
Norway × Afrobeats no longer plays a-ha.

**Norway × Afrobeats is now REAL** — user-supplied, Deezer-verified: Akuvi,
Tolou (TOLOU), Matata, in seeds.json + world-seeds.json + 18 globe dots via a
targeted crawl (Nico & Vinz joined via MusicBrainz on its own). Recipe for
adding a scene to one pairing end-to-end:
  1. add artists to seeds.json (+ world-seeds.json genres list)
  2. remove the country from that genre's `__done` in public/world-songs/<g>.json
  3. `npx tsx scripts/build-world-songs.ts --genres "<Genre>"` (fills just it)
  4. `npm run recoord`

### 🎯 SEED RESEARCH LIST — the user offered to Google these
19 hard-FALLBACK pairings (no seeds anywhere). The user found Norway's scene
in one search; these need the same treatment. Diamonds probably exist for
most:
  Argentina × Disco · Ghana × Classical · India × Reggae · Iran × Bossa Nova ·
  Iran × Reggae · Mexico × Bossa Nova · Mexico × Disco · Nigeria × Classical ·
  Norway × Reggae · Pakistan × Bossa Nova · Pakistan × Reggae · Poland × Disco ·
  Portugal × Disco · South Korea × Bossa Nova · South Korea × Reggae ·
  Spain × Bossa Nova · Spain × Disco · Sweden × Reggae · Turkey × Bossa Nova
Also: the audit's 136 RELATED pairings now rely on MusicBrainz alone or show
the empty card — spot-check the popular ones (each country × Afrobeats/
Reggae/Cumbia are likeliest to be empty).

## 🟡 Globe re-crawl (2026-07-26, late)

Everything below is committed and pushed to BOTH remotes. Vercel is deploying
`2145096`. No background jobs running.

### The globe was re-crawled from scratch

`npm run world-songs` for all 3,500 country×genre pairings, 20 genres, no
failures, ~3h at concurrency 4 via `scripts/recrawl-all.sh`.

    dots                        92,267 → 42,312  (-54%)
    country-genre cells lit      2,848 → 1,777   (-38%)
    at the artist's REAL CITY     33.4% → 72.8%
    no origin at all              28.6% → 9.2%
    artist filed under a country that is not theirs
                                  49.0% → 23.2%
    outside their filing polygon  0.37% → 0.42%  (unchanged; coastal cities
                                  clipped by the 110m outlines)

Fewer dots, but the survivors are **twice as likely to sit on a real city**.
That is causal, not luck: the crawl only keeps artists whose country can be
verified, and those are the same artists we have a CITY for.

**What went dark was padding.** Algeria's Afrobeats was 5 songs by "Afrobeats
Lounge"; Angola's was Rod Picott (American folk); Chad's was Chilean Newen
Afrobeat; Belize's was a sleep-music compilation. The cut is largest exactly
where a genre is regional (Bossa Nova 76→14 countries, Cumbia 118→22) and
smallest where it is global (Folk 160→125, Hip Hop 164→106). Nigeria, Ghana
and the UK still fill the 50-song cap.

### Three bugs fixed on the way — all the same shape

1. **`?? candidates[0]`** in `lib/deezer.ts` — an unmatched artist name
   returned Deezer's FIRST search result, whose whole catalogue then joined
   the playlist. "Alen Yian" → Alela Diane, a singer from Nevada City
   California, playing under India. Now gated on name similarity: 734 exact,
   59 accent variants kept (João Gilberto, Antônio Carlos Jobim), 1 dropped.
   **Do not "simplify" this to a strict equality check** — 5 of the 6 names
   that reach the fallback are legitimate variants.
2. **The same bug again** in `build-world-songs.ts`'s own copy of the
   resolver, where it baked wrong artists permanently into the dot data.
3. **`normKey` drift** across 4 scripts — `recoord` could only match
   single-word artist names, so every multi-word artist was invisible to it.

### ⚠️ Deliberate trade, marked in the code

Attribution is 23.2%, not 0. **Only the free-text source is vetoed on origin.**
Vetoing MusicBrainz and the seed lists too empties Albania × Jazz, because
Elina Duni — the Albanian jazz singer — moved to Switzerland at ten and both
origin sources file her there. Diaspora is not an error. The strict
"birthplace only" globe is a one-line change at the marked spot in
`build-world-songs.ts`, but it is a decision about what a dot MEANS.

### ▶️ Next

- [ ] **Look at the globe.** It is visibly sparser. If it reads as too empty,
  the lever is NOT the country gate (that removes real junk) — it is giving
  thin countries a "nearest real scene" fallback, the pattern `ParticleToast`
  already uses on the Circle.
- [ ] **337 merged artists have no dots** — they are in world-seeds `top` but
  have no verified genre, and the crawl reads only the genre lists. Correct
  as-is; plotting them would assert a genre nobody checked.
- [ ] **Dot stacking**: multiple songs by one artist jitter around their city,
  so one artist reads as a tight cluster. Pre-existing, more visible now that
  dots are city-accurate. Consider one marker per artist with a track count.
- [ ] 490 artists still quarantined (`ambiguous-resolved.json`, gitignored).
- [ ] `npm run audit` against the merged roster — the genre-rule fixes in
  `c9b2d00` never reached the pre-existing 2,427 artists.

### New tooling

- `npm run audit:dots [-- --baseline <dir>]` — placement / attribution /
  coverage / integrity. **Attribution is the one that matters**: a dot can be
  geometrically perfect and still a lie.
- `npm run mine:charts`, `npm run mine:ambiguous`, `npm run origins:csv`,
  `scripts/recrawl-all.sh`.

## 🟡 Kaggle pass 2 (2026-07-26)

### Shipped (`a081173`, `0243ffb`, both remotes) — no background jobs running

**World roster: 2,427 → 4,350 artists (+79%) across 64 countries.**
`npm run mine:charts -- --apply` merged 1,813 chart-mined artists plus 110
rescued from the quarantine. Verified after merge: zero duplicate names, zero
genre keys outside the 20 wheel genres, zero empty names, country count still
175. Live-checked on `/world`: Thailand plays (Jeff Satur), console clean.

**`normKey` drift — the bug that had been quietly halving dot quality.**
`lib/origins.ts` keys artists space-separated (`"abdel rahman el bacha"`);
`recoord-world-songs.ts`, `enrich-origins-mb.ts` and `build-origins.ts` each
carried a local copy that stripped separators (`"abdelrahmanelbacha"`).
recoord's copy even claimed "keep the copies in sync". Effect: it could only
match SINGLE-WORD artist names, so Trilok Gurtu / A.R. Rahman / Kailash Kher
were invisible to it and got country-centroid dots despite having known
cities sitting in origins.json all along.

    dots with a known origin    33.0% → 71.4%
    placed at the artist's city 30.3% → 33.4%
    no origin at all            67.0% → 28.6%

All local copies deleted; every script now imports the one export from
`lib/stories.ts`. **If you add a script that touches origins.json, import
normKey — do not copy it.** (The city figure moves less than the origin
figure because recoord deliberately pins a song to its FILING country when
the artist is foreign. That rule is what stopped Ghanaian dots landing on
Chile — leave it.)

**`npm run origins:csv`** (`scripts/apply-artist-countries.ts`) — fills origin
gaps from `kaggle_datasets/artists.csv` `country_mb`. 1,578 globe artists no
Wikidata or MusicBrainz crawl had reached (Fokn Bois, Marijata, Sandunes,
Steve Monite, T.P. Orchestre Poly-Rythmo). Gaps only; never overwrites a
city-level origin. `country_lastfm` deliberately UNUSED — the dataset
documents that it conflates language with origin and mislabels Latin
American, Austrian and Swiss artists.

**`npm run mine:ambiguous`** (`scripts/resolve-ambiguous.ts`) — 110 of the 600
quarantined artists were never conflicts. A stage name is not a unique
identifier: MusicBrainz's own disambiguation says Tulus is a "Norwegian black
metal band" AND an "Indonesian singer-songwriter". The miner had kept the
FIRST exact-name match with a country, so it compared the chart's artist to a
different person. Now it reads every exact match's country as a set: if MB
also lists that name in the chart's country, they were describing different
people. Recovered DESH (HU), Airbag (AR), Polycat + Cocktail (TH), FiNCH (DE),
Vixen (PL), Adie (PH), Pause (MA).
**It also re-reads genres from the CORRECT entity** — Tulus had inherited
`Rock` from the black metal band. Most come back empty, because the real
artist is a small local act with no MB tags. Blank beats wrong.
User's hand corrections live in `MANUAL_COUNTRY` and survive re-runs.

### ▶️ Next

- [ ] **490 still quarantined.** MusicBrainz has no artist of that name in the
  chart's country at all, so nothing corroborates either side. Seyi Vibez is
  here (MB files him under Ghana, which is wrong). The chart is probably right
  for many; needs a human or a third source. `ambiguous-resolved.json`
  (gitignored) has the list with a `why` per row.
- [ ] **New artists have no dots yet.** They're in world-seeds but not in
  `public/world-songs/*.json`. Needs `npm run world-songs` (~10h crawl) or a
  targeted run for the 64 affected countries, then `npm run origins:mb` +
  `npm run recoord`.
- [ ] **`npm run audit`** against the merged roster — the genre-rule fixes in
  `c9b2d00` never got applied to the pre-existing 2,427 artists.
- [ ] Nigeria's Afrobeats bucket is thin (10). Deezer labels its artists
  "African Music" → World. A targeted rule would help; do NOT infer Afrobeats
  from the continent-wide label.

### ⚠️ Data-provenance rules learned the hard way — do not re-litigate

1. **`playlist_genre` in `spotify_songs.csv` / `high_/low_popularity` labels the
   PLAYLIST, not the track.** Seyi Vibez and Young Jonn carry a dozen `arabic`
   labels each from a playlist called "Arab X". The wrong label IS the
   majority, so no dominance rule survives. Zero weight.
2. **`tags_lastfm` in `artists.csv` is user-generated and often a joke.** Rolf
   Zuckowski (German children's music) buckets as Rock from a "black metal"
   tag. Only 2.7% of artists bucket from the clean `tags_mb` alone.
3. **`artists.csv` `country_mb` is NOT an independent origin source** — it is
   scraped from MusicBrainz, the same source our live queries hit. Using it to
   arbitrate a chart-vs-MusicBrainz dispute double-counts MusicBrainz. Its
   genuinely new column is `ambiguous_artist` (shared Last.fm page).
4. **Audio-feature coverage is uneven, not just partial**: UK×Rock 80%,
   Brazil×Bossa Nova 2%. Never let features drive sequencing; they refine it.
5. **Check key formats before comparing two datasets.** This session lost time
   three separate times to silent mismatches — ISO code vs country name, and
   normName vs normKey twice. A 0%/100% split is a comparison bug, not a
   finding.

## 🟡 Kaggle pass 1 (2026-07-25b)

### A background job is RUNNING
`npm run mine:charts` — verifying 4,278 chart-nominated artists against
MusicBrainz + Deezer. Log `/tmp/mine-charts.log`, cache
`lib/.chart-verify-cache.json` (gitignored, written every 25). **~0.5 artists/s,
ETA ~2.4h.** Safe to interrupt: re-running skips everything cached.

**⚠️ When it finishes, re-run it once** (`npm run mine:charts`). The process
loaded `lib/genre-rules.ts` at startup, before the vocabulary-audit fix in
`c9b2d00`, so its genre buckets use the superseded matcher. The cache stores
raw MusicBrainz/Deezer labels, so a re-run is an all-cache-hit pass that
re-assembles in seconds with the corrected rules.

**When it finishes:** it writes `chart-proposals.json` (gitignored, reviewable
like `seed-proposals.json`). Review `artists[]` with the user, then
`npm run mine:charts -- --apply` to merge into `lib/world-seeds.json`
(accepted artists join `top`; only genre-bucketed ones join a genre list).
Then `npm run features` again (the index scopes to known artists, so new
artists need a rebuild) and `npm run origins` / `origins:mb` for their dots.

### What shipped (commit `9fda653`, both remotes)

**Playlist ordering — `lib/sequence.ts` (new).** `curatePlaylist` now delegates
to a cost-based greedy sequencer + repair pass. Familiar opener (Deezer `rank`,
newly kept on `Track`), artists spread, eras interleaved, and where audio
features exist, smooth tempo/key along an energy arc (`arcTarget`, Camelot
`keyClash`). **The never-back-to-back-artist guarantee is now exact** — verified
over 10 distributions x 400 runs, adjacency never exceeds the mathematical
minimum, no track lost or duplicated. Live-verified on India x Jazz: Trilok
Gurtu at positions 2/6/10, Louiz Banks at 3/7.

**Audio features — `npm run features` → `lib/track-features.json` (7.6MB,
committed) + `POST /api/track-features`.** 157,427 tracks over 5,149 artists,
scoped to artists we can play. Client primes once per pairing
(`lib/track-features.ts`) and fails soft — sequencing can never stall playback.

**Chart mining — `npm run mine:charts`.** Charts nominate, MusicBrainz confirms
origin + genre, Deezer confirms playability + adds its own genre labels.

**Genre rules — `lib/genre-rules.ts`,** extracted from `build-world-seeds.ts` so
the two builders cannot drift. Weighted scoring (`bucketsScored`) plus, after
diffing every one of the 5,943 Every Noise labels (`c9b2d00`), substring
matching with an explicit `NEGATIVE_RULES` trap list. Word-boundary matching
was tried first and rejected: it fixed reggaeton→Reggae but silently stopped
**89 labels** (synthwave, every `*metalcore`, bubblegrunge, indietronica,
microhouse) from matching anything. Net: 0 labels lost coverage,
3,846→3,864 carry a bucket, 23 assignments added / 22 wrong ones removed.
**If you add a NEGATIVE_RULES entry, record the mis-bucketing you actually
saw** — that list is only trustworthy while every line is evidence.

### 🔬 What the datasets can and cannot do (measured, do not re-litigate)

- **`spotify_songs.csv` / `high_/low_popularity` `playlist_genre` is UNUSABLE as
  a genre source.** It labels the PLAYLIST, not the track. Seyi Vibez and Young
  Jonn — Nigerian Afrobeats — carry a dozen `arabic` labels each because their
  songs sit on a playlist called "Arab X". No majority rule survives it; the
  wrong label IS the majority. Given zero weight, recorded in proposals for
  human eyes only. Their audio-feature columns are per-track and still trusted.
- **Chart country != origin, and MusicBrainz alone is not better.** The two
  agree ~81% of the time and those are reliably right. Of 5 sampled
  disagreements, MusicBrainz was wrong on at least 3 (Seyi Vibez→Ghana,
  Stormy→Japan, Mirella→Netherlands — all correct in the chart) via exact-name
  homonyms. **Accept only on agreement**; disagreements → `needsReview`, no dot.
- **Audio-feature coverage is 33% overall but wildly uneven**: UK x Rock 80%,
  Nigeria x Afrobeats 49%, Brazil x Bossa Nova 2%, Argentina x Folk 4%,
  Ghana x Funk 7%. Sequencing on features alone would flow for Anglophone rock
  and be noise for exactly the music this product exists to surface — hence
  features-as-refinement, never as spine.
- **`Data/` (GTZAN) was NOT used.** 1,000 clips, 10 coarse genres, ~70%
  ceiling, and it needs a raw-audio pipeline over Deezer previews. Tag data
  beats audio classification for genre at every point on that curve.

### ⛔ MISSING FILE the user should download
`music-production-across-the-world.Rmd` is only the analysis notebook — it reads
`../input/artists.csv`, which is **not in the drop**. That is the Kaggle
["Music Artists Popularity"](https://www.kaggle.com/datasets/pieca111/music-artists-popularity)
set: ~1.4M artists with `country_mb` (MusicBrainz country), `country_lastfm`,
`tags_mb`, `tags_lastfm`, and listener/scrobble counts. It is the single
highest-value missing input — it would give an independent third origin source
(breaking the chart/MusicBrainz ties currently sent to `needsReview`) and real
per-artist genre tags at a scale that would raise genre bucketing well past the
~50-80% the current sources reach. Ask the user to add it as
`kaggle_datasets/artists.csv`.

### Content problems noticed in passing (seed data, not code)
- Coldplay's "WE PRAY" opens **Nigeria x Afrobeats**, and Shakira and Frank
  Sinatra surface in Nigeria/Brazil pairings — features and covers pulling
  non-local artists into country seed lists. Worth an `npm run audit` pass.

## 🟡 Previous handoff (2026-07-25a) — globe dots

### A background job is RUNNING — check it first
`npm run origins:mb` (pid was 54989) is enriching `lib/origins.json` from
MusicBrainz. Log: `/tmp/origins-mb.log`. At handoff: **3,425/15,951 done,
567 fixed (~16% hit rate), ETA ~7h remaining** at 30 artists/min (MusicBrainz
caps at 1 req/sec). It writes `lib/origins.json` every 25 artists, so it is
safe to interrupt and re-run — it re-derives its own todo list and skips
anything already placed at a city inside the right country.

**When it finishes (or if you stop it):**
1. `npm run recoord` — pushes the new origins into `public/world-songs/*.json`
   (local only, no network, idempotent, ~1 min).
2. Re-run the placement audit (script inline in the session log below) and the
   India regional breakdown to report the real before/after.
3. Commit `lib/origins.json` + `public/world-songs/` + `scripts/enrich-origins-mb.ts`
   + `package.json` + `.gitignore` (all uncommitted at handoff).

### The globe-dot problem (the reason for all of the above)
User reported dots looked wrong — "no songs in south india, eastern india".
**They were right.** Audit of all 92,267 dots found **26.6% misplaced**:
- 1,111 rendered in the WRONG COUNTRY (Ebo Taylor, Ghanaian, plotted on Chile;
  The Knife, Swedish, on Spain). Cause: a song is filed under the country whose
  MusicBrainz tag search returned it, but its coordinate came from the ARTIST's
  origin — so any cross-border artist threw the dot across the map.
- 23,418 sat off their country's landmass (centroid ±1.5° jitter → sea).
- Only **103 of 17,063** artists had real city coords: `origins.json` had only
  ever been built for the 678 curated *Circle* seed artists, never the World set.

**Fixed so far (pushed):**
- `scripts/recoord-world-songs.ts` (`npm run recoord`, `--dry`) recomputes la/ln
  from origins.json. Real city when the origin is inside the filing country;
  otherwise a verified interior point of that country. Every dot is
  point-in-polygon tested and the jitter shrinks until it lands on land.
  **Misplacement 26.6% → 0.30%** (rest are micro-states too small for the 110m polygon).
- `scripts/build-origins.ts` widened past seeds.json to every World artist
  (`--seeds` restores the old behaviour). That run FINISHED: origins.json
  678 → 17,345 entries, 9,901 resolved, 8,057 city-level.
- Applied: 6,332 dots (6.9%) at a real city.

**Still not solved — set expectations honestly.** India is still ~95% a central
blob. Of its 216 artists: **82% have no Wikidata entity at all**, 9% resolve
OUTSIDE India (wrong-entity hits on short names — Prithvi→Faisalabad,
Vilen→Rotterdam, Stiv→Edinburgh), 5% country-only, leaving **4% placeable by
city**. Hence the MusicBrainz second pass, whose advantage is that MB returns
each artist's **country code**, so wrong-country candidates are rejected — the
precision Wikidata lacked. Verified good: Angélique Kidjo→Cotonou,
Manu Dibango→Douala, Ebo Taylor→Cape Coast (the very artist that was on Chile).
Realistic ceiling: dot-level city coverage ~9–12%. A large share of a 17k
long tail simply is not documented in either database.

### User dropped 1.5GB of Kaggle music datasets
`kaggle_datasets/` (gitignored — never commit). Six zips: `spotify_songs.csv`,
`spotify-2023.csv`, `tracks_features.csv` (346MB), a GTZAN audio-features set,
`universal_top_spotify_songs.csv` (498MB), and popularity splits. Unprompted —
ask what they're for. Worth noting: none obviously carry artist ORIGIN/city,
so they likely won't fix the dot problem, but `tracks_features.csv` and the
audio-feature sets COULD finally enable the "songs that sound good together"
sequencing that was deferred when curating playlists (Deezer previews carry no
tempo/key/energy).

## ✅ Shipped 2026-07-24/25 (all pushed to BOTH remotes)

**Domain + platform**
- **Live domain `discovermusic.xyz`** (Vercel is registrar AND DNS). Apex + www
  aliased to the `discovermusic` project; old `discovery-of-music.vercel.app`
  still works. Canonical/OG resolve from `SITE_URL` in `app/layout.tsx`.
- **Vercel Web Analytics** (`@vercel/analytics/next` — the framework-specific
  import is what attributes App Router ROUTES correctly). Verified live: script
  serves 200 from a randomised ad-blocker-resistant path (`/f60c…/script.js`,
  NOT `/_vercel/insights/…` — that tripped me up), pageview event queued with
  `{route:'/', path:'/'}`, beacon endpoint accepts POSTs.
- **`/` now 307-redirects to `/circle`** (mirrors `/world`). Deliberately
  TEMPORARY — permanent redirects get cached hard and `/` should stay free for
  a landing page. Removed the `replaceState` that rewrote the URL to
  `/?country=x&genre=y` on every spin; params are still READ so old shared
  links work (verified `?country=brazil&genre=funk` → Brazil × Funk) then
  stripped back to `/circle`.

**Link previews / icons**
- Share title **"Discover Music"** + the Chan & Maddy About copy as the
  description, on og: and twitter:.
- Favicon is the user's **8-square mark** (`#737CF4`), standing alone.
  `app/icon.svg` + `app/icon.png` (512) + `app/apple-icon.png` (180), the PNGs
  **transparent** — generated by `scripts/build-icons.mjs` (no image deps:
  polygon coverage sampled 4×4/px + a minimal PNG writer).
  **Why PNGs matter:** unfurlers largely ignore SVG favicons and fall back to
  apple-touch-icon; ours had a light plate, which is what put the white box
  beside the link in WhatsApp. Reference (madhurima.me) ships one transparent
  PNG and no apple-touch-icon.
  Deleted the leftover create-next-app `favicon.ico` — it was outranking the
  brand mark, so the tab had been showing the Next.js logo.
- `/world` has its own globe favicon (`app/world/icon.svg`), same `#737CF4`.
  Purpose-drawn (a photo globe is mush at 16px): solid disc, graticule knocked
  out white. Verified it swaps on full load AND client-side nav.
- OG card = the user's World mockup, `app/opengraph-image.png` 1200×630,
  COVER-cropped anchored to the TOP (art is 1.68:1 vs OG 1.91:1 — fitting left
  white bars, centre-cropping ate the lavender frame). Source kept at
  `design/og-source.png`.
- Nav Circle icon swapped to the same 8-square mark (`CircleIcon` in
  ExperienceNav, also used by PhoneIntro). Every rect is `currentColor`, which
  is what preserves per-theme ink + the hover spin.

**Theming batch** — tokens in `:root`: `--surface #10111D`, `--playing #9daaff`,
`--playing-bg rgba(115,124,244,.16)`.
- Now-playing highlight off Spotify green onto our periwinkle (row, title,
  artist, equaliser). The two remaining `#1db954` are the *Connect Spotify*
  buttons, where Spotify's green is correct.
- Highlight bleeds 8px past artwork/duration (negative margin + padding back;
  `overflow-x:hidden` on the queue so it can't scroll).
- `--surface` replaced all five `#2a2a2a` planes + the `#111` ink on dock
  icons, letter ladder and the wheel-lock padlocks.
- Dock takes the top nav's glass and themes per stage: `--surface` ink on
  Circle, **white** on World (matches search/zoom exactly).
- Letter ladder: all ticks one weight (the 0.22 dim read as a fault).

**Cards / controls**
- Heart is the CENTER control on both cards, sized like its neighbours
  (plain `.ctrl`, 16px icon). Liked = accent-blue disc + solid white heart,
  identical to shuffle-on. NOTE: `.ctrl--lg svg { fill: currentColor }` had been
  force-filling it, so "liked" was never readable before.
- `RoundPlay` — round white Spotify-style play/pause in the now-row; glyphs
  redrawn ~2× (11×14 of the 24 viewBox, was 6.5×9).
- Spotify-aware layout: when the embed sounds it IS the card header (order 0)
  and our row+scrubber unmount, so there is never two players.
- **Not verified by Claude:** the Spotify-CONNECTED layout — user asked that no
  Spotify lookup be triggered. Code + build only.

**Removed:** hand tracking, completely (components, store flags, CSS, copy,
`lib/gestures.ts`, the `@mediapipe/tasks-vision` dep).

## ✅ This session (2026-07-24, pushed `d54f71a`) — UI batch

- **Hand tracking REMOVED completely**: `HandTracking`/`CameraUnavailable`/`GestureToast` components, the dock submenu + `!coarse` gate, store `handMode`/`toggleHandMode`, `.gesture-cursor`/`.gesture-hover` CSS, all `STR.camera`/hand copy, the dead `lib/gestures.ts`, and the `@mediapipe/tasks-vision` dependency (lockfile synced). Nothing references a webcam any more.
- **World country SEARCH** (`WorldGlobe.tsx`, top-right): circular magnifier expands into a field (`world-search--open`); live dropdown of matching nations with flags, ranked starts-with then contains, capped at 8. Click / ↑↓+Enter / exact-name Enter all commit through `pickCountry` → the SAME `onClick(feature)` path as tapping the globe, so the highlight, camera glide and playback all follow. Escape or an outside click closes. Verified: "pol" → Poland → selectedGeo Poland; Enter on "japan" → Japan.
- **World ZOOM restyled**: vertical `+`/`−` pill under the search (top-right); the old bottom-left magnifier+slider is gone. `stepZoom` reads the LIVE `pointOfView` altitude each press, so wheel/pinch zoom never desyncs the control.
- **Genre rail**: DM Sans, UPPERCASE, 0.08em tracking, roomier rows (was DM Mono lowercase).
- **Spotify-aware card layouts** (Circle `CenterStack` + `WorldNowPlaying`): `embedMode = spotifyOn && embedActive`. When the embed sounds it becomes the card HEADER (`.spotify-slot` order 0) and our now-row + scrubber UNMOUNT — no more two-players-in-one-card confusion. When it doesn't, our row shows a round white Spotify-style `RoundPlay` button where the ♥ used to be. The ♥ is the CENTER control in BOTH states (`.ctrl--heart`); play/pause never sits in the strip. Order: shuffle · prev · ♥ · next · share.
- **World card**: share control added as the 5th button, `wnp__learn` ("Listen to full song") removed — both instruments now read identically.
- **Overlays above the Spotify iframe — ROOT CAUSE**: `.frame`/`.world-frame` set `isolation: isolate`, which creates a stacking context; anything rendered inside was trapped BELOW the root-level `.spotify-strip` (z 41) no matter its z-index. Liked / Contact / About now `createPortal` to `<body>` (44 / 45 / 46 — verified `parentElement === document.body`). The Liked popup got its own `.liked-scrim` (44) so the plain `.dock-scrim` can stay at 39 and keep the dock MENU clickable (verified).
- **Scroll speed halved**: `WHEEL_PX_PER_STEP` 24 → 48 in `Wheel.tsx` (pointer-drag threshold left at 22 — direct manipulation wants 1:1).
- **About card**: new copy crediting Chan → linkedin.com/in/chandanalovesdesign and Maddy → linkedin.com/in/madhurima-c (inline links), plus a light-grey `Music served through Deezer and MusicBrainz APIs` footnote and a bolder `Made with 💙 in Seattle` sign-off.
- `graphify-out/` gitignored (regenerate with `/graphify`).
- **⚠️ NOT verified by me — user's call**: the Spotify-CONNECTED layout. The user asked me not to trigger a Spotify connection/lookup, so the `embedMode` branch (embed as header, our row hidden) is verified by code + build only. Everything else was checked live.

## ✅ This session (2026-07-20d, pushed) — iframe float fix + World shuffle

- **Spotify iframe floating on shuffle — FIXED** (`GlobalPlayer.tsx`): after shuffling to a Deezer-preview track the embed stopped being the sounding source, the card's `[data-spotify-slot]` unmounted, but `slotRect` was only re-measured on an 800ms interval — so the strip lingered in `--slot` mode (z-41, on top) at the STALE coordinates, floating over the playlist (user's screenshots). Fix: new reactive `embedLive` state; every `audioBus.ext` change routes through `setExt()` which keeps `embedLive` in lockstep. The measure effect gates on `embedLive` and re-runs the instant it flips → `slotRect` clears immediately when the embed stops sounding → strip drops to its occluded-behind-the-card fallback (verified: `--circle` fallback is hit-tested occluded, not floating) instead of floating. Interval 800→300ms; `useEmbedActive` poll 500→200ms so the slot never lags as an empty gap. (Full embed re-seat during real full-song playback needs the user's Spotify login to verify end-to-end.)
- **World shuffle button** (`WorldNowPlaying.tsx`): was still the old `shuffleTracks(true)` reorder — now the same TOGGLE as the Circle (`toggleShuffle` + `data-active` blue). Verified: toggles false→true, "Shuffle: on", blue.
- Note: a `useEffect changed size 3→4` console error appeared while iterating — it's a STALE MCP console-buffer entry from the live HMR dep-add (stayed at exactly 2 through ~12 forced re-renders + clean restart + hard reload; the shipped 4-dep array can't produce it). Not a real bug.

## ✅ This session (2026-07-20c, pushed) — curated Circle playlists

Circle **pairing playlists now behave like a real Spotify playlist** (per user spec):
- **Curated order** (`curatePlaylist` in `lib/store.tsx`): the fetched tracks are shuffled but artist-spread — greedy "most-remaining-first" interleave so the SAME artist never lands back-to-back when avoidable (dominant artists still spaced maximally). Applied in `commit()` and the `divertAfterCurrent` tail. Verified: India|Jazz → 68 tracks, **0 adjacent same-artist**.
- **Fixed list** (`CenterStack` in `Overlay.tsx`): the queue is now the FULL list in a FIXED order (was a rolling `trackIdx+1…` up-next window). The sounding track is highlighted IN PLACE — Spotify green `#1ed760` + a 3-bar `EqualizerIcon` — and auto-scrolled into view (`queueRef` + `scrollIntoView('nearest')`). Clicking any row jumps without reordering. Heading renamed "Up next:" → "Playlist" (`STR.card.playlist`).
- **Shuffle is now a TOGGLE** (controls-panel button only — NOT the dock's surprise): `store.shuffle` + `toggleShuffle` + `trackEnded` (shuffle-aware advance). ON → each advance plays a random not-yet-heard track (played-set in a ref, no repeats until the list is exhausted → then next genre / library loop); button lit in our blue (`.ctrl--shuffle[data-active="true"]`). OFF → linear from the current track. `GlobalPlayer.onEnded` (audio + Spotify-embed paths) delegates to `trackEnded`. Verified: ON → [0,31,83,124,102,98,92] non-linear no-repeat; OFF → [92,93,94,95,96] linear.
- Note: `getComputedStyle` in the hidden preview tab falsely reported the active-shuffle blue as not applying (even injected `!important` didn't reflect) — a screenshot confirmed it renders correctly. Trust screenshots over computed styles in that tab.

## ✅ This session (2026-07-20b, pushed) — phone interface + contact fix + DB

**📱 Phone interface — BUILT** (`components/PhoneIntro.tsx`, `lib/use-phone.ts`):
- Phones (≤640px, `usePhone()` via useSyncExternalStore + mq-change AND resize listeners) get 3 full-screen swipeable panels instead of the tool; the heavy Stage/WorldGlobe never mount. `/` opens on Circle panel, `/world` on World panel; ≥641px unchanged.
- Panels: Circle (light `--bg-stage`, big #1d2bdf card-ring — the exported nav `CircleIcon` — turning 26s), World (dark #0e0f1a, the real `NavGlobe` at `size={480}` spinning), Shades (soft gradient bg, hue-drifting orb + 👀 COMING SOON pill). Each: "CIRCLE / of Music" mono+italic-serif lockup, one-line blurb, "optimized for desktop" mono caption. Copy in `STR.phone`.
- Continuous drag (pointer events, position float 0..2): leaving panel zooms out (scale .86–1) + dissolves + drifts, backgrounds cross-fade, graphics cross-morph at the same center — mid-drag states are real frames. Flick detection (vx > 0.35 px/ms), rubber-band at the ends, 340ms ease-out snap; `document.hidden`/reduced-motion jump instantly (canAnimate lesson). Progress dots (click-to-jump — root pointer capture must SKIP dots or it eats their click) + a "← swipe →" hint that retires after the first swipe.
- Verified in preview at 375×812: all three panels, swipes, flicks, dots, /world entry, desktop untouched, console clean. Real-phone feel check on the user.

**🗄️ Submissions database (Neon Postgres via Vercel Marketplace) — LIVE + VERIFIED IN PROD**: `lib/db.ts` — lazy `getSql()` (build-safe without DATABASE_URL), idempotent `CREATE TABLE IF NOT EXISTS submissions (id, kind note|song, subject, message, country, genre, song, created_at)`, `storeSubmission()` soft-fails so persistence never blocks email. `/api/contact`: store → email → 200 if EITHER worked (`{ok, stored, sent}`). Contact.tsx sends structured `{kind, country, genre, song}`. Neon connected (`neon-cinnabar-basket`), env vars in Prod+Preview+Dev, production redeployed. Verified: prod POSTs return `stored:true`; both a note row and a Brazil/Samba song row confirmed via direct SQL query. **NOTE:** the Neon env pull overwrote `.env.local` and dropped the Spotify vars (they live in Vercel *production* scope, not *development*) — recovered by pulling prod env and re-appending `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`.

**✉️ Email: FormSubmit ABANDONED → Resend — LIVE + VERIFIED IN PROD.** Two FormSubmit bugs found: (1) it needs Origin/Referer headers or returns HTTP 200 + `success:"false"` (old `res.ok` check passed while nothing sent — that's why no email/activation ever fired); (2) even fixed, FormSubmit sits behind **Cloudflare, which 403s Vercel's datacenter IPs** (verified "Just a moment…" challenge) — so it can NEVER send from a Vercel function. Switched to **Resend** (`lib/email.ts`): env-gated REST call, key+destination server-side, `from` = `onboarding@resend.dev` (only delivers to the Resend-account owner's address — chandanasmekala@gmail.com — until a domain is verified). User supplied `RESEND_API_KEY` directly (skipped the marketplace-terms install); added to Vercel Production+Development (Preview add flaked, non-blocking) + local `.env.local`; production redeployed. Prod POSTs (note + song) both return `stored:true, sent:true`; direct Resend probe returned a message id. **Next (optional): verify a real domain in Resend** to send from a branded address + to any recipient.
- `.claude/launch.json`: added `circle-of-music-alt` (port 3010) — unused (Next 16 refuses two dev servers per dir anyway).

## ⏳ Waiting on user (blocks next steps)
- [ ] **Shades** experience design (nav slot exists, marked coming soon).
- [ ] **Translations** for the 19 listed languages (only `en` is `ready` in `lib/strings.ts`); countries/genres too.
- [x] **Contact pipeline — DONE + verified in prod 2026-07-20b**: Neon DB stores every submission; Resend emails notifications (`stored:true, sent:true` from the live Vercel function). FormSubmit dropped (Cloudflare blocks Vercel IPs). Optional later: verify a real domain in Resend to send from a branded `from` and to any recipient (today `onboarding@resend.dev` only reaches the Resend-account owner's address). The 10 test rows in `submissions` can be cleared when you want a clean slate (row 6 'hello' may be your own live test). Still TODO: the auto-verify-against-pairing pipeline for song suggestions (Deezer/MusicBrainz check like `npm run enrich` — suggestions already arrive tagged Country×Genre).
- [ ] **About us** copy (currently reuses the hub thesis).
- [ ] Lightweight **vector icons** for World/Shades nav (current = PNGs extracted from raster-embedded SVGs).
- [x] **Spotify** — DONE 2026-07-16..18. Client ID `1820…e296` + server `SPOTIFY_CLIENT_SECRET` set in `.env.local` (gitignored) and Vercel production. Full-song path is the **Embed iframe** (no OAuth allowlist, works for any logged-in Spotify user); `/api/spotify-search` (client-credentials) resolves song→id. The whole flow is built + wired (see "This session" above). **Remaining = user verification only:** open discovery-of-music.vercel.app in a browser logged into open.spotify.com, Connect, tap ▶ inside the embed once → full songs. NOTE: the app's search quota is currently rate-limited from testing (escalating ban, ~13–22h) — until it clears everyone gets Deezer previews regardless of connection. The limit is on song *lookups*, not playback; a shared KV cache + extended-quota request are the scale levers if it grows.
- [ ] `seed-proposals.json` review; axes growth (24×24) decision.
- [ ] **Accounts / cross-device library** (decided 2026-07-16: defer until Spotify is live). Plan when ready: Supabase free tier (email magic-link + Google auth; `finds` + `playlists` tables keyed by user id w/ RLS), local-first sync behind the existing `lib/library.ts` store interface — no UI changes needed. Sign-in stays optional ("save across devices"), never a wall.

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
