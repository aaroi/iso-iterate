# iso-iterate

Click the thing you want changed instead of describing it.

iso-iterate is a feedback loop between a person looking at a running web app
and the coding agent building it. A small panel sits bottom right of your dev
build. You write notes in it, and when a note is about a specific element you
press the crosshair and click that element. Each note lands in a JSON file in
your repo with the route, a CSS selector, and your window size. The agent
reads that file with one command, does the work, and marks each note done.
Done notes disappear from your panel, so the queue drains as the agent works.

Dev-only by design: nothing renders in a production build, and there is no
database and no hosted service, just a gitignored file.

## Who it's for

- Anyone reviewing their own app while an agent (Claude Code, Codex, Cursor,
  anything that can run a CLI) writes the code.
- A designer or PM reviewing a dev build who would rather click the button
  than file a ticket about it.
- Agents themselves: if you are an agent reading this, `npx iso-iterate`
  lists open notes. Treat each one as a task, reproduce at the viewport
  printed next to its timestamp, and run `npx iso-iterate --done <id>` when
  fixed.

## Why not the agent's built-in browser?

Claude Code and Codex can open your app themselves: screenshot it, click
around, verify a fix. That covers the agent looking at the app. iso-iterate
covers the other direction, you looking at the app and telling the agent what
to change.

- You review in your own browser, with your login, your extensions, and your
  real window sizes, on your own time. Notes queue up in the file; the agent
  works through them now or next session.
- A click hands the agent a selector, a route, and a viewport. A chat message
  hands it "the second button in the third card" and a guess.
- Feedback survives the conversation. Ten notes written tonight are still
  there for whichever agent, model, or tool picks them up tomorrow.

The two compose. You pin the note; the agent fixes it, verifies in its own
browser, and marks it done.

## Quick start

### Any app: one script tag

```bash
npx iso-iterate serve
```

Run it inside the repo you're reviewing, then add one line to your dev page:

```html
<script src="http://127.0.0.1:4123/iso-iterate.js" defer></script>
```

React ships inside the script, so the host needs no bundler, no React
install, and no build step. `http://127.0.0.1:4123` serves
this tag with a copy button and a bookmarklet for pages you can't edit.
Only loopback origins can reach the server, so a public page you happen to
visit cannot write into your repo.

### Vite: two lines, no HTML edit

```bash
npm install -D iso-iterate
```

```ts
// vite.config.ts
import { iteration } from 'iso-iterate/vite';
export default defineConfig({ plugins: [iteration()] });
```

The plugin serves the endpoint from the dev server and injects the panel.
Remove the two lines and the loop is gone; nothing else changed.

## Using the panel

It works like a chat with the agent:

- Type, press **Enter**. The field clears instantly and keeps focus.
- The crosshair pins an element. Hover highlights, click attaches.
- Click a note to edit it; delete appears on hover; long notes truncate to
  one line (hover for the full text).
- Unsent text survives closing the panel.

The panel renders in a shadow root, so your CSS can't restyle it and its CSS
can't touch your page. It samples the page behind it and matches it, light or
dark, with no configuration.

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

`900×620` is the reviewer's window size; layout feedback only means
something at the breakpoint it was seen on. The `↳` line is the pinned
element. AGENTS.md in this repo is a drop-in brief for your agent.

## The note

```jsonc
{
  "id": "a85a7b93-…",
  "route": "/projects",           // scope string; nothing parses it
  "feedback": "Default label should be Get started.",
  "element": { "tag": "button", "text": "Join the waitlist", "selector": "#primary-cta" },
  "viewport": { "w": 900, "h": 620 },
  "payload": { },                 // optional host context, stored verbatim
  "done": false,
  "doneAt": null,
  "createdAt": "2026-08-29T11:49:03.401Z"
}
```

`route` is whatever scope the host mounts the panel with: a URL path in a
routed app, a design slug elsewhere. `payload` carries host context the store
never interprets (the variant knobs a note was written against, a flag set),
capped at 64 KB serialized; the CLI prints a flat map as a `key=value` line.

## Options

```ts
iteration({
  file: '.iteration-feedback.json', // where notes persist; auto-ignored via
                                    // .git/info/exclude, no .gitignore edit
  rule: { hidden: ['/login'] },     // route visibility
  key: 'my-app',                    // localStorage namespace per app
})
```

`serve` takes `--port 4123` and `--file <path>`. The route rule supports
`hidden` (denylist), `visible` (allowlist, overrides `hidden`) and
`alwaysHidden` (never shown even when allow-listed; defaults to `/api`,
`/auth`, `/login`).

## Hosting the endpoint yourself

`serve` and the Vite plugin are two adapters over one core. To serve the
endpoint from a dev API you already run:

```ts
import { notesResponse } from 'iso-iterate/server';

const { status, headers, body } = notesResponse('.iteration-feedback.json', {
  method: req.method,
  url: req.url,
  body: parsedJsonBody,
});
```

Render those three onto your response from Node middleware, a Next route
handler, Bun.serve, anything. `serveNotesRequest(file, request)` does the same for
`Request`-based runtimes. Mount the panel with `mountIteration` from
`iso-iterate/react` (or render `<IterationPanel/>` in your own tree) pointed
at whatever path you served.

## Development

```bash
pnpm install
pnpm check        # typecheck + lint + test + build
```

MIT.
