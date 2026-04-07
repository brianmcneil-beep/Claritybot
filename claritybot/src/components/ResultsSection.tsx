// Placeholder — implemented in Phases 3 & 4
interface ResultsSectionProps {
  text: string
}

export default function ResultsSection({ text: _text }: ResultsSectionProps) {
  return (
    <section className="p-6 border-b border-gray-200">
      <p className="text-gray-400 italic">Results section — Phases 3 &amp; 4</p>
    </section>
  )
}
