/**
 * End-to-end check of the Vite adapter, in-process: a real dev server with
 * the plugin registered, serving a real index.html.
 *
 * This is the gate the unit tests could not give us. The plugin's two jobs —
 * injecting the mount script into whatever HTML the host serves, and serving
 * the notes endpoint — both live in `configureServer` middleware, so nothing
 * short of a running server exercises them.
 *
 * The fixture root sits inside the repo so `react` resolves by walking up,
 * and `iso-iterate/react` is aliased to the source the way a consumer's
 * installed copy would resolve it.
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

import { iteration } from '../src/vite/index';
import { NOTES_ENDPOINT } from '../src/store';

let server: ViteDevServer;
let root: string;
let notesFile: string;
let origin: string;

beforeAll(async () => {
  root = mkdtempSync(resolve(import.meta.dirname, '..', '.tmp-vite-'));
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><html><head><title>host</title></head><body><div id="app"></div></body></html>',
  );
  notesFile = join(root, 'notes.json');

  server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    // watch: null — the fixture never changes. noDiscovery — the virtual
    // module's react imports otherwise schedule a background esbuild
    // prebundle, and close() racing that run was a coin-flip teardown hang
    // (reproduced 50/50 outside vitest; 0/8 with the optimizer off).
    server: { port: 0, host: '127.0.0.1', watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      alias: {
        'iso-iterate/react': resolve(import.meta.dirname, '..', 'src/react/index.ts'),
      },
    },
    plugins: [iteration({ file: notesFile })],
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  // fetch() keeps its connections alive, and vite's close() waits for open
  // sockets — without this the suite passes and then hangs in teardown.
  (server?.httpServer as import('node:http').Server | null)?.closeAllConnections?.();
  await server?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('the Vite adapter, served', () => {
  it('injects the mount script into the host HTML without a source edit', async () => {
    // A browser navigation asks for text/html; injection is gated on that so
    // module and asset responses are never buffered.
    const html = await (
      await fetch(`${origin}/`, { headers: { accept: 'text/html' } })
    ).text();
    // The host's own markup survives...
    expect(html).toContain('<div id="app"></div>');
    // ...and the mount rides in before </body>, carrying real transformed code
    // (an empty script would mean transformRequest silently failed).
    expect(html).toContain('data-iso-iterate-inject');
    const script = html.slice(
      html.indexOf('data-iso-iterate-inject'),
      html.indexOf('</body>'),
    );
    expect(script).toContain('mountIteration');
    expect(script.length).toBeGreaterThan(200);
  });


  it('leaves non-HTML requests alone', async () => {
    const res = await fetch(`${origin}/`, { headers: { accept: '*/*' } });
    expect((await res.text())).not.toContain('data-iso-iterate-inject');
  });

  it('serves the notes endpoint against the configured file', async () => {
    const created = await fetch(`${origin}${NOTES_ENDPOINT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: '/projects',
        feedback: 'the runtime tile blanks for every org but the first',
        element: { tag: 'span', text: 'platform-api', selector: 'td > span' },
        payload: { fixture: 'console' },
      }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    expect(existsSync(notesFile)).toBe(true);
    const onDisk = JSON.parse(readFileSync(notesFile, 'utf8')) as Array<{
      route: string;
      payload?: unknown;
    }>;
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0].route).toBe('/projects');
    expect(onDisk[0].payload).toEqual({ fixture: 'console' });

    const listed = (await (
      await fetch(`${origin}${NOTES_ENDPOINT}?route=/projects`)
    ).json()) as Array<{ id: string; element: { text: string } | null }>;
    expect(listed[0].id).toBe(id);
    expect(listed[0].element?.text).toBe('platform-api');

    const deleted = await fetch(`${origin}${NOTES_ENDPOINT}?id=${id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(200);
    expect(JSON.parse(readFileSync(notesFile, 'utf8'))).toHaveLength(0);
  });
});
