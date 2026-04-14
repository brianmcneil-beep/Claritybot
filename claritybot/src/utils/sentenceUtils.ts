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
 * Insurance documents separate enumerated conditions with semicolons, not
 * periods. Each semicolon-delimited clause is functionally a sentence and
 * is treated as one here. This is the primary correction that brings
 * ClarityBot's sentence counts in line with tools like Readable.com.
 */
function markBoundaries(text: string): string {
  // Step 1: neutralize abbreviation periods
  const neutralized = text.replace(ABBREV_RE, (m) => m.replace('.', DOT_SENTINEL))

  // Step 2: mark standard sentence endings ([.?!] followed by whitespace + capital)
  const withStandard = neutralized.replace(
    /([.?!]['")\]]*)\s+(?=[A-Z])/g,
    `$1${BREAK_SENTINEL}`,
  )

  // Step 3: mark semicolons as sentence boundaries
  const withSemicolons = withStandard.replace(/;\s*/g, `${BREAK_SENTINEL}`)

  return withSemicolons
}

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
 * Count sentences for use in readability formulas.
 */
export function countSentences(text: string): number {
  return Math.max(splitIntoSentences(text).length, 1)
}
