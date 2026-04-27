declare module 'text-readability' {
  class Readability {
    lexiconCount(text: string, removePunctuation?: boolean): number
    sentenceCount(text: string): number
    averageSentenceLength(text: string): number
    averageSyllablePerWord(text: string): number
    syllableCount(text: string): number
    fleschReadingEase(text: string): number
    fleschKincaidGrade(text: string): number
    smogIndex(text: string): number
    gunningFog(text: string): number
  }
  const readability: Readability
  export default readability
}
