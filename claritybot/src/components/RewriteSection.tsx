import { useState, useEffect } from 'react'
import Anthropic from '@anthropic-ai/sdk'

interface RewriteSectionProps {
  text: string
  apiKey: string
}

const SYSTEM_PROMPT =
  'You are a plain-language editor for insurance policy forms. Rewrite the form below to improve readability for an average consumer (target: 7th–9th grade reading level), while preserving all coverage terms, exclusions, conditions, and legal meaning. Do not add coverage. Do not remove coverage. Do not change defined terms (capitalized terms in the original) unless the change is purely stylistic. Keep the same overall structure (sections, numbering, headers). Return only the rewritten form text, with no preamble, no commentary, and no markdown formatting.'

export default function RewriteSection({ text, apiKey }: RewriteSectionProps) {
  const [rewrite, setRewrite] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Trigger the API call as soon as this component mounts (i.e., when Rewrite is clicked).
  useEffect(() => {
    let cancelled = false

    async function fetchRewrite() {
      setIsLoading(true)
      setError(null)
      setRewrite(null)

      try {
        const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
        const message = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
        })

        if (cancelled) return

        const content = message.content[0]
        if (content.type === 'text') {
          setRewrite(content.text)
        } else {
          setError('Unexpected response format from API.')
        }
      } catch (err) {
        if (cancelled) return
        const msg =
          err instanceof Error ? err.message : 'Unknown error. Please try again.'
        setError(msg)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchRewrite()
    return () => { cancelled = true }
  }, [text, apiKey])

  function handleRetry() {
    setError(null)
    setRewrite(null)
    setIsLoading(true)

    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    client.messages
      .create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      })
      .then((message) => {
        const content = message.content[0]
        if (content.type === 'text') {
          setRewrite(content.text)
        } else {
          setError('Unexpected response format from API.')
        }
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : 'Unknown error. Please try again.'
        setError(msg)
      })
      .finally(() => setIsLoading(false))
  }

  return (
    <section className="p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Plain-Language Rewrite</h2>

      {isLoading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm">
          <svg
            className="animate-spin h-5 w-5 text-indigo-500 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Generating rewrite — this may take 10–30 seconds…</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold">Rewrite failed</p>
          <p className="mt-1 break-words">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {rewrite && (
        <pre className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
          {rewrite}
        </pre>
      )}
    </section>
  )
}
