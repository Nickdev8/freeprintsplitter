# Free Print Splitter

Pack as many uploaded photos as possible onto a 10×15 cm (3:2) sheet, pick a colored padding with a slider, and export a print-ready PNG. The UI keeps the "tiny glade" vibe: soft cards, chunky sliders, and one-screen controls.

## Quick start (dev mode)

Requirements: Node 18+ and npm.

```bash
npm install
npm run dev -- --host
```

Open the printed URL (defaults to `http://localhost:5173`). Drop images, adjust padding + color, and hit **Download PNG**.

## Build & preview

```bash
npm run build
npm run preview -- --host --port 4173
```

## Docker

Build and run the production image (served by nginx):

```bash
docker build -t freeprintsplitter .
docker run --rm -p 8080:80 freeprintsplitter
```

Then visit `http://localhost:8080`.

## What it does

- Accepts multiple images (drag/drop or file picker).
- Auto-computes a grid to fit every photo within a 10×15 cm canvas at 300 dpi, keeping aspect ratios.
- Slider to set padding thickness; color picker to set the padding/fill color.
- Landscape/portrait toggle.
- Inline previews and one-click PNG export of the composed sheet.
