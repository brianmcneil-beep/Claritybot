# Upgrade Audit — ClarityBot v1 → v2.1

**Audit date:** 2026-04-07  
**Auditor:** Cloud Agent (Cursor)  
**Basis:** Upgrade instructions provided in chat message. Note one blocker: the referenced file `claritybot-cursor-upgrade-instructions.md` is on the local machine and was not accessible from the cloud. The system prompt described as "verbatim from PRD Section 3.4" has not been read. See Change Set E note below.

---

## Files audited

| File | Role |
|---|---|
| `claritybot/src/App.tsx` | Top-level state, layout |
| `claritybot/src/components/InputSection.tsx` | Upload + textarea |
| `claritybot/src/components/ResultsSection.tsx` | Scores + diagnostics UI |
| `claritybot/src/components/RewriteSection.tsx` | API call + output display |
| `claritybot/src/utils/readabilityScorer.ts` | All four readability metrics |
| `claritybot/src/utils/sentenceUtils.ts` | Custom sentence splitter |
| `claritybot/src/utils/diagnostics.ts` | Four diagnostic checks |
| `claritybot/src/utils/fileParser.ts` | .txt / .docx / .pdf parsers |
| `claritybot/src/data/jargonGlossary.ts` | 70-term static glossary |
| `claritybot/.env.example` | API key template |
| `claritybot/.gitignore` | `.env` exclusion |
| `claritybot/package.json` | Installed dependencies |

---

## Change Set A — Architectural principle: scoring never via LLM

| Requirement | Status | Evidence |
|---|---|---|
| Scores computed locally, not by the model | ✅ SATISFIES | `readabilityScorer.ts` uses `text-readability` + manual formulas only. `RewriteSection.tsx` scores the rewrite body by calling `scoreText()` locally after the API returns. The LLM is never asked to produce a number. |

**No changes needed.**

---

## Change Set B — Input (Section 3.1)

| Requirement | Status | Evidence |
|---|---|---|
| Drag-and-drop zone (not just a button) | ✅ SATISFIES | `InputSection.tsx` has a full drop zone with `onDragOver`, `onDragLeave`, `onDrop` handlers, visual active state, and click-to-browse fallback. |
| Extracted text populates textarea, editable before analyzing | ✅ SATISFIES | `processFile()` calls `onTextChange(extracted)`, which sets `text` state in `App.tsx`. The textarea is bound to `text` and is always editable. |

**No changes needed.**

---

## Change Set C — Scoring (Section 3.2)

| Requirement | Status | Evidence |
|---|---|---|
| `text-readability` used for all four metrics | ⚠️ PARTIAL | `text-readability`'s `lexiconCount()` and `syllableCount()` are used. However, the four metric formulas are implemented manually in `readabilityScorer.ts` rather than calling `rs.fleschReadingEase()` etc. This was a deliberate calibration decision: the library's sentence splitter undercounts sentences in insurance documents by ~3x, so we override it with `sentenceUtils.ts`. The library is still used for syllable counting (the hard part). |
| Library's syllable counter used (not custom) | ✅ SATISFIES | `rs.syllableCount()` is the only syllable-counting call in both `readabilityScorer.ts` and `diagnostics.ts`. No custom syllable counter exists. |

**Decision recorded (Brian, 2026-04-07):** Keep the custom sentence splitter. The library's "use library functions" rule was intended to prevent custom syllable counting, not to mandate its sentence splitter. The library's sentence splitter is designed for prose; it systematically miscounts sentences in enumerated legal obligations (40.5 words/sentence vs. corrected ~13). The calibrated splitter is the correct approach. The Gunning Fog `-ed`/`-es` suffix exclusion is also retained. No code changes required for Change Set C. BASE form delta (~4 grades) tracked as a known open issue.

---

## Change Set D — Jargon diagnosis (Section 3.3)

