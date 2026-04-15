import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'

// The worker file is copied to public/ at build time (see vite.config.ts).
// Using a static string avoids Rolldown's inability to resolve ?url imports
// for files outside the src tree.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

/**
 * Repair common PDF ligature artifacts where pdfjs-dist splits a ligature
 * glyph into its component letters with a space between them.
 *
 * Examples seen in insurance PDFs:
 *   "De fi nitions"  →  "Definitions"
 *   "bene fi t"      →  "benefit"
 *   "of fi ce"       →  "office"
 *   "ef fi cient"    →  "efficient"
 *   "fl ood"         →  "flood"
 *   "re fl ect"      →  "reflect"
 *
 * Strategy: if a single isolated letter (or two-letter fragment "fi"/"fl"/
 * "ffi"/"ffl") is surrounded by word characters with a space on one or both
 * sides, and the joined result forms a plausible word segment, collapse it.
 * We do multiple passes to handle chains like "de fi ni tion".
 */
function repairLigatures(text: string): string {
  // Pass 1: merge isolated "fi" / "fl" / "ffi" / "ffl" ligature fragments
  // Pattern: word-chars SPACE (fi|fl|ffi|ffl) SPACE word-chars
  let result = text
  for (let i = 0; i < 4; i++) {
    result = result
      // "De fi nition" → "Definition" (fragment flanked by word chars)
      .replace(/([a-zA-Z])\s+(fi|fl|ffi|ffl)\s+([a-zA-Z])/g, '$1$2$3')
      // "bene fi t" where fragment is at a word boundary
      .replace(/([a-zA-Z])\s+(fi|fl|ffi|ffl)(?=\s|$)/g, '$1$2')
      .replace(/(?:^|\s)(fi|fl|ffi|ffl)\s+([a-zA-Z])/g, ' $1$2')
  }
  return result
}

/** Normalize whitespace: collapse multiple spaces/newlines into single spaces/newlines. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Apply ligature repair then whitespace normalization. */
function cleanText(text: string): string {
  return normalizeWhitespace(repairLigatures(text))
}

/** Parse a plain-text file via FileReader. */
export function parseTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      resolve(cleanText(text))
    }
    reader.onerror = () => reject(new Error('Failed to read text file.'))
    reader.readAsText(file)
  })
}

/** Parse a .docx file using mammoth (strips formatting, returns plain text). */
export async function parseDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return cleanText(result.value)
}

/**
 * Parse a .pdf file using pdf.js.
 *
 * The core challenge: pdfjs-dist splits text runs at style boundaries
 * (bold/italic defined terms, font-size changes). Adjacent runs are NOT
 * guaranteed to have a trailing space, so naive concatenation produces
 * "causedbycollision" instead of "caused by collision".
 *
 * Fix: after each item we calculate the expected x-position of the next
 * character as currentX + itemWidth. If the next item starts significantly
 * to the right of that position (gap > 0.25 × font-size), a word boundary
 * exists and we insert a space. If the gap is small (≤ 0.25 × font-size),
 * the items are part of the same word (e.g. bold mid-word) and we join
 * directly.
 *
 * hasEOL is still used to emit real line breaks.
 */
export async function parsePdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent({ includeMarkedContent: false })

    const rawItems = content.items.filter((item) => 'str' in item) as Array<{
      str: string
      transform: number[]
      width: number
      height: number
      hasEOL: boolean
    }>

    const parts: string[] = []
    let prevEndX: number | null = null
    let prevY: number | null = null

    for (const item of rawItems) {
      if (item.str.length === 0 && !item.hasEOL) continue

      const x = item.transform[4]
      const y = item.transform[5]
      // Font size is the absolute value of transform[3] (scale y component).
      const fontSize = Math.abs(item.transform[3]) || 12

      if (prevY !== null && Math.abs(y - prevY) > fontSize * 0.5) {
        // Different line — emit newline regardless of hasEOL
        parts.push('\n')
        prevEndX = null
      } else if (prevEndX !== null && item.str.length > 0) {
        const gap = x - prevEndX
        // If the gap between the end of the last item and start of this one
        // is more than 25% of the font size, treat it as a word boundary.
        if (gap > fontSize * 0.25) {
          // Ensure there's a space between words if the text doesn't already
          // end/start with whitespace.
          const lastPart = parts[parts.length - 1] ?? ''
          if (lastPart.length > 0 && !/\s$/.test(lastPart) && !/^\s/.test(item.str)) {
            parts.push(' ')
          }
        }
      }

      if (item.str.length > 0) {
        parts.push(item.str)
        prevEndX = x + item.width
        prevY = y
      }

      if (item.hasEOL) {
        parts.push('\n')
        prevEndX = null
      }
    }

    pageTexts.push(parts.join(''))
  }

  return cleanText(pageTexts.join('\n\n'))
}

/** Dispatch to the correct parser based on file extension. */
export async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt')) return parseTxt(file)
  if (name.endsWith('.docx')) return parseDocx(file)
  if (name.endsWith('.pdf')) return parsePdf(file)
  throw new Error(`Unsupported file type. Please upload a .txt, .docx, or .pdf file.`)
}
