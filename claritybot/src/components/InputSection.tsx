import { useRef, useState, useCallback } from 'react'
import { parseFile } from '../utils/fileParser'

interface InputSectionProps {
  text: string
  onTextChange: (text: string) => void
  onAnalyze: () => void
}

export default function InputSection({ text, onTextChange, onAnalyze }: InputSectionProps) {
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
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
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [onTextChange])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await processFile(file)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && !name.endsWith('.docx') && !name.endsWith('.pdf')) {
      setParseError('Unsupported file type. Please drop a .txt, .docx, or .pdf file.')
      return
    }

    await processFile(file)
  }, [processFile])

  const canAnalyze = text.trim().length > 0

  return (
    <section className="p-6 border-b border-gray-200">
      <label htmlFor="policy-text" className="block text-sm font-medium text-gray-700 mb-3">
        Policy text
      </label>

      {/* Drag-and-drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          mb-3 flex flex-col items-center justify-center gap-1
          rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer
          transition-colors text-center
          ${isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
          }
        `}
        role="button"
        aria-label="Upload file by clicking or dragging and dropping"
      >
        {isParsing ? (
          <span className="text-sm text-gray-500 italic">Parsing file…</span>
        ) : (
          <>
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-gray-600">
              {isDragOver ? 'Drop to upload' : 'Drop a file here, or click to browse'}
            </p>
            <p className="text-xs text-gray-400">.txt, .docx, .pdf</p>
          </>
        )}
      </div>

      <input
        id="file-upload"
        ref={fileInputRef}
        type="file"
        accept=".txt,.docx,.pdf"
        className="sr-only"
        onChange={handleFileChange}
      />

      <textarea
        id="policy-text"
        rows={15}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="…or paste your policy text here."
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
