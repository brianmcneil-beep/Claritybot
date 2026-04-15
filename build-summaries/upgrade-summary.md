# Upgrade Summary — ClarityBot v1 → v2.1

**Status as of this document:** Change Sets A–E and G complete. Change Set F deferred. Rewrite feature built but untested pending API key.

---

## Change Sets applied

### Change Set A — Architectural principle (Section 3.0)
**Status: Complete — no code changes required.**
Scoring is and has always been computed locally. `readabilityScorer.ts` uses `text-readability` + manual formula implementations. `RewriteSection.tsx` scores the rewrite body by calling `scoreText()` locally after the API returns. The LLM is never asked to produce a number.

### Change Set B — Input (Section 3.1)
**Status: Complete — no code changes required.**
Drag-and-drop zone with click-to-browse fallback was already implemented in `InputSection.tsx`. Extracted text populates the editable textarea before Analyze can be clicked.

### Change Set C — Scoring library (Section 3.2)
**Status: Complete — confirmed correct, no code changes.**
`text-readability` is used for `lexiconCount()` (word count), `syllableCount()` (total and per-word), and as the basis for polysyllable detection. The four metric formulas are implemented manually in `readabilityScorer.ts` — this is intentional and correct. See decision note below.

**Decision recorded (Brian, 2026-04-07):** The PRD's "use library functions" rule was intended to prevent custom syllable counting, not to mandate the library's sentence splitter. The library's sentence splitter is designed for prose; it systematically miscounts sentences in enumerated legal obligations (40.5 avg words/sentence vs. the corrected ~13). The calibrated custom sentence splitter in `sentenceUtils.ts` is preserved. BASE form delta (~4 grades vs. Readable.com) tracked as a known open issue.

### Change Set D — Jargon diagnosis (Section 3.3)
**Status: Complete, with one in-flight refinement (state-name stop-list).**

Applied:
- New `IssueType` enum: `LONG_SENTENCE`, `PASSIVE_VOICE`, `DOUBLE_NEGATIVE`, `NESTED_CONDITIONAL`, `NOMINALIZATION`, `JARGON`, `LONG_WORD`, `DEFINED_TERM_OVERUSE`
- New `DiagnosticItem` shape: `{ section_label, problem_text, issue_type, why_problematic, priority }`
- Four new detectors: `DOUBLE_NEGATIVE`, `NESTED_CONDITIONAL`, `NOMINALIZATION`, `DEFINED_TERM_OVERUSE`
- Priority badges (high/medium/low), sorted within each group
- PDF inter-token spacing fix: gap-aware space insertion between adjacent `TextItem` runs (fixes mashed-together words from bold/italic styled runs)
- `DEFINED_TERM_OVERUSE` per-paragraph scope (3+ distinct paragraphs), stop-list, bracket-placeholder filter, repeated-line (header/footer) filter
- Passive voice shows full containing sentence; `why_problematic` varies by auxiliary verb tense
- Long sentence deduplication with `[appears N× in document]` annotation
- 50-state + DC geographic stop-list added to `DEFINED_TERM_OVERUSE` (fixes "Arizona" false positive from state-law references)

**Known trade-off (noted by Brian):** Long sentences dropped from 32 to 0 on the COLLCOMP form. This is correct behavior — the calibrated sentence splitter now correctly segments numbered lists and semicolons (avg words/sentence dropped from 19.5 to 11.2). The splitter improvement makes scoring more accurate but reduces the long-sentence diagnostic's signal on dense legal passages. Acceptable for v1; a "dense paragraph" detector can be added later if needed.

**Open refinement:** "Arizona" was flagged by `DEFINED_TERM_OVERUSE` because three exclusion paragraphs each contain "Arizona law" — the per-paragraph logic correctly identified cross-section repetition, but the term is a geographic proper noun, not a policy-defined term. Fixed by adding all 50 US states + territories + common geographic/legal proper nouns to the stop-list.

### Change Set E — Rewrite system prompt + streaming (Section 3.4)
**Status: Complete. Untested pending API key.**

Applied:
- Verbatim system prompt from PRD v2.1 (character-for-character; see `SYSTEM_PROMPT` constant in `RewriteSection.tsx`)
- `temperature: 0.2` (was unset, defaulting to 1.0)
- `max_tokens: 4096` — unchanged
- `model: 'claude-sonnet-4-5'` — unchanged
- `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` — unchanged
- Streaming via `client.messages.stream()` with `stream.on('text', delta)` accumulation; live preview shown while streaming
- `AbortController` wired for cleanup on unmount and retry
- `parseResponse()` splits on three section headings: `Rewritten Document`, `Change Summary`, `Legal Integrity Verification`
- Malformed output detection: if any section heading is missing, yellow warning banner + raw output shown
- `livHasWarning()` scans Legal Integrity Verification for problem signals; red banner surfaced if triggered
- Score comparison table now includes word count and sentence count rows

**To test:** Add `VITE_ANTHROPIC_API_KEY=sk-ant-...` to `claritybot/.env` and restart `npm run dev`.

### Change Set F — Markdown rendering (Section 3.4)
**Status: Deferred.**

Brian is running real forms through the diagnostics to validate Change Set D before testing the rewrite. Change Set F (markdown rendering of rewrite output sections) will begin after the API key is added and rewrite output is observed. Dependency question open: the no-new-dependencies constraint may require a minimal regex renderer rather than `marked` or `react-markdown`.

