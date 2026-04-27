import { useState, useRef, useEffect } from 'react'
import {
  scoreText,
  interpretFleschReadingEase,
  interpretFleschKincaidGrade,
  interpretSmog,
  interpretGunningFog,
} from '../utils/readabilityScorer'
import { runDiagnostics, type DiagnosticItem, type IssueType, type Priority } from '../utils/diagnostics'
import {
  detectLOB,
  getLOBDisclosure,
  LOB_LABELS,
  type LOB,
} from '../utils/lobDetector'
import { INSURANCE_GLOSSARY, LONG_WORD_SYNONYMS } from '../data/insuranceGlossary'
import DocumentAnalysis from './DocumentAnalysis'

interface ResultsSectionProps {
  text: string
  onRewrite: () => void
}

// ---------------------------------------------------------------------------
// Methodology notes — one per metric
// ---------------------------------------------------------------------------

const METHODOLOGY_NOTES: Record<string, string> = {
  'Flesch Reading Ease':
    'ClarityBot\'s sentence segmentation treats enumerated policy clauses (numbered lists, semicolon-separated obligations, bulleted exclusions) as discrete sentences. This is more accurate for insurance forms than tools designed for general prose. As a result, ClarityBot\'s Flesch Reading Ease may read approximately 4–5 points higher than Readable.com on the same text. The underlying formula is identical; the difference is sentence boundary detection.',

  'Flesch-Kincaid Grade':
    'The Flesch-Kincaid Grade Level formula shares the same sentence segmentation as Flesch Reading Ease. Because ClarityBot correctly splits enumerated insurance clauses into shorter sentence units, the grade level will typically read 1–2 grades lower than tools designed for prose. This is intentional — those shorter clauses are shorter obligations, and counting them as one run-on sentence would overstate difficulty.',

  'SMOG Index':
    'SMOG (Simple Measure of Gobbledygook) counts polysyllabic words per 30 sentences and is particularly sensitive to sentence count. ClarityBot\'s calibrated splitter produces more sentence units from enumerated clauses, so SMOG scores will typically run ~3 grades lower than Readable.com on the same insurance text. SMOG is most reliable on documents with at least 30 sentences; on short extracts the formula\'s extrapolation introduces variance regardless of the segmentation approach.',

  'Gunning Fog':
    'Gunning Fog counts complex words (3+ syllables) as a fraction of total words, weighted by sentence length. ClarityBot applies Gunning\'s original -ed/-es suffix exclusion rule, which prevents over-counting heavily inflected insurance vocabulary (insured, excluded, covered, damaged) that are only polysyllabic due to their suffix. This exclusion is standard in the original Fog specification but omitted by some tools, which is why ClarityBot\'s Fog scores may differ from those tools.',
}

// ---------------------------------------------------------------------------
// Info popover
// ---------------------------------------------------------------------------

