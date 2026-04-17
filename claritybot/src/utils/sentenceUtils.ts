import rs from 'text-readability'

/**
 * Abbreviations that end with a period but do NOT end a sentence.
 * These are neutralized before boundary detection to avoid false splits.
 */
const ABBREV_RE =
  /\b(mr|mrs|ms|dr|prof|sr|jr|vs|etc|e\.g|i\.e|no|pg|pp|fig|dept|est|approx|inc|corp|ltd|co|st|ave|blvd|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\./gi

// Internal sentinels — chosen from Unicode control range, unlikely in real docs.
const DOT_SENTINEL  = '\u00B7' // replaces neutralized abbreviation periods
const PARA_SENTINEL = '\u001E' // paragraph break (\n\n or more)
const BREAK_SENTINEL = '\u001F' // inline sentence boundary (single-line, semicolon, numbered)

/**
 * Preprocess text so sentence boundary markers are unambiguous.
 *
 * Two sentinel types are used:
 *   PARA_SENTINEL  — paragraph breaks (\n\n+). Items that follow a paragraph
 *                    break are standalone list items.
 *   BREAK_SENTINEL — all other inline boundaries (single newlines that contain
 *                    numbered markers, semicolons, standard [.?!] breaks).
 *                    Numbered items following an inline break are inline
 *                    sub-items of the preceding sentence.
 *
 * This two-sentinel approach lets classifySentences distinguish inline
 * numbered sub-items (no blank line before them) from standalone list items
 * (preceded by a blank line or paragraph break).
 */
function markBoundaries(text: string): string {
  // Step 1: neutralize abbreviation periods
  const neutralized = text.replace(ABBREV_RE, (m) => m.replace('.', DOT_SENTINEL))

  // Step 2: paragraph breaks → PARA_SENTINEL (must come before single-newline handling)
  const withParas = neutralized.replace(/\n{2,}/g, PARA_SENTINEL)

  // Step 3: standard sentence endings ([.?!] followed by whitespace + capital) → BREAK_SENTINEL
  const withStandard = withParas.replace(
    /([.?!]['")\]]*)\s+(?=[A-Z])/g,
    `$1${BREAK_SENTINEL}`,
  )

  // Step 4: semicolons → BREAK_SENTINEL
  const withSemicolons = withStandard.replace(/;\s*/g, BREAK_SENTINEL)

  // Step 5: numbered/lettered list items → BREAK_SENTINEL prefix.
  // Patterns covered (insurance policies use all of these):
  //   1.   2.   10.          digit(s) + period + space
  //   a.   b.   A.  B.       letter + period + space
  //   1)   2)               digit(s) + closing paren + space
  //   a)   b)   A)  B)       letter + closing paren + space
  //   (1)  (2)              opening paren + digit(s) + closing paren
  //   (a)  (b)  (A)  (B)    opening paren + letter + closing paren
  //
  // The lookbehind must allow PARA_SENTINEL (\u001E) and BREAK_SENTINEL (\u001F)
  // in addition to whitespace and start-of-string. Steps 2–4 have already placed
  // sentinels directly adjacent to list markers — there is no \s between them.
  // Without including sentinels in the lookbehind, "(1) collision" after a
  // semicolon would never be split because \u001F(1) fails (?<=\s).
  // Use new RegExp to avoid embedding literal control characters (ESLint no-control-regex).
  // The lookbehind includes PARA_SENTINEL and BREAK_SENTINEL so that enumeration markers
  // immediately following a sentinel (e.g. \u001F(1) after a semicolon) are also split.
  const numberedRE = new RegExp(
    `(?<=[\\s${PARA_SENTINEL}${BREAK_SENTINEL}]|^)(\\(\\d+\\)|\\([a-zA-Z]\\)|\\d+[.)]\\s|[a-zA-Z][.)]\\s)`,
    'g',
  )
  const withNumbered = withSemicolons.replace(numberedRE, `${BREAK_SENTINEL}$1`)

  return withNumbered
}

export type SentenceType = 'prose' | 'list_item' | 'inline_numbered'

export interface ClassifiedSentence {
  text: string
  sentenceType: SentenceType
}

// Bullet characters that mark standalone list items.
const BULLET_RE = /^[\u2022\u25CF\u25AA\u2013\u2014●•\-*]\s*/

// Numbered or lettered list marker at start of text.
// Covers: 1. 1) (1) a. a) (a) A. A) (A) — all common insurance policy formats.
const NUMBERED_ITEM_RE = /^(\(\d+\)|\([a-zA-Z]\)|\d+[.)]\s|[a-zA-Z][.)]\s)/

/**
 * Split text into sentence-sized strings (raw, unclassified).
 *
 * Fragments of fewer than 2 words (headers, numbering artifacts, etc.)
 * are filtered out. Both PARA_SENTINEL and BREAK_SENTINEL are treated
 * as split points here.
 */
export function splitIntoSentences(text: string): string[] {
  const marked = markBoundaries(text)
  return marked
    .split(new RegExp(`[${PARA_SENTINEL}${BREAK_SENTINEL}]`))
    .map((s) => s.replace(new RegExp(DOT_SENTINEL, 'g'), '.').trim())
    .filter((s) => rs.lexiconCount(s) >= 2)
}

/**
 * Split text into classified sentences with per-item metadata.
 *
 * Classification rules (evaluated in order):
 *
 *   list_item      — starts with a bullet character (●, -, *, •, …)
 *   list_item      — starts with a numbered/lettered marker AND the
 *                    preceding sentinel was PARA_SENTINEL (blank line
 *                    before it → standalone list item)
 *   list_item      — short (< 10 words) AND immediately follows a
 *                    colon-ending sentence (colon-introduced list)
 *   inline_numbered — starts with a numbered/lettered marker AND the
 *                    preceding sentinel was BREAK_SENTINEL (no blank
 *                    line → inline sub-item of the preceding sentence)
 *   prose          — everything else
 *
 * This classification is used only by the readability formula weighting
 * in readabilityScorer.ts. Diagnostic displays use splitIntoSentences()
 * directly and are unaffected.
 */
export function classifySentences(text: string): ClassifiedSentence[] {
  const marked = markBoundaries(text)

  // Split on either sentinel, but record WHICH sentinel preceded each piece.
  // We do this by splitting on a capture group so the delimiters are included.
  const SPLIT_RE = new RegExp(`([${PARA_SENTINEL}${BREAK_SENTINEL}])`)
  const parts = marked.split(SPLIT_RE)

  // Rebuild: [sentinel?, text, sentinel?, text, …]
  // parts[0] is pre-first-sentinel text (no preceding sentinel → treat as PARA)
  const units: Array<{ sentinel: string; raw: string }> = []
  let i = 0
  // First chunk has no preceding sentinel — treat as paragraph-level
  if (parts.length > 0 && parts[0] !== PARA_SENTINEL && parts[0] !== BREAK_SENTINEL) {
    units.push({ sentinel: PARA_SENTINEL, raw: parts[0] })
    i = 1
  }
  while (i < parts.length) {
    const sentinel = parts[i] ?? PARA_SENTINEL
    const raw = parts[i + 1] ?? ''
    units.push({ sentinel, raw })
    i += 2
  }

  // Clean and filter fragments
  const cleaned = units
    .map((u) => ({
      sentinel: u.sentinel,
      text: u.raw.replace(new RegExp(DOT_SENTINEL, 'g'), '.').trim(),
    }))
    .filter((u) => rs.lexiconCount(u.text) >= 2)

  // Two-pass: first classify, then fix up list continuations.
  const result: ClassifiedSentence[] = []

  for (let idx = 0; idx < cleaned.length; idx++) {
    const unit = cleaned[idx]
    const trimmed = unit.text.trimStart()

    // Bullet → list_item (standalone regardless of sentinel)
    if (BULLET_RE.test(trimmed)) {
      result.push({ text: unit.text, sentenceType: 'list_item' })
      continue
    }

    const isNumberedMarker = NUMBERED_ITEM_RE.test(trimmed)

    if (isNumberedMarker) {
      if (unit.sentinel === PARA_SENTINEL) {
        // Blank line before → standalone list item
        result.push({ text: unit.text, sentenceType: 'list_item' })
        continue
      }

      // BREAK_SENTINEL before a numbered item — two sub-cases:
      // (a) Previous classified sentence was list_item → continuation of
      //     that standalone list (NOT an inline sub-item of a prose parent)
      // (b) Previous classified sentence was prose or inline_numbered →
      //     inline sub-item of the parent sentence
      const prevType = result.length > 0 ? result[result.length - 1].sentenceType : null
      if (prevType === 'list_item') {
        result.push({ text: unit.text, sentenceType: 'list_item' })
      } else {
        result.push({ text: unit.text, sentenceType: 'inline_numbered' })
      }
      continue
    }

    // Colon-introduced short sentence → list_item
    if (idx > 0) {
      const prevRaw = cleaned[idx - 1].text.trimEnd()
      if (prevRaw.endsWith(':') && rs.lexiconCount(unit.text) < 10) {
        result.push({ text: unit.text, sentenceType: 'list_item' })
        continue
      }
    }

    result.push({ text: unit.text, sentenceType: 'prose' })
  }

  return result
}

/**
 * Count raw sentences for use in diagnostic displays.
 */
export function countSentences(text: string): number {
  return Math.max(splitIntoSentences(text).length, 1)
}

// ---------------------------------------------------------------------------
// Debug utility — call from browser console or a test harness
// ---------------------------------------------------------------------------

export interface SentenceDebugEntry {
  index: number
  text: string
  sentinel: 'PARA' | 'BREAK' | 'START'
  isBullet: boolean
  isNumberedMarker: boolean
  prevType: SentenceType | null
  prevEndsColon: boolean
  wordCount: number
  result: SentenceType
  reason: string
}

/**
 * debugClassifySentences(text, limit?)
 *
 * Returns per-sentence classification trace entries. Each entry explains
 * exactly which condition matched (or didn't) and the final assigned type.
 *
 * Usage in browser console after pasting text into the textarea:
 *   import('/src/utils/sentenceUtils.ts').then(m =>
 *     console.table(m.debugClassifySentences(window.__clarityText, 20))
 *   )
 *
 * Or expose window.__debugSentences from App.tsx for easier access.
 */
export function debugClassifySentences(
  text: string,
  limit = 20,
): SentenceDebugEntry[] {
  const marked = markBoundaries(text)
  const SPLIT_RE = new RegExp(`([${PARA_SENTINEL}${BREAK_SENTINEL}])`)
  const parts = marked.split(SPLIT_RE)

  const units: Array<{ sentinel: string; raw: string }> = []
  let i = 0
  if (parts.length > 0 && parts[0] !== PARA_SENTINEL && parts[0] !== BREAK_SENTINEL) {
    units.push({ sentinel: 'START', raw: parts[0] })
    i = 1
  }
  while (i < parts.length) {
    const sentinel = parts[i] ?? PARA_SENTINEL
    const raw = parts[i + 1] ?? ''
    units.push({ sentinel, raw })
    i += 2
  }

  const cleaned = units
    .map((u) => ({
      sentinel: u.sentinel === PARA_SENTINEL ? 'PARA' : u.sentinel === BREAK_SENTINEL ? 'BREAK' : 'START',
      text: u.raw.replace(new RegExp(DOT_SENTINEL, 'g'), '.').trim(),
    }))
    .filter((u) => rs.lexiconCount(u.text) >= 2) as Array<{ sentinel: 'PARA' | 'BREAK' | 'START'; text: string }>

  const entries: SentenceDebugEntry[] = []
  const assigned: SentenceType[] = []

  for (let idx = 0; idx < cleaned.length; idx++) {
    const unit = cleaned[idx]
    const trimmed = unit.text.trimStart()
    const wc = rs.lexiconCount(unit.text)
    const isBullet = BULLET_RE.test(trimmed)
    const isNum = NUMBERED_ITEM_RE.test(trimmed)
    const prevType: SentenceType | null = assigned.length > 0 ? assigned[assigned.length - 1] : null
    const prevEndsColon = idx > 0 ? cleaned[idx - 1].text.trimEnd().endsWith(':') : false

    let result: SentenceType
    let reason: string

    if (isBullet) {
      result = 'list_item'; reason = 'bullet character match'
    } else if (isNum && unit.sentinel === 'PARA') {
      result = 'list_item'; reason = 'numbered marker + PARA_SENTINEL (blank line before)'
    } else if (isNum && unit.sentinel !== 'PARA') {
      if (prevType === 'list_item') {
        result = 'list_item'; reason = `numbered marker + ${unit.sentinel} + prev=list_item (list continuation)`
      } else {
        result = 'inline_numbered'; reason = `numbered marker + ${unit.sentinel} + prev=${prevType ?? 'none'} → inline sub-item`
      }
    } else if (prevEndsColon && wc < 10) {
      result = 'list_item'; reason = `prev ends with colon + wordCount=${wc} < 10`
    } else if (!isNum && isBullet === false) {
      result = 'prose'
      const reasons: string[] = []
      if (isNum) reasons.push('has numbered marker but conditions not met')
      if (!isBullet) reasons.push('no bullet')
      if (!prevEndsColon) reasons.push('prev does not end with colon')
      if (wc >= 10) reasons.push(`wordCount=${wc} ≥ 10`)
      reason = reasons.length ? reasons.join('; ') : 'no list conditions met → prose'
    } else {
      result = 'prose'; reason = 'fallthrough → prose'
    }

    assigned.push(result)
    entries.push({
      index: idx,
      text: unit.text.slice(0, 80) + (unit.text.length > 80 ? '…' : ''),
      sentinel: unit.sentinel,
      isBullet,
      isNumberedMarker: isNum,
      prevType,
      prevEndsColon,
      wordCount: wc,
      result,
      reason,
    })

    if (entries.length >= limit) break
  }

  return entries
}
