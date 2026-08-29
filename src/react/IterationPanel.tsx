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

export interface IterationPanelProps {
  /** The current route; the panel hides itself when `rule` excludes it. */
  route: string;
  /** Store wiring — endpoint (the Vite plugin's URL) + optional namespace. */
  store: IterationStoreConfig;
  /** Route visibility. When omitted you get the safe default (hidden on the
   *  auth/error pages). Pass an explicit list to allow-list your app's pages. */
  rule?: RouteGateOptions;
}

/**
 * The Iteration panel: INTERNAL feedback for the coding agent. Notes are
 * Overall (default) or Element-scoped (a hover-highlight picker), autosave
 * ~1.2s after keystrokes, and list with edit/delete; done notes hide behind a
 * toggle. Renders a fixed bottom-right control and is DEV-only in practice —
 * gated here by `rule` and, for the plugin integration, by the consumer.
 */
export function IterationPanel({ route, store: storeCfg, rule }: IterationPanelProps) {
  const [store] = useState(() => createIterationStore(storeCfg));
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<IterationElement | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [feedback, setFeedback] = useState('');
  const [notes, setNotes] = useState<IterationNote[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noteIdRef = useRef<string | null>(null);
  const targetRef = useRef<IterationElement | null>(null);
  targetRef.current = target;

  const MAX_TEXTAREA_H = 168;
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_H)}px`;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: autosize reads only the ref; feedback drives the re-run.
  useEffect(() => autosize(textareaRef.current), [feedback]);

  const visible = isRouteVisible(route, rule);
  const openCount = notes?.filter((n) => !n.done).length ?? 0;
  const visibleNotes = notes?.filter((n) => showDone || !n.done) ?? [];
  const doneCount = notes?.filter((n) => n.done).length ?? 0;

  function upsertNote(id: string, text: string) {
    const element = targetRef.current;
    const entry: IterationNote = {
      id,
      route,
      feedback: text,
      element,
      done: false,
      createdAt: new Date().toISOString(),
    };
    setNotes((prev) => {
      if (!prev) return [entry];
      const i = prev.findIndex((n) => n.id === id);
      if (i === -1) return [entry, ...prev];
      const copy = [...prev];
      copy[i] = { ...copy[i], feedback: text, element };
      return copy;
    });
  }

  function flushNote() {
    const text = feedback.trim();
    if (text === '') return;
    const id = noteIdRef.current;
    const element = targetRef.current;
    void store
      .saveNote(route, text, element, id)
      .then((savedId) => upsertNote(savedId, text))
      .catch(() => {});
  }

  function resetComposer(resetScope: boolean) {
    setFeedback('');
    noteIdRef.current = null;
    setState('idle');
    if (resetScope) setTarget(null);
  }

  function editNote(note: IterationNote) {
    if (note.id !== noteIdRef.current) flushNote();
    setFeedback(note.feedback);
    noteIdRef.current = note.id;
    setTarget(note.element);
    setState('idle');
  }

  async function removeNote(id: string) {
    try {
      await store.deleteNote(id);
      setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev);
      if (noteIdRef.current === id) resetComposer(true);
    } catch {
      setState('error');
    }
  }

  // Load the route's notes the first time the panel opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load-once guard; store is stable.
  useEffect(() => {
    if (!open || notes !== null) return;
    store.listNotes(route).then(setNotes).catch(() => setNotes([]));
  }, [open, notes, route]);

  // Autosave 1.2s after the last keystroke.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate debounce; omitting store/upsert keeps it stable across renders.
  useEffect(() => {
    const text = feedback.trim();
    if (text === '') return;
    const timer = setTimeout(async () => {
      setState('saving');
      try {
        const id = await store.saveNote(route, text, targetRef.current, noteIdRef.current);
        noteIdRef.current = id;
        upsertNote(id, text);
        setState('saved');
      } catch {
        setState('error');
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [feedback, route]);

  // On close, finish the note; next open starts fresh (Overall).
  // biome-ignore lint/correctness/useExhaustiveDependencies: flush on close intentionally reads current state.
  useEffect(() => {
    if (open) return;
    flushNote();
    resetComposer(true);
  }, [open]);

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

  // Escape / outside click closes an open panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
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
  }, [open]);

  if (!visible) return null;

  return (
    <div ref={rootRef} data-iso-iterate className="iso-iter-root">
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
        className="iso-iter-fab"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <title>Iteration</title>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {picking
          ? 'Click an element · Esc'
          : openCount > 0
            ? `Iteration · ${openCount}`
            : 'Iteration'}
      </button>

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
        <div data-iso-iterate className="iso-iter-panel">
          <div className="iso-iter-seg">
            <button
              type="button"
              data-iso-iterate
              onClick={() => {
                if (target !== null) {
                  flushNote();
                  resetComposer(true);
                }
              }}
              className={target === null ? 'iso-iter-seg-on' : 'iso-iter-seg-off'}
            >
              Overall
            </button>
            <button
              type="button"
              data-iso-iterate
              onClick={() => {
                setOpen(false);
                setPicking(true);
              }}
              title={target ? 'Pick a different element' : 'Pick an element'}
              className={target !== null ? 'iso-iter-seg-on' : 'iso-iter-seg-off'}
            >
              Element
            </button>
          </div>

          {target && (
            <span title={target.selector} className="iso-iter-target">
              {target.tag}
              {target.text ? ` · ${target.text}` : ''}
            </span>
          )}

          <div className="iso-iter-compose">
            <textarea
              ref={textareaRef}
              value={feedback}
              onChange={(e) => {
                autosize(e.target);
                const value = e.target.value;
                if (value.trim() === '' && feedback.trim() !== '') {
                  noteIdRef.current = null;
                  setState('idle');
                }
                setFeedback(value);
              }}
              placeholder={
                target
                  ? 'Feedback on the selected element…'
                  : 'Overall feedback for the agent…'
              }
              rows={2}
              className="iso-iter-textarea"
            />
            <span className="iso-iter-save">
              {state === 'saving'
                ? 'Saving…'
                : state === 'saved'
                  ? 'Saved'
                  : state === 'error'
                    ? "Couldn't save"
                    : ''}
            </span>
          </div>

          {notes && notes.length > 0 && (
            <div className="iso-iter-list">
              <div className="iso-iter-list-head">
                <span>Notes · {visibleNotes.length}</span>
                {doneCount > 0 && (
                  <button
                    type="button"
                    data-iso-iterate
                    onClick={() => setShowDone((v) => !v)}
                  >
                    {showDone ? 'Hide done' : `Show done (${doneCount})`}
                  </button>
                )}
              </div>
              <ul>
                {visibleNotes.map((note) => (
                  <li key={note.id} className="iso-iter-note">
                    <div>
                      <p className={note.done ? 'iso-iter-done-text' : 'iso-iter-note-text'}>
                        {note.feedback}
                      </p>
                      <div className="iso-iter-note-meta">
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                        {note.element && (
                          <span title={note.element.selector}>
                            {note.element.tag}
                            {note.element.text ? ` · ${note.element.text}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="iso-iter-note-actions">
                      {!note.done && (
                        <button type="button" data-iso-iterate onClick={() => editNote(note)}>
                          edit
                        </button>
                      )}
                      <button
                        type="button"
                        data-iso-iterate
                        onClick={() => void removeNote(note.id)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}