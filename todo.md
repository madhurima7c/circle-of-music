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
