import { useState, useEffect } from 'react'
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

const SYSTEM_PROMPT = `You are a plain-language editor for insurance policy forms. Rewrite the form below to improve readability for an average consumer (target: 7th–9th grade reading level), while preserving all coverage terms, exclusions, conditions, and legal meaning. Follow these additional rules:

- Break long sentences into shorter ones (target 15–20 words per sentence).
- Eliminate double negatives.
- Flatten nested conditionals into direct statements.
- Replace nominalizations with verb forms (e.g., "make a determination" → "determine").
- Preserve "shall," "must," and "may" distinctions exactly — these have legal significance.
- Use "you/your" for the policyholder and "we/our" for the insurer where appropriate.
- Do not add coverage. Do not remove coverage.
- Do not change defined terms (capitalized terms in the original) unless the change is purely stylistic.
- Keep the same overall structure (sections, numbering, headers).

After the rewritten form, append a section with exactly this heading on its own line:
LEGAL INTEGRITY VERIFICATION
Then provide a brief confirmation (3–5 bullet points) that exclusions, conditions, and defined terms were preserved unchanged, noting any specific items checked.

Return only the rewritten form text followed by the Legal Integrity Verification section. No preamble, no commentary, no markdown formatting.`

/**
 * Split the API response into the rewrite body and the Legal Integrity
 * Verification section. The model is instructed to use the heading
 * "LEGAL INTEGRITY VERIFICATION" on its own line as a delimiter.
 */
function splitResponse(raw: string): { rewriteBody: string; legalVerification: string } {
  const marker = /^LEGAL INTEGRITY VERIFICATION\s*$/im
  const match = marker.exec(raw)
  if (!match || match.index === undefined) {
    return { rewriteBody: raw.trim(), legalVerification: '' }
  }
  return {
    rewriteBody: raw.slice(0, match.index).trim(),
    legalVerification: raw.slice(match.index + match[0].length).trim(),
  }
}

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
      <td className="py-2 pr-4 text-sm text-gray-600 text-right">{original}</td>
      <td className="py-2 pr-4 text-sm text-gray-600 text-right">{rewrite}</td>
      <td className={`py-2 text-sm font-semibold text-right ${color}`}>
        {same ? '—' : `${sign}${round(delta, 1)}`}
      </td>
      <td className="py-2 pl-4 text-xs text-gray-400 hidden sm:table-cell">{interpretation}</td>
    </tr>
  )
}

function round(n: number, decimals: number): number {
  return Math.round(n * (10 ** decimals)) / (10 ** decimals)
}

async function callApi(apiKey: string, text: string): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  })
  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response format from API.')
  return content.text
}

export default function RewriteSection({ originalText, originalScores, apiKey }: RewriteSectionProps) {
  const [rawResponse, setRawResponse] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setRawResponse(null)

    callApi(apiKey, originalText)
      .then((text) => { if (!cancelled) setRawResponse(text) })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error. Please try again.')
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [originalText, apiKey])

  function handleRetry() {
    setError(null)
    setRawResponse(null)
    setIsLoading(true)
    callApi(apiKey, originalText)
      .then((text) => setRawResponse(text))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error.'))
      .finally(() => setIsLoading(false))
  }

  const parsed = rawResponse ? splitResponse(rawResponse) : null
  const rewriteScores = parsed ? scoreText(parsed.rewriteBody) : null

  return (
    <section className="p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Plain-Language Rewrite</h2>

      {isLoading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm">
          <svg className="animate-spin h-5 w-5 text-indigo-500 shrink-0" xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Generating rewrite — this may take 10–30 seconds…</span>
        </div>
      )}

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

      {parsed && rewriteScores && (
        <>
          {/* Before / after score comparison */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
            <div className="px-5 py-3 bg-gray-100 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Score comparison — original vs. rewrite</h3>
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
                  <ScoreRow
                    label="Flesch Reading Ease"
                    original={originalScores.fleschReadingEase}
                    rewrite={rewriteScores.fleschReadingEase}
                    higherIsBetter={true}
                    interpretation={interpretFleschReadingEase(rewriteScores.fleschReadingEase)}
                  />
                  <ScoreRow
                    label="FK Grade Level"
                    original={originalScores.fleschKincaidGrade}
                    rewrite={rewriteScores.fleschKincaidGrade}
                    higherIsBetter={false}
                    interpretation={interpretFleschKincaidGrade(rewriteScores.fleschKincaidGrade)}
                  />
                  <ScoreRow
                    label="SMOG Index"
                    original={originalScores.smogIndex}
                    rewrite={rewriteScores.smogIndex}
                    higherIsBetter={false}
                    interpretation={interpretSmog(rewriteScores.smogIndex)}
                  />
                  <ScoreRow
                    label="Gunning Fog"
                    original={originalScores.gunningFog}
                    rewrite={rewriteScores.gunningFog}
                    higherIsBetter={false}
                    interpretation={interpretGunningFog(rewriteScores.gunningFog)}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* Rewritten text */}
          <pre className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
            {parsed.rewriteBody}
          </pre>

          {/* Legal Integrity Verification */}
          {parsed.legalVerification && (
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <h3 className="text-sm font-semibold text-green-800 mb-2">Legal Integrity Verification</h3>
              <pre className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed font-sans">
                {parsed.legalVerification}
              </pre>
            </div>
          )}
        </>
      )}
    </section>
  )
}