| Requirement | Status | Evidence |
|---|---|---|
| Eight-category `issue_type` enum | ❌ MISSING | Current `DiagnosticItem` shape is `{ text, reason }`. No `issue_type` enum exists. |
| New shape: `{ section_label, problem_text, issue_type, why_problematic, priority }` | ❌ MISSING | Shape does not match. |
| LONG_SENTENCE check | ✅ EXISTS | `detectLongSentences()` in `diagnostics.ts` |
| PASSIVE_VOICE check | ✅ EXISTS | `detectPassiveVoice()` in `diagnostics.ts` |
| JARGON check | ✅ EXISTS | `detectJargon()` in `diagnostics.ts` |
| LONG_WORD check | ✅ EXISTS | `detectLongWords()` in `diagnostics.ts` |
| DOUBLE_NEGATIVE check | ❌ MISSING | Not implemented |
| NESTED_CONDITIONAL check | ❌ MISSING | Not implemented |
| NOMINALIZATION check | ❌ MISSING | Not implemented |
| DEFINED_TERM_OVERUSE check | ❌ MISSING | Not implemented |
| UI groups by `issue_type` with priority indicators | ❌ MISSING | UI groups by type (4 groups hardcoded) but no priority field or priority-based sorting/display |

**Changes needed:**
1. Define `IssueType` enum and new `DiagnosticItem` shape in `diagnostics.ts`
2. Migrate existing 4 checks to new shape
3. Implement 4 new checks
4. Update `DiagnosticsResult` type and `runDiagnostics()` return value
5. Update `ResultsSection.tsx` to consume new shape, show priority indicators

---

## Change Set E — Rewrite system prompt (Section 3.4)

| Requirement | Status | Evidence |
|---|---|---|
| Verbatim system prompt from PRD Section 3.4 | ⛔ CANNOT VERIFY | The file `claritybot-cursor-upgrade-instructions.md` containing the v2.1 PRD is on your local machine. I have not seen the verbatim prompt. The current prompt includes the 9 rules described in your message but may not match the exact wording in the spec. |
| Prompt includes role separation (Task A / Task B) | ❌ MISSING | Current prompt has no Task A / Task B structure |
| Prompt includes 11 numbered rewrite rules | ❌ MISSING | Current prompt has 9 bullet rules; the count and exact wording of the 11 rules in v2.1 are unknown |
| Prompt includes scoring anchor with both Flesch formulas | ❌ MISSING | No scoring anchor in current prompt |
| Prompt instructs model to output four sections | ❌ PARTIAL | Current prompt requests two output sections (rewritten text + Legal Integrity Verification). "Change Summary" section is not requested. The 4th section (Before & After Metrics) is supposed to be locally computed, not model-generated — current code already does this correctly. |
| `temperature: 0.2` | ❌ MISSING | `callApi()` does not set `temperature`. Default is 1.0. |
| `stream: true` (streaming) | ❌ MISSING | Currently non-streaming (single `.create()` call). Streaming requires switching to `stream()` method and accumulating chunks. |
| `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` | ✅ SATISFIES | `RewriteSection.tsx` line 87. |
| Model `claude-sonnet-4-5` | ✅ SATISFIES | `RewriteSection.tsx` line 89. |
| `max_tokens: 4096` | ✅ SATISFIES | `RewriteSection.tsx` line 90. |

**Blocker: I need the verbatim system prompt before I can implement Change Set E.** Please either paste it into the chat or share the file so I can read it.

**Changes needed (once prompt is received):**
1. Replace system prompt with verbatim v2.1 version
2. Add `temperature: 0.2` to the API call
3. Implement streaming using `client.messages.stream()`

---

## Change Set F — Rewrite output (Section 3.4)

