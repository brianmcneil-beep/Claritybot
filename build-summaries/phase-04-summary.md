# Phase 04 — Jargon Diagnosis

## What was built

- `src/data/jargonGlossary.ts` — static glossary seeded with 70 insurance terms across PPA, Homeowners, and Pet insurance vocabulary (exceeds the 30–50 term spec).
- `src/utils/diagnostics.ts` — four diagnostic checks:
  - **Long sentences** — splits text on sentence boundaries, flags any sentence over 25 words with its word count.
  - **Insurance jargon** — whole-word/whole-phrase regex match against the glossary (case-insensitive).
  - **Passive voice** — heuristic regex: `(am|is|are|was|were|be|been|being) [optional adverb] (word ending in -ed/-en/-wn/-nt)`. Returns matched constructions. UI labels this a heuristic.
  - **Long words** — tokenizes text, counts syllables per word via `text-readability`, flags any unique word with 4+ syllables.
- `ResultsSection` component updated: diagnostics now appear below the score cards, grouped by type, each as a labeled list with item text + one-line reason. Passive voice group includes a heuristic disclaimer. **Rewrite Form** button added at the bottom of the section.

## Decisions made

- **Diagnostics run together with scoring on Analyze click** — both share the same `text` prop in `ResultsSection`; no separate button, consistent with PRD Section 3.3.
- **Glossary exceeds 30–50 terms** (70 terms) to provide better coverage across all three lines of business mentioned in the PRD. Brian can trim it.
- **Long-word deduplication** — a `Set` is used so each unique word only appears once in the long-words list, keeping results clean.
- **Passive voice regex** uses a union of common auxiliary verbs plus approximate past-participle suffixes. It will have false positives (acknowledged in the UI per the PRD).

## Files created or modified

- `claritybot/src/data/jargonGlossary.ts` — new; 70-term insurance jargon glossary
- `claritybot/src/utils/diagnostics.ts` — new; four diagnostic check functions + `runDiagnostics()`
- `claritybot/src/components/ResultsSection.tsx` — updated with diagnostics UI + Rewrite Form button
- `claritybot/src/App.tsx` — updated with `onRewrite` handler wiring

## Open questions or assumptions

- The glossary is seeded broadly. Brian should review and trim/extend terms for his specific lines of business.

## What's next

- **Phase 5 — Anthropic Rewrite**: install `@anthropic-ai/sdk`, implement the rewrite call, build RewriteSection with loading and error states.
