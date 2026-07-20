@AGENTS.md

# Music Exploration — project guide

> Working title: **Music Exploration**. One product, two "instruments":
> **Circle of Music** (spin two wheels of countries × genres, hear the
> intersection) and **World of Music** (a globe — tap a country, hear its
> music). Thesis: **"Wander, don't search."** Replace algorithmic feeds and
> the burden of choice with browsable geography + genre. 30-second Deezer
> previews are framed as a listening station; every find deep-links out to the
> listener's own app, and can be kept in a local library.

**TWO git remotes — push every commit to BOTH:**
- `origin` = `github.com/madhurima7c/circle-of-music` (the original repo;
  `origin/Maddy` is Madhurima's parallel Vite rewrite — ignore it).
- `deploy` = `github.com/chanmekala/discovery-of-music` — **this is what
  Vercel watches**; the live site only updates when you `git push deploy main`.

All active work is on `main` (Next.js 16 + React Three Fiber). You commit
as `chanmekala`. Convention: `git push origin main && git push deploy main`
after each coherent change.

## Run it

```bash
npm run dev          # Next 16 (Turbopack) at http://localhost:3000
npm run build        # prod build (runs tsc; does NOT run eslint)
npm run audit        # pairing genre-mismatch report (no changes)
npm run curate       # LLM-fill seeds.json (needs ANTHROPIC_API_KEY in .env.local)
npm run origins      # Wikidata → lib/origins.json artist origin coords (resumable; manual fixes in the JSON persist because existing keys are skipped)
npm run enrich       # propose verified artists for weak pairings → seed-proposals.json (review; never edits seeds)
```

No env vars are needed to run — the Anthropic key only powers optional
build-time/runtime curation. The app is anonymous, serverless (only the two
Next API proxies), no accounts.

**Optional Spotify full-song mode** (`lib/spotify.ts`): set
`NEXT_PUBLIC_SPOTIFY_CLIENT_ID` in `.env.local` (free app at
developer.spotify.com/dashboard; whitelist redirect URIs `<origin>/`,
`<origin>/circle`, `<origin>/world`). A "Connect Spotify" entry then appears
in the card's share ("listen in") menu; connected Premium users hear FULL
tracks via the Web Playback SDK (PKCE, no server/secret), with automatic
fallback to the 30s Deezer preview for anything Spotify can't match.
Without the env var, Spotify login is never mentioned. Deferred by user
until the published Vercel URL exists to whitelist.

## Routes & the shared spine

- `app/page.tsx` — landing **hub** (server component) linking the two instruments.
- `app/circle/page.tsx` — Circle of Music (client): `Stage` (R3F wheels) + `Overlay` UI.
- `app/world/page.tsx` — World of Music (client): dynamically-imported `WorldGlobe`.
- `app/layout.tsx` — root: fonts (**DM Sans + DM Mono** via next/font, kept on
  the legacy `--font-plex-*` variable names), **`StoreProvider`** and
  **`GlobalPlayer`** wrap everything so **selection + playback survive
  navigation** between routes.
- Page titles are gone — **`components/ExperienceNav.tsx`** (top-center
  switcher: Circle / World / Shades) is the navigation on both instrument
  pages. Shades is a designed-later experience: visible, marked coming-soon.

State lives in **`lib/store.tsx`** (React context). Audio lives in **one**
`<audio>` in **`components/GlobalPlayer.tsx`** (+ MediaSession + a mini-player
pill on the hub). The element is also exposed via **`lib/audio-bus.ts`** so the
card's progress bar can poll/seek it without store re-renders. `CenterStack`
(in `Overlay.tsx`) is pure UI over the store.

## Data & playlist pipeline (unchanged core)

`lib/seeds.json` = 20 countries × 20 genres + curated seed artists.
`lib/deezer.ts` `buildPlaylist({country, genre, seeds})` resolves a pairing
through 4 tiers: **track-overrides.json → MusicBrainz proxy (`/api/musicbrainz`)
→ seeds.json artists (+ `RELATED_GENRES` fallback) → Claude Haiku (`/api/curate`)**.
Deezer is anonymous JSONP, ~30s preview MP3s (the only Deezer surface still
open in 2026). MusicBrainz needs its mandatory User-Agent (already set in the
route). Store actions read the CURRENT pairing via **refs** (`countryIdxRef`/
`genreIdxRef`) — do not read the state vars inside `commit`/`playPlace` or you
reintroduce the stale-closure bug where the fetched playlist lagged the UI.

## Key modules

| File | Role |
|---|---|
| `lib/store.tsx` | all app state + actions: `spinLeft/Right`, `setCountry/Genre`, `commit`, `surprise`, `playPlace` (globe, instant, no debounce), `playPlaceNamed` (any globe nation → MusicBrainz tier; sets `customCountry`, cleared by any wheel action), `countryName` (display name incl. custom), `loadQueue` (library), `toggleLock*`, `toggleHandMode`, playback. Indices mirrored into refs. |
| `components/Overlay.tsx` | 2D UI: CenterStack (flip card: front = player w/ progress bar + share "listen in" menu + rich queue rows; back = about-this-song story/facts; click card to flip), Dial (letter ladder), WheelLock, **Dock** (shuffle · liked-songs popup · ⋮ menu w/ Language 19-langs / Hand tracking On-Off / world dots filter / Contact / About), **HandTracking** (opt-in VR-cursor gesture system), GestureToast. |
| `components/ExperienceNav.tsx` | top-center switcher (Circle/World/Shades) using the user's icons in `public/icons/`; Shades = coming soon. |
| `components/Stage.tsx` / `Wheel.tsx` | R3F wheels; tuned values are locked constants (`DESKTOP_TUNING`/`LIGHTS` — leva dial kit REMOVED for users; restore from git `30306c7` if tuning is needed again); lit PBR card materials (matte spine/back, clearcoat front). `MOBILE_*` swap in ≤640px. |
| `components/WorldGlobe.tsx` | react-globe.gl globe; every nation tappable (seeded = curated pipeline, rest = world-seeds/MusicBrainz); flat artist-origin **dots** per queue (playing = avatar + sonar ring, hover popups per artists/songs filter, click jumps playback); vertical genre rail (left). Listens for `world:shuffle` / `world:dots` window events from the shared Dock. Dev hook: `window.__world.select(name, genreIdx)`. `lib/geo.ts` maps GeoJSON `NAME`→seed country. |
| `lib/stories.ts` + `lib/track-stories.json` | curated artist/song stories (90) + `releaseYear` + `normKey` (Unicode-aware — keep the 4 copies in sync: stories, deezer, build-origins, enrich-seeds). |
| `lib/origins.ts/.json` + `lib/origins-live.ts` | artist → origin coords (build-time for seeds via `npm run origins`; runtime Wikidata lookups w/ localStorage cache for everyone else). Manual JSON fixes survive re-runs. |
| `lib/world-seeds.json` + `lib/enao-genres.json` | 161/175 nations w/ Deezer-verified genre-bucketed artists (`npm run world-seeds`); Every-Noise featured genres per country. Powers the World's any-nation tier + globe tint. |
| `lib/geo-iso.json` | GeoJSON NAME → ISO-3166 alpha-2 — lets `/api/musicbrainz` accept any globe nation. |
| `components/GlobalPlayer.tsx` | the one `<audio>` (+ Spotify SDK routing when connected) + MediaSession + hub mini-player; registers the element on `lib/audio-bus.ts`. |
| `components/Library.tsx` + `lib/library.ts` | **LikedSongs popup** (Spotify-style: All liked + named playlists, drag-a-row-onto-a-playlist to add, create/delete, export/import) over localStorage stores `finds` + `playlists`. |
| `lib/links.ts` | search deep links (Spotify/Apple/YouTube/Deezer) built locally — surfaced in the card's share menu. |
| `lib/strings.ts` | **all** user-facing copy (i18n-ready; incl. the 19-language menu list — only `en` is `ready`). |
| `lib/covers.ts` + `lib/spine-colors.json` | card faces: front = cover art, edges = dedicated spine art, back = solid spine color. `public/covers/{countries,genres,country-spines,genre-spines}/<kebab>.jpg`. Raw art folders `covers new/` + `menu icons/` are gitignored (2.1GB originals). |

## Conventions & gotchas (read before editing)

- **Read `node_modules/next/dist/docs/` before writing Next code** (per AGENTS.md — this Next 16 differs from training data).
- **Turbopack stale-cache bug**: after edits the dev server sometimes serves an
  OLD bundle (phantom import errors, half-applied CSS). Fix: stop server →
  `rm -rf .next` → restart. Recurs often — expect it.
- **globals.css**: the `@media (max-width: 640px)` block **must stay at the end
  of the file**. Same-specificity base rules placed after it will override it.
- **GSAP entrances**: wrap `.from()` tweens in the `canAnimate()` guard (page
  visible + motion not reduced). A hidden tab pauses rAF and strands `.from()`
  elements invisible. Use `@gsap/react` `useGSAP` scoped to a ref.
- **Hand tracking is opt-in** (dock toggle, default off, `localStorage.handMode`,
  hidden on coarse pointers). It only mounts when on. It's the VR-cursor model:
  index-fingertip cursor, hover a `<button>` + pinch-hold ~1s to click, pinch
  over the wheel canvas + move to spin. Needs a real webcam to test.
- **The preview browser runs as a HIDDEN tab** (`document.hidden===true`) — so
  rAF animations (GSAP, globe idle spin) don't visibly run there, and the
  camera is blocked. Verify logic/DOM headless; the user tests motion + webcam +
  phone for real.
- Benign console noise: `getServerSnapshot should be cached` ×4 comes from
  Next's `usePathname` in GlobalPlayer (shows on the hub too) — not our code.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>` (or current
  model name). Push after each coherent change **to BOTH remotes**:
  `git push origin main && git push deploy main` (deploy = Vercel).
