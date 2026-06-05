// ─────────────────────────────────────────────────────────────
// Default school account# -> SCoA category mapping (v1).
// Ported VERBATIM from the legacy ACCT_MAP. Numeric keys preserved.
// ─────────────────────────────────────────────────────────────
import type { SCoaCategory } from './categories.js'

export interface SchoolToScoaMapping {
  mappingVersion: string
  entries: Record<number, SCoaCategory>
}

export const ACCT_MAP: Record<number, SCoaCategory> = {
  // Revenue & support
  401: 'tuition', 402: 'tuition', 403: 'tuition', 404: 'tuition', 405: 'tuition', 409: 'tuition',
  407: 'intlRev',
  410: 'textbook', 419: 'other', 420: 'other', 430: 'other',
  440: 'studActRev', 450: 'studActRev',
  453: 'investments',
  465: 'support', 470: 'interest', 475: 'development', 480: 'support', 482: 'support',
  497: 'other', 499: 'other',

  // Instructional salaries & support
  500: 'instrSal', 510: 'instrSal', 511: 'instrSal', 519: 'instrSal',
  520: 'instrSup', 523: 'instrSup', 524: 'instrSup', 525: 'instrSup', 528: 'instrSup',
  529: 'instrSup', 530: 'instrSup', 531: 'instrSup', 532: 'instrSup', 534: 'instrSup',
  535: 'instrSup', 536: 'instrSup', 538: 'instrSup', 539: 'instrSup', 540: 'instrSup',
  541: 'instrSup', 542: 'instrSup', 567: 'instrSup', 579: 'instrSup', 580: 'instrSup',
  595: 'instrSup', 599: 'instrSup',

  // Administration
  600: 'adminSal', 601: 'adminSal', 602: 'adminSal',
  620: 'adminCost', 630: 'adminCost', 640: 'adminCost', 650: 'adminCost', 660: 'adminCost',
  661: 'adminCost', 670: 'adminCost', 671: 'adminCost', 680: 'adminCost', 691: 'adminCost',
  692: 'adminCost', 693: 'adminCost', 699: 'adminCost',

  // Facilities
  700: 'facilSal', 701: 'facilCost', 720: 'facilCost', 730: 'facilCost', 740: 'facilCost',
  741: 'facilCost', 742: 'facilCost', 750: 'facilCost', 760: 'facilCost',

  // Fixed charges & other
  800: 'fixedOther', 810: 'fixedOther', 811: 'fixedOther', 815: 'fixedOther',
  820: 'fixedOther', 821: 'fixedOther', 822: 'fixedOther', 823: 'fixedOther', 824: 'fixedOther',
  840: 'fixedOther', 841: 'fixedOther', 860: 'fixedOther', 865: 'fixedOther', 866: 'fixedOther',
  880: 'fixedOther', 890: 'fixedOther',

  // Auxiliary programs
  925: 'bus', 935: 'food',
  950: 'athletics', 951: 'athletics', 952: 'athletics', 953: 'athletics',
  954: 'athletics', 955: 'athletics', 958: 'athletics', 959: 'athletics',
  910: 'ancillary', 911: 'ancillary', 918: 'ancillary',
  963: 'restricted', 960: 'restricted', 988: 'intlExp',
}

export const DEFAULT_MAPPING: SchoolToScoaMapping = {
  mappingVersion: 'map-v1',
  entries: ACCT_MAP,
}
