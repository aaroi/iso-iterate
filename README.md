# iso-iterate

A dev-only feedback loop between a person reviewing a running web app and the
coding agent working on it. The reviewer writes notes on the page itself —
optionally pinned to a real element by clicking it — and the agent reads them
from a local file, acts on them, and marks them done.

Describing UI in chat goes wrong: "the second button in the third card" points
at three different things on three screens. A note written on the page carries
the route, a CSS selector for the pinned element, and the window size it was
written at, so the agent looks at the right thing at the right breakpoint.

Notes live in a gitignored JSON file in your repo. No database, no hosted
service, and nothing renders in a production build.

## Quick start

### Any app — one script tag

```bash
npx iso-iterate serve
```

Run it inside the repo you are reviewing. It owns the notes file, serves the
endpoint, and hands out the panel as one self-contained script — React
included, so the host needs no bundler, no React install, no build step:

```html
<!-- dev only -->
<script src="http://127.0.0.1:4123/iso-iterate.js" defer></script>
```

Open `http://127.0.0.1:4123` for this tag with a copy button, plus a
**bookmarklet** for pages whose dev server you can't configure at all. Only
loopback origins can reach the server, so a public page you happen to visit
cannot post into your repo.

### Vite — two lines, no HTML edit

```bash
npm install -D iso-iterate
```

```ts
// vite.config.ts
import { iteration } from 'iso-iterate/vite';
export default defineConfig({ plugins: [iteration()] });
```

The plugin serves the endpoint from the dev server and injects the panel into
the served HTML. Remove the two lines and the loop is gone; nothing else in
the repo changed.

## Reviewing

The panel is a small pen icon, bottom right, on every page (hidden on
auth/error routes). It works like a chat with the agent:

- Type a note, press **Enter**. The field clears instantly and keeps focus, so
  five notes is five sentences.
- The **crosshair** pins an element: hover highlights, click attaches it to
  the note as a removable chip.
- **Click a note** to edit it. Delete floats in on hover. Done notes hide
  behind a toggle, so the queue drains as the agent works.
- Unsent text survives closing the panel as a draft.

The panel renders in a shadow root, so your CSS can't restyle it and its CSS
can't touch your page — and it samples the page behind it to decide between
its light and dark look, so it belongs on either without configuration.

## The agent side

```bash
npx iso-iterate               # open notes, all routes
npx iso-iterate /projects     # one route
npx iso-iterate --done <id>   # mark addressed (id prefix is enough)
npx iso-iterate --undone <id> # reopen
npx iso-iterate --all         # include done items
npx iso-iterate --days 30     # widen the window
```

```
## /projects
- [a85a7b93] (2026-08-29 14:49 · 900×620)
  ↳ <button> "Join the waitlist" — #primary-cta
  Default label should be Get started, with cursor-pointer.
```

The header line carries the viewport the note was written at; the `↳` line is
the pinned element's selector. Tell your agent: an open note is a task — run
`npx iso-iterate` at the start of a session, act on what's open, and `--done`
each note so the reviewer's panel reflects it. AGENTS.md in this repo is a
drop-in brief for the agent.

## The note model

```jsonc
{
  "id": "a85a7b93-…",
  "route": "/projects",            // scope string; nothing parses it
  "feedback": "Default label should be Get started.",
  "element": { "tag": "button", "text": "Join the waitlist", "selector": "#primary-cta" },
  "viewport": { "w": 900, "h": 620 },
  "payload": { },                  // optional host context, never interpreted
  "done": false,
  "doneAt": null,
  "createdAt": "2026-08-29T11:49:03.401Z"
}
```

`route` is whatever scope the host mounts the panel with — a URL path in a
routed app, a design slug or component name elsewhere. `payload` carries
host-specific context (the variant knobs a design note was written against, a
feature-flag set); iso-iterate stores and returns it verbatim, caps it at
64 KB serialized, and the CLI prints a flat map as a `key=value` line.

## Options

```ts
iteration({
  file: '.iteration-feedback.json', // where notes persist (auto-git-ignored
                                    // via .git/info/exclude, no .gitignore edit)
  rule: { hidden: ['/login'] },     // route visibility
  key: 'my-app',                    // localStorage namespace per app
})
```

`serve` takes the same ideas as flags: `--port 4123`, `--file <path>`.

The route rule supports `hidden` (denylist), `visible` (allowlist, overrides
`hidden`) and `alwaysHidden` (never shown even when allow-listed; defaults to
`/api`, `/auth`, `/login`).

## Hosting the endpoint yourself

`serve` and the Vite plugin are two adapters over one core. To serve the
endpoint from a dev API you already run, use `iso-iterate/server`:

```ts
import { notesResponse } from 'iso-iterate/server';

const { status, headers, body } = notesResponse('.iteration-feedback.json', {
  method: req.method,
  url: req.url,
  body: parsedJsonBody,
});
```

Render those three onto your response — Node middleware, Next route handler,
Bun.serve, anything. `serveNotesRequest(file, request)` does the same for
`Request`-based runtimes. Mount the panel with `mountIteration` from
`iso-iterate/react` (or render `<IterationPanel/>` in your own tree) pointed
at whatever path you served.

## Development

```bash
pnpm install
pnpm check        # typecheck + lint + test + build
```

MIT.
