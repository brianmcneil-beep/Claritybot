import rs from 'text-readability'
import { splitIntoSentences } from './sentenceUtils'
import { INSURANCE_GLOSSARY } from '../data/insuranceGlossary'

// ---------------------------------------------------------------------------
// Enhancement 1 — Reading Time
// ---------------------------------------------------------------------------

export interface ReadingTime {
  avgMinutes: number   // 238 wpm
  slowMinutes: number  // 150 wpm
}

export function calcReadingTime(wordCount: number): ReadingTime {
  const round2 = (n: number) => Math.round(n * 2) / 2   // nearest 0.5
  return {
    avgMinutes: round2(wordCount / 238),
    slowMinutes: round2(wordCount / 150),
  }
}

// ---------------------------------------------------------------------------
// Enhancement 4 — Sentence Length Histogram
// ---------------------------------------------------------------------------

export interface HistogramBucket {
  label: string
  min: number
  max: number   // Infinity for the last bucket
  count: number
  pct: number
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '1–5',   min: 1,  max: 5 },
  { label: '6–10',  min: 6,  max: 10 },
  { label: '11–15', min: 11, max: 15 },
  { label: '16–20', min: 16, max: 20 },
  { label: '21–25', min: 21, max: 25 },
  { label: '26–30', min: 26, max: 30 },
  { label: '31+',   min: 31, max: Infinity },
]

export function buildHistogram(text: string): HistogramBucket[] {
  const sentences = splitIntoSentences(text)
  const total = Math.max(sentences.length, 1)
  const counts = BUCKETS.map((b) => ({ ...b, count: 0, pct: 0 }))

  for (const s of sentences) {
    const wc = rs.lexiconCount(s)
    const bucket = counts.find((b) => wc >= b.min && wc <= b.max)
    if (bucket) bucket.count++
  }

  counts.forEach((b) => { b.pct = Math.round((b.count / total) * 100) })
  return counts
}

// ---------------------------------------------------------------------------
// Enhancement 5 — Sentence FRE heatmap data
// ---------------------------------------------------------------------------

export type HeatLevel = 'easy' | 'moderate' | 'difficult'

export interface SentenceHeat {
  text: string
  fre: number
  level: HeatLevel
}

function sentenceFRE(sentence: string): number {
  const W = rs.lexiconCount(sentence)
  if (W < 2) return 100
  const Sy = rs.syllableCount(sentence)
  const S = 1
  return Math.min(121, Math.max(0, 206.835 - 1.015 * (W / S) - 84.6 * (Sy / W)))
}

export function buildHeatmap(text: string): SentenceHeat[] {
  return splitIntoSentences(text).map((s) => {
    const fre = Math.round(sentenceFRE(s) * 10) / 10
    const level: HeatLevel = fre >= 60 ? 'easy' : fre >= 45 ? 'moderate' : 'difficult'
    return { text: s, fre, level }
  })
}

// ---------------------------------------------------------------------------
// Enhancement 6 — Word Frequency
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'to','of','in','for','on','with','at','by','from','up','about','into',
  'through','during','before','after','above','below','between','out','off',
  'over','under','again','further','then','once','and','but','or','nor','so',
  'yet','both','either','neither','not','no','if','as','than','that','this',
  'these','those','it','its','we','our','you','your','they','their','any',
  'all','each','every','some','such','same','other','also',
])

export interface WordFreqEntry {
  word: string
  count: number
  isJargon: boolean
  jargonSuggestion?: string
}

export function buildWordFrequency(text: string, topN = 20): WordFreqEntry[] {
  const freq = new Map<string, number>()
  const words = text.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/)

  for (const w of words) {
    const clean = w.replace(/^['-]+|['-]+$/g, '')
    if (clean.length < 2 || STOP_WORDS.has(clean)) continue
    freq.set(clean, (freq.get(clean) ?? 0) + 1)
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => {
      const suggestion = INSURANCE_GLOSSARY[word]
      return {
        word,
        count,
        isJargon: Boolean(suggestion),
        jargonSuggestion: suggestion,
      }
    })
}

// ---------------------------------------------------------------------------
// Enhancement 7 — Passive Voice Percentage
// ---------------------------------------------------------------------------

const PASSIVE_RE = /\b(am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|\w+en|\w+wn|\w+nt)\b/i

export interface PassiveStats {
  totalSentences: number
  passiveSentences: number
  percentage: number
  level: 'good' | 'warn' | 'bad'
}

export function calcPassiveStats(text: string): PassiveStats {
  const sentences = splitIntoSentences(text)
  const passiveCount = sentences.filter((s) => PASSIVE_RE.test(s)).length
  const pct = sentences.length > 0 ? Math.round((passiveCount / sentences.length) * 100) : 0
  return {
    totalSentences: sentences.length,
    passiveSentences: passiveCount,
    percentage: pct,
    level: pct < 10 ? 'good' : pct <= 20 ? 'warn' : 'bad',
  }
}
