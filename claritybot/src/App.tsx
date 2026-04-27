import { useState, useEffect } from 'react'
import './index.css'
import Header from './components/Header'
import InputSection from './components/InputSection'
import ResultsSection from './components/ResultsSection'
import RewriteSection from './components/RewriteSection'
import { scoreText, type ReadabilityScores } from './utils/readabilityScorer'
import { debugClassifySentences } from './utils/sentenceUtils'

declare global {
  interface Window {
    __debugSentences: (limit?: number) => ReturnType<typeof debugClassifySentences>
    __clarityText: string
  }
}

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

function MissingKeyBanner() {
  return (
    <div className="m-6 p-4 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-900">
      <p className="font-semibold">API key not configured</p>
      <p className="mt-1 text-sm">
        To enable the plain-language rewrite feature, create a{' '}
        <code className="bg-yellow-100 px-1 rounded">.env</code> file in the
        project root and add:
      </p>
      <pre className="mt-2 text-xs bg-yellow-100 p-2 rounded">
        VITE_ANTHROPIC_API_KEY=your_key_here
      </pre>
      <p className="mt-2 text-sm">
        Then restart the dev server. Readability scoring and diagnostics work
        without a key.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement 8 — Before/After Score Comparison
// ---------------------------------------------------------------------------

interface ScoreCompareProps {
  original: ReadabilityScores
  current: ReadabilityScores
}

function ScoreCompare({ original, current }: ScoreCompareProps) {
  type Metric = { label: string; orig: number; curr: number; higherIsBetter: boolean }
  const metrics: Metric[] = [
    { label: 'Flesch RE',  orig: original.fleschReadingEase,  curr: current.fleschReadingEase,  higherIsBetter: true },
    { label: 'FK Grade',   orig: original.fleschKincaidGrade, curr: current.fleschKincaidGrade, higherIsBetter: false },
    { label: 'SMOG',       orig: original.smogIndex,          curr: current.smogIndex,          higherIsBetter: false },
    { label: 'Gunning Fog',orig: original.gunningFog,         curr: current.gunningFog,         higherIsBetter: false },
  ]

  return (
    <div className="mx-6 mb-4 rounded-xl border border-indigo-200 bg-indigo-50 overflow-hidden">
      <div className="px-5 py-2.5 bg-indigo-100 border-b border-indigo-200">
        <p className="text-sm font-semibold text-indigo-800">Score Comparison — Original vs. Current</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-indigo-500 uppercase tracking-wide">
            <th className="px-5 py-2 text-left">Metric</th>
            <th className="px-4 py-2 text-right">Original</th>
            <th className="px-4 py-2 text-right">Current</th>
            <th className="px-4 py-2 text-right">Δ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-indigo-100">
          {metrics.map(({ label, orig, curr, higherIsBetter }) => {
            const delta = Math.round((curr - orig) * 10) / 10
            const improved = higherIsBetter ? delta > 0 : delta < 0
            const same = delta === 0
            const arrow = same ? '—' : improved ? '↑' : '↓'
            const color = same ? 'text-gray-500' : improved ? 'text-green-600' : 'text-red-500'
            return (
              <tr key={label}>
                <td className="px-5 py-1.5 text-gray-700 font-medium">{label}</td>
                <td className="px-4 py-1.5 text-right text-gray-500 tabular-nums">{orig}</td>
                <td className="px-4 py-1.5 text-right text-gray-800 font-semibold tabular-nums">{curr}</td>
                <td className={`px-4 py-1.5 text-right font-semibold tabular-nums ${color}`}>
                  {same ? '—' : `${delta > 0 ? '+' : ''}${delta} ${arrow}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [text, setText] = useState('')
  // analyzedText = the text at the moment Analyze was last clicked
  const [analyzedText, setAnalyzedText] = useState('')
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [hasRewrite, setHasRewrite] = useState(false)
  const [originalScores, setOriginalScores] = useState<ReadabilityScores | null>(null)
  const [currentScores, setCurrentScores] = useState<ReadabilityScores | null>(null)
  // true when text has been edited since last analyze
  const [textDirty, setTextDirty] = useState(false)

  useEffect(() => {
    window.__clarityText = text
    window.__debugSentences = (limit = 20) => debugClassifySentences(text, limit)
  }, [text])

  function handleAnalyze() {
    const scores = scoreText(text)
    setOriginalScores(scores)
    setCurrentScores(null)
    setAnalyzedText(text)
    setHasAnalyzed(true)
    setHasRewrite(false)
    setTextDirty(false)
  }

  function handleReanalyze() {
    const scores = scoreText(text)
    setCurrentScores(scores)
    setTextDirty(false)
  }

  function handleRewrite() {
    setHasRewrite(true)
  }

  function handleTextChange(t: string) {
    setText(t)
    if (hasAnalyzed && t !== analyzedText) {
      setTextDirty(true)
    }
    if (!hasAnalyzed) {
      setTextDirty(false)
    }
    setHasRewrite(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-sm min-h-screen">
        <Header />
        {!apiKey && <MissingKeyBanner />}
        <InputSection
          text={text}
          onTextChange={handleTextChange}
          onAnalyze={handleAnalyze}
        />

        {/* Enhancement 8 — Re-analyze banner */}
        {hasAnalyzed && textDirty && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
            <p className="text-sm text-blue-800">Text has been edited since last analysis.</p>
            <button
              onClick={handleReanalyze}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              Re-analyze
            </button>
          </div>
        )}

        {/* Score comparison panel (Enhancement 8) */}
        {hasAnalyzed && currentScores && originalScores && !textDirty && (
          <ScoreCompare original={originalScores} current={currentScores} />
        )}

        {hasAnalyzed && (
          <ResultsSection text={textDirty ? analyzedText : text} onRewrite={handleRewrite} />
        )}
        {hasRewrite && originalScores && (
          <RewriteSection
            originalText={analyzedText}
            originalScores={originalScores}
            apiKey={apiKey ?? ''}
          />
        )}
      </div>
    </div>
  )
}
