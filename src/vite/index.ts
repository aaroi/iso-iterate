/**
 * iso-iterate — Vite plugin.
 *
 * The one integration point a framework app needs. Registers the notes
 * endpoint (a dev middleware writing to a local gitignored file) and injects
 * the panel's self-mount into the served HTML, so the consumer never edits app
 * source. Dev-only: in `build` the plugin is inert.
 *
 * Injection is framework-agnostic: React Router and many SPA dev servers do
 * not run Vite's `transformIndexHtml`, so we instead wrap the HTML response
 * body in a `configureServer` middleware and append the mount script before
 * `</body>`. Works across Vite, RR7, and Next dev.
 */
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import type { Plugin, ResolvedConfig } from 'vite';

import { ensureFileIgnored, notesResponse, NOTES_ENDPOINT } from '../store';
import type { RouteGateOptions } from '../core/index';

export interface IterationViteOptions {
  /** Where notes persist. Defaults to `.iteration-feedback.json` under the
   *  working directory; git-ignored automatically via `.git/info/exclude`. */
  file?: string;
  /** Route visibility rule (denylist/allowlist) for the injected panel. */
  rule?: RouteGateOptions;
  /** localStorage namespace override. */
  key?: string;
}

/**
 * What `iteration()` hands back.
 *
 * Only `name` is public, and that is deliberate. iso-iterate is consumed as a
 * linked (`file:` / workspace) dependency, so TypeScript resolves the `vite`
 * import from *this* package's `node_modules`, not the consumer's. Two vite
 * type instances are nominally incompatible — rollup's plugin container
 * carries a private `_pluginContextMap` — and a single unassignable entry
 * poisons the overload resolution for the consumer's whole `plugins: []`
 * array, so every other plugin in it errors too. Vite's own `Plugin` requires
 * nothing but `name`, so a structural shape drops into any vite version's
 * `PluginOption` while the hooks below stay checked against the real vite
 * types inside this file.
 */
export interface IterationPlugin {
  name: string;
}

const DEFAULT_FILE = '.iteration-feedback.json';
const INJECTED = new WeakSet<ServerResponse>();
const VIRTUAL_ID = 'virtual:iso-iterate-mount';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export function iteration(options: IterationViteOptions = {}): IterationPlugin {
  const file = options.file ?? DEFAULT_FILE;
  let isDev = false;

  const plugin: Plugin = {
    name: 'iso:iteration',
    enforce: 'pre',
    configResolved(config: ResolvedConfig) {
      isDev = config.command === 'serve';
    },
    resolveId(id) {
      if (id === VIRTUAL_ID || id === RESOLVED_VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        return mountModuleSource(options.rule ?? {}, options.key ?? '');
      }
      return null;
    },
    configureServer(server) {
      if (!isDev) return;
      // Here, not at construction: a production build should not touch .git.
      ensureFileIgnored(resolve(file));

      // Notes endpoint → local file.
      server.middlewares.use(NOTES_ENDPOINT, (req, res, next) => {
        const method = req.method ?? '';
        if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          let body: unknown;
          if (method === 'POST') {
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              body = undefined;
            }
          }
          const { status, headers, body: payload } = notesResponse(
            resolve(file),
            { method, url: req.url, body },
          );
          res.statusCode = status;
          for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
          res.end(JSON.stringify(payload));
        });
      });

      // Pre-transform the mount module so its (bare) imports are rewritten to
      // browser-fetchable Vite URLs; inject that transformed code into HTML.
      let mountCodePromise: Promise<string> | null = null;
      const getMountCode = () => {
        mountCodePromise ??= server
          .transformRequest(VIRTUAL_ID)
          .then((m) => m?.code ?? '')
          .catch(() => '');
        return mountCodePromise;
      };

      server.middlewares.use((req, res, next) => {
        // Only navigations: buffering every response to look for </body>
        // would tax each of the hundreds of module requests a dev page makes.
        if (!(req.headers.accept ?? '').includes('text/html')) {
          next();
          return;
        }
        getMountCode().then((code) => {
          if (code) injectHtmlResponse(res, code);
          next();
        });
      });
    },
  };

  return plugin;
}

/** Source for the virtual mount module: a static import Vite resolves. */
function mountModuleSource(rule: RouteGateOptions, key: string): string {
  return `
    import { mountIteration } from 'iso-iterate/react';
    const prev = window.__isoIteration?.off;
    if (typeof prev === 'function') prev();
    window.__isoIteration = {
      off: mountIteration({
        endpoint: ${JSON.stringify(NOTES_ENDPOINT)},
        key: ${JSON.stringify(key)},
        rule: ${JSON.stringify(rule)},
      }),
    };
  `;
}

function injectHtmlResponse(res: ServerResponse, code: string): void {
  if (INJECTED.has(res)) return;
  INJECTED.add(res);

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let body = '';

  const consume = (chunk: string | Buffer) => {
    if (typeof chunk === 'string') body += chunk;
    else body += chunk.toString('utf8');
  };

  res.write = ((chunk: string | Buffer, ...rest: unknown[]) => {
    consume(chunk);
    return originalWrite(chunk, ...(rest as []));
  }) as unknown as ServerResponse['write'];

  res.end = ((...args: unknown[]) => {
    const finalChunk = args[0] as string | Buffer | undefined;
    if (typeof finalChunk === 'string' || finalChunk instanceof Buffer) {
      consume(finalChunk);
    }
    if (body.includes('<html') && body.includes('</body>')) {
      const script = `<script type="module" data-iso-iterate-inject>${code}</script>`;
      return originalEnd(
        body.replace('</body>', `${script}</body>`),
      );
    }
    return originalEnd(...(args as Parameters<ServerResponse['end']>));
  }) as unknown as ServerResponse['end'];
}