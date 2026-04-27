import { useState, useEffect, useRef } from 'react'
import Anthropic from '@anthropic-ai/sdk'
import {
  scoreText,
  interpretFleschReadingEase,
  interpretFleschKincaidGrade,
  interpretSmog,
  interpretGunningFog,
  type ReadabilityScores,
} from '../utils/readabilityScorer'

interface RewriteSectionProps {
  originalText: string
  originalScores: ReadabilityScores
  apiKey: string
}

// ---------------------------------------------------------------------------
// Verbatim system prompt — do not modify
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are ClarityBot, a senior insurance policy plain-language specialist.
Your job is to improve readability while preserving legal meaning, coverage intent, conditions, exclusions, definitions, and operative effect.
═══════════════════════════════════════════════
ROLE SEPARATION — THIS IS CRITICAL
═══════════════════════════════════════════════
You are performing TWO distinct tasks in this response. You MUST treat them as independent operations:
TASK A — JARGON ANALYSIS: Identify and classify problematic sentences. For each one, explain the issue and propose a revision. This is an ANALYTICAL task — be precise, conservative, and evidence-based.
TASK B — FULL DOCUMENT REWRITE: Rewrite the entire document for readability. This is a CONSTRAINED CREATIVE task — you may only change what needs changing. Every sentence that already meets readability standards MUST appear in the rewrite VERBATIM, character-for-character.
═══════════════════════════════════════════════
REWRITE RULES (apply to both tasks)
═══════════════════════════════════════════════

Do not add, remove, broaden, narrow, or reinterpret coverage.
Do not change legal effect.
Preserve document structure, section ordering, headings, and defined terms unless a clearer substitute is clearly safe.
Prefer minimal edits. Leave already clear sentences unchanged unless revision is needed for consistency, flow, or legal clarity.
Break long or run-on sentences into shorter ones where safe (target 15–20 words per sentence).
Replace jargon and legalese with plain language where safe.
Convert passive voice to active voice where safe.
Eliminate double negatives where safe.
Use "you" and "we" instead of "the insured" and "the company" where appropriate and legally safe.
If language appears statutory, quoted, or state-mandated, preserve it unless clearly editable without changing meaning.
Preserve "shall," "must," and "may" distinctions exactly — these have legal significance.

═══════════════════════════════════════════════
SCORING ANCHOR — READ THIS CAREFULLY
═══════════════════════════════════════════════
The Flesch-Kincaid Reading Ease is computed as:
FRE = 206.835 - 1.015 × (total_words / total_sentences) - 84.6 × (total_syllables / total_words)
The FK Grade Level is computed as:
FKGL = 0.39 × (total_words / total_sentences) + 11.8 × (total_syllables / total_words) - 15.59
When you write a rewrite, mentally verify:

Did I reduce the word count per sentence (by splitting or tightening)?
Did I reduce the average syllable count per word (by replacing complex words)?
If neither changed, the FRE will NOT improve — do not produce cosmetic-only edits.

The CALLER will independently score your rewrite using the exact formulas above. Your work will be graded by math, not by subjective judgment. Do not over-rewrite sentences that are already compliant — this wastes effort and risks changing legal meaning for no score benefit.
═══════════════════════════════════════════════
OUTPUT STRUCTURE — RETURN ALL THREE SECTIONS
═══════════════════════════════════════════════
Rewritten Document
The complete rewritten text. Compliant sentences appear unchanged. Mark each revised sentence by appending [REVISED] at the end of that sentence.
Change Summary
A bulleted list of every change made. For each:

Section reference
Brief description of what changed and why
The issue type addressed (LONG_SENTENCE, PASSIVE_VOICE, etc.)

Legal Integrity Verification
Confirm in plain text:

