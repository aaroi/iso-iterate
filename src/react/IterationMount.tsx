import { createRoot } from 'react-dom/client';

import type { RouteGateOptions } from '../core/index';
import { IterationPanel } from './IterationPanel';
import { ensurePanelStyles } from './styles';

export interface MountIterationOptions {
  /** The notes endpoint the dev plugin serves (or a framework preset). */
  endpoint: string;
  /** Optional localStorage namespace for multi-app origins. */
  key?: string;
  /** Route visibility rule; default hides auth/error pages. */
  rule?: RouteGateOptions;
  /** Override the auto-detected pathname (sub-apps). Default: pathname. */
  getRoute?: () => string;
  /** Host context attached to each new note as its opaque payload — see
   *  IterationPanelProps.getPayload. */
  getPayload?: () => unknown;
}

/**
 * Self-mount the Iteration panel into a shadow root on `document.body`,
 * outside any app tree, tracking `window.location.pathname` so it needs no
 * router integration.
 *
 * The shadow root is what makes this safe to drop into an app nobody vetted:
 * the host's resets, its `button` and `textarea` rules, its stacking and its
 * global handlers stop at the boundary, so the panel looks the same in every
 * app. Inherited properties and custom properties still cross, which is
 * deliberate — the panel reads `--font-sans` and `--foreground` from the host
 * so it matches the surrounding theme.
 *
 * The host element carries `data-iso-iterate`, and that is load-bearing:
 * `document.elementFromPoint` retargets to the host for anything inside a
 * shadow root, so the element picker's self-exclusion matches on it.
 */
export function mountIteration(opts: MountIterationOptions): () => void {
  const host = document.createElement('div');
  host.setAttribute('data-iso-iterate', 'root');
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  // Eagerly, so the panel never paints one frame unstyled.
  ensurePanelStyles(shadow);
  const root = createRoot(shadow);

  const getRoute = opts.getRoute ?? (() => window.location.pathname);

  function render() {
    root.render(
      <IterationPanel
        route={getRoute()}
        store={{ endpoint: opts.endpoint, key: opts.key }}
        rule={opts.rule}
        getPayload={opts.getPayload}
      />,
    );
  }

  const listeners: (() => void)[] = [];
  // Called from popstate/history wrappers that a router may invoke from
  // inside its own commit (Next dev does this on navigation). Keep every
  // `root.render` off that path — a render scheduled mid-commit fires React
  // 19 dev's "useInsertionEffect must not schedule updates", so coalesze to
  // one pending frame and flush once the host has settled.
  let disposed = false;
  let pending = false;
  const notify = () => {
    if (pending || disposed) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (!disposed) render();
    }, 0);
  };

  // Deferred, not synchronous — the host may call mountIteration from an
  // effect (the lab mounts it from one), and a synchronous secondary root
  // render fires React 19 dev's "useInsertionEffect must not schedule
  // updates" because it commits while the host's own commit is in flight.
  // One macrotask later the host has settled; the panel simply mounts a
  // frame later, which is invisible because the host element starts empty.
  setTimeout(() => {
    if (disposed) return;
    render();
    window.addEventListener('popstate', notify);
    listeners.push(() => window.removeEventListener('popstate', notify));
    for (const evt of ['pushState', 'replaceState'] as const) {
      const orig = window.history[evt].bind(window.history);
      window.history[evt] = ((...a: Parameters<History['pushState']>) => {
        const r = orig(...a);
        notify();
        return r;
      }) as typeof orig;
      listeners.push(() => {
        window.history[evt] = orig as never;
      });
    }
  }, 0);

  return () => {
    disposed = true;
    for (const off of listeners) off();
    // Deferred, not synchronous: a React host calls this from an effect
    // cleanup, and unmounting our root while the host's render is in flight
    // is a race React 19 rejects ("Attempted to synchronously unmount a root
    // while React was already rendering"). One macrotask later the host's
    // commit is done; nothing observable changes for a vanilla host.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 0);
  };
}
