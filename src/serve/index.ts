/**
 * iso-iterate — the standalone dev server.
 *
 * The plug-and-play path. Run it in the repo you are reviewing and it owns the
 * notes file, serves the endpoint, and hands out the panel as a single script
 * so the host app needs no build integration at all:
 *
 *   npx iso-iterate serve
 *   # then, in dev only, one line in the host's HTML:
 *   <script src="http://127.0.0.1:4123/iso-iterate.js" defer></script>
 *
 * Running it inside the repo is what keeps a note unambiguous: the process that
 * owns the file is the checkout the agent is working in, so a route and a
 * selector always point somewhere. Nothing about which port served the page has
 * to be mapped back to a repo.
 *
 * The Vite plugin remains the two-line convenience for a Vite host; this is for
 * every other runtime, and for a page whose dev server you cannot configure at
 * all (paste the bookmarklet the index page prints).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RouteGateOptions } from '../core/index';
import { ensureFileIgnored, notesResponse, NOTES_ENDPOINT } from '../store';

export const DEFAULT_PORT = 4123;
const BUNDLE_PATH = '/iso-iterate.js';

export interface ServeIterationOptions {
  /** Where notes persist. Git-ignored automatically via `.git/info/exclude`. */
  file: string;
  /** Defaults to 4123. */
  port?: number;
  /** Defaults to 127.0.0.1 — a dev loop has no business on 0.0.0.0. */
  host?: string;
  /** Route visibility rule handed to the panel. */
  rule?: RouteGateOptions;
  /** localStorage namespace for the panel. */
  key?: string;
}

export interface ServedIteration {
  port: number;
  url: string;
  bundleUrl: string;
  close(): Promise<void>;
}

/**
 * Only localhost may talk to this server.
 *
 * The endpoint writes a file, and a wide-open `*` would let any page you happen
 * to visit post notes into the repo you are reviewing. Restricting the allowed
 * origin to loopback keeps a drive-by from a public site out while leaving
 * every real dev origin (any localhost port, http or https) working.
 */
function allowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const { hostname, protocol } = new URL(origin);
    const loopback =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
    return loopback && (protocol === 'http:' || protocol === 'https:') ? origin : null;
  } catch {
    return null;
  }
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  const origin = allowedOrigin(req.headers.origin);
  res.setHeader('Vary', 'Origin');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

/** The IIFE bundle, next to this module in `dist/`. */
export function readBundle(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    // built: dist/serve.js sits beside the bundle
    resolve(here, 'iso-iterate.global.js'),
    resolve(here, '..', 'dist', 'iso-iterate.global.js'),
    // from source (tests): src/serve/ -> the repo's dist/
    resolve(here, '..', '..', 'dist', 'iso-iterate.global.js'),
  ]) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  throw new Error(
    'iso-iterate: the browser bundle is missing from dist/. Run `pnpm build`.',
  );
}

/** The bundle plus the mount call, with the config the server itself knows. */
function bundleWithMount(origin: string, opts: ServeIterationOptions): string {
  const config = JSON.stringify({
    endpoint: `${origin}${NOTES_ENDPOINT}`,
    key: opts.key ?? '',
    rule: opts.rule ?? {},
  });
  return `${readBundle()}\n;window.__isoIterate&&window.__isoIterate.mount(${config});\n`;
}

function bookmarklet(origin: string): string {
  return `javascript:(function(){var s=document.createElement('script');s.src=${JSON.stringify(
    `${origin}${BUNDLE_PATH}`,
  )};s.defer=true;document.body.appendChild(s);})()`;
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function indexPage(origin: string, file: string): string {
  const escaped = escapeHtml(`<script src="${origin}${BUNDLE_PATH}" defer></script>`);
  const mark = escapeHtml(bookmarklet(origin));
  return `<!doctype html>
<meta charset="utf-8"><title>iso-iterate</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: dark light }
  body { font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; max-width: 44rem;
         margin: 4rem auto; padding: 0 1.5rem }
  code, pre { font-family: ui-monospace, monospace; font-size: 0.9em }
  pre { padding: 0.9rem 1rem; border-radius: 8px; overflow-x: auto;
        background: color-mix(in oklab, currentColor 8%, transparent) }
  a.bm { display: inline-block; padding: 0.4rem 0.9rem; border-radius: 9999px;
         border: 1px solid currentColor; text-decoration: none; font-weight: 600 }
  p.muted { opacity: 0.7 }
</style>
<h1>iso-iterate is serving</h1>
<p>Notes are written to <code>${escapeHtml(file)}</code>.</p>
<h2>Add the panel to a dev page</h2>
<pre>${escaped}</pre>
<h2>Or, on any page you cannot edit</h2>
<p>Drag this to your bookmarks bar, then click it on the page you want to review.</p>
<p><a class="bm" href="${mark}">Iteration</a></p>
<h2>Read the notes</h2>
<pre>npx iso-iterate            # open notes, all routes
npx iso-iterate --done &lt;id&gt;  # mark addressed</pre>
<p class="muted">Dev-only. Loopback origins only, so a public page cannot post
into your repo.</p>
`;
}

/** Start the server. Resolves once it is listening. */
export function serveIteration(
  opts: ServeIterationOptions,
): Promise<ServedIteration> {
  const file = resolve(opts.file);
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? '127.0.0.1';
  ensureFileIgnored(file);

  // The port we were ASKED for is not necessarily the one we got: 0 means "any
  // free port". The panel's endpoint has to be the bound one or the bundle
  // ships a URL that answers nothing.
  let boundPort = port;

  const server: Server = createServer((req, res) => {
    cors(req, res);
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const method = req.method ?? 'GET';
    const origin = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${boundPort}`;

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (path === BUNDLE_PATH && method === 'GET') {
      let body: string;
      try {
        body = bundleWithMount(origin, opts);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(String(err instanceof Error ? err.message : err));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(body);
      return;
    }

    if (path === NOTES_ENDPOINT) {
      if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') {
        res.statusCode = 405;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'method not allowed' }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        let parsed: unknown;
        if (method === 'POST') {
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            parsed = undefined;
          }
        }
        const out = notesResponse(file, { method, url: req.url, body: parsed });
        res.statusCode = out.status;
        for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
        res.end(JSON.stringify(out.body));
      });
      return;
    }

    if (path === '/' && method === 'GET') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(indexPage(origin, file));
      return;
    }

    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('not found');
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      const actual = server.address();
      boundPort = typeof actual === 'object' && actual ? actual.port : port;
      const url = `http://${host}:${boundPort}`;
      ok({
        port: boundPort,
        url,
        bundleUrl: `${url}${BUNDLE_PATH}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
