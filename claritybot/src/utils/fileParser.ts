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
 * We use the hasEOL flag that pdf.js sets on each TextItem to detect real
 * line breaks (paragraph ends, list item ends, section headers). When
 * hasEOL is true the item ends a visual line; we append a newline.
 * Otherwise items on the same line are joined with a space.
 *
 * This is more reliable than Y-coordinate comparison, which can drop text
 * blocks whose transform scale differs from the document's dominant scale
 * (causing ~24% word-count loss on dense multi-section documents).
 */
export async function parsePdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent({ includeMarkedContent: false })

    const parts: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const textItem = item as { str: string; hasEOL: boolean }
      if (textItem.str.trim().length === 0 && !textItem.hasEOL) continue
      parts.push(textItem.str)
      if (textItem.hasEOL) parts.push('\n')
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
