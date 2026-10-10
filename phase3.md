# Phase 3 — Report

Third pass on the HedgeDoc fork: night-mode consistency, split-mode UI
correctness, sync-scroll toggle feedback, gist import frontmatter and images,
the Notes table (sorting + dark hover), and a regression fix found while
verifying. This pass is uncommitted at the time of writing: 12 modified files
plus new [test/import-gist.js](test/import-gist.js),
[phase2.md](phase2.md) and this file.

## What was changed

1. **Night-mode consistency** —
   [hedgedoc/head.ejs](public/views/hedgedoc/head.ejs) applies the stored
   night preference before first paint (CSP-safe, via the per-request nonce),
   and [index.js](public/js/index.js) keeps `html.night` and `body.night` in
   lockstep when the mode changes. The published page
   ([pretty.ejs](public/views/pretty.ejs), [pretty.js](public/js/pretty.js))
   shares the same stored preference, with night styles in
   [extra.css](public/css/extra.css).
2. **Split-mode permission control** — the toolbar permission control (moved
   to the toolbar in phase 2) now appears only in edit mode. Verified in edit,
   view and split mode.
3. **Sync-scroll toggle feedback** — the splitter's chain button reports its
   state (link/unlink icon, "on"/"off" tooltip), and the behavior matches the
   cue: enabled, the panes scroll together and realign; disabled, they scroll
   independently. Verified in both directions with real wheel input.
4. **Gist import frontmatter + images** —
   [importRouter.js](lib/web/importRouter.js) classifies binary/image gist
   files by media type and hands text files over as content; the editor
   renders YAML frontmatter and inlines images. Covered by 8 tests in
   [test/import-gist.js](test/import-gist.js).
5. **Notes table sorting + dark hover** — clickable *Title*/*Updated* headers
   with direction icons ([cover.js](public/js/cover.js),
   [body.ejs](public/views/index/body.ejs)); hovered rows paint `#454545` on
   the dark cover instead of Bootstrap's illegible `#f5f5f5`
   ([cover.css](public/css/cover.css)).
6. **FAQ** — "How do I find a note that is missing from my history?"
   ([faq.md](docs/content/faq.md)) documents the Notes tab: orphan badges,
   sorting, pagination and deleting from the listing.
7. **Regression fix** — [errors.js](lib/errors.js) passes the CSP nonce to
   error pages. The head.ejs change had made every error page crash with a
   `ReferenceError`; fixed and re-verified with a 404 request.
8. **Traces** — [phase2.md](phase2.md) (the dropped item from the plan) and
   this file. While writing them, [resources/config.json](resources/config.json)
   (build input the phase-2 Dockerfile `COPY`s) was found invisible to
   version control — the bare `config.json` ignore rule swallowed it — so
   [.gitignore](.gitignore) now un-ignores that path and the file carries the
   upstream-verified `{}` content.

## What worked (verified)

- `pnpm run eslint` (`--max-warnings 0`): 0 errors, 0 warnings.
- `pnpm run mocha-suite`: 49 passing (41 pre-existing + 8 new).
- All repository JSON files parse clean. (`jq` is absent on this host, so the
  stock `jsonlint` script could not run; an equivalent Node-based parse
  covered the identical file set. The script itself is unchanged.)
- Built bundles in `public/build/` contain the new feature markers and were
  exercised live in a browser: night mode (no flash, consistent state),
  permission control in all three editor modes, sync toggle both ways, notes
  table sorting (ascending/descending with tracking icons) and dark hover
  (computed styles under a real pointer), notes list rendering for guests and
  for the signed-in account, and a clean error page after the regression fix.
- Cleanup: the sort-test note created during verification was deleted
  afterwards; the app verified healthy afterward.

## What still needs work

- Docker image build + smoke test (needs a Docker daemon) — see
  [phase2.md](phase2.md).
- S3/R2 uploads against a real service.
- Slide-mode theming — the last published surface without light/dark.
- The `jsonlint` script's `jq` dependency.
- Suggested hardening: the test suite's `sync({ force: true })` fixtures should
  refuse to run against a non-in-memory database (see below).

## Operational notes

- **Run tests with `pnpm run mocha-suite`**, never bare `npx mocha`: the
  script pins `CMD_DB_URL="sqlite::memory:"`, while a bare run executes the
  destructive fixtures against the configured development database and wipes
  it. This happened during the first battery attempt of this pass; only
  disposable test artifacts in the scratch `db.hedgedoc.sqlite` were lost, the
  schema survived, and the suite was re-run through the correct script.
- The development session secret is regenerated on every boot, so restarting
  the server signs the browser out.
- On hosts that export `PORT=0` (legacy Heroku support), start the app with
  `CMD_PORT=3000`.