function InfoPopover({ metricLabel }: { metricLabel: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const note = METHODOLOGY_NOTES[metricLabel]

  // Close on outside click — hook must be called unconditionally
  useEffect(() => {
    if (!open || !note) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, note])

  if (!note) return null

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`About ${metricLabel} methodology`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd"
            d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8.75-2.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM7.25 6.5a.75.75 0 0 1 .75-.75h.25a.75.75 0 0 1 .75.75v3.25h.25a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5h.25V7.25H8a.75.75 0 0 1-.75-.75Z" />
        </svg>
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 rounded-xl border border-blue-100 bg-white shadow-lg px-4 py-3 text-xs text-gray-700 leading-relaxed"
        >
          <p className="font-semibold text-blue-700 mb-1">About {metricLabel}</p>
          <p>{note}</p>
          {/* Caret */}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-blue-100" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LOB disclosure — collapsible banner below the score card grid
// ---------------------------------------------------------------------------

/** Disclosure UI only — `lob` state affects `getLOBDisclosure(lob)` text only, never scores. */
function LOBDisclosure({ text, wordCount }: { text: string; wordCount: number }) {
  const detected = detectLOB(text, wordCount)
  const [lob, setLOB] = useState<LOB>(detected.lob)
  const [open, setOpen] = useState(false)

  // Re-detect whenever the scored text changes (new form loaded).
  // setState is deferred via queueMicrotask to satisfy react-hooks/set-state-in-effect.
  const prevTextRef = useRef(text)
  useEffect(() => {
    if (text === prevTextRef.current) return
    prevTextRef.current = text
    const next = detectLOB(text, wordCount)
    queueMicrotask(() => {
      setLOB(next.lob)
      setOpen(false)
    })
  }, [text, wordCount])

  const disclosure = getLOBDisclosure(lob)
  const isManual = lob !== detected.lob

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        {/* LOB selector */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-500 shrink-0">Line of business:</span>
          <select
            value={lob}
            onChange={(e) => { setLOB(e.target.value as LOB); setOpen(false) }}
            className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none cursor-pointer hover:text-blue-600 focus:text-blue-600 transition-colors truncate"
            aria-label="Select line of business for score context"
          >
            {(Object.entries(LOB_LABELS) as [LOB, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {isManual && (
            <span className="text-xs text-blue-500 shrink-0">(manual)</span>
          )}
          {!isManual && (
            <span className="text-xs text-gray-400 shrink-0">(auto-detected)</span>
          )}
        </div>

        {/* Expand / collapse toggle — only shown when there is disclosure text */}
        {disclosure ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide score context' : 'Show score context'}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 shrink-0 transition-colors"
          >
            <span>{open ? 'Hide context' : 'Score context'}</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
            >
              <path fillRule="evenodd"
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              />
            </svg>
          </button>
        ) : (
          <span className="text-xs text-gray-400 shrink-0">No context note for this LOB</span>
        )}
      </div>

      {open && disclosure && (
        <div className="border-t border-gray-200 px-4 py-3 bg-white">
          <p className="text-xs text-gray-600 leading-relaxed">{disclosure}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score cards
// ---------------------------------------------------------------------------

function ScoreCard({ label, value, interpretation }: { label: string; value: number; interpretation: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <InfoPopover metricLabel={label} />
      </div>
      <p className="mt-1 text-4xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600">{interpretation}</p>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diagnostic UI helpers
// ---------------------------------------------------------------------------

const ISSUE_TYPE_META: Record<IssueType, { label: string; note?: string }> = {
  LONG_SENTENCE:       { label: 'Long sentences (over 25 words)' },
  PASSIVE_VOICE:       { label: 'Passive voice', note: 'Heuristic detection — may include false positives.' },
  DOUBLE_NEGATIVE:     { label: 'Double negatives' },
  NESTED_CONDITIONAL:  { label: 'Nested conditionals (3+ if/unless/provided-that clauses)' },
  NOMINALIZATION:      { label: 'Nominalizations & verbose phrasing' },
  JARGON:              { label: 'Insurance jargon' },
  LONG_WORD:           { label: 'Long words (4+ syllables)' },
  DEFINED_TERM_OVERUSE:{ label: 'Defined term overuse (5+ occurrences)' },
}

const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low']

const PRIORITY_BADGE: Record<Priority, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-500',
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${PRIORITY_BADGE[priority]}`}>
      {priority}
    </span>
  )
}

function DiagnosticGroup({ issueType, items }: { issueType: IssueType; items: DiagnosticItem[] }) {
  const meta = ISSUE_TYPE_META[issueType]

  // Sort within group: high → medium → low
  const sorted = [...items].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
  )

  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{meta.label}</h3>
        <span className="text-xs text-gray-400">({items.length} found)</span>
      </div>
      {meta.note && (
        <p className="mb-2 text-xs text-gray-400 italic">{meta.note}</p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-green-600">None found.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item, i) => {
            // Inline suggestion lookup
            let suggestion: string | undefined
            if (item.issue_type === 'JARGON') {
              suggestion = INSURANCE_GLOSSARY[item.problem_text.toLowerCase()]
            } else if (item.issue_type === 'LONG_WORD') {
              suggestion = LONG_WORD_SYNONYMS[item.problem_text.toLowerCase()]
            }
            const suggestionText = suggestion
              ? `Suggested alternative: "${suggestion}"`
              : (item.issue_type === 'JARGON' || item.issue_type === 'LONG_WORD')
                ? item.issue_type === 'JARGON'
                  ? 'Consider replacing with a plain-language description of what this term means to the policyholder.'
                  : 'Consider replacing with a shorter, more familiar word.'
                : undefined

            return (
              <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-sm font-medium text-gray-800 break-words flex-1">
                    "{item.problem_text}"
                  </p>
                  <PriorityBadge priority={item.priority} />
                </div>
                <p className="text-xs text-gray-500">{item.why_problematic}</p>
                {suggestionText && (
                  <p className="text-xs text-blue-600 mt-1">
                    💡 {suggestionText}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// The display order for diagnostic groups in the UI.
const DISPLAY_ORDER: IssueType[] = [
  'LONG_SENTENCE',
  'NESTED_CONDITIONAL',
  'DOUBLE_NEGATIVE',
  'PASSIVE_VOICE',
  'NOMINALIZATION',
  'JARGON',
  'LONG_WORD',
  'DEFINED_TERM_OVERUSE',
]

export default function ResultsSection({ text, onRewrite }: ResultsSectionProps) {
  // Scoring and diagnostics depend only on `text`. LOB dropdown state must never
  // feed into scoreText, runDiagnostics, or any displayed numeric score.
  const scores = scoreText(text)
  const { items } = runDiagnostics(text)

  // Group items by issue_type
  const grouped = new Map<IssueType, DiagnosticItem[]>()
  for (const type of DISPLAY_ORDER) grouped.set(type, [])
  for (const item of items) {
    grouped.get(item.issue_type)?.push(item)
  }

  const totalIssues = items.length
  const highCount = items.filter(i => i.priority === 'high').length

  return (
    <section className="p-6 border-b border-gray-200">
      {/* Readability Scores */}
      <h2 className="text-base font-semibold text-gray-900 mb-4">Readability Scores</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ScoreCard
          label="Flesch Reading Ease"
          value={scores.fleschReadingEase}
          interpretation={interpretFleschReadingEase(scores.fleschReadingEase)}
        />
        <ScoreCard
          label="Flesch-Kincaid Grade"
          value={scores.fleschKincaidGrade}
          interpretation={interpretFleschKincaidGrade(scores.fleschKincaidGrade)}
        />
        <ScoreCard
          label="SMOG Index"
          value={scores.smogIndex}
          interpretation={interpretSmog(scores.smogIndex)}
        />
        <ScoreCard
          label="Gunning Fog"
          value={scores.gunningFog}
          interpretation={interpretGunningFog(scores.gunningFog)}
        />
      </div>

      <LOBDisclosure text={text} wordCount={scores.wordCount} />

      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 divide-y divide-gray-200">
        <StatRow label="Word count" value={scores.wordCount.toLocaleString()} />
        <StatRow label="Sentence count (raw)" value={scores.sentenceCount.toLocaleString()} />
        <StatRow label="Avg. words per sentence" value={scores.avgWordsPerSentence} />
        <StatRow label="Avg. syllables per word" value={scores.avgSyllablesPerWord} />
        <StatRow label="Prose sentences" value={scores.sentenceBreakdown.proseCount.toLocaleString()} />
        <StatRow label="List-item sentences" value={scores.sentenceBreakdown.listItemCount.toLocaleString()} />
        <StatRow label="Inline-numbered sentences" value={scores.sentenceBreakdown.inlineNumberedCount.toLocaleString()} />
        <StatRow label="Inline-numbered merged into parent" value={scores.sentenceBreakdown.inlineNumberedMerged.toLocaleString()} />
        <StatRow label="Effective sentence count (for scores)" value={scores.sentenceBreakdown.effectiveSentenceCount} />
      </div>

      {/* Document Analysis panel (enhancements 1–7) */}
      <div className="mt-5">
        <DocumentAnalysis text={text} scores={scores} />
      </div>

      {/* Diagnostics header */}
      <div className="flex items-baseline gap-3 mt-8 mb-4">
        <h2 className="text-base font-semibold text-gray-900">Diagnostics</h2>
        <span className="text-xs text-gray-400">{totalIssues} issues</span>
        {highCount > 0 && (
          <span className="text-xs font-semibold text-red-600">{highCount} high priority</span>
        )}
      </div>

      {DISPLAY_ORDER.map((issueType) => (
        <DiagnosticGroup
          key={issueType}
          issueType={issueType}
          items={grouped.get(issueType) ?? []}
        />
      ))}

      {/* Rewrite trigger */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onRewrite}
          className="px-6 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Rewrite Form
        </button>
      </div>
    </section>
  )
}
