/**
 * Minimal streaming CSV reader for the Kaggle drop.
 *
 * The files run to 500MB and 2.1M rows, so nothing is ever held in memory as
 * a whole; rows are handed to a callback one at a time. Handles the two
 * quoting realities in these particular files: escaped `""` inside quoted
 * fields, and real newlines inside quoted fields (song titles do this).
 */

import { createReadStream } from 'node:fs';
import readline from 'node:readline';

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Stream `path`, calling `fn` once per data row with a header-keyed object. */
export async function eachRow(
  path: string,
  fn: (row: Record<string, string>, index: number) => void,
): Promise<number> {
  const rl = readline.createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let header: string[] | null = null;
  let pending = '';
  let n = 0;
  for await (const raw of rl) {
    // An odd number of quotes means the record continues on the next line.
    const line = pending ? `${pending}\n${raw}` : raw;
    if (((line.match(/"/g) || []).length) % 2 === 1) { pending = line; continue; }
    pending = '';
    if (!header) { header = splitCsvLine(line); continue; }
    const cells = splitCsvLine(line);
    if (cells.length < header.length - 2) continue;   // torn row — skip
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i];
    fn(row, n++);
  }
  rl.close();
  return n;
}
