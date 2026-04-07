import {
  scoreText,
  interpretFleschReadingEase,
  interpretFleschKincaidGrade,
  interpretSmog,
  interpretGunningFog,
} from '../utils/readabilityScorer'
import { runDiagnostics, type DiagnosticItem } from '../utils/diagnostics'

interface ResultsSectionProps {
  text: string
  onRewrite: () => void
}

interface ScoreCardProps {
  label: string
  value: number
  interpretation: string
}

function ScoreCard({ label, value, interpretation }: ScoreCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-4xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600">{interpretation}</p>
    </div>
  )
}

interface StatRowProps {
  label: string
  value: number | string
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  )
}

interface DiagnosticGroupProps {
  title: string
  items: DiagnosticItem[]
  note?: string
}

function DiagnosticGroup({ title, items, note }: DiagnosticGroupProps) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">({items.length} found)</span>
      </div>
      {note && (
        <p className="mb-2 text-xs text-gray-400 italic">{note}</p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-green-600">None found.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-800 break-words">"{item.text}"</p>
              <p className="mt-0.5 text-xs text-gray-500">{item.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ResultsSection({ text, onRewrite }: ResultsSectionProps) {
  const scores = scoreText(text)
  const diagnostics = runDiagnostics(text)

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

      {/* Supporting counts */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 divide-y divide-gray-200">
        <StatRow label="Word count" value={scores.wordCount.toLocaleString()} />
        <StatRow label="Sentence count" value={scores.sentenceCount.toLocaleString()} />
        <StatRow label="Avg. words per sentence" value={scores.avgWordsPerSentence} />
        <StatRow label="Avg. syllables per word" value={scores.avgSyllablesPerWord} />
      </div>

      {/* Diagnostics */}
      <h2 className="text-base font-semibold text-gray-900 mt-8 mb-4">Diagnostics</h2>

      <DiagnosticGroup
        title="Long sentences (over 25 words)"
        items={diagnostics.longSentences}
      />
      <DiagnosticGroup
        title="Insurance jargon"
        items={diagnostics.jargon}
      />
      <DiagnosticGroup
        title="Passive voice"
        items={diagnostics.passiveVoice}
        note="Detected using a heuristic pattern — may include false positives."
      />
      <DiagnosticGroup
        title="Long words (4+ syllables)"
        items={diagnostics.longWords}
      />

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
