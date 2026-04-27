import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import {
  calcReadingTime,
  buildHistogram,
  buildHeatmap,
  buildWordFrequency,
  calcPassiveStats,
  type HeatLevel,
} from '../utils/documentAnalysis'
import type { ReadabilityScores, SentenceBreakdown } from '../utils/readabilityScorer'

interface DocumentAnalysisProps {
  text: string
  scores: ReadabilityScores
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
}

// ---------------------------------------------------------------------------
// Enhancement 1 — Reading Time
// ---------------------------------------------------------------------------

function ReadingTimeCard({ wordCount }: { wordCount: number }) {
  const rt = calcReadingTime(wordCount)
  const fmt = (n: number) => n === 1 ? '1 minute' : `${n} minutes`
  return (
    <div>
      <SectionHeader title="Estimated Reading Time" />
      <p className="text-sm text-gray-700">
        <span className="font-semibold">{fmt(rt.avgMinutes)}</span>
        <span className="text-gray-500"> at average reading speed (238 wpm)</span>
      </p>
      <p className="text-sm text-gray-500 mt-0.5">
        {fmt(rt.slowMinutes)} at slower reading speed (150 wpm)
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement 2 — FRE Target Indicator
// ---------------------------------------------------------------------------

const FRE_MARKERS = [
  { value: 40, label: 'Difficult' },
  { value: 45, label: 'Standard' },
  { value: 50, label: 'Good' },
  { value: 60, label: 'Plain\nLanguage' },
]

function FRETarget({ fre }: { fre: number }) {
  const [target, setTarget] = useState(45)
  const gap = Math.round((target - fre) * 10) / 10
  const met = fre >= target
  const clamp = (n: number) => Math.min(100, Math.max(0, n))
  // Map FRE 0–100 to bar width
  const freBarPct = clamp(fre)
  const targetPct = clamp(target)

  return (
    <div>
      <SectionHeader title="Flesch RE Target" />
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-gray-500">Target:</span>
        <input
          type="number"
          min={0} max={100}
          value={target}
          onChange={(e) => setTarget(Math.min(100, Math.max(0, Number(e.target.value))))}
          className="w-16 text-sm border border-gray-300 rounded px-2 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
          aria-label="FRE target score"
        />
        <span className={`text-sm font-semibold ${met ? 'text-green-600' : 'text-gray-600'}`}>
          {met
            ? `${Math.abs(gap)} pts above target`
            : `${gap} pts to reach target`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-5 rounded-full bg-gray-200 overflow-visible mb-4">
        {/* Filled bar up to current FRE */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-blue-400 transition-all"
          style={{ width: `${freBarPct}%` }}
        />
        {/* Target marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-gray-700"
          style={{ left: `${targetPct}%` }}
        />
        {/* Current score label */}
        <span
          className="absolute -top-5 text-xs font-semibold text-blue-700 -translate-x-1/2"
          style={{ left: `${freBarPct}%` }}
        >{fre}</span>
      </div>

      {/* Reference markers */}
      <div className="relative h-4 mb-1">
        {FRE_MARKERS.map(({ value, label }) => (
          <div
            key={value}
            className="absolute flex flex-col items-center"
            style={{ left: `${value}%`, transform: 'translateX(-50%)' }}
          >
            <div className="w-px h-2 bg-gray-400" />
            <span className="text-xs text-gray-400 text-center leading-tight whitespace-pre-line">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>0 — Very confusing</span>
        <span>100 — Very easy</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement 3 — Sentence Count by Type
// ---------------------------------------------------------------------------

function SentenceBreakdownTable({ bd }: { bd: SentenceBreakdown }) {
  const rows: [string, number][] = [
    ['Total sentences (raw)',                bd.rawSentenceCount],
    ['Prose sentences',                      bd.proseCount],
    ['List-item sentences',                  bd.listItemCount],
    ['Inline-numbered sentences',            bd.inlineNumberedCount],
    ['Effective sentence count (for scores)', bd.effectiveSentenceCount],
  ]
  return (
    <div>
      <SectionHeader title="Sentence Count by Type" />
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="py-1 text-gray-500">{label}</td>
              <td className="py-1 text-right font-medium text-gray-800">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement 4 — Sentence Length Histogram
// ---------------------------------------------------------------------------

function SentenceHistogram({ text }: { text: string }) {
  const data = buildHistogram(text)
  return (
    <div>
      <SectionHeader title="Sentence Length Distribution" />
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, _name, props) => {
              const pct = (props.payload as { pct?: number } | undefined)?.pct ?? 0
              return [`${value} sentences (${pct}%)`, 'Count']
            }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.label}
                fill={entry.label === '31+' ? '#ef4444' : '#6366f1'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-1">Red bar (31+ words) indicates very long sentences.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement 5 — Syllable Complexity Heatmap
// ---------------------------------------------------------------------------

const HEAT_STYLE: Record<HeatLevel, string> = {
  easy:       'bg-green-50 border-green-200',
  moderate:   'bg-yellow-50 border-yellow-200',
  difficult:  'bg-red-50 border-red-200',
}

function ComplexityHeatmap({ text }: { text: string }) {
  const sentences = buildHeatmap(text)
  return (
    <div>
      <SectionHeader title="Sentence Complexity Heatmap" />
      {/* Legend */}
      <div className="flex gap-3 mb-3 text-xs">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" />Easier (FRE ≥ 60)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300" />Moderate (45–59)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />Difficult (below 45)</span>
      </div>
      <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
        {sentences.map((s, i) => (
          <div
            key={i}
            className={`rounded px-2 py-1 border text-xs text-gray-700 leading-relaxed ${HEAT_STYLE[s.level]}`}
          >
            {s.text}
            <span className="ml-1 text-gray-400">(FRE {s.fre})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement 6 — Word Frequency
// ---------------------------------------------------------------------------

function WordFrequency({ text }: { text: string }) {
  const entries = buildWordFrequency(text, 20)
  return (
    <div>
      <SectionHeader title="Top 20 Words" />
      <ol className="space-y-0.5">
        {entries.map(({ word, count, isJargon }) => (
          <li key={word} className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-800 w-40 truncate">{word}</span>
            <span className="text-gray-500 tabular-nums">{count}×</span>
            {isJargon && (
              <span title="Insurance jargon" className="text-amber-500 text-xs">⚠ jargon</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement 7 — Passive Voice Percentage
// ---------------------------------------------------------------------------

const PASSIVE_COLOR: Record<string, string> = {
  good: 'text-green-600',
  warn: 'text-yellow-600',
  bad:  'text-red-600',
}

function PassiveVoiceStat({ text }: { text: string }) {
  const stats = calcPassiveStats(text)
  return (
    <div>
      <SectionHeader title="Passive Voice Usage" />
      <p className={`text-sm font-semibold ${PASSIVE_COLOR[stats.level]}`}>
        {stats.percentage}% of sentences use passive voice
      </p>
      <p className="text-xs text-gray-500 mt-0.5">
        {stats.passiveSentences} of {stats.totalSentences} sentences detected (heuristic)
      </p>
      <p className="text-xs text-gray-400 mt-0.5">
        {stats.percentage < 10 ? 'Good — below 10%' : stats.percentage <= 20 ? 'Moderate — 10–20%' : 'High — above 20%'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Outer collapsible panel
// ---------------------------------------------------------------------------

export default function DocumentAnalysis({ text, scores }: DocumentAnalysisProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">Document Analysis</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
        >
          <path fillRule="evenodd"
            d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </button>

      {open && (
        <div className="divide-y divide-gray-100 bg-white">
          {[
            <ReadingTimeCard key="rt" wordCount={scores.wordCount} />,
            <FRETarget key="fre" fre={scores.fleschReadingEase} />,
            <SentenceBreakdownTable key="sbd" bd={scores.sentenceBreakdown} />,
            <SentenceHistogram key="hist" text={text} />,
            <ComplexityHeatmap key="heat" text={text} />,
            <WordFrequency key="wf" text={text} />,
            <PassiveVoiceStat key="pv" text={text} />,
          ].map((child, i) => (
            <div key={i} className="px-5 py-4">{child}</div>
          ))}
        </div>
      )}
    </div>
  )
}
