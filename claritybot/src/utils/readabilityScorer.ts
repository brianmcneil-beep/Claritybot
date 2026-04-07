import rs from 'text-readability'

export interface ReadabilityScores {
  fleschReadingEase: number
  fleschKincaidGrade: number
  smogIndex: number
  gunningFog: number
  wordCount: number
  sentenceCount: number
  avgWordsPerSentence: number
  avgSyllablesPerWord: number
}

export function scoreText(text: string): ReadabilityScores {
  const wordCount = rs.lexiconCount(text)
  const sentenceCount = rs.sentenceCount(text)

  return {
    fleschReadingEase: round(rs.fleschReadingEase(text), 1),
    fleschKincaidGrade: round(rs.fleschKincaidGrade(text), 1),
    smogIndex: round(rs.smogIndex(text), 1),
    gunningFog: round(rs.gunningFog(text), 1),
    wordCount,
    sentenceCount,
    avgWordsPerSentence: round(wordCount / Math.max(sentenceCount, 1), 1),
    avgSyllablesPerWord: round(rs.averageSyllablePerWord(text), 2),
  }
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

// One-line plain-English interpretations for each score.

export function interpretFleschReadingEase(score: number): string {
  if (score >= 90) return 'Very easy — 5th grade reading level'
  if (score >= 80) return 'Easy — 6th grade reading level'
  if (score >= 70) return 'Fairly easy — 7th grade reading level'
  if (score >= 60) return 'Standard — 8th–9th grade reading level'
  if (score >= 50) return 'Fairly difficult — 10th–12th grade reading level'
  if (score >= 30) return 'Difficult — college reading level'
  return 'Very confusing — professional / graduate reading level'
}

export function interpretFleschKincaidGrade(grade: number): string {
  if (grade <= 6) return `Grade ${grade} — elementary school reading level`
  if (grade <= 8) return `Grade ${grade} — middle school reading level`
  if (grade <= 12) return `Grade ${grade} — high school reading level`
  if (grade <= 16) return `Grade ${grade} — college reading level`
  return `Grade ${grade} — graduate / professional reading level`
}

export function interpretSmog(score: number): string {
  if (score <= 6) return `SMOG ${score} — elementary school reading level`
  if (score <= 10) return `SMOG ${score} — middle school reading level`
  if (score <= 14) return `SMOG ${score} — high school reading level`
  if (score <= 18) return `SMOG ${score} — college reading level`
  return `SMOG ${score} — graduate / professional reading level`
}

export function interpretGunningFog(score: number): string {
  if (score <= 6) return `Fog ${score} — very easy to read`
  if (score <= 8) return `Fog ${score} — easy — ideal for consumer documents`
  if (score <= 12) return `Fog ${score} — acceptable — high school level`
  if (score <= 16) return `Fog ${score} — difficult — college level`
  return `Fog ${score} — very difficult — requires specialist knowledge`
}
