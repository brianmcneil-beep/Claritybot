# Phase 01 — Project Scaffold

## What was built

- Vite + React + TypeScript project initialized at `claritybot/`
- Tailwind CSS v4 installed and configured via the `@tailwindcss/vite` Vite plugin
- Top-level one-page layout assembled in `App.tsx` with four child components:
  - `Header` — app title and tagline
  - `InputSection` — placeholder for Phase 2
  - `ResultsSection` — placeholder for Phases 3 & 4
  - `RewriteSection` — placeholder for Phase 5
- Missing-API-key startup banner wired into `App.tsx` (reads `import.meta.env.VITE_ANTHROPIC_API_KEY`)
- `.env` and `.env.example` created; `.env` added to `.gitignore`
- Production build verified: `npm run build` exits cleanly, `tsc --noEmit` produces zero errors

## Decisions made

- **Tailwind CSS v4** was installed (`tailwindcss@4.2.2`) rather than v3, because v4 is the current stable release and uses a simpler zero-config approach (no `tailwind.config.js`; just `@import "tailwindcss"` in the CSS entry point and the `@tailwindcss/vite` plugin). The v3 API would have required a separate config file and PostCSS setup.
- **Project lives in `claritybot/` subdirectory** of the repo root rather than at the root itself, because the repo root already had an `README.md` and `.git` directory, and Vite's `create-vite` refused to scaffold into a non-empty directory. This is a clean separation.
- **Boilerplate `App.css` deleted** — all styling will be Tailwind utility classes; a separate stylesheet adds no value here.
- **`StrictMode` retained** in `main.tsx` — it catches subtle React issues at dev time at zero runtime cost.

## Files created or modified

- `claritybot/` — new Vite + React + TS project root
- `claritybot/vite.config.ts` — added `@tailwindcss/vite` plugin
- `claritybot/src/index.css` — replaced boilerplate with `@import "tailwindcss"`
- `claritybot/src/App.tsx` — full top-level layout; replaces boilerplate
- `claritybot/src/main.tsx` — untouched (clean as generated)
- `claritybot/src/components/Header.tsx` — app header with title and tagline
- `claritybot/src/components/InputSection.tsx` — placeholder
- `claritybot/src/components/ResultsSection.tsx` — placeholder
- `claritybot/src/components/RewriteSection.tsx` — placeholder
- `claritybot/.env` — empty key slot (not committed)
- `claritybot/.env.example` — template for setup instructions
- `claritybot/.gitignore` — added `.env` entry
- `build-summaries/phase-01-summary.md` — this file

## Open questions or assumptions

- The PRD places all project files at the repo root, but Vite could not scaffold into a non-empty directory. The `claritybot/` subdirectory approach is used instead. **Brian should confirm this is acceptable**, or indicate if the files should live at the root.
- No Node version constraint is pinned (currently using Node 22). Should a `.nvmrc` or `engines` field be added?

## What's next

- **Phase 2 — Input & File Parsing**: build the textarea, file upload button, and client-side parsers for `.txt`, `.docx`, and `.pdf`. Key dependencies to install: `mammoth` (`.docx`) and `pdfjs-dist` (`.pdf`). Both are standard, well-maintained packages — no unusual dependencies expected.