### Change Set G — Anti-hallucination guardrails (Section 11)
**Status: Complete — no code changes required.**
- No invented state-specific thresholds, statute citations, DOI ratings, or LOB-specific rules anywhere in the codebase
- File parse errors surfaced in red alert; app does not proceed with empty text (Analyze button disabled)
- Only Claude (`claude-sonnet-4-5`) is used; no fallback logic

---

## Files modified in this upgrade

| File | Change Sets | Summary |
|---|---|---|
| `claritybot/src/utils/diagnostics.ts` | D, D.5 | New IssueType enum, 8 detectors, new DiagnosticItem shape, all D.5 fixes, state stop-list |
| `claritybot/src/components/ResultsSection.tsx` | D | Priority badges, grouped display, 8 issue types |
| `claritybot/src/components/RewriteSection.tsx` | E | Verbatim prompt, temperature, streaming, 3-section parse |
| `claritybot/src/components/InputSection.tsx` | D.5 (lint) | `processFile` wrapped in `useCallback` |
| `claritybot/src/utils/fileParser.ts` | D.5 | Gap-aware PDF inter-token spacing |
| `build-summaries/upgrade-audit.md` | — | Audit document |
| `build-summaries/upgrade-summary.md` | — | This file |

---

## Intentionally not changed

- **Scaffold, layout, Tailwind config** — untouched per standing rule
- **`sentenceUtils.ts`** — calibrated sentence splitter preserved (see Change Set C decision)
- **`readabilityScorer.ts`** — custom formula implementations preserved; only `text-readability` syllable counting used
- **`jargonGlossary.ts`** — unchanged; Brian to review and trim for specific lines of business
- **`.env.example`, `.gitignore`** — no changes needed

---

## Syllable counter investigation (Brian request, 2026-04-07)

**Question:** Would switching from `text-readability`'s built-in syllable counter to the `syllable` npm package close the ~4-point FRE gap vs. Readable.com?

**Finding: No change possible or needed.** `text-readability` already delegates `syllableCount()` directly to the `syllable` npm package (`syllable@5.0.1`). Every word-level result is identical between `rs.syllableCount(word)` and `syllable(word)` (verified programmatically). There is no alternative to switch to.

**Root cause of FRE gap (decomposed mathematically):**

The Flesch formula has two inputs: words/sentence (W/S) and syllables/word (Syl/W). Solving the two-equation system (FRE + FK) for both tools simultaneously on COLLCOMP:

| Input | ClarityBot | Readable.com | Effect on FRE |
|---|---|---|---|
| Words/sentence | 11.32 | 12.82 | ClarityBot splits more sentences → FRE **higher** |
| Syllables/word | 1.659 | 1.687 | ClarityBot counts slightly fewer syllables → FRE **higher** |

Both differences push ClarityBot's FRE **above** Readable's, not below. The gap is entirely at the sentence-segmentation layer. The two tools count the same underlying syllables but disagree on sentence boundaries, which changes W/S and cascades through both FRE and FK. The CMU Pronouncing Dictionary would not close this gap for the same reason.

**Conclusion:** The ~4-point FRE gap is a sentence-boundary calibration residual, not a syllable-counting error. Closing it further requires more refined sentence detection (e.g. distinguishing enumeration continuations from true sentence starts). Tracked as known open issue. No code changes made.

**Final calibration decision (Brian, 2026-04-07):** Keep the calibrated single splitter. The +4–5 FRE gap vs. Readable.com is accepted because (a) ClarityBot scores are not cited externally, and (b) the calibrated approach is more accurate for insurance text than Readable.com's prose-tuned splitter. Scoring engine is now locked — no further changes.

**Methodology disclosure UI added:** An info icon (ℹ) appears beside each score card label. On hover or click, a popover explains ClarityBot's sentence segmentation approach and why scores may differ from Readable.com. Each of the four metrics has its own note:
- **Flesch RE:** explains ~4–5 point higher reading vs. Readable, notes identical formula, different sentence boundary detection
- **FK Grade:** explains ~1–2 grade lower reading, explains why shorter clause units correctly reduce apparent grade level
- **SMOG:** specifically notes ~3 grade lower reading vs. Readable, notes 30-sentence minimum for reliability
- **Gunning Fog:** explains -ed/-es suffix exclusion rule and why it differs from tools that omit it

---

## Open questions / next steps

1. **Change Set F (markdown rendering):** Awaiting Brian's approval after API key testing. Dependency question: can `marked` or `react-markdown` be added, or use regex renderer?
2. **BASE form gap / FRE residual:** COLLCOMP and GAP are within ~1.5–4 grades of Readable.com. Gap is sentence-boundary calibration, not syllable counting (see syllable investigation above). Accepted — scoring engine locked.
3. **Long-sentence diagnostic signal:** Zero long sentences on COLLCOMP after splitter calibration. A "dense paragraph" detector (flags paragraphs with high avg syllables/word even if individual sentences are short) could recover signal. Deferred to future phase.
4. **Geographic stop-list completeness:** Multi-word state references ("New York," "New Mexico," "New Hampshire," "North Carolina," "South Carolina," "North Dakota," "South Dakota," "Rhode Island," "West Virginia") are split into component words in the stop-list. Multi-word geography detection may need a secondary phrase filter if these appear as two-word Title Case sequences. Monitor in testing.
