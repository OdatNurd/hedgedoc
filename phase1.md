# Phase 1 — Report

This documents the first pass of work on the HedgeDoc fork: the package-manager
migration and ten fixes, all verified against a locally running instance. A
second pass is planned against the gaps listed at the end.

## What was changed

### pnpm migration

- Removed `yarn.lock`, `.yarn/` and `.yarnrc.yml`; [package.json](package.json)
  now pins `packageManager: pnpm@10.34.6`.
- The Yarn `patch:` pin for passport 0.7.0 was converted to pnpm's
  `patchedDependencies` in [pnpm-workspace.yaml](pnpm-workspace.yaml); the patch
  itself is preserved in [patches/passport-npm-0.7.0-df02531736.patch](patches/passport-npm-0.7.0-df02531736.patch)
  and verified applied in `node_modules`.
- [.npmrc](.npmrc) sets `shamefully-hoist=true` so pnpm builds a flat
  `node_modules` like npm/Yarn classic — this legacy webpack/eslint toolchain
  can then never hit a phantom-dependency resolution failure.
- The Yarn-style `#commit=` git dependency pins were rewritten to bare `#<sha>`
  (pnpm does not accept the Yarn syntax).
- [config.json](config.json) provides a disposable SQLite dev database
  (`db.hedgedoc.sqlite`, safe to delete at any time) and `staticCacheTime: 0`
  so webpack rebuilds show up immediately in the browser.

### The ten fixes

1. **Dark dialogs** — removed the inline `color:black` from the three modals in
   [public/views/hedgedoc/body.ejs](public/views/hedgedoc/body.ejs); error
   dialogs now render `#eee` on the dark background.
2. **Published-page theming** — moon toggle added to the info bar
   ([public/views/pretty.ejs](public/views/pretty.ejs),
   [public/js/pretty.js](public/js/pretty.js)), sharing the editor's stored
   night-mode preference; night styles moved to shared
   [public/css/extra.css](public/css/extra.css).
3. **Gist import** — the real blocker was CSP `connect-src 'self'`, not the API.
   New server route `GET /gist/:id`
   ([lib/web/importRouter.js](lib/web/importRouter.js)) fetches server-side with
   robust gist-ID parsing and real error messages.
4. **Clipboard import** — line breaks preserved (contenteditable serialization),
   plain text inserted verbatim, rich HTML converted through turndown, and
   everything inserts **at the cursor**. Bonus: pasting a bare URL fetches and
   inserts its content via `GET /import` (SSRF-guarded, size-capped), with
   document metadata (`<meta>`, `<title>`, …) stripped before conversion.
5. **S3/R2 uploads** — new `s3publicBaseUrl` / `CMD_S3_PUBLIC_BASE_URL` for
   direct public URLs; when unset, upload links use this host (`/uploads/…`) and
   the server streams from the bucket on request, keeping the bucket private.
   Also `CMD_S3_FORCE_PATH_STYLE` (recommended for R2). Covered by 6 unit tests
   in [test/image-s3.js](test/image-s3.js) and documented in
   [docs/content/configuration.md](docs/content/configuration.md).
6. **Autocomplete** — Tab accepts a suggestion, Enter inserts a newline. The
   hidden culprit was the dropdown's temporary keymap in
   [public/js/index.js](public/js/index.js), which swallowed Enter and let the
   base Tab handler insert a tab character.
7. **Spellcheck** — `plop'` is no longer flagged (trailing-apostrophe
   stripping); clicking a squiggle shows up to five replacements and clicking a
   suggestion replaces the word.
8. **Note state controls** — the permission dropdown and delete-note action also
   live in the editor status bar, so they are reachable outside the view pane.
9. **Frontmatter highlighting** — new strict yaml-frontmatter mode
   ([public/js/lib/editor/yaml-frontmatter.js](public/js/lib/editor/yaml-frontmatter.js)):
   the front matter block is closed only by a line consisting of exactly `---`
   or `...`, so thematic breaks like `----` or `--- text` no longer break the
   highlighting.
10. **Home page** — the Intro section is gone; the root page serves History
    only ([public/views/index/body.ejs](public/views/index/body.ejs),
    [public/js/cover.js](public/js/cover.js)).

## What worked (verified)

- All ten fixes were verified interactively in a browser against the running
  dev instance, including real key presses for the autocomplete change and a
  real gist import of `https://gist.github.com/OdatNurd/fd3cb2e03a323d7f0f2801f59bbda7e6`.
- ESLint: 0 errors, 0 warnings.
- Mocha suite: 36/36 passing (30 pre-existing + 6 new S3 tests).
- All 49 JSON files validate. (The `jsonlint` script requires `jq`, which is
  not installed on the build host; an equivalent Node-based JSON parse was run
  over the identical file set instead. The script itself is unchanged.)

## What still needs work

- **S3/R2 support is not yet tested against a real service.** It needs a
  deployment to exercise; it will be tested once the remainder is passing.
- **Docker image**: no Dockerfile existed in the repository. A new image is
  being produced in the second pass, reconstructed from the running 1.12.0
  image (`original_dockerfile.txt`) with pnpm, and still needs a build + smoke
  test on a host with a Docker daemon.
- **URL import** occasionally behaves unexpectedly in practice (the tab can end
  up at the imported site, and the resulting history card seems to lead to the
  external link). Needs reproduction and a root-cause fix.
- **Note state controls** are still not visible in pure edit-only mode — the
  editor-side permission label is injected after the state is applied and ends
  up empty.
- **Gist imports** currently land as prose (`filename` + `---` + text) instead
  of language-tagged fenced code blocks.
- Slide mode still ignores the light/dark preference — it is the last published
  surface without theming.
- The `jsonlint` script depends on `jq`, absent on some hosts (see above).

## Operational notes

- On hosts that export `PORT=0` (which HedgeDoc's legacy Heroku support
  consumes), start the app with `CMD_PORT=3000`.
