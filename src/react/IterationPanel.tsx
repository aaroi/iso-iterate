import { useEffect, useRef, useState } from 'react';

import {
  createIterationStore,
  describeIterationElement,
  elementAsNode,
  isRouteVisible,
  type IterationElement,
  type IterationNote,
  type IterationStoreConfig,
  type RouteGateOptions,
} from '../core/index';
import { ensurePanelStyles } from './styles';

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Excludes the panel's own chrome from element picking. */
function elementAt(e: MouseEvent): Element | null {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  return el && !el.closest('[data-iso-iterate]') ? el : null;
}

/** Compact mono timestamp: time today, date otherwise. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface IterationPanelProps {
  /** The current route; the panel hides itself when `rule` excludes it. */
  route: string;
  /** Store wiring — endpoint (the Vite plugin's URL) + optional namespace. */
  store: IterationStoreConfig;
  /** Route visibility. When omitted you get the safe default (hidden on the
   *  auth/error pages). Pass an explicit list to allow-list your app's pages. */
  rule?: RouteGateOptions;
  /**
   * Host context attached to each NEW note as its opaque `payload` — the state
   * that gives a note its meaning (e.g. the variant knob settings it was
   * written against). Called at send time. Edits never re-attach it: the
   * snapshot belongs to the moment the note was written.
   */
  getPayload?: () => unknown;
}

/**
 * The Iteration panel: INTERNAL feedback for the coding agent.
 *
 * The model is a chat with the agent. Notes list oldest→newest with the
 * composer pinned at the bottom, Enter sends (Shift+Enter for a newline), the
 * field clears instantly and keeps focus, and the new note appears right above
 * it — so writing five notes in a row is five sentences, no waiting, and
 * nothing under the cursor moves. A note optionally carries an element: the
 * crosshair in the composer starts the picker, and the pinned element rides
 * along as a removable chip. Unsent text survives close/reopen as a draft.
 */