All exclusions preserved (list them by section)
All conditions preserved
All defined terms unchanged
No coverage added or removed
All statutory or quoted language left intact`

// ---------------------------------------------------------------------------
// Response parsing — three-section structure
// ---------------------------------------------------------------------------

interface ParsedResponse {
  rewrittenDocument: string
  changeSummary: string
  legalVerification: string
  malformed: boolean
  raw: string
}

/**
 * The model is instructed to output three sections delimited by the headings:
 *   "Rewritten Document"
 *   "Change Summary"
 *   "Legal Integrity Verification"
 *
 * We match these as case-insensitive headings on their own line.
 * If any section is missing, malformed=true and the raw text is preserved.
 */
function parseResponse(raw: string): ParsedResponse {
  const rewrittenDocRe = /^Rewritten Document\s*$/im
  const changeSummaryRe = /^Change Summary\s*$/im
  const legalVerificationRe = /^Legal Integrity Verification\s*$/im

  const m1 = rewrittenDocRe.exec(raw)
  const m2 = changeSummaryRe.exec(raw)
  const m3 = legalVerificationRe.exec(raw)

  const malformed = !m1 || !m2 || !m3

  if (malformed) {
    return {
      rewrittenDocument: '',
      changeSummary: '',
      legalVerification: '',
      malformed: true,
      raw,
    }
  }

  const docStart = m1.index + m1[0].length
  const summaryStart = m2.index + m2[0].length
  const livStart = m3.index + m3[0].length

  return {
    rewrittenDocument: raw.slice(docStart, m2.index).trim(),
    changeSummary: raw.slice(summaryStart, m3.index).trim(),
    legalVerification: raw.slice(livStart).trim(),
    malformed: false,
    raw,
  }
}

/** Heuristic: scan the Legal Integrity Verification text for problem signals. */
function livHasWarning(liv: string): boolean {
  const problemPatterns = [
    /coverage (added|removed|changed|broadened|narrowed)/i,
    /exclusion.{0,30}(changed|removed|altered|missing)/i,
    /defined term.{0,30}(changed|altered|removed)/i,
    /unable to (verify|confirm|preserve)/i,
    /could not (verify|confirm|preserve)/i,
    /\bcannot confirm\b/i,
    /\bnot preserved\b/i,
    /\bmodified the (exclusion|condition|definition)\b/i,
  ]
  return problemPatterns.some((re) => re.test(liv))
}

// ---------------------------------------------------------------------------
// Streaming API call
// ---------------------------------------------------------------------------

/**
 * Opens a streaming request via client.messages.stream().
 * Calls onDelta with each text delta as it arrives.
 * Returns the final accumulated text.
 * Accepts an AbortController signal for cancellation.
 */
async function streamRewrite(
  apiKey: string,
  text: string,
  onDelta: (accumulated: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  })

  // Abort handling: if the signal fires, destroy the stream
  signal.addEventListener('abort', () => stream.abort(), { once: true })

  let accumulated = ''
  stream.on('text', (delta: string) => {
    accumulated += delta
    onDelta(accumulated)
  })

  await stream.finalMessage()
  return accumulated
}

// ---------------------------------------------------------------------------
// Score comparison table
// ---------------------------------------------------------------------------

interface ScoreRowProps {
  label: string
  original: number
  rewrite: number
  higherIsBetter: boolean
  interpretation: string
}

function ScoreRow({ label, original, rewrite, higherIsBetter, interpretation }: ScoreRowProps) {
  const improved = higherIsBetter ? rewrite > original : rewrite < original
  const same = rewrite === original
  const delta = rewrite - original
  const sign = delta > 0 ? '+' : ''
  const color = same ? 'text-gray-500' : improved ? 'text-green-600' : 'text-red-500'

  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-4 text-sm font-medium text-gray-700 whitespace-nowrap">{label}</td>
      <td className="py-2 pr-4 text-sm text-gray-600 text-right tabular-nums">{original}</td>
      <td className="py-2 pr-4 text-sm text-gray-600 text-right tabular-nums">{rewrite}</td>
      <td className={`py-2 text-sm font-semibold text-right tabular-nums ${color}`}>
        {same ? '—' : `${sign}${roundNum(delta, 1)}`}
      </td>
      <td className="py-2 pl-4 text-xs text-gray-400 hidden sm:table-cell">{interpretation}</td>
    </tr>
  )
}

function roundNum(n: number, decimals: number): number {
  return Math.round(n * (10 ** decimals)) / (10 ** decimals)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RewriteSection({ originalText, originalScores, apiKey }: RewriteSectionProps) {
  const [streamedText, setStreamedText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller

    async function run() {
      setIsStreaming(true)
      setIsDone(false)
      setError(null)
      setStreamedText('')
      try {
        await streamRewrite(
          apiKey,
          originalText,
          (accumulated) => {
            if (!controller.signal.aborted) setStreamedText(accumulated)
          },
          controller.signal,
        )
        if (!controller.signal.aborted) setIsDone(true)
      } catch (err: unknown) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unknown error. Please try again.')
      } finally {
        if (!controller.signal.aborted) setIsStreaming(false)
      }
    }

    run()
    return () => controller.abort()
  }, [originalText, apiKey])

  function handleRetry() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setStreamedText('')
    setIsDone(false)
    setIsStreaming(true)

    streamRewrite(
      apiKey,
      originalText,
      (accumulated) => {
        if (!controller.signal.aborted) setStreamedText(accumulated)
      },
      controller.signal,
    )
      .then(() => { if (!controller.signal.aborted) setIsDone(true) })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unknown error.')
      })
      .finally(() => { if (!controller.signal.aborted) setIsStreaming(false) })
  }

  // Only parse the full response once streaming is complete — avoid parsing
  // mid-stream text where section headings may not yet have arrived.
  const parsed: ParsedResponse | null = isDone ? parseResponse(streamedText) : null
  const rewriteScores = parsed && !parsed.malformed ? scoreText(parsed.rewrittenDocument) : null
  const showLivWarning = parsed && !parsed.malformed && livHasWarning(parsed.legalVerification)

  return (
    <section className="p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Plain-Language Rewrite</h2>

      {/* Loading / streaming indicator */}
      {isStreaming && (
        <div className="mb-4">
          <div className="flex items-center gap-3 text-gray-500 text-sm mb-3">
            <svg className="animate-spin h-5 w-5 text-indigo-500 shrink-0" xmlns="http://www.w3.org/2000/svg"
              fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Generating rewrite — streaming…</span>
          </div>
          {/* Live stream preview */}
          {streamedText && (
            <pre className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans opacity-75 max-h-72 overflow-y-auto">
              {streamedText}
            </pre>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Rewrite failed</p>
          <p className="mt-1 break-words">{error}</p>
          <button onClick={handleRetry}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Malformed output warning */}
      {parsed?.malformed && (
        <div role="alert" className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          <p className="font-semibold">Output format warning</p>
          <p className="mt-1">The model did not return all three expected sections (Rewritten Document / Change Summary / Legal Integrity Verification). The raw output is shown below.</p>
          <pre className="mt-3 rounded bg-yellow-100 px-4 py-3 text-xs whitespace-pre-wrap break-words">
            {parsed.raw}
          </pre>
        </div>
      )}

      {/* Parsed output — only shown when streaming is done and output is well-formed */}
      {parsed && !parsed.malformed && rewriteScores && (
        <>
          {/* LIV problem warning */}
          {showLivWarning && (
            <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p className="font-semibold">⚠ Legal Integrity Warning</p>
              <p className="mt-1">The Legal Integrity Verification section may indicate a problem with preserved coverage, exclusions, or defined terms. Review carefully before use.</p>
            </div>
          )}

          {/* Before / after score comparison */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
            <div className="px-5 py-3 bg-gray-100 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Score comparison — original vs. rewrite</h3>
              <p className="text-xs text-gray-400 mt-0.5">Scores computed locally using the calibrated readability engine.</p>
            </div>
            <div className="px-5 py-2 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="py-2 pr-4 text-left">Metric</th>
                    <th className="py-2 pr-4 text-right">Original</th>
                    <th className="py-2 pr-4 text-right">Rewrite</th>
                    <th className="py-2 text-right">Delta</th>
                    <th className="py-2 pl-4 text-left hidden sm:table-cell">Rewrite interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  <ScoreRow label="Flesch Reading Ease"
                    original={originalScores.fleschReadingEase} rewrite={rewriteScores.fleschReadingEase}
                    higherIsBetter={true} interpretation={interpretFleschReadingEase(rewriteScores.fleschReadingEase)} />
                  <ScoreRow label="FK Grade Level"
                    original={originalScores.fleschKincaidGrade} rewrite={rewriteScores.fleschKincaidGrade}
                    higherIsBetter={false} interpretation={interpretFleschKincaidGrade(rewriteScores.fleschKincaidGrade)} />
                  <ScoreRow label="SMOG Index"
                    original={originalScores.smogIndex} rewrite={rewriteScores.smogIndex}
                    higherIsBetter={false} interpretation={interpretSmog(rewriteScores.smogIndex)} />
                  <ScoreRow label="Gunning Fog"
                    original={originalScores.gunningFog} rewrite={rewriteScores.gunningFog}
                    higherIsBetter={false} interpretation={interpretGunningFog(rewriteScores.gunningFog)} />
                  <ScoreRow label="Word count"
                    original={originalScores.wordCount} rewrite={rewriteScores.wordCount}
                    higherIsBetter={false} interpretation={`${rewriteScores.wordCount.toLocaleString()} words`} />
                  <ScoreRow label="Sentence count"
                    original={originalScores.sentenceCount} rewrite={rewriteScores.sentenceCount}
                    higherIsBetter={true} interpretation={`${rewriteScores.sentenceCount.toLocaleString()} sentences`} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Rewritten Document */}
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Rewritten Document</h3>
          <pre className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
            {parsed.rewrittenDocument}
          </pre>

          {/* Change Summary */}
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Change Summary</h3>
          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
              {parsed.changeSummary}
            </pre>
          </div>

          {/* Legal Integrity Verification */}
          <h3 className={`text-sm font-semibold mb-2 ${showLivWarning ? 'text-red-700' : 'text-green-700'}`}>
            Legal Integrity Verification
          </h3>
          <div className={`rounded-xl border px-5 py-4 ${showLivWarning ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            <pre className={`text-sm whitespace-pre-wrap leading-relaxed font-sans ${showLivWarning ? 'text-red-900' : 'text-green-900'}`}>
              {parsed.legalVerification}
            </pre>
          </div>
        </>
      )}
    </section>
  )
}
