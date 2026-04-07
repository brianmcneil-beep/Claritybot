// Placeholder — implemented in Phase 5
interface RewriteSectionProps {
  text: string
  apiKey: string
}

export default function RewriteSection({ text: _text, apiKey: _apiKey }: RewriteSectionProps) {
  return (
    <section className="p-6">
      <p className="text-gray-400 italic">Rewrite output section — Phase 5</p>
    </section>
  )
}
