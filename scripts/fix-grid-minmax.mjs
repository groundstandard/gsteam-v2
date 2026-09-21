/**
 * Give every grid column a zero minimum.
 *
 * `1fr` is shorthand for `minmax(auto, 1fr)`, and `auto` means "at least as wide
 * as my content". One long client name or campaign name in a cell therefore
 * widens its whole column and pushes the grid past the screen — which is where
 * horizontal scroll on phones comes from.
 *
 * `minmax(0, 1fr)` keeps the same proportions and lets the cell shrink.
 *
 *   node scripts/fix-grid-minmax.mjs          list what would change
 *   node scripts/fix-grid-minmax.mjs --write  change it
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const write = process.argv.includes('--write');

// A grid track that is a bare fraction: 1fr, 1.5fr, .5fr — but not one already
// wrapped in minmax(), and not part of a longer word.
const BARE_FR = /(^|[\s,(])(\d*\.?\d+fr)(?=[\s,)]|$)/g;

function fixValue(value) {
  // Leave anything already inside minmax() alone by splitting on it first.
  const parts = value.split(/(minmax\([^)]*\))/);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : part.replace(BARE_FR, (m, lead, fr) => `${lead}minmax(0, ${fr})`)))
    .join('');
}

let touched = 0;
let files = 0;

for (const name of readdirSync(SRC).filter((f) => f.endsWith('.jsx'))) {
  const path = join(SRC, name);
  const before = readFileSync(path, 'utf8');
  let changes = 0;

  // gridTemplateColumns: '...' | "..." | `...`
  const after = before.replace(
    /gridTemplateColumns:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    (whole, quote, value) => {
      const fixed = fixValue(value);
      if (fixed === value) return whole;
      changes += 1;
      if (!write) {
        console.log(`  ${path}`);
        console.log(`     ${value}`);
        console.log(`  -> ${fixed}`);
      }
      return `gridTemplateColumns: ${quote}${fixed}${quote}`;
    },
  );

  if (changes) {
    files += 1;
    touched += changes;
    if (write) {
      writeFileSync(path, after);
      console.log(`  ${path}: ${changes} grid${changes === 1 ? '' : 's'}`);
    }
  }
}

console.log(`\n${touched} grid definitions across ${files} files`);
if (!write) console.log('nothing written. Pass --write.');
