# reoo

**A free, open-source graphics editor that runs entirely in your browser.**

Reoo is a lightweight alternative to Photopea and Photoshop. It loads as a static
site, keeps every pixel on your machine, and never uploads a file anywhere.
Layers, selections, brushes, filters, adjustments, and PSD import/export all run
client-side.

```
No backend. No account. No uploads. No tracking. MIT licensed.
```

## Try it

- **Hosted build:** <https://sheikhminds.github.io/reoo/>
- **Source:** <https://github.com/sheikhminds/reoo>

## Features

**Documents**
- New document with custom size and background, or transparent canvas
- Open PNG / JPEG / WebP / GIF / BMP / AVIF and PSD / PSB files
- Place an image as a new layer, drag and drop files onto the canvas, or paste an image copied from another app
- Resize image, crop to selection, rotate 90° left/right or 180°, flip horizontally/vertically
- Flatten image
- Save and reopen projects as `.reoo` (JSON with embedded layer PNGs)
- Export PNG, JPEG, or WebP at 10–400% scale with adjustable quality

**Layers**
- Add, duplicate, delete, reorder (drag), rename, show/hide, merge down
- Per-layer opacity and 16 blend modes
- Full-document raster layers, so every tool works anywhere on the canvas

**Tools**
- Move, rectangle/ellipse marquee, lasso
- Brush and eraser with size, hardness, and opacity, plus stylus pressure
- Paint bucket with tolerance and contiguous/global modes
- Linear and radial gradients
- Rectangle, ellipse, and line shapes with fill, stroke, and corner radius
- Text with font family, size, weight, style, and alignment
- Eyedropper (samples while dragging), crop, hand, zoom

**Filters and adjustments**
- Blur, Gaussian blur, sharpen, pixelate, add noise
- Brightness/contrast, hue/saturation/lightness, levels, threshold, posterize
- Grayscale, invert, sepia

**Editing quality of life**
- Snapshot undo/redo history (20 steps) with `Ctrl+Z` / `Ctrl+Shift+Z`
- Cut, copy, paste, and delete constrained by the active selection
- Marching-ants selection overlay, checkerboard transparency, zoom and pan
- Keyboard-first workflow, dark UI, responsive layout down to phone width
- Installable as an app (PWA) and works with no network after the first load
- Autosave for crash recovery: if the tab dies with unsaved work, the next visit offers to restore every layer

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `V` / `M` / `L` | Move / marquee / lasso |
| `B` / `E` | Brush / eraser |
| `G` / `Shift+G` | Paint bucket / gradient |
| `U` / `T` | Shape / text |
| `I` / `C` | Eyedropper / crop |
| `H` / `Z` | Hand / zoom |
| `[` / `]` | Brush size down / up |
| `X` / `D` | Swap / reset colors |
| `Space` (hold) | Temporary pan |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+A` / `Ctrl+D` | Select all / deselect |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste (native paste places images too) |
| `Delete` | Clear selection contents |
| `Ctrl+S` | Save project (`.reoo`) |
| `Ctrl+O` / `Ctrl+Shift+O` | Open / place image |
| `Ctrl+E` | Export image |
| `Ctrl+0` / `Ctrl+1` | Fit on screen / 100% |

`?` opens the in-app shortcut sheet. On macOS, use `Cmd` where `Ctrl` is listed.

## Run it locally

```bash
git clone https://github.com/sheikhminds/reoo.git
cd reoo
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm test         # unit tests (Vitest)
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
```

Requires Node 20.19+ (Node 22 recommended).

## PSD support

Import and export are provided by [`ag-psd`](https://github.com/Agamnentzar/ag-psd),
loaded lazily so the editor stays small for anyone who never opens a PSD.

**Import** reads layer names, visibility, opacity, blend modes, and layer pixels,
plus the flattened composite as a fallback.

**Known limitations** (documented rather than hidden):
- Layer groups are flattened into their child layers.
- Clipping masks are ignored.
- Text, shape, and adjustment layers arrive as raster pixels — they are not
  re-editable.
- Layer effects/styles are not imported.
- Unsupported blend modes fall back to the closest supported one.

**Export** writes every layer with its name, opacity, blend mode, and pixels, and
also embeds a flattened composite so the file previews correctly elsewhere. Text
and shapes are written as raster layers.

## How it is built

- **TypeScript** with `strict` enabled, no UI framework
- **Canvas 2D** for compositing and painting
- **Vite** for dev server and production builds
- **Vitest** for unit tests over the pure image and color math
- **ag-psd** (MIT) for PSD parsing and serialization

The code splits cleanly:

```
src/core/    documents, layers, history, selection, filters, adjustments, IO, PSD
src/tools/   tool implementations behind one Tool interface
src/ui/      app shell, canvas view, panels, dialogs, options bar
tests/       unit tests for the pure logic
```

Pixel operations are plain functions over `Uint8ClampedArray`, which is what the
tests exercise — no browser required.

## Privacy

Reoo has no server component and no analytics. Files you open are read with the
browser `File` API and stay in memory; exports are generated locally as blobs.
There is nothing to send anywhere.

The only thing Reoo persists is a crash-recovery snapshot in your own browser
storage (see below). It never leaves the device and is deleted as soon as you
save your project.

## Crash recovery

While a document has unsaved changes, Reoo writes a recovery snapshot to
IndexedDB every 20 seconds. If the tab is closed, the browser crashes, or the
machine loses power, the next visit offers to restore the work instead of
starting over.

- Snapshots older than 12 hours are ignored
- Saving the project, opening another file, or choosing "Discard" clears it
- If IndexedDB is unavailable (private mode), recovery silently falls back to
  memory, which only survives a reload of the same tab
- File > Save still downloads a `.reoo` file; autosave is not a substitute for it

## Offline use

The hosted build registers a service worker, so after one visit the editor keeps
working with the network off — on a plane, on a locked-down machine, or when the
site is unreachable. Hashed build assets are cached indefinitely; the HTML shell
is fetched from the network first and falls back to the cache. Browsers offer
"Install app" for the same reason, which gives you a standalone window instead of
a tab.

If a new release looks stale, reload once while online — the shell updates on the
next navigation.

## Contributing

Issues and pull requests are welcome. Please keep changes focused, run
`npm test` and `npm run build` before opening a PR, and describe what you
verified.

This project is maintained by an autonomous AI agent. Its work is reviewed and
shipped in public — commit history, CI runs, and releases are the record.

## License

MIT. See [LICENSE](LICENSE).

## Support

Reoo is free, has no paid tier, no ads and no tracking. If it saves you time:

- Star the repo so other people can find it
- Report bugs and rough edges in [issues](https://github.com/sheikhminds/reoo/issues)
- Send a tip (any EVM chain) to `0xD8f7aA827a145bc8C40eEd5C1BB12BF5e720C6aa`

Tips are optional and fund nothing but more time on the project.
