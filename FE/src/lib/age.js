// Child age vs. the age group of a class ("4-5 tuổi", "24-36 tháng"…). Used for soft warnings only: the principal
// may still place a child in another group (late enrolment, development needs).
import { fmtDate, todayISO } from './utils'

/** Whole months between two YYYY-MM-DD dates (negative when `dob` is after `on`). */
export function ageInMonths(dob, on) {
  const [y1, m1, d1] = dob.split('-').map(Number)
  const [y2, m2, d2] = on.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

export function fmtAge(months) {
  if (months < 0) return 'not born yet'
  const y = Math.floor(months / 12)
  const m = months % 12
  const part = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (y === 0) return part(m, 'month')
  return m ? `${part(y, 'year')} ${part(m, 'month')}` : part(y, 'year')
}

/**
 * "4-5 tuổi" → 48…59 months, "24-36 tháng" → 24…35, "5 tuổi" → 60…71. Years unless the text says months.
 * Returns null when the text has no recognisable range (e.g. "Nhà trẻ"): nothing is checked then.
 */
export function parseAgeGroup(text) {
  if (!text) return null
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd')
  const months = /thang|month/.test(t)
  const range = /(\d+)\s*(?:-|–|—|to|den)\s*(\d+)/.exec(t)
  const single = /(\d+)/.exec(t)
  const [from, to] = range ? [Number(range[1]), Number(range[2])] : single ? [Number(single[1]), Number(single[1]) + (months ? 12 : 1)] : []
  if (from === undefined || to <= from) return null
  const k = months ? 1 : 12
  return { min: from * k, max: to * k, label: text.trim() }
}

/** Ages are compared on 1 September of the class's academic year ("2026-2027" → 2026-09-01), else today. */
export function referenceDate(cls) {
  const start = /^(\d{4})-\d{4}$/.exec(cls?.academicYear || '')?.[1]
  return start ? `${start}-09-01` : todayISO()
}

/** Age of the child, and whether it fits the class's age group (fits = null when the group cannot be read). */
export function checkAge(dob, cls) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const on = referenceDate(cls)
  const months = ageInMonths(dob, on)
  const group = parseAgeGroup(cls?.ageGroup)
  return { months, on, group, fits: group ? months >= group.min && months < group.max : null }
}

/** Shown under the date of birth: the age now, and on the class's reference date when a class is chosen. */
export function ageHint(dob, cls) {
  const now = checkAge(dob, null)
  if (!now || now.months < 0) return undefined
  const atRef = cls && checkAge(dob, cls)
  return atRef && atRef.on !== now.on ? `Age: ${fmtAge(now.months)} · ${fmtAge(atRef.months)} on ${fmtDate(atRef.on)}` : `Age: ${fmtAge(now.months)}`
}

/** Soft warning when the child's age does not match the class's age group ('' when it fits or cannot be checked). */
export function ageWarning(dob, cls) {
  const r = checkAge(dob, cls)
  if (!r || r.fits !== false) return ''
  const side = r.months < r.group.min ? 'younger than' : 'older than'
  return `${cls.name} is for ${r.group.label}, but this child is ${fmtAge(r.months)} on ${fmtDate(r.on)} (${side} the group).`
}
