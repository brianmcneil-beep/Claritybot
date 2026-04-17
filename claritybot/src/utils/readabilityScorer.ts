import rs from 'text-readability'
import { classifySentences } from './sentenceUtils'

export interface SentenceBreakdown {
  rawSentenceCount: number
  proseCount: number
  listItemCount: number
  inlineNumberedCount: number
  inlineNumberedMerged: number
  effectiveSentenceCount: number
}

export interface ReadabilityScores {
  fleschReadingEase: number
  fleschKincaidGrade: number
  smogIndex: number
  gunningFog: number
  wordCount: number
  sentenceCount: number
  avgWordsPerSentence: number
  avgSyllablesPerWord: number
  sentenceBreakdown: SentenceBreakdown
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
  const totalSyllables = rs.syllableCount(text)
  const polysyllableCount = countPolysyllables(text)

  // Classify sentences, then compute effectiveSentenceCount for formula use only.
  // rawSentenceCount and avgWordsPerSentence (display) use the raw count unchanged.
  const classified = classifySentences(text)
  const rawSentenceCount = Math.max(classified.length, 1)

  // Step 1: merge inline_numbered sub-items into their parent prose sentence.
  // Each contiguous run of inline_numbered items that follows a prose or list_item
  // sentence is collapsed into that parent — the run contributes 1 sentence unit
  // (the parent), not N+1.
  let inlineNumberedCount = 0
  let inlineNumberedMerged = 0

  type ReducedType = 'prose' | 'list_item'
  const reduced: ReducedType[] = []
  let absorbingInline = false

  for (const s of classified) {
    if (s.sentenceType === 'inline_numbered') {
      inlineNumberedCount++
      if (absorbingInline) {
        inlineNumberedMerged++
      } else if (reduced.length > 0) {
        absorbingInline = true
        inlineNumberedMerged++
      } else {
        reduced.push('prose')
      }
    } else {
      absorbingInline = false
      reduced.push(s.sentenceType === 'prose' ? 'prose' : 'list_item')
    }
  }

  const proseCount = reduced.filter((t) => t === 'prose').length
  const listItemCount = reduced.filter((t) => t === 'list_item').length

  // Step 2: apply fractional weighting to list_item sentences.
  // effectiveSentenceCount is the sole sentence-count input to all four formulas.
  const effectiveSentenceCount = Math.max(proseCount + listItemCount * 0.65, 1)

  // Shared inputs — identical across all four formulas.
  const W  = wordCount
  const S  = effectiveSentenceCount
  const Sy = totalSyllables
  const P  = polysyllableCount

  const wordsPerSentence = W / S
  const sylPerWord       = W > 0 ? Sy / W : 0

  const fleschReadingEase = clamp(
    206.835 - 1.015 * wordsPerSentence - 84.6 * sylPerWord,
    0,
    121,
  )
  const fleschKincaidGrade = Math.max(
    0,
    0.39 * wordsPerSentence + 11.8 * sylPerWord - 15.59,
  )
  const smogIndex = Math.max(
    0,
    3 + Math.sqrt(P * (30 / S)),
  )
  const gunningFog = Math.max(
    0,
    0.4 * (wordsPerSentence + 100 * (W > 0 ? P / W : 0)),
  )

  return {
    fleschReadingEase: round(fleschReadingEase, 1),
    fleschKincaidGrade: round(fleschKincaidGrade, 1),
    smogIndex: round(smogIndex, 1),
    gunningFog: round(gunningFog, 1),
    wordCount: W,
    sentenceCount: rawSentenceCount,    // raw count for display
    avgWordsPerSentence: round(W / rawSentenceCount, 1),  // raw count for display
    avgSyllablesPerWord: round(sylPerWord, 2),
    sentenceBreakdown: {
      rawSentenceCount,
      proseCount,
      listItemCount,
      inlineNumberedCount,
      inlineNumberedMerged,
      effectiveSentenceCount: round(effectiveSentenceCount, 2),
    },
  }
}

/**
 * Count words with 3 or more syllables (used by SMOG and Gunning Fog).
 *
 * Per Gunning's original specification, words where the -ed or -es suffix
 * alone pushes the count to 3 syllables are excluded. This prevents
 * over-counting heavily inflected insurance text ("insured", "excluded",
 * "damaged", "covered") which are all 3-syllable by suffix only.
 *
 * Exclusion test: strip the suffix and re-count; if the bare stem has < 3
 * syllables, the word does not qualify as a "complex" word.
 *
 * Every occurrence counts (no deduplication) — matching standard formula.
 */
function countPolysyllables(text: string): number {
  const wordRegex = /\b[a-zA-Z]+\b/g
  let count = 0
  let match: RegExpExecArray | null
  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[0]
    if (isPolysyllable(word)) count++
  }
  return count
}

function isPolysyllable(word: string): boolean {
  const syllCount = rs.syllableCount(word)
  if (syllCount < 3) return false

  const lower = word.toLowerCase()

  // Gunning exclusion: if the word ends in -ed or -es and stripping the
  // suffix drops the syllable count below 3, it does not count as complex.
  if (lower.endsWith('ed') && syllCount === 3) {
    const stem = lower.slice(0, -2)
    if (stem.length >= 2 && rs.syllableCount(stem) < 3) return false
  }
  if (lower.endsWith('es') && syllCount === 3) {
    const stem = lower.slice(0, -2)
    if (stem.length >= 2 && rs.syllableCount(stem) < 3) return false
  }

  return true
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
