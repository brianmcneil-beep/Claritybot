/**
 * Insurance jargon glossary.
 * Each entry is a word or phrase (lowercase) that is common insurance
 * terminology and may be difficult for average consumers to understand.
 *
 * To add terms: append to the array. Terms are matched case-insensitively
 * against the document text.
 */
const jargonGlossary: string[] = [
  // Coverage fundamentals
  'actual cash value',
  'replacement cost value',
  'agreed value',
  'depreciation',
  'deductible',
  'copay',
  'coinsurance',
  'premium',
  'endorsement',
  'rider',
  'binder',
  'declaration',
  'declarations page',

  // Parties & roles
  'named insured',
  'additional insured',
  'insured',
  'insurer',
  'policyholder',
  'underwriter',
  'subrogation',
  'indemnify',
  'indemnification',
  'obligee',
  'obligor',

  // Loss & claims
  'peril',
  'covered peril',
  'occurrence',
  'claim',
  'claimant',
  'proof of loss',
  'loss of use',
  'total loss',
  'constructive total loss',
  'salvage',
  'adjuster',
  'appraisal',

  // Policy structure
  'exclusion',
  'exclusions',
  'conditions',
  'definitions',
  'insuring agreement',
  'coverage territory',
  'coverage period',
  'retroactive date',
  'tail coverage',
  'extended reporting period',

  // Liability
  'bodily injury',
  'property damage',
  'personal injury',
  'occurrence basis',
  'claims-made basis',
  'aggregate limit',
  'per-occurrence limit',
  'umbrella policy',
  'excess liability',
  'defense costs',

  // PPA-specific
  'uninsured motorist',
  'underinsured motorist',
  'collision coverage',
  'comprehensive coverage',
  'medical payments',
  'personal injury protection',
  'no-fault',
  'stacked coverage',

  // Homeowners-specific
  'dwelling coverage',
  'other structures',
  'personal property',
  'loss of income',
  'ordinance or law',
  'inflation guard',
  'valued policy',
  'blanket coverage',
  'scheduled property',
  'floater',

  // Pet-specific
  'bilateral condition',
  'congenital condition',
  'hereditary condition',
  'pre-existing condition',
  'waiting period',
  'annual benefit limit',
  'per-incident limit',
  'reimbursement basis',
]

export default jargonGlossary
