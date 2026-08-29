import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureFileIgnored, notesResponse, readNotes, writeNotes } from '../src/store';

const dirs: string[] = [];

function tempFile() {
  const dir = mkdtempSync(join(tmpdir(), 'iso-iterate-'));
  dirs.push(dir);
  return join(dir, 'notes.json');
}

afterEach(() => {
  for (const d of dirs) {
    rmSync(d, { recursive: true, force: true });
  }
  dirs.length = 0;
});

function post(file: string, body: unknown) {
  return notesResponse(file, { method: 'POST', url: '/api/iteration/notes', body });
}

function get(file: string, url: string) {
  return notesResponse(file, { method: 'GET', url });
}

function del(file: string, id: string | null) {
  return notesResponse(file, {
    method: 'DELETE',
    url: `/api/iteration/notes${id ? `?id=${id}` : ''}`,
  });
}

describe('notesResponse', () => {
  it('starts empty, saves, lists by route, deletes', () => {
    const file = tempFile();

    const created = post(file, {
      route: '/projects',
      feedback: 'hello',
      element: null,
    });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    const listed = get(file, '/api/iteration/notes?route=/projects');
    const rows = listed.body as Array<{ id: string; feedback: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].feedback).toBe('hello');
    expect(readNotes(file)).toHaveLength(1);

    expect(del(file, id).status).toBe(200);
    expect(readNotes(file)).toHaveLength(0);
  });

  it('upserts by id instead of duplicating', () => {
    const file = tempFile();
    const first = post(file, { route: '/x', feedback: 'v1', element: null });
    const id = (first.body as { id: string }).id;
    const second = post(file, { id, route: '/x', feedback: 'v2', element: null });
    expect(second.status).toBe(200);
    expect(readNotes(file)).toHaveLength(1);
    expect(readNotes(file)[0].feedback).toBe('v2');
  });

  it('only lists open notes when no route is given', () => {
    const file = tempFile();
    post(file, { route: '/a', feedback: 'hi', element: null });
    post(file, { route: '/b', feedback: 'done me', element: null });
    // Mark /a done the way the CLI does: flip the stored note.
    const all = readNotes(file);
    const first = all.find((n) => n.route === '/a');
    if (first) first.done = true;
    writeNotes(file, all);
    const pending = get(file, '/api/iteration/notes');
    expect(
      (pending.body as Array<{ route: string }>).map((r) => r.route),
    ).toEqual(['/b']);
  });

  it('rejects a POST without feedback and a DELETE without an id', () => {
    const file = tempFile();
    expect(post(file, { route: '/x', feedback: '  ', element: null }).status).toBe(400);
    expect(del(file, null).status).toBe(400);
  });
});

describe('ensureFileIgnored', () => {
  it('is non-destructive outside a git repo', () => {
    expect(() => ensureFileIgnored(tempFile())).not.toThrow();
  });
});
