@AGENTS.md

# Music Exploration — project guide

> Working title: **Music Exploration**. One product, two "instruments":
> **Circle of Music** (spin two wheels of countries × genres, hear the
> intersection) and **World of Music** (a globe — tap a country, hear its
> music). Thesis: **"Wander, don't search."** Replace algorithmic feeds and
> the burden of choice with browsable geography + genre. 30-second Deezer
> previews are framed as a listening station; every find deep-links out to the
> listener's own app, and can be kept in a local library.

The repo is a clone of `github.com/madhurima7c/circle-of-music` (owned by
madhurima7c; you commit as `chanmekala`). `origin/Maddy` is Madhurima's
parallel Vite rewrite — **all active work is on `main`** (Next.js 16 + React
Three Fiber).

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

## Routes & the shared spine

- `app/page.tsx` — landing **hub** (server component) linking the two instruments.
- `app/circle/page.tsx` — Circle of Music (client): `Stage` (R3F wheels) + `Overlay` UI.
- `app/world/page.tsx` — World of Music (client): dynamically-imported `WorldGlobe`.
- `app/layout.tsx` — root: fonts, the liquid-glass SVG filter, **`StoreProvider`**
  and **`GlobalPlayer`** wrap everything so **selection + playback survive
  navigation** between routes.

State lives in **`lib/store.tsx`** (React context). Audio lives in **one**
`<audio>` in **`components/GlobalPlayer.tsx`** (+ MediaSession + a mini-player
pill on non-`/circle` routes). `CenterStack` (in `Overlay.tsx`) is pure UI over
the store.

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
| `components/Overlay.tsx` | 2D UI: Title, CenterStack (card incl. **origin line** — story or facts fallback), Dial (letter ladder), WheelLock, Dock (surprise + hand toggle), Hint, **HandTracking** (opt-in VR-cursor gesture system), GestureToast. |
| `components/Stage.tsx` / `Wheel.tsx` | R3F wheels; `MOBILE_CAMERA`/`MOBILE_TUNING` swap in ≤640px; leva dev panel (hidden on mobile). |
| `components/WorldGlobe.tsx` | react-globe.gl globe; every nation tappable (seeded = curated pipeline, rest = MusicBrainz); artist-origin **dots** per queue (playing dot glows + ring, hover story tooltip, click jumps playback); vertical genre rail (left). `lib/geo.ts` maps GeoJSON `NAME`→seed country; data at `public/geo/countries-110m.geojson`. |
| `lib/stories.ts` + `lib/track-stories.json` | curated artist/song stories (90) + `releaseYear`; keys are normalized artist names, optional `country\|genre\|artist` override. Grounded facts only. |
| `lib/origins.ts` + `lib/origins.json` | artist → origin coords (city-level where Wikidata knows); built by `scripts/build-origins.ts`; manual fixes live in the JSON and survive re-runs. |
| `lib/geo-iso.json` | GeoJSON NAME → ISO-3166 alpha-2 (generated from the Natural Earth file) — lets `/api/musicbrainz` accept any globe nation. |
| `components/GlobalPlayer.tsx` | the one `<audio>` + MediaSession + mini-player. |
| `components/Library.tsx` + `lib/library.ts` | local "finds" (localStorage, `useSyncExternalStore`). |
| `lib/links.ts` | search deep links (Spotify/Apple/YouTube/Deezer) built locally — Odesli's free tier no longer returns the big three. |
| `lib/strings.ts` | **all** user-facing copy (i18n-ready — add copy here, not inline). |
| `lib/covers.ts` | real cover art on cards (front/back + sampled spine gradient); `public/covers/{countries,genres}/<kebab>.jpg`. |

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
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
  Push after each coherent change (user has been doing per-feature commits).

## Current status

**Done:** Phase 0 (routes/hub, opt-in hand tracking, shareable URLs, deep links,
persistent player + MediaSession, mobile Circle, strings module) + Phase 1A
(GSAP card polish, surprise/shuffle, finds library, audit script) + content
wave 1 (+80 verified seeds, related-genre net — fallbacks 26%→5%; card origin
line with 90 curated stories) + World **Phase 2** (origin dots w/ glow ring +
story tooltips + dot-click playback, every nation tappable via MusicBrainz
tier, vertical genre rail). See **`todo.md`** for what's next.

**Not done / known:** seed-proposals.json review + the 19 remaining fallbacks;
axes growth (24×24/28×28) awaiting user decision + covers; reach arcs + layer
toggles + Circle→globe flyover; full playback + library export (Phase 3);
real-device testing (webcam gestures, iOS background audio, origin-dot visuals).
