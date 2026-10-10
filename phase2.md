# Phase 2 — Report

Second pass on the HedgeDoc fork: the production Docker image reconstructed
with pnpm, the package-manager migration completed in CI and tooling, the new
Notes list for finding notes that fell out of the history, and the editor gaps
left open by phase 1 (imports, note state controls, spellcheck). The work
shipped as commit `797bcb000` ("Phase 2"); this trace was written afterwards,
together with [phase3.md](phase3.md).

## What was changed

### Docker image

- New [Dockerfile](Dockerfile), reconstructed from the running
  `quay.io/hedgedoc/hedgedoc:1.12.0` image ([original_dockerfile.txt](original_dockerfile.txt))
  with the build switched to pnpm: a build stage (corepack-pinned pnpm,
  `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm prune --prod`) and a
  runtime stage on `node:24.18.0-bookworm` with a non-root `hedgedoc` user
  (10000:10000), gosu privilege drop, OCI labels, the legacy `/codimd`
  symlink, and the runtime config symlinked from `/files/config.json`.
- New [resources/docker-entrypoint.sh](resources/docker-entrypoint.sh): drops
  root via gosu, maps legacy `HMD_*` variables to `CMD_*`, warns when
  filesystem uploads run without a mounted volume, and fixes up uploads
  directory permissions when started as root.
- New [resources/healthcheck.mjs](resources/healthcheck.mjs): probes
  `/_health` with a 5-second timeout and requires `"ready": true`.
- [docs/content/setup/docker.md](docs/content/setup/docker.md) documents the
  image and the `/files/config.json` bind-mount point.
- [resources/config.json](resources/config.json) (which the Dockerfile `COPY`s
  to `/files/config.json`) was kept out of the commit and out of `git status`
  by the repository's bare `config.json` ignore rule — it can never reach a
  clone that way, breaking `docker build`. The ignore rule now un-ignores the
  path ([.gitignore](.gitignore)); the content is an empty config object,
  matching the upstream container image, with everything else configured
  through `CMD_*` environment variables.

### CI and tooling move to pnpm

- The GitHub Actions setup-node action and the build/test and lint workflows,
  [bin/setup](bin/setup), and the dev/setup docs
  ([getting-started.md](docs/content/dev/getting-started.md),
  [ot.md](docs/content/dev/ot.md),
  [release_checklist.md](docs/content/dev/release_checklist.md),
  [manual-setup.md](docs/content/setup/manual-setup.md)) install with pnpm now,
  completing the migration started in phase 1.

### Notes list: find notes missing from your history

- New API [lib/web/notesListRouter.js](lib/web/notesListRouter.js), mounted in
  [app.js](app.js):
  - `GET /api/notes?scope=mine|all&page=N` — 18 notes per page. Guests see
    publicly viewable notes; signed-in users additionally see limited and
    protected notes and their own private ones. Own notes carry `mine: true`,
    and `inHistory: false` marks orphans that dropped out of the history.
  - `DELETE /api/notes/:id` — owner only (403 for everyone else, 404 for
    unknown notes).
- Five tests in [test/notes-api.js](test/notes-api.js) cover the visibility
  rules, the orphan flag, pagination and the delete permissions.
- The start page gains a **Notes** tab
  ([body.ejs](public/views/index/body.ejs), [cover.js](public/js/cover.js)):
  *Your notes* and *Other visible notes* tables with title, permission and
  updated columns, a *Not in history* badge for orphans, pagination, and a
  trash-can button for deleting your own notes.
- New strings in [locales/en.json](locales/en.json).

### Note state controls reach the toolbar

- The permission dropdown and delete-note action moved from the editor status
  bar to the editor toolbar
  ([statusbar.html](public/js/lib/editor/statusbar.html) →
  [toolbar.html](public/js/lib/editor/toolbar.html)), so they are reachable in
  edit-only mode. [index.js](public/js/index.js) reworks the permission
  handlers, mode switching and state application, fixing phase 1's empty
  editor-side permission label (it was injected after the state was applied).

### Imports land as real content

- Gist and snippet imports build proper documents: a file-extension →
  fence-language map feeds language-tagged fenced code blocks (a
  `## filename` section per file; markdown files are inserted as-is), and
  snippet export writes the same shape. Well-known extension-less names
  (`Makefile`, `Dockerfile`) resolve through their full name.
- The URL-import content fix landed: `parseToMarkdown(html, baseUrl)` now
  receives the source page URL, prefers the page's `h1` over the document
  title (no site suffixes in the text), and resolves relative links and images
  against the source page.

### Spellcheck hint

- Hovering a misspelled word shows a small "Click to fix" hint; clicking still
  opens the replacement popover added in phase 1.

## What worked (verified)

- The five Notes list API tests pass; the whole suite (49 tests) is green in
  phase 3's final battery.
- The Notes tab, orphan badges, pagination, guest vs. signed-in views and the
  toolbar permission control were exercised against the running instance and
  re-verified in phase 3's browser pass.

## What still needs work

- **The Docker image has not been built or smoke-tested** — this host has no
  Docker daemon. The reconstruction follows the running 1.12.0 image's build
  history and is expected to build, but `docker build .` plus a container boot
  is still owed.
- S3/R2 uploads are still untested against a real service (needs a
  deployment).
- The full URL-import flow (where the tab ends up, what the history card links
  to) deserves one more end-to-end look beyond the content-level fix.
- Slide mode still ignores the light/dark preference.
- The `jsonlint` script needs `jq`, absent on some hosts (unchanged).

## Operational notes

- Run the test suite with `pnpm run mocha-suite` (or `pnpm test`); it pins
  `CMD_DB_URL="sqlite::memory:"`. A bare `npx mocha` runs the destructive
  `sync({ force: true })` fixtures against whatever database the config points
  at — in development that wipes `db.hedgedoc.sqlite` (this bit phase 3's
  verification; see phase3.md).
- The container reads its runtime config from `/files/config.json` (the image
  ships `{}`) and is otherwise configured with `CMD_*` environment variables.
- On hosts that export `PORT=0` (legacy Heroku support), start the app with
  `CMD_PORT=3000`.