export function IterationPanel({
  route,
  store: storeCfg,
  rule,
  getPayload,
}: IterationPanelProps) {
  const [store] = useState(() => createIterationStore(storeCfg));
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<IterationElement | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<IterationNote[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const draftKey = `${storeCfg.key ?? 'iso-iterate-feedback'}::draft::${route}`;

  const MAX_TEXTAREA_H = 148;
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_H)}px`;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: autosize reads only the ref; text drives the re-run.
  useEffect(() => autosize(textareaRef.current), [text]);

  const visible = isRouteVisible(route, rule);
  const openCount = notes?.filter((n) => !n.done).length ?? 0;
  const doneCount = notes?.filter((n) => n.done).length ?? 0;
  // Chat order: oldest at the top, newest right above the composer.
  const visibleNotes = (notes ?? [])
    .filter((n) => showDone || !n.done)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  /**
   * Send the composer. The field clears and keeps focus IMMEDIATELY — the
   * write happens behind an optimistic row, so the next note starts with the
   * next keystroke. The store falls back to localStorage when the endpoint is
   * down, so the catch path is a dev-server blip, not data loss.
   */
  function send() {
    const value = text.trim();
    if (value === '') return;
    const element = target;
    const editing = editingId;
    setText('');
    setTarget(null);
    setEditingId(null);
    try {
      window.localStorage.removeItem(draftKey);
    } catch {}
    textareaRef.current?.focus();

    if (editing) {
      setNotes((prev) =>
        prev?.map((n) => (n.id === editing ? { ...n, feedback: value, element } : n)) ??
        prev,
      );
      // Edits omit the payload on purpose: the stored snapshot stays.
      void store.saveNote(route, value, element, editing).catch(() => {});
      return;
    }

    const tempId = `pending-${Math.random().toString(36).slice(2)}`;
    const entry: IterationNote = {
      id: tempId,
      route,
      feedback: value,
      element,
      done: false,
      createdAt: new Date().toISOString(),
    };
    setNotes((prev) => (prev ? [...prev, entry] : [entry]));
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    void store
      .saveNote(route, value, element, null, getPayload?.(), viewport)
      .then((id) => {
        setNotes((prev) =>
          prev?.map((n) => (n.id === tempId ? { ...n, id } : n)) ?? prev,
        );
      })
      .catch(() => {
        setNotes((prev) => prev?.filter((n) => n.id !== tempId) ?? prev);
      });
  }

  function beginEdit(note: IterationNote) {
    setText(note.feedback);
    setTarget(note.element);
    setEditingId(note.id);
    textareaRef.current?.focus();
  }

  function cancelEdit() {
    setText('');
    setTarget(null);
    setEditingId(null);
  }

  async function removeNote(id: string) {
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev);
    if (editingId === id) cancelEdit();
    try {
      await store.deleteNote(id);
    } catch {}
  }

  // Load the route's notes the first time the panel opens; restore the draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load-once guard; store is stable.
  useEffect(() => {
    if (!open) return;
    if (notes === null) {
      store.listNotes(route).then(setNotes).catch(() => setNotes([]));
    }
    if (text === '') {
      try {
        const draft = window.localStorage.getItem(draftKey);
        if (draft) setText(draft);
      } catch {}
    }
  }, [open, notes, route]);

  // Unsent text survives close/reopen — the safety autosave used to provide,
  // without autosave's side effects (no phantom notes, no field-clearing).
  useEffect(() => {
    if (editingId) return; // an edit is not a draft
    try {
      if (text.trim() === '') window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, text);
    } catch {}
  }, [text, editingId, draftKey]);

  // Keep the newest note in view: the list sticks to its bottom edge.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll position follows list growth.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [notes, showDone, open]);

  // Focus the composer whenever the panel is in front of the reviewer.
  useEffect(() => {
    if (open && !picking) textareaRef.current?.focus();
  }, [open, picking]);

  // Selector mode: highlight the hovered element, capture the click.
  useEffect(() => {
    if (!picking) return;
    document.body.style.cursor = 'crosshair';
    const onMove = (e: MouseEvent) => {
      const el = elementAt(e);
      if (!el) return setHoverRect(null);
      const r = el.getBoundingClientRect();
      setHoverRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const onClick = (e: MouseEvent) => {
      const el = elementAt(e);
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setTarget(describeIterationElement(elementAsNode(el)));
      setPicking(false);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPicking(false);
        setOpen(true);
      }
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.cursor = '';
      setHoverRect(null);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [picking]);

  // Styles travel with the panel: a host embedding this component needs no CSS
  // import of ours, and a shadow-mounted one gets them inside its boundary
  // (where a stylesheet in document.head would never reach). Idempotent.
  useEffect(() => {
    if (!visible) return; // nothing rendered yet, so no root to style
    const root = rootRef.current?.getRootNode();
    if (root instanceof ShadowRoot || root instanceof Document) {
      ensurePanelStyles(root);
    }
  }, [visible]);

  // Escape backs out one layer (edit → panel); outside click closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingId) {
        setText('');
        setTarget(null);
        setEditingId(null);
      } else {
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      // composedPath, not `contains(e.target)`: a listener on window sees
      // events from inside a shadow root retargeted to the host, so `contains`
      // reports every click on our own panel as an outside click and the panel
      // closes under the cursor. The composed path still holds the real nodes.
      const root = rootRef.current;
      if (root && !e.composedPath().includes(root)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, editingId]);

  if (!visible) return null;

  return (
    <div ref={rootRef} data-iso-iterate className="iso-iter-root">
      {picking && (
        <span data-iso-iterate className="iso-iter-hint">
          click an element · esc cancels
        </span>
      )}

      {picking && hoverRect && (
        <div
          data-iso-iterate
          className="iso-iter-hover"
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}

      {open && !picking && (
        <div data-iso-iterate role="dialog" aria-label="Iteration notes" className="iso-iter-panel">
          {doneCount > 0 && (
            <div className="iso-iter-head">
              <button
                type="button"
                data-iso-iterate
                onClick={() => setShowDone((v) => !v)}
              >
                {showDone ? 'hide done' : `show done · ${doneCount}`}
              </button>
            </div>
          )}

          {visibleNotes.length > 0 && (
            <ul ref={listRef} className="iso-iter-list">
              {visibleNotes.map((note) => (
                <li
                  key={note.id}
                  className={[
                    'iso-iter-note',
                    note.done ? 'iso-iter-note-done' : '',
                    editingId === note.id ? 'iso-iter-note-editing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    data-iso-iterate
                    className="iso-iter-note-hit"
                    disabled={note.done}
                    title={note.done ? undefined : 'Click to edit'}
                    onClick={() => beginEdit(note)}
                  >
                    <p>{note.feedback}</p>
                    <div className="iso-iter-meta">
                      <span>{note.done ? '✓ done' : timeLabel(note.createdAt)}</span>
                      {note.element && (
                        <span className="iso-iter-el" title={note.element.selector}>
                          ↳ {note.element.tag}
                          {note.element.text ? ` · ${note.element.text}` : ''}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    data-iso-iterate
                    aria-label="Delete note"
                    className="iso-iter-x"
                    onClick={() => void removeNote(note.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="iso-iter-compose">
            {editingId && (
              <div className="iso-iter-editing">
                <span>editing note</span>
                <button type="button" data-iso-iterate onClick={cancelEdit}>
                  cancel
                </button>
              </div>
            )}
            {target && (
              <div className="iso-iter-chip" title={target.selector}>
                <span>
                  ↳ {target.tag}
                  {target.text ? ` · ${target.text}` : ''}
                </span>
                <button
                  type="button"
                  data-iso-iterate
                  aria-label="Remove pinned element"
                  onClick={() => setTarget(null)}
                >
                  ×
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                autosize(e.target);
                setText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                target ? 'Feedback on the pinned element…' : 'Feedback for the agent…'
              }
              rows={1}
              className="iso-iter-textarea"
            />
            <div className="iso-iter-toolbar">
              <button
                type="button"
                data-iso-iterate
                title="Pin an element"
                aria-label="Pin an element"
                className={target ? 'iso-iter-pick iso-iter-pick-on' : 'iso-iter-pick'}
                onClick={() => {
                  setOpen(false);
                  setPicking(true);
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <title>Pin an element</title>
                  <circle cx="12" cy="12" r="7" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
              </button>
              <button
                type="button"
                data-iso-iterate
                aria-label={editingId ? 'Save edit' : 'Send note'}
                title="Send — Enter"
                disabled={text.trim() === ''}
                className="iso-iter-send"
                onClick={send}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <title>Send</title>
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        data-iso-iterate
        onClick={() => {
          if (picking) {
            setPicking(false);
            setOpen(true);
          } else {
            setOpen((v) => !v);
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={openCount > 0 ? `Iteration — ${openCount} open notes` : 'Iteration'}
        className="iso-iter-fab"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <title>Iteration</title>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        {openCount > 0 && <span className="iso-iter-badge">{openCount}</span>}
      </button>
    </div>
  );
}
