# Phase 03 — Readability Scoring

## What was built

- `src/utils/readabilityScorer.ts` — scoring module:
  - `scoreText(text)` returns all four metrics (Flesch Reading Ease, Flesch-Kincaid Grade, SMOG Index, Gunning Fog) plus word count, sentence count, avg words per sentence, avg syllables per word.
  - Four `interpret*()` functions return one-line plain-English descriptions for each score.
- `src/types/text-readability.d.ts` — hand-written TypeScript ambient declaration for `text-readability` (no `@types` package exists).
- `ResultsSection` component updated with 4-card grid + supporting counts table, consuming `readabilityScorer`.
- `App.tsx` updated to pass `onRewrite` prop to `ResultsSection`.

## Decisions made

- **`text-readability` chosen as specified** — it covers all four metrics natively, has 200k+ weekly npm downloads, and its API matched the PRD exactly (`fleschReadingEase`, `fleschKincaidGrade`, `smogIndex`, `gunningFog`).
- **Interpretation thresholds** are based on the commonly cited ranges for each formula (e.g., Flesch RE ≥ 60 = "standard/8th–9th grade"). No pass/fail is shown — just the plain-English description, per PRD Section 3.2.
- **Score rounding** — metrics rounded to 1 decimal; avg syllables per word to 2 decimals for precision.
- **`sm:grid-cols-4` layout** — 2×2 on narrower desktop, 1×4 on wider, matching the PRD's "4 cards in a row or 2×2 grid" spec.

## Files created or modified

- `claritybot/src/utils/readabilityScorer.ts` — new; scoring + interpretation functions
- `claritybot/src/types/text-readability.d.ts` — new; ambient module declaration
- `claritybot/src/components/ResultsSection.tsx` — replaced placeholder with scores + counts UI

## Open questions or assumptions

- None for this phase.

## What's next

- **Phase 4 — Jargon Diagnosis**: create `src/data/jargonGlossary.ts`, implement the four diagnostic checks, add the diagnostics UI below the score cards, and add the Rewrite Form button.
