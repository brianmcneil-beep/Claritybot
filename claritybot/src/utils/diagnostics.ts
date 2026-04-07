import jargonGlossary from '../data/jargonGlossary'
import rs from 'text-readability'

export interface DiagnosticItem {
  text: string
  reason: string
}

export interface DiagnosticsResult {
  longSentences: DiagnosticItem[]
  jargon: DiagnosticItem[]
  passiveVoice: DiagnosticItem[]
  longWords: DiagnosticItem[]
}

const LONG_SENTENCE_THRESHOLD = 25

/**
 * Split text into individual sentences using the same delimiter pattern
 * as text-readability, then return each sentence with its word count.
 */
function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Count words in a string (matches text-readability's lexiconCount logic). */
function wordCount(text: string): number {
  return rs.lexiconCount(text)
}

/** Count syllables in a single word using text-readability's syllableCount. */
function syllables(word: string): number {
  return rs.syllableCount(word)
}

/** Flag sentences longer than LONG_SENTENCE_THRESHOLD words. */
function detectLongSentences(text: string): DiagnosticItem[] {
  const sentences = extractSentences(text)
  const results: DiagnosticItem[] = []

  for (const sentence of sentences) {
    const count = wordCount(sentence)
    if (count > LONG_SENTENCE_THRESHOLD) {
      results.push({
        text: sentence,
        reason: `${count} words — sentences over ${LONG_SENTENCE_THRESHOLD} words are harder to follow.`,
      })
    }
  }

  return results
}

/** Flag occurrences of glossary terms in the text. */
function detectJargon(text: string): DiagnosticItem[] {
  const lowerText = text.toLowerCase()
  const results: DiagnosticItem[] = []

  for (const term of jargonGlossary) {
    // Match whole-word / whole-phrase occurrences (word boundary on each side).
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    if (regex.test(lowerText)) {
      results.push({
        text: term,
        reason: 'Insurance jargon that may be unfamiliar to consumers.',
      })
    }
  }

  return results
}

/**
 * Flag passive voice constructions using the heuristic:
 *   (was|were|been|being|is|are|am) + optional adverb + past participle
 *
 * A past participle is approximated as a word ending in -ed or common
 * irregular forms (-en, -wn, -nt endings). This is intentionally a
 * heuristic and will have false positives.
 */
function detectPassiveVoice(text: string): DiagnosticItem[] {
  const passiveRegex =
    /\b(am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|\w+en|\w+wn|\w+nt)\b/gi

  const results: DiagnosticItem[] = []
  let match: RegExpExecArray | null

  while ((match = passiveRegex.exec(text)) !== null) {
    results.push({
      text: match[0],
      reason: 'Possible passive voice — consider using active voice for clarity.',
    })
  }

  return results
}

/**
 * Flag individual words with 4 or more syllables.
 * These drive the Flesch-Kincaid grade level up.
 */
function detectLongWords(text: string): DiagnosticItem[] {
  const wordRegex = /\b[a-zA-Z]+\b/g
  const seen = new Set<string>()
  const results: DiagnosticItem[] = []
  let match: RegExpExecArray | null

  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[0]
    const lower = word.toLowerCase()
    if (seen.has(lower)) continue
    const count = syllables(word)
    if (count >= 4) {
      seen.add(lower)
      results.push({
        text: word,
        reason: `${count} syllables — complex words increase reading difficulty.`,
      })
    }
  }

  return results
}

export function runDiagnostics(text: string): DiagnosticsResult {
  return {
    longSentences: detectLongSentences(text),
    jargon: detectJargon(text),
    passiveVoice: detectPassiveVoice(text),
    longWords: detectLongWords(text),
  }
}
