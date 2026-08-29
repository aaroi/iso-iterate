# iso-iterate

A dev-only **internal feedback loop** for coding agents. A one-line Vite
integration drops an **Iteration** control into any web app: reviewers write
page-wide or element-scoped notes by clicking the actual UI, notes autosave to
a local gitignored file, and the coding agent reads them and marks them done.
No database, no separate server to run, no permanent changes to the host repo's
source.

## What you get

| Piece | What it is | Where it lives |
|---|---|---|
| `IterationPanel` | React control (fixed bottom-right): Overall / Element notes, autosave, edit/delete, done toggle. Self-contained dark styles. | `iso-iterate/react` |
| Vite plugin | Serves `/api/iteration/notes` from a local file and injects the panel (no host mount line). | `iso-iterate/vite` |
| Server | The transport-free half: the file store plus `notesResponse(file, req)`, which returns `{ status, headers, body }` for any runtime to render. Imports no React and no Vite. | `iso-iterate/server` |
| Standalone server | `iso-iterate serve` — owns the notes file, serves the endpoint, and hands out the panel as one self-contained script. No build integration in the host. | `iso-iterate/serve` |
| CLI | `iso-iterate` reads notes and marks them done. | `iso-iterate/cli` / `npx` |
| Core | Note model, element descriptor, route allowlist, `localStorage` fallback. | `iso-iterate/core` |

## Plug into a new project

Two ways in. Use the server if the host is not a Vite app, or if you would
rather not touch its build at all.

### `iso-iterate serve` — one script tag, any framework

```bash
npx iso-iterate serve
```

Run it **inside the repo you are reviewing**. It owns the notes file, serves
`/api/iteration/notes`, and hands out the panel as a self-contained bundle with
React inside, so the host needs no bundler, no React and no build step:

```html
<!-- dev only -->
<script src="http://127.0.0.1:4123/iso-iterate.js" defer></script>
```

Running it in the repo is what keeps a note unambiguous — the process holding
the file is the checkout the agent works in, so nothing has to map a port back
to a repo. Open `http://127.0.0.1:4123` for the tag and a **bookmarklet**, which
is how you review a page whose dev server you cannot configure at all.

Only loopback origins may reach it, so a public page you happen to visit cannot
post into your repo.

### The Vite plugin — two lines, zero host HTML

An agent can wire this into any Vite/React repository in **two lines** and no
source edits. Tell the agent: *"Bring in `iso-iterate` and register its
Vite plugin; use `npx iso-iterate` to read reviewer notes."*

1. **Install:**
   ```bash
   npm install -D iso-iterate
   # or: pnpm add -D iso-iterate
   ```
2. **Register the plugin** in `vite.config.ts`:
   ```ts
   import { iteration } from 'iso-iterate/vite';
   export default defineConfig({ plugins: [iteration()] });
   ```
   That's everything. The plugin:
   - serves `/api/iteration/notes` (a dev middleware persisting to a local file),
   - injects the panel's self-mount into `index.html` (dev only),
   - auto-ignores the notes file via repo-local `.git/info/exclude` (no
     `.gitignore` edit, nothing committed),
   - defaults to hiding the panel on auth/error routes.

3. **The agent reads notes:**
   ```bash
   npx iso-iterate            # open notes, all routes
   npx iso-iterate /projects   # one route
   npx iso-iterate --done <id>  # mark addressed (id prefix ok)
   npx iso-iterate --all        # include done items
   ```

Revertable: remove the plugin line and the dev dependency and the loop is gone;
nothing else changed.

## Serving the endpoint from your own runtime

`iso-iterate serve` and the Vite plugin are two adapters over one core. If you
would rather serve the endpoint from a dev API you already run, do that. The Vite plugin is one adapter, not the product. The panel is a plain React
component and the store is plain Node, so any dev runtime can host the loop by
serving one endpoint from `iso-iterate/server`:

```ts
import { notesResponse, NOTES_ENDPOINT } from 'iso-iterate/server';

// Node/Connect/Express — render the returned parts onto your response.
const { status, headers, body } = notesResponse('.iteration-feedback.json', {
  method: req.method,
  url: req.url,
  body: parsedJsonBody,
});
res.statusCode = status;
for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
res.end(JSON.stringify(body));
```

For a `Request`-based runtime (Next route handler, Bun.serve, a Vercel
function) `serveNotesRequest(file, request)` does the parsing for you and
returns the same three parts. Mount the panel yourself (below) pointed at
whatever path you served it on, and the CLI reads the same file either way.

## Carrying your own context on a note

Some hosts have state that gives a note its meaning: the knob settings a design
note was written against, the selected tenant, a feature-flag set. Send it as
`payload` on the POST and iso-iterate stores and returns it verbatim, without
ever interpreting it:

```ts
await fetch(NOTES_ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ route, feedback, element, payload: { variants } }),
});
```

Omitting `payload` on a later autosave leaves the stored one alone, a host that
never sends one never sees the field, and the CLI prints a flat map as a
compact `key=value` breadcrumb under the note. Serialized payloads are capped
at 64 KB; over that (or unserializable) the POST is rejected rather than
silently truncated.

## Mounting on your own

Prefer to own the mount? You still can, without the plugin:

```tsx
import { IterationPanel } from 'iso-iterate/react';
// in any component whose render you control:
<IterationPanel route="/projects" store={{ endpoint: '/api/iteration/notes' }} />
```

The plugin is just the no-source-change convenience wrapper over this.

## Options

```ts
iteration({
  file: '.iteration-feedback.json', // where notes persist (auto-git-ignored)
  rule: { hidden: ['/login', '/error'] }, // route denylist/allowlist
  key: 'iso-iterate-feedback', // localStorage namespace for multi-app origins
})
```

The route rule supports `hidden` (denylist, with `+prefix` matching), `visible`
(an explicit allowlist that overrides `hidden`), and `alwaysHidden` (surfaces
that are never allowed even when allow-listed, e.g. `/api`, `/auth`, `/login`).

## Model

A note is `{ id, route, feedback, element?, payload?, done, doneAt?, createdAt }`
in a gitignored JSON file. `--done <id>` sets `done: true`; the panel hides done
notes by default, so the review queue drains as an agent answers notes.

`route` is only the scope string a note is filed under. It is a URL path in a
routed app, but nothing parses it, so a host that scopes by something else — a
design slug, a component name — can file notes under that instead. `payload`
is host-specific context iso-iterate stores and returns but never reads.

## Development

```bash
pnpm install
pnpm check        # typecheck + lint + test + build
```

## The panel is isolated from your app

`mountIteration` (and so the Vite plugin and the standalone bundle) renders the
panel into a **shadow root**. Your resets, your `button` and `textarea` rules,
your global handlers and your stacking stop at the boundary, so the panel looks
and behaves the same in an app nobody vetted it against. Inherited CSS custom
properties still cross, which is deliberate: the panel reads `--font-sans` and
`--foreground` from the host so it matches the surrounding theme.

Embedding `<IterationPanel/>` in your own tree instead puts it in the document,
where it has no such protection — but its selectors are all namespaced
`.iso-iter-*` and it carries its own reset, so it does not touch your markup
either way. No CSS import needed in either case.

## Status

Dev-only by design: the panel never renders in a production bundle (the plugin
injects under `import.meta.env.DEV`, and `mountIteration` is only ever called
by that injected dev script). There is no hosted feedback endpoint.