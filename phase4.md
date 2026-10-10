# Phase 4 — Report

Fourth pass on the HedgeDoc fork: an image lightbox for rendered note
content — hover shows a magnifier cursor and a central zoom badge, click opens
a dark overlay with the image as large as the screen allows. Purely
client-side: no server, database, or sanitizer changes.

## What was changed

1. **Image lightbox module** — new
   [public/js/lib/lightbox.js](public/js/lib/lightbox.js):
   - `lightboxify(view)` runs after `finishView()` and wraps eligible images in
     a `<span class="img-lightbox">` so a hover badge can be shown (bare
     `<img>` elements cannot host pseudo-elements). Wrapping is idempotent,
     which matters because the editor patches the view with a diffing
     `partialUpdate` on every keystroke and only replaces changed subtrees.
   - `initLightbox()` installs one delegated document-level click listener and
     the ESC handler; the overlay itself is built lazily on first open and
     lives on `<body>`, outside the re-rendered view.
   - Opening fits the image into the viewport keeping its aspect ratio and
     **never upscales past its natural size** (small images show at natural
     size); the overlay also locks body scroll while open and frees the
     decoded image data on close.
2. **Editor integration** — [public/js/index.js](public/js/index.js) calls
   `lightboxify(ui.area.markdown)` right after `finishView()` (single render
   choke point) and `initLightbox()` on page ready. Covers both split view and
   view-only mode — they share the same rendered pane.
3. **Published-page integration** —
   [public/js/pretty.js](public/js/pretty.js) does the same after its
   `finishView()`, so the publish page (`?view=pretty`) behaves identically.
4. **Styles** — [public/css/extra.css](public/css/extra.css) gains the
   wrapper/badge styles (`cursor: zoom-in` is the magnifying-glass cursor; the
   badge is ForkAwesome `fa-search-plus`), the overlay with its circular close
   button (ForkAwesome `fa-times`, top-right, translucent round button), and a
   print rule hiding the overlay. `extra.css` is bundled into both the editor
   and published-page packs, so no webpack changes were needed.

### Close paths (per spec + review adjustment)

1. Click on the backdrop ("clicking away from the image"); clicking the image
   itself leaves the overlay open.
2. The circular **X** button in the overlay's top-right corner.
3. ESC (keyboard accessibility).

### Deliberate exclusions

- **Images inside links** (`[![](img)](url)`) — intercepting the click would
  break link navigation.
- **Emoji and tiny icons** — `.emoji` images and anything under 40px natural
  width (checked lazily once loaded) get no badge and no lightbox.
- **`img[align]` images** — their float-based layout would break inside the
  wrapper span.
- **Slide mode** — `lightboxify` refuses views marked `.slides`, and slide
  rendering is never passed through it; reveal keeps its own click behavior.
- **Static exports and print/PDF** — standalone HTML keeps today's behavior.

## What worked (verified)

Verified interactively in a browser against a purpose-built test note (tiny
1×1 PNG, 512×512 local PNG, a 2000×1200 raw `<img>` SVG data-URI, an external
`https` PNG, a `:smile:` emoji, and a linked image), in a 600×400 and a
1000×667 CSS viewport:

- **Eligibility** — the 1×1 image gets no zoom affordance (`cursor: auto`, not
  zoomable); the 512², 2000×1200, and external images are zoomable with
  `cursor: zoom-in`; emoji and the linked image are never wrapped; the raw
  `<img>` tag behaves identically to markdown-syntax images.
- **Sizing** — the 2000×1200 image rendered at 570×342 in the small viewport
  and 950×570 in the large one (exact 95%-of-viewport fit, aspect ratio
  preserved to four decimal places); the 544×184 external image rendered at
  exactly 544×184 — **never upscaled**.
- **Close paths** — clicking the image itself leaves the overlay open; the
  circular X button and ESC both close it with real user input; the
  backdrop-click path closes it too (verified with a synthetic click at a
  point confirmed to hit-test as pure backdrop — the click automation can
  only target elements, and the centered image covers the element-center).
  Body scroll lock is released on every close path.
- **Surfaces** — split view, view-only mode (`?view`), and the publish page
  (`?view=pretty`) all behave identically; the overlay works in both night and
  day mode (dark in both, per spec).
- **Hover badge** — the `fa-search-plus` badge rule is present in the built
  CSS inside `@media (hover: hover)` (font: ForkAwesome); the cursor rule is
  live in computed styles.
- **Health** — eslint 0 issues, mocha 49/49 passing, `pnpm build` clean, and
  zero console errors across the entire verification session.

## What still needs work

- None known after verification. The exclusion thresholds (linked images,
  40px minimum zoom size, `img[align]`) are deliberate and easy to revisit in
  [public/js/lib/lightbox.js](public/js/lib/lightbox.js).

## Operational notes

- No configuration or database changes; the feature is active for all notes as
  soon as the bundles are rebuilt (`pnpm build`) and the server restarted.
- CSP already permits arbitrary image sources (`img-src: ['*','data:']`), so
  the lightbox works for externally hosted and `data:` URI images alike
  without policy changes.
