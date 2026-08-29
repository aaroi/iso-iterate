import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { notesResponse, readNotes } from '../src/store';
import { serveNotesRequest } from '../src/server/index';

const dirs: string[] = [];
function tempFile() {
  const dir = mkdtempSync(join(tmpdir(), 'iso-iterate-'));
  dirs.push(dir);
  return join(dir, 'notes.json');
}
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

describe('notesResponse (transport-agnostic)', () => {
  it('creates, lists by route, and deletes a note', () => {
    const file = tempFile();

    const created = notesResponse(file, {
      method: 'POST',
      url: '/api/notes',
      body: { route: '/projects', feedback: 'hi', element: null },
    });
    expect(created.status).toBe(201);
    const id = created.body as { id: string };

    const listed = notesResponse(file, {
      method: 'GET',
      url: '/api/notes?route=/projects',
    });
    const rows = listed.body as Array<{ id: string; feedback: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].feedback).toBe('hi');

    expect(notesResponse(file, {
      method: 'DELETE',
      url: `/api/notes?id=${id.id}`,
    }).status).toBe(200);
    expect(readNotes(file)).toHaveLength(0);
  });

  it('validates and rejects empty feedback', () => {
    const file = tempFile();
    const r = notesResponse(file, {
      method: 'POST',
      url: '/api/notes',
      body: { route: '/x', feedback: '   ', element: null },
    });
    expect(r.status).toBe(400);
  });

  it('holds a 200 with an empty note list', () => {
    const file = tempFile();
    expect(notesResponse(file, { method: 'GET', url: '/api/notes' }).status).toBe(
      200,
    );
  });
});

describe('serveNotesRequest (fetch/gitworker adapter)', () => {
  it('handles a Web Request against the same store', async () => {
    const file = tempFile();
    const req = new Request('http://localhost:3000/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: '/',
        feedback: 'web request note',
        element: { tag: 'button', text: 'Go', selector: 'button:first-child' },
      }),
    });
    const res = await serveNotesRequest(file, req);
    expect(res.status).toBe(201);
    expect((res.body as { id: string }).id).toMatch(/^[0-9a-f-]+$/);

    const listed = await serveNotesRequest(
      file,
      new Request('http://localhost:3000/api/notes?route=/'),
    );
    const rows = listed.body as Array<{ element: { selector: string } | null }>;
    expect(rows[0].element?.selector).toBe('button:first-child');
  });
});