// check-ui.js — the interface rules that were quietly broken once.
//
// Each check exists because we found the defect in the running app, not because
// it sounded like good practice:
//
//   · index.html loaded four webfonts and no theme named any of them, so every
//     screen rendered in whatever the operating system had.
//   · 23 of 24 grids used bare `1fr`, whose minimum is the content width, so one
//     long client name widened a column and pushed the layout off a phone.
//   · reduced motion set animations to 0.001ms — sped up, not switched off.
//   · nothing in the app had a :focus-visible style, so keyboard users had no
//     idea where they were.
//   · the reporting tables scrolled sideways on phones, which loses the row
//     label before you reach the number.
//
// Run: node scripts/check-ui.js

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const fail = (name, detail) => results.push({ pass: false, name, detail });

const index = readFileSync('index.html', 'utf8');
const sources = readdirSync('src')
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => ({ path: join('src', f), text: readFileSync(join('src', f), 'utf8') }));
const all = sources.map((s) => s.text).join('\n');

// 1 ── every family a theme asks for is actually downloaded
const asked = new Set();
for (const m of all.matchAll(/\b(?:serif|sans|mono):\s*'([^']+)'/g)) {
  const first = m[1].split(',')[0].replace(/["']/g, '').trim();
  // Skip generic and system faces — the browser always has those.
  if (!/^(system-ui|sans-serif|serif|monospace|-apple-system)$/.test(first)) asked.add(first);
}
const missing = [...asked].filter((f) => !index.includes(f.replace(/ /g, '+')) && !index.includes(f));
if (missing.length) {
  fail('every themed font is loaded', `not in index.html: ${missing.join(', ')}`);
} else {
  ok('every themed font is loaded', `${asked.size} families: ${[...asked].join(', ')}`);
}

// and nothing is downloaded that no theme names
const loaded = [...index.matchAll(/family=([^&:"]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, ' '));
const unused = loaded.filter((f) => !asked.has(f));
if (unused.length) {
  fail('no unused webfonts', `downloaded but never named by a theme: ${unused.join(', ')}`);
} else {
  ok('no unused webfonts', `${loaded.length} loaded, all used`);
}

// 2 ── grid tracks can shrink below their content
const bare = [];
for (const { path, text } of sources) {
  for (const m of text.matchAll(/gridTemplateColumns:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    const outside = m[2].split(/minmax\([^)]*\)/).join(' ');
    if (/(^|[\s,(])\d*\.?\d+fr(?=[\s,)]|$)/.test(outside)) bare.push(`${path}: ${m[2].slice(0, 46)}`);
  }
}
if (bare.length) {
  fail('grid tracks have a zero minimum', `${bare.length} use a bare fr:\n      ${bare.slice(0, 4).join('\n      ')}`);
} else {
  ok('grid tracks have a zero minimum', 'every fr track is wrapped in minmax');
}

// 3 ── reduced motion switches animation off rather than speeding it up
const reducedRaw = all.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,600}?\}\s*\}/);
// Strip comments first — the note explaining why 0.001ms is wrong should not
// read as the defect itself.
const reduced = reducedRaw && [reducedRaw[0].replace(/\/\*[\s\S]*?\*\//g, '')];
if (!reduced) {
  fail('reduced motion is honoured', 'no prefers-reduced-motion block found');
} else if (/0\.001m?s/.test(reduced[0])) {
  fail('reduced motion is honoured', 'animations are sped up, not turned off');
} else if (/animation:\s*none/.test(reduced[0]) && /transition:\s*none/.test(reduced[0])) {
  ok('reduced motion is honoured', 'animation and transition both set to none');
} else {
  fail('reduced motion is honoured', 'block exists but does not disable both animation and transition');
}

// 4 ── keyboard focus is visible
if (/:focus-visible\s*\{|:focus-visible,/.test(all)) {
  ok('keyboard focus is visible', 'a :focus-visible rule exists');
} else {
  fail('keyboard focus is visible', 'no :focus-visible anywhere — tabbing shows nothing');
}

// 5 ── reporting tables have a phone reading
const reporting = sources.find((s) => s.path.endsWith('reporting.jsx'))?.text || '';
if (/function RptTable[\s\S]{0,900}?narrow/.test(reporting)) {
  ok('reporting tables read on a phone', 'RptTable falls back to cards when narrow');
} else {
  fail('reporting tables read on a phone', 'RptTable has no narrow-screen path');
}

// 6 ── the tab strip is reachable and readable by keyboard
const ui = sources.find((s) => s.path.endsWith('ui.jsx'))?.text || '';
const tabs = ui.match(/function Tabs\([\s\S]*?\n\}/);
if (!tabs) {
  fail('tabs answer the keyboard', 'no Tabs component found');
} else if (/role="tablist"/.test(tabs[0]) && /ArrowRight/.test(tabs[0]) && /aria-selected/.test(tabs[0])) {
  ok('tabs answer the keyboard', 'tablist role, arrow keys, roving tabindex');
} else {
  fail('tabs answer the keyboard', 'Tabs is still a plain row of buttons');
}

// 7 ── a dialog traps focus, closes on Escape, and hands focus back
if (!/function useDialog\(/.test(ui)) {
  fail('dialogs behave', 'useDialog is missing from ui.jsx');
} else {
  const orphans = [];
  for (const { path, text } of sources) {
    // Every component that renders role="dialog" should be using the hook.
    for (const m of text.matchAll(/function (\w*(?:Modal|Dialog|Sheet))\s*\([\s\S]{0,8000}?\n\}/g)) {
      if (/role="dialog"/.test(m[0]) && !/useDialog\(/.test(m[0])) orphans.push(`${path}: ${m[1]}`);
    }
  }
  if (orphans.length) fail('dialogs behave', `not using useDialog: ${orphans.join(', ')}`);
  else ok('dialogs behave', 'every role="dialog" component calls useDialog');
}

// 8 ── the sign-in fields say what they are to a screen reader
const auth = sources.find((s) => s.path.endsWith('auth-gate.jsx'))?.text || '';
const form = auth.match(/<form[\s\S]*?<\/form>/);
if (!form) {
  fail('sign-in fields are labelled', 'no form found in auth-gate.jsx');
} else {
  const inputs = [...form[0].matchAll(/<input[\s\S]*?\/>/g)];
  const unlabelled = inputs.filter((i) => !/aria-label|aria-labelledby|id=/.test(i[0]));
  if (unlabelled.length) fail('sign-in fields are labelled', `${unlabelled.length} input(s) carry only a placeholder`);
  else ok('sign-in fields are labelled', `${inputs.length} inputs, all named`);
}
if (/role="alert"/.test(auth)) ok('a failed sign-in is announced', 'the error carries role="alert"');
else fail('a failed sign-in is announced', 'the error is drawn but not announced');

// 9 ── no component can switch the focus ring off
const shell = sources.find((s) => s.path.endsWith('app-shell.jsx'))?.text || '';
if (/:focus-visible[\s\S]{0,400}?outline:[^;]*!important/.test(shell)) {
  ok('the focus ring cannot be suppressed', 'the rule outranks inline outline:none');
} else {
  fail('the focus ring cannot be suppressed',
    `${(all.match(/outline: 'none'/g) || []).length} inline outline:none would win against it`);
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name} — ${r.detail}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
