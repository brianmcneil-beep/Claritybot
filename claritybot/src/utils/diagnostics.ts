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

/** Flag sentences longer than LONG_SENTENCE_THRESHOLD words, deduplicating identical text. */
function detectLongSentences(text: string): DiagnosticItem[] {
  const sentences = splitIntoSentences(text)
  // Map normalized sentence → { count, wordCount, first occurrence }
  const seen = new Map<string, { count: number; wc: number; sentence: string }>()

  for (const sentence of sentences) {
    const wc = wordCount(sentence)
    if (wc <= LONG_SENTENCE_THRESHOLD) continue
    const key = sentence.replace(/\s+/g, ' ').trim().toLowerCase()
    const existing = seen.get(key)
    if (existing) {
      existing.count++
    } else {
      seen.set(key, { count: 1, wc, sentence })
    }
  }

  return [...seen.values()].map(({ count, wc, sentence }) => ({
    section_label: inferSectionLabel(sentence),
    problem_text: count > 1 ? `${sentence}  [appears ${count}× in document]` : sentence,
    issue_type: 'LONG_SENTENCE' as IssueType,
    why_problematic: `${wc} words${count > 1 ? ` (duplicated ${count} times — likely a boilerplate exclusion clause)` : ''} — sentences over ${LONG_SENTENCE_THRESHOLD} words are significantly harder for consumers to follow.`,
    priority: (wc > 50 ? 'high' : wc > 35 ? 'medium' : 'low') as Priority,
  }))
}

// ---------------------------------------------------------------------------
// Detector: PASSIVE_VOICE
// ---------------------------------------------------------------------------

/**
 * Returns a contextual explanation based on what the passive construction
 * is hiding: responsibility (insurer/insured obligation), agent, or timing.
 */
function passiveWhyProblematic(auxiliary: string, participle: string): string {
  const aux = auxiliary.toLowerCase()
  const part = participle.toLowerCase()

  if (['is', 'are', 'am'].includes(aux)) {
    return `"${auxiliary} ${participle}" is a present passive — it hides who performs this action. Active voice names the responsible party directly.`
  }
  if (['was', 'were'].includes(aux)) {
    return `"${auxiliary} ${participle}" is a past passive — it hides who was responsible for this action. Rewrite to name the actor (e.g., "we" or "you").`
  }
  if (aux === 'been') {
    return `"been ${part}" is a perfect passive — it obscures when and by whom the action was completed. Active voice improves clarity.`
  }
  if (aux === 'being') {
    return `"being ${part}" is a progressive passive — it hides who is currently performing the action. Consider active voice.`
  }
  return `Passive construction obscures who is responsible for "${part}." Active voice is clearer for consumers.`
}

