# Repository Guidelines

## Project Structure & Module Organization
- App lives under `app/` (Vite + React + TS + Tailwind). Core UI logic in `app/src/App.tsx`; entrypoint in `app/index.html`; styling tokens in `app/src/index.css`.
- Build/config files: `app/package.json`, `app/tailwind.config.cjs`, `app/vite.config.ts`, `app/tsconfig*.json`.
- Assets: drop static files into `app/public/`; library uploads are handled in-app.
- Containerization: root `Dockerfile` and `docker-compose.yml` (serves on host port 3016).
- Docs: `README.md` (usage) and this guide.

## Build, Test, and Development Commands
- `cd app && npm install` — install dependencies.
- `cd app && npm run dev -- --host --port 5173` — local dev server.
- `cd app && npm run build` — type-check and emit production bundle to `app/dist/`.
- `cd app && npm run preview -- --host --port 4173` — serve the built bundle locally.
- Docker (prod-like): `docker-compose up --build` — runs on http://localhost:3016.

## Coding Style & Naming Conventions
- Language: TypeScript, React hooks/function components, Tailwind utility classes.
- Formatting: 2-space indent; keep JSX concise; add short comments only for non-obvious layout/rendering logic.
- Naming: PascalCase for components, camelCase for vars/functions, UPPER_SNAKE for constants; file names PascalCase or kebab-case.
- UI: prefer Tailwind utilities over inline styles; keep shared values centralized near component defaults.
- Layout specifics: four-slot cards with per-card orientation and padding color (including auto-color from average image tone). Padding slider max is 80px; rounding applies to images only. Card pixel size scales up to fit high-res sources (capped) while keeping 10×15 aspect.

## Testing Guidelines
- No automated tests configured. When adding, use Vitest + React Testing Library; colocate as `*.test.ts(x)` alongside source.
- Focus on layout calculations (padding, orientation), image placement, and download flows. Add `npm test` script once tests exist.

## Commit & Pull Request Guidelines
- Commits: imperative, scoped messages (`tweak padding defaults`, `add per-card color presets`).
- Keep related code/docs together; avoid mixing refactors with feature work.
- PRs: clear summary, user-facing impact, screenshots/gifs for UI changes, and linked issues. Note results of `npm run build` (and tests when present).
- Avoid force-push; prefer follow-up commits for review feedback.

## Security & Configuration Tips
- Do not commit secrets; prefer `.env` files kept locally (not tracked). If new env vars are needed, document them in `README.md`.
- Validate user-provided images on the client only; no server-side processing is present in this repo.

## Architecture Notes
- Cards render from client-only data: per-slot images can rotate and pan within masks; padding is even on all sides and overflow is clipped.
- Library previews support drag-and-drop plus tap to select; uploads append to the in-memory list.
- Downloads: per-card PNGs and ZIP-all; gallery at bottom mirrors the rendered cards with per-card download buttons.
- Keep UI responsive: large previews in the library and card grid use object-cover images; avoid blocking operations on the main thread when adding heavy features.*** End Patch" json-commentary> Nothing to patch. Please ensure that the patch is well-formed. Use *** Begin Patch and *** End Patch with proper formatting. If you have not done so, check your patch for errors.
