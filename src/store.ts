/**
 * File-backed store for iteration notes — shared by the Vite plugin (dev
 * server) and the CLI. Notes live in a gitignored JSON file on disk, no
 * database. The path comes from the plugin/CLI options.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { IterationElement } from './core/index';

export interface StoredNote {
  id: string;
  route: string;
  feedback: string;
  element: IterationElement | null;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
}

export function readNotes(file: string): StoredNote[] {
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, 'utf8').trim();
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as StoredNote[]) : [];
  } catch {
    return [];
  }
}

export function writeNotes(file: string, notes: StoredNote[]): void {
  writeFileSync(file, `${JSON.stringify(notes, null, 2)}\n`);
}

/**
 * Ensure the feedback file path is ignored by git via the repo-local
 * `.git/info/exclude` (never committed), so a consumer needs no `.gitignore`
 * edit. Idempotent and non-destructive; never fails the dev server.
 */
export function ensureFileIgnored(file: string): void {
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    const infoExclude = `${gitRoot}/.git/info/exclude`;
    const absolute = resolve(file);
    const existing = existsSync(infoExclude) ? readFileSync(infoExclude, 'utf8') : '';
    if (existing.includes(absolute)) return;
    const marker = existing && !existing.endsWith('\n') ? '\n' : '';
    writeFileSync(
      infoExclude,
      `${existing}${marker}# iso-iterate (local dev feedback loop)\n${absolute}\n`,
    );
  } catch {
    // A stray dev-only feedback file is non-fatal if we can't ignore it.
  }
}

function toItem(n: StoredNote) {
  return {
    id: n.id,
    route: n.route,
    feedback: n.feedback,
    element: n.element,
    done: n.done,
    createdAt: n.createdAt,
  };
}

export interface IterationRequest {
  method?: string;
  url?: string;
  /** Collected request body for POST. */
  body?: unknown;
  res: {
    statusCode: number;
    setHeader(key: string, value: string): void;
    end(body?: string): void;
  };
}

/** The transport-agnostic result of a notes request — any runtime (Vite
 *  middleware, Next route handler, Bun serve, Vercel) can render it. */
export interface NotesResponse {
  status: number;
  /** Response headers object (frame works set them on their own res). */
  headers: Record<string, string>;
  /** The JSON payload to send. */
  body: unknown;
}

/** A request the pure handler understands (framework-neutral). */
export interface NotesRequest {
  method?: string;
  url?: string;
  body?: unknown;
}

/**
 * The transport-agnostic core of the notes endpoint. Reads/writes the local
 * file and returns a `{ status, headers, body }` the caller renders. Works
 * under Vite middleware, Next route handler, Bun.seerve, or Vercel.
 */
export function notesResponse(file: string, req: NotesRequest): NotesResponse {
  const method = req.method ?? '';
  const query = Object.fromEntries(
    new URL(req.url ?? '/', 'http://localhost').searchParams,
  );
  const json = (status: number, body: unknown): NotesResponse => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body,
  });

  if (method === 'GET') {
    const route = String(query.route ?? '');
    const notes = readNotes(file);
    const rows = (
      route ? notes.filter((n) => n.route === route) : notes.filter((n) => !n.done)
    )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toItem);
    return json(200, rows);
  }

  if (method === 'DELETE') {
    const id = String(query.id ?? '');
    if (!id) return json(400, { error: 'id is required' });
    writeNotes(file, readNotes(file).filter((n) => n.id !== id));
    return json(200, { ok: true });
  }

  if (method === 'POST') {
    const body = (req.body ?? {}) as {
      id?: unknown;
      route?: unknown;
      feedback?: unknown;
      element?: unknown;
    };
    const { id, route, feedback, element } = body;
    if (typeof route !== 'string' || route === '') {
      return json(400, { error: 'route is required' });
    }
    const cleanFeedback =
      typeof feedback === 'string' ? feedback.trim().slice(0, 4000) : '';
    if (cleanFeedback === '') {
      return json(400, { error: 'feedback is required' });
    }
    let cleanElement: IterationElement | null = null;
    if (element && typeof element === 'object' && !Array.isArray(element)) {
      cleanElement = {
        tag: cap(String((element as { tag?: unknown }).tag ?? ''), 30),
        text: cap(String((element as { text?: unknown }).text ?? ''), 120),
        selector: cap(
          String((element as { selector?: unknown }).selector ?? ''),
          300,
        ),
      };
    }
    const notes = readNotes(file);
    if (typeof id === 'string' && id !== '') {
      const existing = notes.find((n) => n.id === id && n.route === route);
      if (existing) {
        existing.feedback = cleanFeedback;
        existing.element = cleanElement;
        writeNotes(file, notes);
        return json(200, { id: existing.id });
      }
    }
    const newId = randomUUID();
    notes.push({
      id: newId,
      route,
      feedback: cleanFeedback,
      element: cleanElement,
      done: false,
      doneAt: null,
      createdAt: new Date().toISOString(),
    });
    writeNotes(file, notes);
    return json(201, { id: newId });
  }

  return json(405, { error: 'method not allowed' });
}

/** Serve GET/POST/DELETE on the notes endpoint from a local file (the Vite
 *  middleware / imperative adapters). Kept so the plugin stays unchanged. */
export function handleNotes(file: string, req: IterationRequest) {
  const { status, headers, body } = notesResponse(file, {
    method: req.method,
    url: req.url,
    body: req.body,
  });
  req.res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) req.res.setHeader(k, v);
  req.res.end(JSON.stringify(body));
}

function cap(v: string, max: number): string {
  return v.slice(0, max);
}

/** The endpoint path the client calls. */
export const NOTES_ENDPOINT = '/api/iteration/notes';