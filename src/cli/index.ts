#!/usr/bin/env node
/**
 * iso-iterate — CLI.
 *
 * Lets the coding agent work with notes written from the Iteration panel:
 *
 *   npx iso-iterate                # open notes, all routes
 *   npx iso-iterate /projects      # one route
 *   npx iso-iterate --days 30      # widen the window
 *   npx iso-iterate --all          # include done items
 *   npx iso-iterate --done <id>    # mark addressed (id prefix ok)
 *   npx iso-iterate --undone <id>  # reopen
 *   npx iso-iterate --file <path>  # point at a non-default notes file
 *
 *   npx iso-iterate serve          # stand up the endpoint + panel for any host
 *   npx iso-iterate serve --port 4123
 */
import { resolve } from 'node:path';

import { readNotes, writeNotes } from '../store';

const args = process.argv.slice(2);

function valueFor(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}
function has(name: string): boolean {
  return args.indexOf(name) >= 0;
}

const days = Number(valueFor('--days') ?? 14);
const file = resolve(valueFor('--file') ?? '.iteration-feedback.json');
const all = has('--all');
const doneIdx = args.indexOf('--done');
const undoneIdx = args.indexOf('--undone');

// Indices that belong to a flag or its value, so the leftover positional is
// the route. Each `--x value` occupies two slots.
const consumed = new Set<number>();
for (const flag of ['--days', '--file', '--done', '--undone', '--port', '--host']) {
  const idx = args.indexOf(flag);
  if (idx >= 0) {
    consumed.add(idx);
    if (idx + 1 < args.length) consumed.add(idx + 1);
  }
}
const route = args.find((a, i) => !a.startsWith('--') && !consumed.has(i));

// `serve` is the plug-and-play path: run it in the repo and it owns the notes
// file, serves the endpoint and hands out the panel as one script tag, so a
// host with no Vite (or no build step at all) still gets the loop.
if (args[0] === 'serve') {
  const { serveIteration, DEFAULT_PORT } = await import('../serve/index');
  const port = Number(valueFor('--port') ?? DEFAULT_PORT);
  const served = await serveIteration({
    file,
    port,
    host: valueFor('--host'),
  });
  console.log(`iso-iterate serving on ${served.url}`);
  console.log(`  notes  ${file}`);
  console.log(`  panel  <script src="${served.bundleUrl}" defer></script>`);
  console.log(`  setup  ${served.url}  (script tag + bookmarklet)`);
  const stop = () => {
    void served.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {

const notes = readNotes(file);
const within = (iso: string, d: number) =>
  Date.now() - new Date(iso).getTime() < d * 86_400_000;

// --done / --undone: flip a note by id prefix (unique enough to act on).
const flipIdx = doneIdx >= 0 ? doneIdx : undoneIdx;
if (flipIdx >= 0) {
  const prefix = args[flipIdx + 1];
  if (!prefix) {
    console.error('Give the feedback id (prefix ok): iso-iterate --done <id>');
    process.exit(1);
  }
  const matches = notes.filter((n) => n.id.startsWith(prefix));
  if (matches.length === 0) {
    console.error(`No feedback id starting with "${prefix}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `Ambiguous prefix "${prefix}" (${matches.length} matches) — use more characters.`,
    );
    process.exit(1);
  }
  const setDone = doneIdx >= 0;
  matches[0].done = setDone;
  matches[0].doneAt = setDone ? new Date().toISOString() : null;
  writeNotes(file, notes);
  console.log(
    `${setDone ? 'done' : 'reopened'}: [${matches[0].id.slice(0, 8)}] ${matches[0].route} — ${matches[0].feedback.slice(0, 60)}`,
  );
  process.exit(0);
}

const rows = notes
  .filter((n) => (route ? n.route === route : true))
  .filter((n) => within(n.createdAt, days))
  .filter((n) => all || !n.done)
  .sort(
    (a, b) => a.route.localeCompare(b.route) || b.createdAt.localeCompare(a.createdAt),
  );

if (rows.length === 0) {
  console.log(
    `No ${all ? '' : 'open '}iteration notes${route ? ` for "${route}"` : ''} in the last ${days} days.`,
  );
  process.exit(0);
}

let cur = '';
for (const n of rows) {
  if (n.route !== cur) {
    cur = n.route;
    console.log(`\n## ${n.route}`);
  }
  const when = n.createdAt.slice(0, 16).replace('T', ' ');
  const done = n.done ? ' ✓done' : '';
  console.log(`- [${n.id.slice(0, 8)}] (${when})${done}`);
  if (n.element) {
    const label = n.element.text ? `"${n.element.text}"` : '(no text)';
    console.log(`  ↳ <${n.element.tag}> ${label} — ${n.element.selector}`);
  }
  const context = n.payload === undefined ? '' : describePayload(n.payload);
  if (context) console.log(`  · ${context}`);
  if (n.feedback) console.log(`  ${n.feedback}`);
}
console.log(`\n${rows.length} iteration note(s).`);

}

/**
 * One compact line of a note's host payload — the context that gives the note
 * its meaning, like the knob settings a design note was written against. A
 * flat map of scalars reads as `key=value`; anything else falls back to
 * compact JSON. Truncated, because this is a breadcrumb, not the data.
 */
function describePayload(payload: unknown, max = 300): string {
  if (payload === null) return '';
  let text: string;
  const flat = asFlatMap(payload);
  if (flat) {
    text = flat;
  } else {
    // A host that nests its context under one key (`{ variants: {...} }`) is
    // the common shape, and dumping it as JSON buries the part worth reading.
    const entries = asEntries(payload);
    const single = entries?.length === 1 ? entries[0] : null;
    const inner = single ? asFlatMap(single[1]) : null;
    if (single && inner) {
      text = `${single[0]}: ${inner}`;
    } else {
      try {
        text = JSON.stringify(payload) ?? '';
      } catch {
        return '(unserializable payload)';
      }
    }
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function asEntries(v: unknown): [string, unknown][] | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? Object.entries(v as Record<string, unknown>)
    : null;
}

/** `key=value key=value` when every value is a scalar, else null. */
function asFlatMap(v: unknown): string | null {
  const entries = asEntries(v);
  if (!entries?.length) return null;
  if (!entries.every(([, x]) => typeof x === 'string' || typeof x === 'number')) {
    return null;
  }
  return entries.map(([k, x]) => `${k}=${x}`).join(' ');
}
