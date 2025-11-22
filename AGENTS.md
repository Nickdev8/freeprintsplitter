# Repository Guidelines

## Project Structure & Module Organization
- App source in `src/` (`App.tsx`, `main.tsx`, `styles.css`); entry HTML in `index.html`.
- Build/config in `package.json`, `tsconfig*.json`, `vite.config.ts`.
- Assets are currently inline; add static assets under `public/` if needed.
- Docs: `README.md` (usage) and this file.
- Containerization: `Dockerfile`, `.dockerignore`.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm run dev -- --host` — start Vite dev server (default port 5173).
- `npm run build` — type-check (tsc) and build production bundle to `dist/`.
- `npm run preview -- --host --port 4173` — serve the built bundle locally.
- Docker: `docker build -t freeprintsplitter .` then `docker run -p 8080:80 freeprintsplitter`.
- Tests: none yet; add scripts under `package.json` when introduced.

## Coding Style & Naming Conventions
- Language: TypeScript + React (function components, hooks).
- Formatting: Prettier not enforced; keep 2-space indentation, trailing commas optional; prefer concise inline comments only when clarifying logic.
- Naming: PascalCase for components, camelCase for functions/variables, UPPER_SNAKE for constants. Keep file names in PascalCase or kebab-case as fits the module.
- Styling: global `src/styles.css`; prefer BEM-like, lower-hyphen class names; avoid inline styles unless dynamic.

## Testing Guidelines
- No test framework configured yet. When adding, prefer Vite-compatible tools (Vitest/RTL).
- Place tests alongside source as `*.test.tsx|ts`. Aim for coverage on layout logic (grid calc) and canvas rendering utilities.
- Add `npm test` script in `package.json` when tests exist.

## Commit & Pull Request Guidelines
- Commits: use concise, imperative messages (`add layout grid`, `fix padding calculation`).
- Scope commits to a logical change set; include relevant file updates together (code + styles + docs).
- Pull Requests: describe the change, mention user impact, attach before/after screenshots for UI changes, and reference issues when applicable.
- Include run results for `npm run build` (and tests when added) in the PR description.
