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
      />,
    );
  }
  render();

  const listeners: (() => void)[] = [];
  const notify = () => render();
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

  return () => {
    for (const off of listeners) off();
    root.unmount();
    host.remove();
  };
}
