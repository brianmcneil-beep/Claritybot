# ClarityBot

Readability and plain-language rewrites for insurance policy forms.

## What it does

1. **Score** — paste or upload a policy form and click **Analyze** to get four readability scores (Flesch Reading Ease, Flesch-Kincaid Grade Level, SMOG Index, Gunning Fog) plus word/sentence counts.
2. **Diagnose** — instantly see which specific language is dragging the score down: long sentences, insurance jargon, passive voice constructions, and multi-syllable words.
3. **Rewrite** — click **Rewrite Form** to send the text to Claude and get a plain-language version back on screen.

Scoring and diagnostics run entirely in the browser. The only network call is the optional Anthropic rewrite.

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd claritybot
npm install
```

### 2. Add your Anthropic API key

Create a `.env` file in the `claritybot/` directory (where `package.json` lives):

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

A `.env.example` template is included. The `.env` file is git-ignored and will never be committed.

> The rewrite feature requires a key. Readability scoring and diagnostics work without one.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or Safari.

---

## Usage

1. **Paste** policy text into the textarea, or click **Upload file** to load a `.txt`, `.docx`, or `.pdf`. The extracted text loads into the textarea so you can review and edit it before analyzing.
2. Click **Analyze**. Scores and diagnostics appear immediately (100% client-side, no API call).
3. Review the diagnostics — long sentences, jargon hits, passive voice, and long words are grouped into separate lists.
4. Click **Rewrite Form** to send the text to Claude (`claude-sonnet-4-5`) for a plain-language rewrite. The rewrite appears below. This call typically takes 10–30 seconds.

---

## Adding or editing jargon terms

The jargon glossary lives in:

```
src/data/jargonGlossary.ts
```

It is a plain TypeScript string array. To add a term, append it to the array:

```ts
'your new term here',
```

Terms are matched case-insensitively and support multi-word phrases (e.g., `'actual cash value'`). After editing, restart the dev server (or rebuild) for the change to take effect.

---

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Serve it with any static file server (e.g., `npx serve dist`).

---

## Tech stack

| Concern | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 |
| Readability metrics | `text-readability` |
| `.docx` parsing | `mammoth` |
| `.pdf` parsing | `pdfjs-dist` |
| AI rewrite | `@anthropic-ai/sdk` → `claude-sonnet-4-5` |
