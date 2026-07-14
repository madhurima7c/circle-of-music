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

## ▶️ Next up (pick one)

### A. Content expansion + genre correctness  *(uses the audit output)*
- [ ] Run `npm run audit` → 104 FALLBACK pairings (0 direct + 0 related seeds). Weakest countries: **Ghana, Pakistan, Turkey, Iran, Nigeria** (13/20 genres fall back).
- [ ] Hand-add curated artists to `lib/seeds.json` for the worst offenders (or `npm run curate` to LLM-fill, then review). **User wanted to review before seed changes land.**
- [ ] Consider growing to bigger EQUAL axes (24×24 or 28×28 — must stay equal for symmetric wheels). Candidate country adds: Germany, Italy, Colombia, Jamaica, Cuba, Ethiopia, Indonesia, Australia. Genre adds: Blues, Country, Metal, R&B, Reggaeton, Amapiano, Salsa, Flamenco.
- [ ] If axes grow, add matching covers to `public/covers/` (kebab-case; see `lib/covers.ts`) and geo works automatically.

### B. World of Music — Phase 2 (the data-viz layer)
- [ ] Artist-origin **points** layer (MusicBrainz `begin-area` → city coords; geoapify/Natural Earth populated-places).
- [ ] "Reach" **arcs**: genre origin → where it spread (seed from everynoise frozen country pages + curate).
- [ ] **Layer toggles** UI (Google-Earth style: countries / origins / reach).
- [ ] Cross-links: Circle track → "see on globe" flyover; globe → open in Circle (mini-player already bridges audio).
- [ ] Globe polish: on-demand render loop (`frameloop`/idle) for battery; verify touch rotate/pinch on a real phone.

### C. Full playback + export (Phase 3, opt-in)
- [ ] Spotify **Embed iframe** panel (full track for Premium users, no app registration) + optional YouTube iframe.
- [ ] Library export → Spotify playlist (personal/dev-mode only; public Spotify blocked by 250k-MAU quota).

---

## 🔎 Needs real-device testing (can't verify in the hidden preview tab)
- [ ] Hand mode: toggle on with a real webcam — cursor tracking, pinch-hold click, pinch-drag spin.
- [ ] GSAP card animations actually play (preview tab is hidden → rAF paused).
- [ ] Globe touch: rotate/pinch-zoom + tap-to-play on a phone.
- [ ] iOS Safari: does audio keep playing with the screen locked? (known-unreliable in PWAs.)

## 🐞 Known, low-priority
- Dev-only console warning `getServerSnapshot should be cached` ×4 → Next's `usePathname` in GlobalPlayer, not our code. Benign.
- Pre-existing eslint findings (ref-assign-during-render idiom, one `as 'pretty'`) — don't gate the build; `next build` runs tsc only.
- `lib/gestures.ts` shape helpers now unused again (VR-cursor model supersedes).
- "from these pairing" typo kept verbatim from Maddy's no-results copy (`lib/strings.ts` `card.noResults`).
