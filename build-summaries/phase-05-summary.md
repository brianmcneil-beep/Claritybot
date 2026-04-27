# Phase 05 — Anthropic Rewrite

## What was built

- `src/components/RewriteSection.tsx` — full implementation:
  - Triggers the Anthropic API call automatically when the component mounts (i.e., immediately after "Rewrite Form" is clicked).
  - Uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` (per PRD Section 5 — acceptable because this runs locally with the key in `.env`).
  - Model: `claude-sonnet-4-5` (per PRD Section 3.4).
  - `max_tokens`: 4096 (per PRD Section 3.4).
  - System prompt: verbatim from PRD Section 3.4.
  - **Loading state**: animated spinner + "Generating rewrite — this may take 10–30 seconds…" message.
  - **Error state**: red alert box showing the error message, with a **Retry** button.
  - **Success state**: rewrite displayed in a styled `<pre>` block with `whitespace-pre-wrap`.
  - Cleanup: `cancelled` flag prevents state updates after component unmount.
- `App.tsx`: `hasRewrite` flag controls visibility of `RewriteSection`; resetting to `false` when text is edited or Analyze is re-clicked.

## Decisions made

- **API call fires on mount** rather than requiring a second button click inside the component — clicking "Rewrite Form" is the user's intent signal; no additional confirmation needed.
- **`useEffect` with cancellation flag** — prevents stale state updates if the user edits text while a rewrite is in flight.
- **Retry uses a direct `.then()/.catch()` chain** (not `useEffect`) to avoid re-mounting the component, keeping the existing rewrite visible until the retry completes.
- **Missing API key** shows the yellow banner (set in Phase 1) and the RewriteSection will display an error from the SDK if the user clicks Rewrite anyway.

## Files created or modified

- `claritybot/src/components/RewriteSection.tsx` — replaced placeholder with full implementation
- `claritybot/src/App.tsx` — `hasRewrite` state, reset logic, `onRewrite` prop

## Open questions or assumptions

- If documents exceed ~3,000 words, the `max_tokens: 4096` limit may truncate the rewrite. Brian can increase this in a later iteration.

## What's next

- **Phase 6 — Polish & README**: write `README.md`, review empty/loading states, minor visual cleanup.
