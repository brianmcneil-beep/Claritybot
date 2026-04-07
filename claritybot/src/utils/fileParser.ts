import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'

// The worker file is copied to public/ at build time (see vite.config.ts).
// Using a static string avoids Rolldown's inability to resolve ?url imports
// for files outside the src tree.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

/** Normalize whitespace: collapse multiple spaces/newlines into single spaces/newlines. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Parse a plain-text file via FileReader. */
export function parseTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      resolve(normalizeWhitespace(text))
    }
    reader.onerror = () => reject(new Error('Failed to read text file.'))
    reader.readAsText(file)
  })
}

/** Parse a .docx file using mammoth (strips formatting, returns plain text). */
export async function parseDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return normalizeWhitespace(result.value)
}

/** Parse a .pdf file using pdf.js (extracts text from all pages). */
export async function parsePdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(pageText)
  }

  return normalizeWhitespace(pageTexts.join('\n\n'))
}

/** Dispatch to the correct parser based on file extension. */
export async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt')) return parseTxt(file)
  if (name.endsWith('.docx')) return parseDocx(file)
  if (name.endsWith('.pdf')) return parsePdf(file)
  throw new Error(`Unsupported file type. Please upload a .txt, .docx, or .pdf file.`)
}
