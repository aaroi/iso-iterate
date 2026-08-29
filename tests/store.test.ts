import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureFileIgnored, handleNotes, readNotes, writeNotes } from '../src/store';
import type { IterationRequest } from '../src/store';

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

/** A minimal capture of the handler's write into a Node-style res. Models a
 *  live response: the status the handler sets is the status we read back, so a
 *  handler that never sets one fails here instead of passing on the default. */
function capture() {
  let statusCode = 0;
  let body = '';
  const res: IterationRequest['res'] = {
    setStatus(code) {
      statusCode = code;
    },
    setHeader() {},
    end(b) {
      body = b ?? '';
    },
  };
  return { res, status: () => statusCode, body: () => body };
}

function post(file: string, body: unknown) {
  const c = capture();
  handleNotes(file, { method: 'POST', url: '/api/iteration/notes', body, res: c.res });
  return c;
}

function get(file: string, url: string) {
  const c = capture();
  handleNotes(file, { method: 'GET', url, res: c.res });
  return c;
}

function del(file: string, id: string | null) {
  const c = capture();
  handleNotes(file, {
    method: 'DELETE',
    url: `/api/iteration/notes${id ? `?id=${id}` : ''}`,
    res: c.res,
  });
  return c;
}

describe('handleNotes', () => {
  it('starts empty, saves, lists by route, deletes', () => {
    const file = tempFile();

    const created = post(file, {
      route: '/projects',
      feedback: 'hello',
      element: null,
    });
    expect(created.status()).toBe(201);
    const id = JSON.parse(created.body()).id as string;

    const listed = get(file, '/api/iteration/notes?route=/projects');
    const rows = JSON.parse(listed.body()) as Array<{ id: string; feedback: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].feedback).toBe('hello');
    expect(readNotes(file)).toHaveLength(1);

    expect(del(file, id).status()).toBe(200);
    expect(readNotes(file)).toHaveLength(0);
  });

  it('upserts by id instead of duplicating', () => {
    const file = tempFile();
    const first = post(file, { route: '/x', feedback: 'v1', element: null });
    const id = JSON.parse(first.body()).id as string;
    const second = post(file, { id, route: '/x', feedback: 'v2', element: null });
    expect(second.status()).toBe(200);
    expect(readNotes(file)).toHaveLength(1);
    expect(readNotes(file)[0].feedback).toBe('v2');
  });

  it('only lists open notes when no route is given', () => {
    const file = tempFile();
    const a = post(file, { route: '/a', feedback: 'hi', element: null });
    const id = JSON.parse(a.body()).id as string;
    post(file, { route: '/b', feedback: 'done me', element: null });
    // Mark /a done the way the CLI does: flip the stored note.
    const all = readNotes(file);
    const first = all[0];
    if (first) first.done = true;
    writeNotes(file, all);
    const pending = get(file, '/api/iteration/notes');
    expect(
      (JSON.parse(pending.body()) as Array<{ route: string }>).map((r) => r.route),
    ).toEqual(['/b']);
    expect(id).toBeTruthy();
  });

  it('rejects a POST without feedback and a DELETE without an id', () => {
    const file = tempFile();
    expect(
      post(file, { route: '/x', feedback: '  ', element: null }).status(),
    ).toBe(400);
    expect(del(file, null).status()).toBe(400);
  });
});

describe('ensureFileIgnored', () => {
  it('is non-destructive outside a git repo', () => {
    expect(() => ensureFileIgnored(tempFile())).not.toThrow();
  });
});