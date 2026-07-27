#!/usr/bin/env bash
# Re-crawl every genre's world-songs file.
#
#   scripts/recrawl-all.sh [concurrency]
#
# Each genre writes its OWN file under public/world-songs, so genres can run as
# separate processes without touching each other's data. That is the whole
# reason this is safe to parallelise without changing the crawler: there is no
# shared mutable state between them.
#
# Concurrency is capped low on purpose. Deezer's anonymous quota is roughly
# 50 requests / 5s across the whole client, and MusicBrainz asks for 1 req/sec;
# four workers sit inside both with room to spare, and the crawler already
# backs off on 503. Raising this risks trading a 2-hour clean run for a long
# one full of throttled retries.
#
# Resumable: a genre that fails or is interrupted can simply be re-run — the
# crawler skips countries listed in that file's __done.

set -uo pipefail
cd "$(dirname "$0")/.."

CONCURRENCY="${1:-4}"
# RECRAWL_LIMIT=N restricts each genre to N countries — smoke-testing only.
LOG_DIR="/tmp/recrawl"
mkdir -p "$LOG_DIR"

GENRES=$(node -e "console.log(require('./lib/seeds.json').genres.join('\n'))")

echo "re-crawling $(echo "$GENRES" | wc -l | tr -d ' ') genres, ${CONCURRENCY} at a time"
echo "logs: $LOG_DIR/<genre>.log"
date

export RECRAWL_LIMIT
printf '%s\n' "$GENRES" | xargs -P "$CONCURRENCY" -I{} ./scripts/recrawl-genre.sh "{}"

echo
date
echo "all genres finished"
node -e "
const fs=require('fs');
let total=0, files=0;
for(const f of fs.readdirSync('public/world-songs')){
  if(!f.endsWith('.json'))continue;
  const j=JSON.parse(fs.readFileSync('public/world-songs/'+f,'utf8'));
  let n=0; for(const k of Object.keys(j)) if(k!=='__done'&&Array.isArray(j[k])) n+=j[k].length;
  total+=n; files++;
}
console.log(\`\${files} genre files, \${total.toLocaleString()} songs total\`);
"