- **Fonts are DM Sans + DM Mono** (user's spec), loaded in layout.tsx on the
  legacy `--font-plex-sans`/`--font-plex-mono` variable names.

## Current status

Full detail + this-session log in **`todo.md`**; the deep history is in the
per-file summaries above. Highlights of the current build:

**Spotify FULL-SONG mode is wired end-to-end** (`lib/spotify-embed.ts` +
`GlobalPlayer.tsx`): "Connect Spotify" opens a plain Spotify login popup and
rebuilds a FRESH embed iframe (only a new iframe document sees the just-granted
login). The embed is Spotify's 152px card, **nested BELOW our scrubber +
transport** in both the Circle and World now-playing cards (reserved
`[data-spotify-slot]`; the fixed strip in GlobalPlayer seats itself over it —
the iframe can't live in the card DOM, it reloads on route change). It only
appears while the embed is genuinely the sounding source. Reverts to Deezer
30s previews when **not connected**, **disconnected**, **not logged in**
(clip-length duration detected → session clip-mode), or on a lookup miss —
never dead air. Track→id lookups go through `/api/spotify-search`
(client-credentials, no user auth). **Rate-limit reality:** the limit is on
that SEARCH lookup, NOT on playback (once an id is known, playback is
unlimited). Bans escalate on repeated 429s; server + client both remember the
`Retry-After` window (`spotify_rl_until` in localStorage) and stop calling.
Creds live in **gitignored `.env.local`** (`NEXT_PUBLIC_SPOTIFY_CLIENT_ID` +
server-only `SPOTIFY_CLIENT_SECRET`) and on Vercel production.

**Wheel cursor interaction** (`Wheel.tsx`, Spencer-Gabor-inspired,
user-tuned): ring cards react to the cursor's angle + sweep VELOCITY (lift +
lean, per-card springs that trail the cursor — `RIPPLE`); the active face-on
card does a "look at cursor" tilt (`RIPPLE_ACTIVE`). Values baked in; the
dev dial kit was removed. Spine art now reads on **all four edges** (top/bottom
get quarter-turn-rotated clones); every card's back carries its note text
permanently (a standing cue there's more info behind it).

**Two-way World↔Circle sync**: `store.setNowPlayingOrigin` makes the "FROM"
banner AND (on the Circle) the country/genre cards follow the CURRENTLY-PLAYING
dot. Queue kinds `pairing | chain | library`: at end-of-queue a pairing OR
dot-chain advances to the **NEXT GENRE, same country** (`store.endOfQueue`) —
never repeats the finished run; only the library loops. Unrepresented (non-seed)
nations: a country TAP with no dots snaps to the nearest seed
(`lib/geo.nearestSeedIdx`); a World→Circle switch while a non-seed dot plays
runs `store.divertAfterCurrent` (keeps the current song as the queue head,
swaps Up Next for the nearest-seed pipeline in the same genre) and shows the
**ParticleToast** ("Taiwan coming soon — brought you nearby." + ⓘ, ~5s,
particles→text→particles).

**Spotify VERIFIED WORKING by the user (2026-07-20)** — full songs play on
their logged-in browser. The search-quota rate-limit bans from testing have
lapsed; protections (server+client Retry-After memory, gentle 1/1.5s sweep)
prevent a repeat.

**Also live:** LikedSongs popup (Export CSV/JSON dropdown, select-all + bulk
clear / add-to-playlist, per-row share, compact icon "listen in"); Circle
**Up Next is scrollable** (the wheels' scroll handler ignores events over
overlay UI); both now-playing cards are 340px wide; wheel cards −15%
(`DESKTOP_TUNING.cardSize` 1.06); **World zoom pill** (bottom-left magnifier
→ − · slider · + driving `pointOfView` altitude); **tablet preset** in
Stage.tsx (641–900px `TABLET_CAMERA/TUNING` — desktop camera pushed the
wheels off-canvas on portrait iPads) + window-resize fallback; **Contact
popup v2** (`components/Contact.tsx` + `/api/contact`): two tabs (note /
add-a-song), light-mode w/ #1d2bdf CTAs, sends REAL email via FormSubmit
relay (destination lives server-side only), particle confirmation + "send
another" reset, country dropdown = all 175 globe nations.

**Contact pipeline (2026-07-20b):** `/api/contact` now (1) STORES every
submission in **Neon Postgres** (`lib/db.ts` — lazy client, build-safe
without `DATABASE_URL`, idempotent `submissions` table, soft-fail) and
(2) emails via FormSubmit — which **requires Origin/Referer headers** or it
returns HTTP 200 + `success:"false"` (the old silent failure; the real
verdict is the JSON `success` field, never `res.ok`). Route returns ok if
either channel took it.

**PHONE interface is BUILT** (`components/PhoneIntro.tsx` + `lib/use-phone.ts`,
2026-07-20b): ≤640px gets 3 swipeable full-screen panels (Circle light
card-ring / World dark NavGlobe at size 480 / Shades gradient orb + COMING
SOON) instead of the tool — heavy canvases never mount; continuous drag with
cross-fade/zoom-dissolve morphs, flick detection, rubber-band ends,
click-to-jump progress dots (root pointer-capture must skip the dots), copy
in `STR.phone`. `/` opens on the Circle panel, `/world` on World. Desktop
≥641px unchanged. Real-phone feel check on the user.

**Awaiting from user:** TWO one-time clicks — (1) FormSubmit activation link
(now really in the inbox; check spam) or emails won't deliver; (2) Neon
marketplace-terms acceptance (vercel.com → integrations → accept-terms/neon),
then `vercel integration add neon` finishes the submissions DB. Plus: Shades
design; translations; About copy; vector icons; seed-proposals.json review;
axes-growth decision; real-iPad tablet-preset check; real-phone intro check.

**Not done / known:** accounts / cross-device library (Supabase plan in
`todo.md`); Shades; reach arcs + layer toggles + Circle→globe flyover; the
song-suggestion auto-verify pipeline (suggestions arrive tagged
Country×Genre; the Deezer/MusicBrainz cross-check like `npm run enrich` is
TODO).
