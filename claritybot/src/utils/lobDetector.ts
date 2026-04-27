/**
 * Line-of-Business detection and methodology disclosure.
 *
 * Detection is keyword-based: score each LOB by counting how many of its
 * characteristic terms appear in the document text (case-insensitive, whole
 * word). The LOB with the highest weighted hit count wins, subject to the
 * endorsement override (word count < 3,000 → Endorsement regardless of LOB).
 *
 * These keyword lists are intentionally conservative — they target terms that
 * are distinctive to one LOB and unlikely to appear prominently in another.
 */

export type LOB =
  | 'ppa'          // Personal auto / private passenger auto
  | 'homeowners'   // Homeowners, condo, renters
  | 'pet'          // Pet insurance
  | 'endorsement'  // Any short form (< 3,000 words)
  | 'unknown'      // Cannot determine

export interface LOBResult {
  lob: LOB
  confidence: 'auto' | 'manual'
  /** Total keyword hits that drove detection (debug). */
  hitCount: number
}

// Keywords weighted 1 each. Higher density = stronger LOB signal.
const LOB_KEYWORDS: Record<Exclude<LOB, 'endorsement' | 'unknown'>, string[]> = {
  ppa: [
    'automobile', 'motor vehicle', 'collision coverage', 'comprehensive coverage',
    'uninsured motorist', 'underinsured motorist', 'personal injury protection',
    'no-fault', 'bodily injury liability', 'property damage liability',
    'named driver', 'covered auto', 'non-owned auto', 'owned auto',
    'physical damage', 'rental reimbursement', 'towing', 'roadside',
    'declarations page', 'policy period', 'your covered auto',
  ],
  homeowners: [
    'dwelling', 'residence premises', 'other structures', 'personal property',
    'loss of use', 'additional living expenses', 'homeowner', 'condo',
    'condominium', 'renters', 'tenant', 'landlord', 'mortgage holder',
    'replacement cost', 'ordinance or law', 'inflation guard', 'floater',
    'scheduled property', 'blanket coverage', 'liability coverage',
    'medical payments to others', 'fire damage', 'smoke damage',
    'vandalism', 'theft', 'water damage', 'dwelling coverage',
  ],
  pet: [
    'veterinary', 'vet', 'pet', 'animal', 'dog', 'cat', 'canine', 'feline',
    'hereditary condition', 'congenital condition', 'bilateral condition',
    'pre-existing condition', 'wellness', 'routine care', 'vaccination',
    'spay', 'neuter', 'dental cleaning', 'annual benefit limit',
    'per-incident limit', 'reimbursement percentage', 'breed',
  ],
}

/** Count whole-word, case-insensitive keyword hits in text. */
function countHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'i')
    if (re.test(lower)) hits++
  }
  return hits
}

/**
 * Detect the most likely LOB from document text and word count.
 *
 * If wordCount < 3,000 the form is treated as an endorsement regardless of
 * content — endorsement forms are too short for reliable LOB keyword scoring
 * and have their own score context disclosure.
 */
export function detectLOB(text: string, wordCount: number): LOBResult {
  if (wordCount < 3000) {
    return { lob: 'endorsement', confidence: 'auto', hitCount: 0 }
  }

  const scores: Record<Exclude<LOB, 'endorsement' | 'unknown'>, number> = {
    ppa: countHits(text, LOB_KEYWORDS.ppa),
    homeowners: countHits(text, LOB_KEYWORDS.homeowners),
    pet: countHits(text, LOB_KEYWORDS.pet),
  }

  const best = (Object.entries(scores) as [Exclude<LOB, 'endorsement' | 'unknown'>, number][])
    .sort((a, b) => b[1] - a[1])[0]

  // Require at least 3 hits to claim a LOB; otherwise unknown.
  if (best[1] < 3) {
    return { lob: 'unknown', confidence: 'auto', hitCount: best[1] }
  }

  return { lob: best[0], confidence: 'auto', hitCount: best[1] }
}

// ---------------------------------------------------------------------------
// Disclosure text per LOB
// ---------------------------------------------------------------------------

/** Returns the disclosure text for the FRE card, or null if none needed. */
export function getLOBDisclosure(lob: LOB): string | null {
  switch (lob) {
    case 'ppa':
      return null  // No disclosure needed — scores align within ±1 point

    case 'endorsement':
      return 'Readability scores on short endorsement forms may vary from full policy benchmarks. ClarityBot\'s sentence-level analysis is optimized for full policy documents.'

    case 'homeowners':
      return 'Homeowners forms use complex multi-clause prose structures that produce Flesch RE scores approximately 4–5 points higher than general-purpose readability tools. ClarityBot\'s scores reflect accurate sentence-level analysis optimized for insurance policy language.'

    case 'pet':
      return 'Pet insurance forms use short declarative sentence structures that produce Flesch RE scores approximately 5–8 points higher than general-purpose readability tools. ClarityBot\'s scores reflect accurate sentence-level analysis optimized for insurance policy language.'

    case 'unknown':
      return null  // No disclosure for undetected LOB

    default:
      return null
  }
}

export const LOB_LABELS: Record<LOB, string> = {
  ppa: 'Personal Auto (PPA)',
  homeowners: 'Homeowners / Condo / Renters',
  pet: 'Pet Insurance',
  endorsement: 'Endorsement / Short Form',
  unknown: 'Unknown',
}
