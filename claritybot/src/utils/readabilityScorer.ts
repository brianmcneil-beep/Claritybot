import rs from 'text-readability'
import { countSentences } from './sentenceUtils'

export interface ReadabilityScores {
  fleschReadingEase: number
  fleschKincaidGrade: number
  smogIndex: number
  gunningFog: number
  wordCount: number
  sentenceCount: number
  avgWordsPerSentence: number
  avgSyllablesPerWord: number
}

/**
 * Compute all four readability metrics plus supporting counts.
 *
 * We use our own sentence counter (sentenceUtils.ts) rather than the
 * text-readability library's internal sentence splitter. The library splits
 * only on [.?!] followed by a capital letter, which massively undercounts
 * sentences in insurance documents (semicolon-separated enumerated conditions,
 * numbered list items, etc.). Our counter treats semicolons as sentence
 * boundaries, which brings results in line with tools like Readable.com.
 *
 * Syllable counting is still delegated to the library (it uses the `syllable`
 * package, which is the hard part to get right).
 *
 * Formulas:
 *   Flesch RE      = 206.835 − 1.015(W/S) − 84.6(Syl/W)
 *   FK Grade       = 0.39(W/S) + 11.8(Syl/W) − 15.59
 *   SMOG           = 3 + √(polysyllables × 30 / S)
 *   Gunning Fog    = 0.4 × ((W/S) + 100 × (complex / W))
 *
 * Where W = words, S = sentences, Syl = total syllables,
 * polysyllables / complex = words with 3+ syllables.
 */
export function scoreText(text: string): ReadabilityScores {
  const wordCount = rs.lexiconCount(text)
  const sentenceCount = countSentences(text)
  const totalSyllables = rs.syllableCount(text)
  const polysyllableCount = countPolysyllables(text)

  const W = wordCount
  const S = sentenceCount
  const sylPerWord = W > 0 ? totalSyllables / W : 0
  const wordsPerSentence = W / S

  const fleschReadingEase = clamp(
    206.835 - 1.015 * wordsPerSentence - 84.6 * sylPerWord,
    0,
    121,
  )
  const fleschKincaidGrade = Math.max(
    0,
    0.39 * wordsPerSentence + 11.8 * sylPerWord - 15.59,
  )
  // SMOG requires at least 30 sentences for accuracy; surface the raw number anyway.
  const smogIndex = S > 0
    ? Math.max(0, 3 + Math.sqrt(polysyllableCount * (30 / S)))
    : 0
  const gunningFog = Math.max(
    0,
    0.4 * (wordsPerSentence + 100 * (W > 0 ? polysyllableCount / W : 0)),
  )

  return {
    fleschReadingEase: round(fleschReadingEase, 1),
    fleschKincaidGrade: round(fleschKincaidGrade, 1),
    smogIndex: round(smogIndex, 1),
    gunningFog: round(gunningFog, 1),
    wordCount: W,
    sentenceCount: S,
    avgWordsPerSentence: round(wordsPerSentence, 1),
    avgSyllablesPerWord: round(sylPerWord, 2),
  }
}

/**
 * Count words with 3 or more syllables (used by SMOG and Gunning Fog).
 * Deduplication is NOT applied here — every occurrence counts, not just
 * unique words, matching the standard formula definition.
 */
function countPolysyllables(text: string): number {
  const wordRegex = /\b[a-zA-Z]+\b/g
  let count = 0
  let match: RegExpExecArray | null
  while ((match = wordRegex.exec(text)) !== null) {
    if (rs.syllableCount(match[0]) >= 3) count++
  }
  return count
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

// ---------------------------------------------------------------------------
// One-line plain-English interpretations for each score.
// ---------------------------------------------------------------------------

export function interpretFleschReadingEase(score: number): string {
  if (score >= 90) return 'Very easy — 5th grade reading level'
  if (score >= 80) return 'Easy — 6th grade reading level'
  if (score >= 70) return 'Fairly easy — 7th grade reading level'
  if (score >= 60) return 'Standard — 8th–9th grade reading level'
  if (score >= 50) return 'Fairly difficult — 10th–12th grade reading level'
  if (score >= 30) return 'Difficult — college reading level'
  return 'Very confusing — professional / graduate reading level'
}

export function interpretFleschKincaidGrade(grade: number): string {
  if (grade <= 6) return `Grade ${grade} — elementary school reading level`
  if (grade <= 8) return `Grade ${grade} — middle school reading level`
  if (grade <= 12) return `Grade ${grade} — high school reading level`
  if (grade <= 16) return `Grade ${grade} — college reading level`
  return `Grade ${grade} — graduate / professional reading level`
}

export function interpretSmog(score: number): string {
  if (score <= 6) return `SMOG ${score} — elementary school reading level`
  if (score <= 10) return `SMOG ${score} — middle school reading level`
  if (score <= 14) return `SMOG ${score} — high school reading level`
  if (score <= 18) return `SMOG ${score} — college reading level`
  return `SMOG ${score} — graduate / professional reading level`
}

export function interpretGunningFog(score: number): string {
  if (score <= 6) return `Fog ${score} — very easy to read`
  if (score <= 8) return `Fog ${score} — easy — ideal for consumer documents`
  if (score <= 12) return `Fog ${score} — acceptable — high school level`
  if (score <= 16) return `Fog ${score} — difficult — college level`
  return `Fog ${score} — very difficult — requires specialist knowledge`
}
