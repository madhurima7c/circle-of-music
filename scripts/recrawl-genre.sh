#!/usr/bin/env bash
# Re-crawl ONE genre's world-songs file. Invoked by recrawl-all.sh; safe to run
# alone: scripts/recrawl-genre.sh "Bossa Nova"
#
# Lives in its own file because macOS xargs cannot assemble a long inline
# `sh -c` body ("command line cannot be assembled, too long").

set -uo pipefail
cd "$(dirname "$0")/.."

GENRE="$1"
SLUG=$(printf '%s' "$GENRE" | tr '[:upper:] ' '[:lower:]-')
LOG="/tmp/recrawl/${SLUG}.log"
mkdir -p /tmp/recrawl

LIMIT_ARG=()
[ -n "${RECRAWL_LIMIT:-}" ] && LIMIT_ARG=(--limit "$RECRAWL_LIMIT")

echo "start  $GENRE"
if npx tsx scripts/build-world-songs.ts --fresh --genres "$GENRE" "${LIMIT_ARG[@]}" > "$LOG" 2>&1; then
  n=$(node -e "
    try {
      const j = require('./public/world-songs/${SLUG}.json');
      let n = 0;
      for (const k of Object.keys(j)) if (k !== '__done' && Array.isArray(j[k])) n += j[k].length;
      console.log(n);
    } catch (e) { console.log('?'); }
  ")
  echo "done   $GENRE  ($n songs)"
else
  echo "FAILED $GENRE — see $LOG"
  exit 1
fi
