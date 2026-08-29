/**
 * iso-iterate — server.
 *
 * The transport-agnostic side of the loop: the file store and a pure request
 * handler that any dev runtime (Vite middleware, Next route handler, Bun.serve,
 * Vercel function, plain `node:http`) can render. No React and no Vite here —
 * keep this subpath framework-free.
 */

export {
  ensureFileIgnored,
  handleNotes,
  notesResponse,
  readNotes,
  writeNotes,
  NOTES_ENDPOINT,
  PAYLOAD_MAX,
} from '../store';
import { notesResponse } from '../store';
export type {
  IterationRequest,
  NotesRequest,
  NotesResponse,
  StoredNote,
} from '../store';

/**
 * A convenience Next-compatible adapter: given a `Request`/`NextRequest` and the
 * `file`, return a `NextResponse`-shaped `{ status, headers, body }`. Frameworks
 * that expose a `(req, res)` pair call `notesResponse` and render it directly.
 */
export async function serveNotesRequest(
  file: string,
  request: Request,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  let body: unknown;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }
  const url = new URL(request.url);
  return notesResponse(file, {
    method: request.method,
    url: `${url.pathname}?${url.searchParams.toString()}`,
    body,
  });
}