import { createRoot } from 'react-dom/client';

import type { RouteGateOptions } from '../core/index';
import { IterationPanel } from './IterationPanel';

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
 * Self-mount the Iteration panel into `document.body`, outside any app tree,
 * tracking `window.location.pathname` so it needs no router integration. Used
 * by the Vite plugin's auto-injection so a consumer never edits app source.
 */
export function mountIteration(opts: MountIterationOptions): () => void {
  const host = document.createElement('div');
  host.dataset.isoIteration = 'root';
  document.body.appendChild(host);
  const root = createRoot(host);

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