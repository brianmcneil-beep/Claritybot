import { useRef, useState } from 'react'
import { parseFile } from '../utils/fileParser'

interface InputSectionProps {
  text: string
  onTextChange: (text: string) => void
  onAnalyze: () => void
}

export default function InputSection({ text, onTextChange, onAnalyze }: InputSectionProps) {
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setParseError(null)
    setIsParsing(true)

    try {
      const extracted = await parseFile(file)
      onTextChange(extracted)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error parsing file.'
      setParseError(message)
    } finally {
      setIsParsing(false)
      // Reset file input so the same file can be re-uploaded after an error.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const canAnalyze = text.trim().length > 0

  return (
    <section className="p-6 border-b border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <label htmlFor="policy-text" className="text-sm font-medium text-gray-700">
          Policy text
        </label>
        <div className="flex items-center gap-3">
          {isParsing && (
            <span className="text-sm text-gray-500 italic">Parsing file…</span>
          )}
          <label
            htmlFor="file-upload"
            className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
          >
            Upload file (.txt, .docx, .pdf)
          </label>
          <input
            id="file-upload"
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx,.pdf"
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <textarea
        id="policy-text"
        rows={15}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Paste your policy text here, or upload a file above…"
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono leading-relaxed"
      />

      {parseError && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span className="font-semibold shrink-0">Parse error:</span>
          <span>{parseError}</span>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Analyze
        </button>
      </div>
    </section>
  )
}
