import {
  scoreText,
  interpretFleschReadingEase,
  interpretFleschKincaidGrade,
  interpretSmog,
  interpretGunningFog,
} from '../utils/readabilityScorer'
import { runDiagnostics, type DiagnosticItem, type IssueType, type Priority } from '../utils/diagnostics'

interface ResultsSectionProps {
  text: string
  onRewrite: () => void
}

// ---------------------------------------------------------------------------
// Score cards
// ---------------------------------------------------------------------------

function ScoreCard({ label, value, interpretation }: { label: string; value: number; interpretation: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
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
          {sorted.map((item, i) => (
            <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="text-sm font-medium text-gray-800 break-words flex-1">
                  "{item.problem_text}"
                </p>
                <PriorityBadge priority={item.priority} />
              </div>
              <p className="text-xs text-gray-500">{item.why_problematic}</p>
            </li>
          ))}
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

      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 divide-y divide-gray-200">
        <StatRow label="Word count" value={scores.wordCount.toLocaleString()} />
        <StatRow label="Sentence count" value={scores.sentenceCount.toLocaleString()} />
        <StatRow label="Avg. words per sentence" value={scores.avgWordsPerSentence} />
        <StatRow label="Avg. syllables per word" value={scores.avgSyllablesPerWord} />
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
