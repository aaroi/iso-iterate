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
.iso-iter-root button,
.iso-iter-root textarea {
  font: inherit;
  color: inherit;
  margin: 0;
  background: none;
  border: 0;
  padding: 0;
}
.iso-iter-root button {
  cursor: pointer;
}
.iso-iter-root ul,
.iso-iter-root li,
.iso-iter-root p {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Two voices, deliberately: the host's sans (Inter where the host loads it)
   for what the reviewer writes, mono for everything the tool itself says —
   counts, times, selectors, key hints. */
.iso-iter-root {
  --iso-sans: var(--font-sans, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif);
  --iso-mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace);
  --iso-bg: #131317;
  --iso-raised: #1b1b20;
  --iso-line: rgba(255, 255, 255, 0.09);
  --iso-fg: #ececf1;
  --iso-muted: #8f8f9a;
  --iso-faint: #5f5f6a;
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

/* ── The one entry point: an icon, bottom right, everywhere ─────────────── */
.iso-iter-fab {
  position: relative;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 9999px;
  background: var(--iso-raised);
  border: 1px solid var(--iso-line);
  color: var(--iso-fg);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.iso-iter-fab:hover {
  background: #232329;
  border-color: rgba(255, 255, 255, 0.16);
}
.iso-iter-fab:active {
  transform: scale(0.96);
}
.iso-iter-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9999px;
  display: grid;
  place-items: center;
  font-family: var(--iso-mono);
  font-size: 10px;
  line-height: 1;
  background: var(--iso-fg);
  color: #131317;
}

/* ── The panel ──────────────────────────────────────────────────────────── */
.iso-iter-panel {
  width: 320px;
  max-height: min(70vh, 520px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--iso-bg);
  border: 1px solid var(--iso-line);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.iso-iter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
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
   scrolls internally, so sending never moves the composer under the cursor. */
.iso-iter-list {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 6px;
}
.iso-iter-note {
  padding: 7px 8px 8px;
  border-radius: 10px;
}
.iso-iter-note:hover {
  background: rgba(255, 255, 255, 0.035);
}
.iso-iter-note p {
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.iso-iter-note-done p {
  color: var(--iso-faint);
}
.iso-iter-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 3px;
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
.iso-iter-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
  flex: none;
  opacity: 0;
  transition: opacity 100ms ease;
}
.iso-iter-note:hover .iso-iter-actions {
  opacity: 1;
}
.iso-iter-actions button {
  font-family: var(--iso-mono);
  font-size: 10px;
  color: var(--iso-muted);
}
.iso-iter-actions button:hover {
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
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
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
  border-radius: 8px;
  color: var(--iso-muted);
  transition: color 100ms ease, background 100ms ease;
}
.iso-iter-pick:hover {
  color: var(--iso-fg);
  background: rgba(255, 255, 255, 0.06);
}
.iso-iter-pick-on {
  color: var(--iso-fg);
  background: rgba(255, 255, 255, 0.08);
}
.iso-iter-key {
  margin-left: auto;
  font-family: var(--iso-mono);
  font-size: 9.5px;
  letter-spacing: 0.03em;
  color: var(--iso-faint);
  user-select: none;
}
.iso-iter-send {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  background: var(--iso-fg);
  color: #131317;
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
  border-radius: 9999px;
  background: var(--iso-raised);
  border: 1px solid var(--iso-line);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
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
  border-radius: 3px;
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
