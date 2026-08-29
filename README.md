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
| CLI | `iso-iterate` reads notes and marks them done. | `iso-iterate/cli` / `npx` |
| Core | Note model, element descriptor, route allowlist, `localStorage` fallback. | `iso-iterate/core` |

## Plug into a new project (the whole guide)

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

A note is `{ id, route, feedback, element?, done, doneAt?, createdAt }` in a
gitignored JSON file. `--done <id>` sets `done: true`; the panel hides done
notes by default, so the review queue drains as an agent answers notes.

## Development

```bash
pnpm install
pnpm check        # typecheck + lint + test + build
```

## Status

Dev-only by design: the panel never renders in a production bundle (the plugin
injects under `import.meta.env.DEV`, and `mountIteration` is only ever called
by that injected dev script). There is no hosted feedback endpoint.