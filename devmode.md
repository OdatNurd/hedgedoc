# Development mode

How to run this fork locally for development. Everything here has been tested
on this machine (Node 22, pnpm 10).

## Prerequisites

- **Node.js >= 18** (the `engines` field; current LTS works fine)
- **pnpm 10** — pinned via the `packageManager` field in
  [package.json](package.json). Get it with `corepack enable` (or
  `npm install -g pnpm` if you don't use corepack)
- **jq** — only for `pnpm run jsonlint`; the rest works without it

## First-time setup

```sh
pnpm install               # full install, including the devDependencies
                           # needed to build the frontend (bin/setup does a
                           # prod-only install, so don't use it for dev)

cp config.json.example config.json
```

Then edit `config.json` and add `"staticCacheTime": 0` to the `development`
block, so rebuilt assets are served immediately instead of being cached for an
hour. A working development config looks like this:

```json
{
    "test": {
        "db": {
            "dialect": "sqlite",
            "storage": ":memory:"
        },
        "linkifyHeaderStyle": "gfm"
    },
    "development": {
        "loglevel": "debug",
        "staticCacheTime": 0,
        "db": {
            "dialect": "sqlite",
            "storage": "./db.hedgedoc.sqlite"
        },
        "domain": "localhost",
        "urlAddPort": true
    }
}
```

Build the frontend bundles once (the server serves `public/build/` and
`public/views/build/`, which are generated — they are not in the repo):

```sh
pnpm build                 # one-shot production-style bundle
```

## Running

```sh
CMD_PORT=3000 node app.js
```

Then open <http://localhost:3000>. (`pnpm start` is the same as `node app.js`.)

Two details worth knowing:

- `NODE_ENV` defaults to `development`, so a plain `node app.js` already uses
  the `development` block of `config.json` — no environment juggling needed.
- The `CMD_PORT=3000` prefix matters on hosts that export a `PORT` variable
  (HedgeDoc's legacy Heroku support consumes it). If `PORT=0` is exported,
  the app tries to bind port 0 and fails; `CMD_PORT` overrides it.

The dev database is a plain SQLite file at `./db.hedgedoc.sqlite`. Delete it at
any time to reset; it is recreated (with fresh migrations) on the next start.

## The day-to-day loop

For frontend work, run the bundler in watch mode in a second terminal:

```sh
# terminal 1
pnpm run dev               # webpack --watch (webpack.dev.js)

# terminal 2
CMD_PORT=3000 node app.js
```

What picks up changes when:

| What you changed | What to do |
| --- | --- |
| `public/js/**`, `public/css/**`, webpack config | let `pnpm run dev` rebuild (or run `pnpm build`), then hard-refresh the browser |
| `public/views/**` (EJS templates) | just refresh the browser — Express re-reads templates outside production |
| `lib/**`, `app.js`, `config.json` | restart the server |

## Tests and linting

```sh
pnpm run mocha-suite       # the test suite
pnpm run eslint            # lint (0 warnings tolerated)
pnpm run jsonlint          # validate JSON files (needs jq)
pnpm test                  # all three of the above
```

> **Warning:** always run the tests through `pnpm run mocha-suite` (or
> `pnpm test`). The script pins `NODE_ENV=test` and `CMD_DB_URL=sqlite::memory:`
> for a reason: some fixtures call `sequelize.sync({ force: true })`, which
> **drops every table** in whatever database the config points at. Running a
> bare `mocha` against your dev config can wipe `db.hedgedoc.sqlite`.

## Docker image

`docker build .` produces the production image (multi-stage, pnpm-based; see
[docs/content/setup/docker.md](docs/content/setup/docker.md) for how to run
it). The container is configured through `CMD_*` environment variables; the
`/files/config.json` in the image is only a bind-mount target for those who
prefer a config file. Building is done on a machine with a Docker daemon —
it is not part of the dev loop above.
