import rs from 'text-readability'

/**
 * Abbreviations that end with a period but do NOT end a sentence.
 * These are neutralized before boundary detection to avoid false splits.
 */
const ABBREV_RE =
  /\b(mr|mrs|ms|dr|prof|sr|jr|vs|etc|e\.g|i\.e|no|pg|pp|fig|dept|est|approx|inc|corp|ltd|co|st|ave|blvd|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\./gi

// Sentinel characters used internally — unlikely to appear in real documents.
const DOT_SENTINEL = '\u00B7'   // replaces neutralized abbreviation periods
const BREAK_SENTINEL = '\u001F' // marks sentence boundaries before splitting

/**
 * Preprocess text so sentence boundary markers are unambiguous.
 *
 * Insurance documents use several constructs that standard sentence splitters
 * miss: semicolons separate enumerated conditions; paragraph breaks separate
 * policy sections; numbered/lettered list items each contain a discrete
 * obligation. We mark all of these as boundaries.
 */
function markBoundaries(text: string): string {
  // Step 1: neutralize abbreviation periods so they don't trigger splits
  const neutralized = text.replace(ABBREV_RE, (m) => m.replace('.', DOT_SENTINEL))

  // Step 2: mark paragraph breaks (double newline) as sentence boundaries
  const withParas = neutralized.replace(/\n{2,}/g, BREAK_SENTINEL)

  // Step 3: mark standard sentence endings ([.?!] followed by whitespace + capital)
  const withStandard = withParas.replace(
    /([.?!]['")\]]*)\s+(?=[A-Z])/g,
    `$1${BREAK_SENTINEL}`,
  )

  // Step 4: mark semicolons as sentence boundaries (primary fix for enumerated lists)
  const withSemicolons = withStandard.replace(/;\s*/g, BREAK_SENTINEL)

  // Step 5: mark numbered list items (e.g. "1." "2." at start of line / after break)
  // as sentence boundaries so each enumerated clause is counted separately
  const withNumbered = withSemicolons.replace(
    /(?<=\s|^)(\d+\.|[a-z]\.)(?=\s)/g,
    `${BREAK_SENTINEL}$1`,
  )

  return withNumbered
}

export type SentenceType = 'prose' | 'list_item'

export interface ClassifiedSentence {
  text: string
  sentenceType: SentenceType
}

// Bullet characters that mark list items in insurance documents.
const BULLET_RE = /^[\u2022\u25CF\u25AA\u2013\u2014●•\-*]\s*/

// Numbered list item: starts with one or more digits followed by a period/paren.
const NUMBERED_ITEM_RE = /^\d+[.)]\s+/

/**
 * Split text into sentence-sized strings.
 *
 * Each returned string is one "sentence" for the purpose of readability
 * scoring and diagnostics. Fragments of fewer than 2 words (headers,
 * numbering artifacts, etc.) are filtered out.
 */
export function splitIntoSentences(text: string): string[] {
  const marked = markBoundaries(text)
  return marked
    .split(BREAK_SENTINEL)
    .map((s) => s.replace(new RegExp(DOT_SENTINEL, 'g'), '.').trim())
    .filter((s) => rs.lexiconCount(s) >= 2)
}

/**
 * Split text into classified sentences.
 *
 * A sentence is tagged "list_item" if it:
 *   (a) starts with a bullet character (●, -, *, •, etc.)
 *   (b) starts with a numbered list marker (1. 2. etc.)
 *   (c) contains fewer than 10 words AND immediately follows a sentence
 *       that ends with a colon
 *
 * All other sentences are tagged "prose".
 *
 * The classification is used only in readability formula weighting.
 * Diagnostic display and counts use the raw sentence list unchanged.
 */
export function classifySentences(text: string): ClassifiedSentence[] {
  const raw = splitIntoSentences(text)
  return raw.map((sentence, i) => {
    const trimmed = sentence.trimStart()

    // Condition (a): starts with a bullet character
    if (BULLET_RE.test(trimmed)) {
      return { text: sentence, sentenceType: 'list_item' }
    }

    // Condition (b): starts with a numbered list marker
    if (NUMBERED_ITEM_RE.test(trimmed)) {
      return { text: sentence, sentenceType: 'list_item' }
    }

    // Condition (c): short sentence immediately following a colon-ending sentence
    if (i > 0) {
      const prev = raw[i - 1].trimEnd()
      if (prev.endsWith(':') && rs.lexiconCount(sentence) < 10) {
        return { text: sentence, sentenceType: 'list_item' }
      }
    }

    return { text: sentence, sentenceType: 'prose' }
  })
}

/**
 * Count sentences for use in readability formulas.
 */
export function countSentences(text: string): number {
  return Math.max(splitIntoSentences(text).length, 1)
}
