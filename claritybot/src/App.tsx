import { useState, useEffect } from 'react'
import './index.css'
import Header from './components/Header'
import InputSection from './components/InputSection'
import ResultsSection from './components/ResultsSection'
import RewriteSection from './components/RewriteSection'
import { scoreText, type ReadabilityScores } from './utils/readabilityScorer'
import { debugClassifySentences } from './utils/sentenceUtils'

// Expose debug helper on window so it's callable from the browser console:
//   window.__debugSentences(20)   — first 20 evaluated candidates
//   console.table(window.__debugSentences(50))
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

export default function App() {
  const [text, setText] = useState('')
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [hasRewrite, setHasRewrite] = useState(false)
  const [analyzedScores, setAnalyzedScores] = useState<ReadabilityScores | null>(null)

  // Keep window debug refs in sync with current text
  useEffect(() => {
    window.__clarityText = text
    window.__debugSentences = (limit = 20) => debugClassifySentences(text, limit)
  }, [text])

  function handleAnalyze() {
    setAnalyzedScores(scoreText(text))
    setHasAnalyzed(true)
    setHasRewrite(false)
  }

  function handleRewrite() {
    setHasRewrite(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-sm min-h-screen">
        <Header />
        {!apiKey && <MissingKeyBanner />}
        <InputSection
          text={text}
          onTextChange={(t) => {
            setText(t)
            setHasAnalyzed(false)
            setHasRewrite(false)
            setAnalyzedScores(null)
          }}
          onAnalyze={handleAnalyze}
        />
        {hasAnalyzed && (
          <ResultsSection text={text} onRewrite={handleRewrite} />
        )}
        {hasRewrite && analyzedScores && (
          <RewriteSection
            originalText={text}
            originalScores={analyzedScores}
            apiKey={apiKey ?? ''}
          />
        )}
      </div>
    </div>
  )
}
