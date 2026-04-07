# Phase 02 — Input & File Parsing

## What was built

- `InputSection` component with a 15-row textarea, a file upload trigger (hidden `<input type="file">`), an inline "Parsing file…" indicator, a styled parse-error alert, and the **Analyze** button (disabled until text is present).
- `src/utils/fileParser.ts` — client-side file parsing module:
  - `.txt` — native `FileReader.readAsText()`
  - `.docx` — `mammoth.extractRawText()` (strips all formatting, returns plain text)
  - `.pdf` — `pdfjs-dist`: loads all pages, joins `TextItem.str` values, normalizes whitespace
  - Shared `normalizeWhitespace()` helper: collapses runs of spaces/tabs, normalizes line endings, trims
  - `parseFile()` dispatcher: routes by file extension, throws a user-friendly error for unsupported types
- `App.tsx` updated: holds `text` and `hasAnalyzed` state; passes `onTextChange`, `onAnalyze`, and `text` down to child components; `ResultsSection` and `RewriteSection` now only render after Analyze is clicked.
- `ResultsSection` and `RewriteSection` updated to accept `text` (and `apiKey`) props without breaking the build.
- `public/pdf.worker.min.mjs` — PDF.js worker file copied to `public/` for static serving.

## Decisions made

- **Worker file copied to `public/`** rather than imported with `?url`: Vite 8 uses Rolldown as its bundler, which could not resolve the `?url` import for `pdfjs-dist/pdf.worker.min.mjs` during production build. Copying the worker to `public/` and referencing it as `/pdf.worker.min.mjs` is a standard, reliable alternative and behaves identically at runtime.
- **Analyze button disabled (not hidden) when textarea is empty** — disabling is less surprising than hiding; the user can see the button and understand what action is needed.
- **`hasAnalyzed` flag in App.tsx controls visibility** of `ResultsSection` and `RewriteSection` — per PRD Section 4, these sections should only appear after Analyze is clicked. A boolean flag is the simplest correct approach.
- **File input resets after each parse attempt** — so the same file can be re-selected after an error without the browser silently ignoring the second `change` event.

## Files created or modified

- `claritybot/src/utils/fileParser.ts` — new; .txt / .docx / .pdf parsers + whitespace normalizer
- `claritybot/src/components/InputSection.tsx` — replaced placeholder with full implementation
- `claritybot/src/components/ResultsSection.tsx` — updated to accept `text` prop
- `claritybot/src/components/RewriteSection.tsx` — updated to accept `text` and `apiKey` props
- `claritybot/src/App.tsx` — added `text` / `hasAnalyzed` state; wired props to children
- `claritybot/public/pdf.worker.min.mjs` — copied from `node_modules/pdfjs-dist/build/`
- `build-summaries/phase-02-summary.md` — this file

## Open questions or assumptions

- The PDF.js worker (`public/pdf.worker.min.mjs`) is ~1.1 MB. It is served statically and only loaded when a PDF is parsed. If bundle size becomes a concern, it could be lazy-loaded. No action needed for now.
- `mammoth` and `pdfjs-dist` are both well-maintained, widely-used libraries — no unusual dependencies.

## What's next

- **Phase 3 — Readability Scoring**: install `text-readability` (or equivalent), implement the four metrics + supporting counts, build the 4-card + counts UI, and wire the Analyze button to actually compute scores.
