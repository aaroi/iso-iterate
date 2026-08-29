# iso-iterate — for agents

A dev-only internal feedback loop between a human reviewing a web app and the
coding agent working on it. The reviewer drops notes on real UI elements; the
agent reads them and marks them addressed.

## The loop

1. The reviewer opens the **Iteration** control (the icon bottom-right of the
   app) and writes notes like chat messages — Enter sends, and a note
   optionally carries a pinned element (the crosshair in the composer: hover
   to highlight, click to pin).
2. Notes persist to a local gitignored JSON file (default
   `.iteration-feedback.json` in the working dir), served by the Vite plugin
   (`/api/iteration/notes`).
3. You read them and mark them done as you address them.

## Reading & marking notes

```bash
npx iso-iterate               # open notes, all routes
npx iso-iterate /projects     # one route
npx iso-iterate --days 30     # widen the window
npx iso-iterate --all         # include done items
npx iso-iterate --done <id>   # mark addressed — id prefix is enough
npx iso-iterate --undone <id> # reopen
```

An **open note is a task**. At the start of a session, run `npx
iso-iterate` (or point the plugin's `file` and read that path) and act on
what's open. When you fix it, `--done <id>` so the reviewer's panel reflects it.

A note may carry host context on a `·` line — a compact `key=value`
breadcrumb of the state it was written against (the knob settings for a design
note, the active fixture, the selected tenant). Treat it as the conditions to
reproduce under, not as instructions.

An element-scoped note prints the pin target:

```
↳ <span> "platform-api" — tr:nth-child(1) > td:nth-child(1) > div:nth-child(1) > span:nth-child(1)
```

That path is the debugging breadcrumb: find that node in the current page's
DOM, then the component/file that renders it. Route is the URL the note was
written on.

## Conventions

- `--done` uses the id *prefix* (unique is enough); ambiguous prefixes are
  rejected.
- `route` is only a scope string. It is a URL path in a routed app, but nothing
  parses it — a host may file notes under a design slug or component name.
- Done notes hide in the panel by default (a "Show done" toggle reveals them),
  so feedback drains as you work.
- There is no hosted endpoint and no database; everything is the local file.
- Nothing here renders in a production build.

## Standing the loop up

Two ways, depending on the host:

```bash
npx iso-iterate serve        # any framework: one <script src> in the host's dev HTML
                             # (or the bookmarklet at http://127.0.0.1:4123)
```

or, for a Vite host, register `iteration()` from `iso-iterate/vite` in
`vite.config.ts` — two lines, no host HTML.

Run `serve` **inside the repo being reviewed**. The process that owns the notes
file is then the checkout you are working in, so a note's route and selector
always point at code you can open.

## Publishing this package

Not yet published to any registry; consumed as a local/git dependency today.
The `bin` (`iso-iterate`) and the `react`/`core`/`server`/`vite`/`cli` subpath
exports are stable shapes to build against (`pnpm build` produces `dist/`).

`iso-iterate/vite` is one adapter, not the boundary. `iso-iterate/server`
holds the transport-free half — the file store and `notesResponse(file, req)
=> { status, headers, body }` — so a Next route handler, `Bun.serve`, a Vercel
function or plain `node:http` can serve the same endpoint against the same
file. It imports neither React nor Vite. Because iso-iterate is consumed as a
linked dependency, `iteration()` deliberately returns a structural
`IterationPlugin` rather than vite's own `Plugin` type: two vite type
instances are nominally incompatible, and one unassignable entry makes a
consumer's whole `plugins: []` array fail to typecheck.