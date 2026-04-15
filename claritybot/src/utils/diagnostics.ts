import jargonGlossary from '../data/jargonGlossary'
import rs from 'text-readability'
import { splitIntoSentences } from './sentenceUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssueType =
  | 'LONG_SENTENCE'
  | 'PASSIVE_VOICE'
  | 'DOUBLE_NEGATIVE'
  | 'NESTED_CONDITIONAL'
  | 'NOMINALIZATION'
  | 'JARGON'
  | 'LONG_WORD'
  | 'DEFINED_TERM_OVERUSE'

export type Priority = 'high' | 'medium' | 'low'

export interface DiagnosticItem {
  section_label: string
  problem_text: string
  issue_type: IssueType
  why_problematic: string
  priority: Priority
}

export interface DiagnosticsResult {
  items: DiagnosticItem[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LONG_SENTENCE_THRESHOLD = 25

// Common nominalizations: noun forms that have a simpler verb equivalent.
// Pattern: the noun form followed optionally by a space/comma/period.
const NOMINALIZATION_PATTERNS: Array<{ pattern: RegExp; suggestion: string }> = [
  { pattern: /\bmake(?:s|ing)?\s+a(?:n)?\s+determination\b/gi, suggestion: '"determine"' },
  { pattern: /\bmake(?:s|ing)?\s+a(?:n)?\s+decision\b/gi, suggestion: '"decide"' },
  { pattern: /\bmake(?:s|ing)?\s+a(?:n)?\s+assessment\b/gi, suggestion: '"assess"' },
  { pattern: /\bmake(?:s|ing)?\s+a(?:n)?\s+payment\b/gi, suggestion: '"pay"' },
  { pattern: /\bgive(?:s|ing)?\s+(?:a\s+)?notification\b/gi, suggestion: '"notify"' },
  { pattern: /\bgive(?:s|ing)?\s+(?:a\s+)?consideration\b/gi, suggestion: '"consider"' },
  { pattern: /\bprovide(?:s|ing)?\s+(?:an?\s+)?authorization\b/gi, suggestion: '"authorize"' },
  { pattern: /\bprovide(?:s|ing)?\s+(?:an?\s+)?explanation\b/gi, suggestion: '"explain"' },
  { pattern: /\bconduct(?:s|ing)?\s+(?:an?\s+)?investigation\b/gi, suggestion: '"investigate"' },
  { pattern: /\bconduct(?:s|ing)?\s+(?:an?\s+)?inspection\b/gi, suggestion: '"inspect"' },
  { pattern: /\bconduct(?:s|ing)?\s+(?:an?\s+)?examination\b/gi, suggestion: '"examine"' },
  { pattern: /\beffect(?:s|ing)?\s+(?:an?\s+)?adjustment\b/gi, suggestion: '"adjust"' },
  { pattern: /\bperform(?:s|ing)?\s+(?:an?\s+)?evaluation\b/gi, suggestion: '"evaluate"' },
  { pattern: /\bperform(?:s|ing)?\s+(?:an?\s+)?calculation\b/gi, suggestion: '"calculate"' },
  { pattern: /\bpursuant\s+to\b/gi, suggestion: '"under" or "per"' },
  { pattern: /\bnotwithstanding\s+the\s+foregoing\b/gi, suggestion: '"despite the above"' },
  { pattern: /\bin\s+the\s+event\s+(?:of\s+)?(?:that\b)?/gi, suggestion: '"if"' },
  { pattern: /\bfor\s+the\s+purpose(?:s)?\s+of\b/gi, suggestion: '"to"' },
  { pattern: /\bwith\s+respect\s+to\b/gi, suggestion: '"about" or "for"' },
  { pattern: /\bprior\s+to\b/gi, suggestion: '"before"' },
  { pattern: /\bsubsequent\s+to\b/gi, suggestion: '"after"' },
  { pattern: /\bin\s+accordance\s+with\b/gi, suggestion: '"under" or "per"' },
]

// Double-negative patterns in insurance context.
const DOUBLE_NEGATIVE_PATTERNS: RegExp[] = [
  /\bnot\s+\w+\s+(?:without|unless|except|until)\b/gi,
  /\bno\s+\w+\s+(?:without|unless|except|until)\b/gi,
  /\bnot\s+(?:un\w+)\b/gi,         // "not unrelated", "not uncommon"
  /\bnot\s+(?:in)?eligible\b/gi,
  /\bnot\s+(?:in)?applicable\b/gi,
  /\bneither\b.{1,60}\bnor\b/gi,
  /\bno\s+(?:liability|coverage|payment|benefit)\s+(?:shall|will|may)\s+(?:not|never)\b/gi,
]

// Nested conditional markers: multiple "if/unless/provided that/subject to"
// in the same sentence indicates problematic nesting.
const CONDITIONAL_MARKERS = /\b(if|unless|provided that|subject to|except when|except where|except that|in the event that|only if|only when)\b/gi

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return rs.lexiconCount(text)
}

function syllables(word: string): number {
  return rs.syllableCount(word)
}

/**
 * Infer a rough section label from a sentence by looking for an immediately
 * preceding heading-like line. Since we work with plain text, we use a
 * heuristic: if the sentence starts with a short ALL-CAPS or Title Case word
 * sequence, treat it as the section label. Otherwise return 'General'.
 */
function inferSectionLabel(sentence: string): string {
  const firstLine = sentence.split('\n')[0].trim()
  // Heading: short (≤ 5 words), no terminal punctuation
  const words = firstLine.split(/\s+/).filter(Boolean)
  if (words.length <= 5 && !/[.?!,;]$/.test(firstLine)) {
    return firstLine
  }
  return 'General'
}

// ---------------------------------------------------------------------------
// Detector: LONG_SENTENCE
// ---------------------------------------------------------------------------

function detectLongSentences(text: string): DiagnosticItem[] {
  const sentences = splitIntoSentences(text)
  const results: DiagnosticItem[] = []
  for (const sentence of sentences) {
    const count = wordCount(sentence)
    if (count > LONG_SENTENCE_THRESHOLD) {
      results.push({
        section_label: inferSectionLabel(sentence),
        problem_text: sentence,
        issue_type: 'LONG_SENTENCE',
        why_problematic: `${count} words — sentences over ${LONG_SENTENCE_THRESHOLD} words are significantly harder for consumers to follow.`,
        priority: count > 50 ? 'high' : count > 35 ? 'medium' : 'low',
      })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Detector: PASSIVE_VOICE
// ---------------------------------------------------------------------------

function detectPassiveVoice(text: string): DiagnosticItem[] {
  const passiveRegex =
    /\b(am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|\w+en|\w+wn|\w+nt)\b/gi
  const results: DiagnosticItem[] = []
  let match: RegExpExecArray | null
  while ((match = passiveRegex.exec(text)) !== null) {
    results.push({
      section_label: 'General',
      problem_text: match[0],
      issue_type: 'PASSIVE_VOICE',
      why_problematic: 'Passive construction obscures who is responsible for the action. Active voice is clearer for consumers.',
      priority: 'low',
    })
  }
  return results
}

// ---------------------------------------------------------------------------
// Detector: DOUBLE_NEGATIVE
// ---------------------------------------------------------------------------

function detectDoubleNegatives(text: string): DiagnosticItem[] {
  const results: DiagnosticItem[] = []
  for (const pattern of DOUBLE_NEGATIVE_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        section_label: 'General',
        problem_text: match[0],
        issue_type: 'DOUBLE_NEGATIVE',
        why_problematic: 'Double negatives require extra cognitive effort and increase misunderstanding risk. Rephrase as a direct positive statement.',
        priority: 'high',
      })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Detector: NESTED_CONDITIONAL
// ---------------------------------------------------------------------------

/**
 * Flag sentences that contain 3 or more conditional markers (if / unless /
 * provided that / subject to / etc.). Two conditionals is acceptable; three
 * or more indicates a nested structure that consumers struggle to parse.
 */
function detectNestedConditionals(text: string): DiagnosticItem[] {
  const sentences = splitIntoSentences(text)
  const results: DiagnosticItem[] = []

  for (const sentence of sentences) {
    CONDITIONAL_MARKERS.lastIndex = 0
    const matches: string[] = []
    let m: RegExpExecArray | null
    while ((m = CONDITIONAL_MARKERS.exec(sentence)) !== null) {
      matches.push(m[0].toLowerCase())
    }
    if (matches.length >= 3) {
      results.push({
        section_label: inferSectionLabel(sentence),
        problem_text: sentence,
        issue_type: 'NESTED_CONDITIONAL',
        why_problematic: `Contains ${matches.length} conditional clauses (${matches.join(', ')}). Nested conditions force readers to track multiple "if…then" branches simultaneously. Flatten into separate statements.`,
        priority: matches.length >= 4 ? 'high' : 'medium',
      })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Detector: NOMINALIZATION
// ---------------------------------------------------------------------------

function detectNominalizations(text: string): DiagnosticItem[] {
  const results: DiagnosticItem[] = []
  for (const { pattern, suggestion } of NOMINALIZATION_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        section_label: 'General',
        problem_text: match[0],
        issue_type: 'NOMINALIZATION',
        why_problematic: `Nominalized phrasing — consider using ${suggestion} instead for a more direct, readable sentence.`,
        priority: 'medium',
      })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Detector: JARGON
// ---------------------------------------------------------------------------

function detectJargon(text: string): DiagnosticItem[] {
  const results: DiagnosticItem[] = []
  for (const term of jargonGlossary) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    if (regex.test(text)) {
      results.push({
        section_label: 'General',
        problem_text: term,
        issue_type: 'JARGON',
        why_problematic: 'Insurance term of art that may be unfamiliar to average consumers. Consider a plain-language alternative or a brief inline definition.',
        priority: 'medium',
      })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Detector: LONG_WORD
// ---------------------------------------------------------------------------

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
        section_label: 'General',
        problem_text: word,
        issue_type: 'LONG_WORD',
        why_problematic: `${count} syllables — polysyllabic words raise the Flesch-Kincaid grade level and slow consumer comprehension.`,
        priority: count >= 6 ? 'high' : count >= 5 ? 'medium' : 'low',
      })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Detector: DEFINED_TERM_OVERUSE
// ---------------------------------------------------------------------------

/**
 * Flag capitalized defined terms (Title Case sequences that recur 5+ times).
 * Insurance policies define terms in ALL CAPS or Title Case. Overuse of a
 * defined term without plain-language anchoring confuses consumers who don't
 * read the Definitions section first.
 */
function detectDefinedTermOveruse(text: string): DiagnosticItem[] {
  // Match 1–4 word Title Case sequences (each word starts with a capital,
  // contains at least one lowercase letter — excludes acronyms like "ACV").
  const termRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g
  const counts = new Map<string, number>()
  let match: RegExpExecArray | null

  while ((match = termRegex.exec(text)) !== null) {
    const term = match[1]
    // Exclude common sentence-starting capitalization and short stopwords
    if (term.split(' ').length === 1 && term.length <= 3) continue
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }

  const results: DiagnosticItem[] = []
  for (const [term, count] of counts.entries()) {
    if (count >= 5) {
      results.push({
        section_label: 'General',
        problem_text: term,
        issue_type: 'DEFINED_TERM_OVERUSE',
        why_problematic: `Appears ${count} times. Defined terms repeated frequently without plain-language anchoring can confuse consumers who haven't read the Definitions section. Consider adding a brief parenthetical definition on first use.`,
        priority: count >= 10 ? 'high' : 'medium',
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function runDiagnostics(text: string): DiagnosticsResult {
  const items: DiagnosticItem[] = [
    ...detectLongSentences(text),
    ...detectPassiveVoice(text),
    ...detectDoubleNegatives(text),
    ...detectNestedConditionals(text),
    ...detectNominalizations(text),
    ...detectJargon(text),
    ...detectLongWords(text),
    ...detectDefinedTermOveruse(text),
  ]
  return { items }
}
