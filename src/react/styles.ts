/**
 * iso-iterate — the panel's styles, as a string.
 *
 * A string rather than a `.css` import so one source serves both mount modes:
 * `mountIteration` puts it inside a shadow root (where a stylesheet in
 * `document.head` would never reach), and a host embedding `<IterationPanel/>`
 * in its own tree gets it injected into the document. It also means a consumer
 * needs no CSS-capable bundler step and no import of ours.
 *
 * Every selector is namespaced `.iso-iter-*`, so nothing here matches host
 * markup even in the document-level case.
 */

const MARKER = 'data-iso-iterate-styles';

export const PANEL_CSS = `
/* The panel used to borrow the host page's reset — Tailwind preflight and
   friends gave it box-sizing and a button font reset. Inside a shadow
   root no document author styles cross the boundary (only inherited
   properties and custom properties do), so the reset has to travel with the
   panel or its buttons fall back to the UA default face and its padding math
   shifts. Scoped to our own subtree, so it changes nothing for a host that
   embeds the component in the document instead. */
.iso-iter-root,
.iso-iter-root *,
.iso-iter-root *::before,
.iso-iter-root *::after {
  box-sizing: border-box;
}
/* :where() keeps the reset at class-level specificity, so every component
   rule below it wins by source order — without it, background: none here
   silently beats .iso-iter-fab and the launcher renders transparent. */
.iso-iter-root :where(button, textarea) {
  font: inherit;
  color: inherit;
  margin: 0;
  background: none;
  border: 0;
  padding: 0;
}
.iso-iter-root :where(button) {
  cursor: pointer;
}
.iso-iter-root :where(ul, li, p) {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Two voices, deliberately: the host's sans (Inter where the host loads it)
   for what the reviewer writes, mono for everything the tool itself says —
   counts, times, selectors.

   Theme follows the page: the component samples the background under the
   panel corner and sets data-theme, so the control belongs on a light page
   and on a dark one without host configuration. Everything below reads from
   these tokens; nothing hardcodes a side. */
.iso-iter-root {
  --iso-sans: var(--font-sans, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif);
  --iso-mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace);
  --iso-bg: #131317;
  --iso-raised: #1b1b20;
  --iso-line: rgba(255, 255, 255, 0.09);
  --iso-edge: rgba(255, 255, 255, 0.16);
  --iso-fg: #ececf1;
  --iso-muted: #8f8f9a;
  --iso-faint: #5f5f6a;
  --iso-hover: rgba(255, 255, 255, 0.045);
  --iso-active: rgba(255, 255, 255, 0.07);
  --iso-shadow: 0 20px 56px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  --iso-fab-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  position: fixed;
  bottom: 1.25rem;
  right: 1.25rem;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.65rem;
  font-family: var(--iso-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--iso-fg);
  -webkit-font-smoothing: antialiased;
}
.iso-iter-root[data-theme='light'] {
  --iso-bg: #ffffff;
  --iso-raised: #f6f6f7;
  --iso-line: rgba(0, 0, 0, 0.1);
  --iso-edge: rgba(0, 0, 0, 0.16);
  --iso-fg: #1b1b20;
  --iso-muted: #71717c;
  --iso-faint: #9d9da6;
  --iso-hover: rgba(0, 0, 0, 0.045);
  --iso-active: rgba(0, 0, 0, 0.07);
  --iso-shadow: 0 20px 56px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08);
  --iso-fab-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
}

/* ── The one entry point: an icon, bottom right, everywhere ─────────────── */
.iso-iter-fab {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: var(--iso-raised);
  border: 1px solid var(--iso-line);
  color: var(--iso-fg);
  box-shadow: var(--iso-fab-shadow);
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.iso-iter-fab:hover {
  background: var(--iso-bg);
  border-color: var(--iso-edge);
}
.iso-iter-fab:active {
  transform: scale(0.96);
}
.iso-iter-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 9999px;
  display: grid;
  place-items: center;
  font-family: var(--iso-mono);
  font-size: 9.5px;
  line-height: 1;
  background: var(--iso-bg);
  border: 1px solid var(--iso-edge);
  color: var(--iso-muted);
}

/* ── The panel ──────────────────────────────────────────────────────────── */
.iso-iter-panel {
  width: 320px;
  max-height: min(70vh, 520px);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--iso-bg);
  border: 1px solid var(--iso-line);
  box-shadow: var(--iso-shadow);
  overflow: hidden;
}

.iso-iter-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 10px 12px 0;
  font-family: var(--iso-mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--iso-faint);
}
.iso-iter-head button {
  font-family: var(--iso-mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--iso-faint);
}
.iso-iter-head button:hover {
  color: var(--iso-muted);
}

/* Chat order: oldest up top, newest right above the composer. The list
   scrolls internally, so sending never moves the composer under the cursor.
   A note is one row — text left, time right — and one hit target: click
   anywhere on it to edit; delete floats in over the time on hover. */
.iso-iter-list {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
}
.iso-iter-head + .iso-iter-list {
  padding-top: 2px;
}
.iso-iter-note {
  position: relative;
}
.iso-iter-note-hit {
  display: block;
  width: 100%;
  text-align: left;
  padding: 5px 8px;
  border-radius: 8px;
  transition: background 100ms ease;
}
.iso-iter-note-hit:not(:disabled):hover {
  background: var(--iso-hover);
}
.iso-iter-note-hit:disabled {
  cursor: default;
}
.iso-iter-note-editing .iso-iter-note-hit {
  background: var(--iso-active);
}
.iso-iter-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.iso-iter-row p {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.iso-iter-note-done .iso-iter-row p {
  color: var(--iso-faint);
}
.iso-iter-when {
  flex: none;
  font-family: var(--iso-mono);
  font-size: 10px;
  color: var(--iso-faint);
  transition: opacity 100ms ease;
}
.iso-iter-note:hover .iso-iter-when {
  opacity: 0;
}
.iso-iter-meta {
  display: flex;
  align-items: baseline;
  margin-top: 1px;
  font-family: var(--iso-mono);
  font-size: 10px;
  color: var(--iso-faint);
  min-width: 0;
}
.iso-iter-el {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.iso-iter-x {
  position: absolute;
  top: 5px;
  right: 6px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  font-size: 13px;
  line-height: 1;
  color: var(--iso-muted);
  opacity: 0;
  transition: opacity 100ms ease, color 100ms ease;
}
.iso-iter-note:hover .iso-iter-x {
  opacity: 1;
}
.iso-iter-x:hover {
  color: var(--iso-fg);
}

/* ── The composer, pinned to the bottom ─────────────────────────────────── */
.iso-iter-compose {
  flex: none;
  border-top: 1px solid var(--iso-line);
  padding: 10px 12px 9px;
}
.iso-iter-panel .iso-iter-compose:first-child {
  border-top: 0;
}
.iso-iter-editing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
  font-family: var(--iso-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--iso-muted);
}
.iso-iter-editing button {
  font-family: var(--iso-mono);
  font-size: 10px;
  color: var(--iso-faint);
}
.iso-iter-editing button:hover {
  color: var(--iso-fg);
}
.iso-iter-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  margin-bottom: 7px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--iso-active);
  font-family: var(--iso-mono);
  font-size: 10.5px;
  color: var(--iso-muted);
}
.iso-iter-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.iso-iter-chip button {
  flex: none;
  color: var(--iso-faint);
  font-size: 12px;
  line-height: 1;
}
.iso-iter-chip button:hover {
  color: var(--iso-fg);
}
.iso-iter-textarea {
  display: block;
  width: 100%;
  resize: none;
  font-family: var(--iso-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--iso-fg);
  caret-color: var(--iso-fg);
}
.iso-iter-textarea::placeholder {
  color: var(--iso-faint);
}
.iso-iter-textarea:focus {
  outline: none;
}
.iso-iter-toolbar {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 7px;
}
.iso-iter-pick {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--iso-muted);
  transition: color 100ms ease, background 100ms ease;
}
.iso-iter-pick:hover {
  color: var(--iso-fg);
  background: var(--iso-hover);
}
.iso-iter-pick-on {
  color: var(--iso-fg);
  background: var(--iso-active);
}
.iso-iter-send {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  background: var(--iso-fg);
  color: var(--iso-bg);
  transition: opacity 100ms ease, transform 100ms ease;
}
.iso-iter-send:disabled {
  opacity: 0.22;
  cursor: default;
}
.iso-iter-send:not(:disabled):active {
  transform: scale(0.92);
}

/* ── Element picking ────────────────────────────────────────────────────── */
.iso-iter-hint {
  padding: 5px 11px;
  border-radius: 8px;
  background: var(--iso-raised);
  border: 1px solid var(--iso-line);
  box-shadow: var(--iso-fab-shadow);
  font-family: var(--iso-mono);
  font-size: 10.5px;
  letter-spacing: 0.03em;
  color: var(--iso-muted);
}
.iso-iter-hover {
  position: fixed;
  pointer-events: none;
  border: 1px solid rgba(120, 170, 255, 0.9);
  background: rgba(120, 170, 255, 0.12);
  border-radius: 2px;
  z-index: 2147483001;
}
`;

/**
 * Put the panel's styles in `target`, once. Idempotent: a second call with the
 * same root is a no-op, so several panels (or a remount) do not stack copies.
 *
 * `target` is whatever `getRootNode()` returns for the panel — a `ShadowRoot`
 * when mounted by `mountIteration`, the `Document` when a host embeds the
 * component directly.
 */
export function ensurePanelStyles(target: Document | ShadowRoot): void {
  const parent = target instanceof Document ? target.head : target;
  if (!parent || parent.querySelector(`[${MARKER}]`)) return;
  const style = (target instanceof Document ? target : target.ownerDocument)
    .createElement('style');
  style.setAttribute(MARKER, '');
  style.textContent = PANEL_CSS;
  // Prepend inside a shadow root so host-passed styles could still win, and
  // append in the document so the panel is not undercut by later app CSS.
  if (target instanceof Document) parent.appendChild(style);
  else parent.insertBefore(style, parent.firstChild);
}