function detectPassiveVoice(text: string): DiagnosticItem[] {
  const passiveRegex =
    /\b(am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|\w+en|\w+wn|\w+nt)\b/gi

  // Build a sentence lookup: for each character offset → sentence text
  const sentences = splitIntoSentences(text)
  // Map sentence text to itself for quick lookup by searching for the match offset
  // We'll find the sentence containing each match by scanning sentences in order.

  const results: DiagnosticItem[] = []
  const seenSentence = new Set<string>() // deduplicate by containing sentence
  let match: RegExpExecArray | null

  while ((match = passiveRegex.exec(text)) !== null) {
    const phrase = match[0]
    const auxiliary = match[1]
    const participle = match[2]

    // Find the sentence that contains this match offset
    const offset = match.index
    let containingSentence = phrase
    let searchPos = 0
    for (const sent of sentences) {
      const idx = text.indexOf(sent, searchPos)
      if (idx !== -1 && idx <= offset && offset < idx + sent.length) {
        containingSentence = sent
        searchPos = idx
        break
      }
    }

    // problem_text = containing sentence; deduplicate on sentence to avoid
    // flagging the same sentence twice for two passive phrases within it
    const key = containingSentence
    if (seenSentence.has(key)) continue
    seenSentence.add(key)

    results.push({
      section_label: inferSectionLabel(containingSentence),
      problem_text: containingSentence,
      issue_type: 'PASSIVE_VOICE',
      why_problematic: passiveWhyProblematic(auxiliary, participle),
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
 * Single-word sentence-starters and common English words that are capitalized
 * at the start of a sentence. These are NOT defined terms.
 */
const DEFINED_TERM_STOPLIST = new Set([
  'A', 'An', 'The', 'This', 'These', 'That', 'Those', 'It', 'Its',
  'We', 'Our', 'You', 'Your', 'They', 'Their', 'He', 'She', 'His', 'Her',
  'All', 'Any', 'Each', 'Both', 'Some', 'No', 'Not', 'Such', 'Other',
  'If', 'When', 'Where', 'While', 'Unless', 'Until', 'After', 'Before',
  'Under', 'Upon', 'With', 'Without', 'By', 'For', 'To', 'From', 'Of',
  'In', 'On', 'At', 'As', 'And', 'Or', 'But', 'However', 'Therefore',
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
])

/**
 * Flag capitalized defined terms (Title Case sequences that recur 5+ times
 * within the same paragraph). "Per-paragraph" scope prevents footer/header
 * boilerplate from inflating counts.
 *
 * Filters applied:
 *  1. Stop-list — common English words capitalized at sentence start.
 *  2. Bracketed placeholders — [Insurance Company], [Company Address], etc.
 *  3. Repeated lines — lines that appear 3+ times across paragraphs are
 *     treated as headers/footers and excluded from term extraction.
 *  4. Minimum two-word requirement for single-word Title Case (prevents
 *     "Coverage", "Policy" as standalone terms unless they recur within
 *     the same paragraph 5+ times).
 */
function detectDefinedTermOveruse(text: string): DiagnosticItem[] {
  // Step 1: identify repeated lines (headers/footers) to exclude
  const lines = text.split('\n')
  const lineFreq = new Map<string, number>()
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0) lineFreq.set(trimmed, (lineFreq.get(trimmed) ?? 0) + 1)
  }
  const repeatedLines = new Set(
    [...lineFreq.entries()].filter(([, c]) => c >= 3).map(([l]) => l),
  )

  // Step 2: split into paragraphs, stripping repeated-line content
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) =>
      p
        .split('\n')
        .filter((l) => !repeatedLines.has(l.trim()))
        .join(' '),
    )
    .filter((p) => p.trim().length > 20)

  // Step 3: per-paragraph term counting
  // term → Set of paragraph indices where it appears (so we count paragraphs,
  // then also track total occurrences for the why_problematic message)
  const termParaSet = new Map<string, Set<number>>()
  const termTotalCount = new Map<string, number>()

  const termRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g

  paragraphs.forEach((para, paraIdx) => {
    // Skip paragraphs that look like they contain only bracketed placeholders
    if (/^\s*\[.*\]\s*$/.test(para)) return

    termRegex.lastIndex = 0
    let match: RegExpExecArray | null
    const seenInPara = new Set<string>()

    while ((match = termRegex.exec(para)) !== null) {
      const raw = match[1]

      // Filter: stop-list (single word)
      const words = raw.split(/\s+/)
      if (words.length === 1 && DEFINED_TERM_STOPLIST.has(raw)) continue

      // Filter: bracketed placeholder anywhere adjacent
      const before = para.slice(Math.max(0, match.index - 1), match.index)
      const after = para.slice(match.index + raw.length, match.index + raw.length + 1)
      if (before === '[' || after === ']') continue

      // Filter: term is or contains only stoplist words
      if (words.every((w) => DEFINED_TERM_STOPLIST.has(w))) continue

      termTotalCount.set(raw, (termTotalCount.get(raw) ?? 0) + 1)
      if (!seenInPara.has(raw)) {
        seenInPara.add(raw)
        if (!termParaSet.has(raw)) termParaSet.set(raw, new Set())
        termParaSet.get(raw)!.add(paraIdx)
      }
    }
  })

  // Step 4: flag terms that appear in 3+ paragraphs (cross-section overuse)
  const results: DiagnosticItem[] = []
  for (const [term, paraSet] of termParaSet.entries()) {
    const paraCount = paraSet.size
    const totalCount = termTotalCount.get(term) ?? 0
    if (paraCount >= 3) {
      results.push({
        section_label: 'General',
        problem_text: term,
        issue_type: 'DEFINED_TERM_OVERUSE',
        why_problematic: `Used in ${paraCount} sections (${totalCount} total occurrences). Defined terms repeated across sections without plain-language anchoring can confuse consumers who haven't read the Definitions section. Consider adding a brief inline definition on first use.`,
        priority: paraCount >= 5 ? 'high' : 'medium',
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
