// Display labels for the backend enums, and the reverse maps forms need.

const invert = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]))
const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }))

export const STATUS = { ACTIVE: 'Active', INACTIVE: 'Inactive', LOCKED: 'Locked' }
export const STATUS_KEY = invert(STATUS)
export const GENDER = { MALE: 'Male', FEMALE: 'Female' }
export const RELATIONSHIP = { MOTHER: 'Mother', FATHER: 'Father', GRANDMOTHER: 'Grandmother', GRANDFATHER: 'Grandfather', GUARDIAN: 'Guardian' }

export const HEALTH = { NORMAL: 'Normal', MONITOR: 'Needs monitoring', SICK: 'Unwell' }

export const GENDER_OPTIONS = options(GENDER)
export const RELATIONSHIP_OPTIONS = options(RELATIONSHIP)

export const label = (map, v) => (v ? map[v] || v : '')

// Readable message for a failed API call (validation errors arrive as a list).
export function errorText(e, fallback = 'Something went wrong. Please try again.') {
  if (!e) return fallback
  if (e.status === undefined) return 'Cannot reach the server. Check that the backend is running.'
  if (e.status === 429) return 'Too many requests. Please wait a minute and try again.'
  return e.message || fallback
}

export const ISO_WEEKDAYS = [
  { bit: 1, short: 'Mon' },
  { bit: 2, short: 'Tue' },
  { bit: 3, short: 'Wed' },
  { bit: 4, short: 'Thu' },
  { bit: 5, short: 'Fri' },
  { bit: 6, short: 'Sat' },
  { bit: 7, short: 'Sun' },
]
export const weekdaysText = (mask) => {
  const on = ISO_WEEKDAYS.filter((d) => mask & (1 << d.bit)).map((d) => d.short)
  if (on.length === 7) return 'Every day'
  if (on.join() === 'Mon,Tue,Wed,Thu,Fri') return 'Mon–Fri'
  return on.join(', ') || 'Never'
}