| Requirement | Status | Evidence |
|---|---|---|
| Parse four-section output from model | ⚠️ PARTIAL | `splitResponse()` splits on `LEGAL INTEGRITY VERIFICATION`. Parses two sections (rewriteBody, legalVerification). "Change Summary" section is not parsed. |
| Render: Rewritten Document | ✅ SATISFIES | Shown in `<pre>` block. |
| Render: Change Summary | ❌ MISSING | Not parsed or rendered. |
| Render: Legal Integrity Verification | ✅ SATISFIES | Shown in green block. |
| Before & After Metrics (locally computed, side by side, all 4 metrics + word/sentence counts, deltas) | ⚠️ PARTIAL | 4-metric table exists with deltas. **Missing: word count and sentence count rows.** |
| Malformed output warning + raw output fallback | ❌ MISSING | If a section is missing, current code silently omits it with no warning. |
| Markdown rendering (headers, lists, bold) | ❌ MISSING | Output rendered in `<pre>` with `whitespace-pre-wrap`. Raw markdown characters show as literal text. |
| Visible warning if Legal Integrity Verification indicates a problem | ❌ MISSING | No heuristic scan of the verification text for problem indicators. |

**Changes needed:**
1. Add Change Summary to `splitResponse()` and render it
2. Add word count + sentence count rows to the before/after table
3. Implement malformed-output detection and warning UI
4. Add a markdown renderer (using `dangerouslySetInnerHTML` with a micro-parser, or install `marked` — but instructions say no new dependencies beyond what's installed; need clarification)
5. Add problem-indicator scan on Legal Integrity Verification text

**Question for Brian:** Markdown rendering requires a parser. The upgrade instructions say "do not introduce new dependencies beyond `@anthropic-ai/sdk` and `text-readability`." A lightweight markdown renderer like `marked` or `react-markdown` would be a new dependency. Options without a new dep: (a) implement a minimal renderer for `**bold**`, `# headers`, `- lists` using regex — covers ~90% of model output, or (b) ask to allow `marked` as a dependency. **Please advise.**

---

## Change Set G — Anti-hallucination guardrails (Section 11)

| Requirement | Status | Evidence |
|---|---|---|
| No invented state-specific Flesch thresholds / statute citations / DOI ratings / LOB-specific rules | ✅ SATISFIES | Score interpretations use standard published ranges only. No jurisdictional references anywhere in the codebase. |
| File parse errors surfaced clearly | ✅ SATISFIES | `parseError` state displayed in a red alert in `InputSection.tsx`. |
| App does not proceed with empty or partial text | ✅ SATISFIES | Analyze button disabled when `text.trim().length === 0`. Parse errors set `parseError` and do not call `onTextChange` with partial output. |
| Only Claude used (no GPT / Gemini fallback) | ✅ SATISFIES | Single `client.messages.create()` call with model hardcoded to `claude-sonnet-4-5`. No fallback logic. |

**No changes needed.**

---

## Summary table

| Change Set | Status | Action required |
|---|---|---|
| A — Scoring never via LLM | ✅ Satisfies | None |
| B — Input / drag-drop | ✅ Satisfies | None |
| C — Scoring library usage | ⚠️ Needs clarification | Wait for Brian to confirm sentence-counter question before touching |
| D — Diagnostics shape + 4 new checks | ❌ Missing | Significant work: new enum, new shape, 4 new detectors, updated UI |
| E — System prompt + temperature + streaming | ❌ Missing + ⛔ Blocked | Need verbatim prompt text; then add temperature, implement streaming |
| F — Rewrite output parsing + rendering | ❌ Partially missing | Change Summary section, word/sentence count rows, malformed output warning, markdown rendering (dep question), LIV problem detector |
| G — Anti-hallucination guardrails | ✅ Satisfies | None |

---

## Blockers requiring Brian's input before work begins

1. **Change Set C:** Confirm whether "use `text-readability` for all four metrics" means I should switch back to the library's sentence splitter (which will regress scores by ~10 grade levels) or whether using the library for syllables/words while keeping our custom sentence counter is acceptable.

2. **Change Set E:** Paste the verbatim v2.1 system prompt, or share `claritybot-cursor-upgrade-instructions.md` by pasting its contents into the chat.

3. **Change Set F (markdown):** Confirm whether `marked` (or equivalent) may be added as a dependency, or whether a minimal regex-based markdown renderer is acceptable.
