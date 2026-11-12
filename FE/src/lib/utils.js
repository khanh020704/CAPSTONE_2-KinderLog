const pad = (n) => String(n).padStart(2, '0')

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => toISO(new Date())
export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export const fmtDate = (iso) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'
export const fmtLongDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
export const fmtTime = (ts) => hm(new Date(ts))
export const fmtDateTime = (ts) => (ts ? `${fmtDate(toISO(new Date(ts)))}, ${fmtTime(ts)}` : '—')

export const relTime = (ts) => {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  const day = toISO(new Date(ts))
  if (day === todayISO()) return `Today, ${fmtTime(ts)}`
  if (day === addDays(todayISO(), -1)) return `Yesterday, ${fmtTime(ts)}`
  return fmtDate(day)
}

export const dayLabel = (iso) => {
  if (iso === todayISO()) return 'Today'
  if (iso === addDays(todayISO(), -1)) return 'Yesterday'
  return fmtDate(iso)
}

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export const isPhone = (v) => /^0\d{9}$/.test((v || '').trim())
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim())

// Vietnamese names put the given name last, so initials use the last two words.
export const initials = (name = '') => {
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(-2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

const TINTS = ['sky', 'mint', 'peach', 'lav', 'cream']
export const tintOf = (name = '') => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997
  return TINTS[h % TINTS.length]
}

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

/**
 * id → what tells a child apart from classmates with the same full name: the date of birth, then the gender, then
 * a number when even those are equal (twins). Children with a name of their own get no entry.
 * `students`: [{ id, fullName | name, dateOfBirth, gender }]
 */
export function namesakeLabels(students) {
  const byName = new Map()
  for (const s of students) {
    const key = norm(s.fullName ?? s.name).trim()
    byName.set(key, [...(byName.get(key) || []), s])
  }
  const labels = {}
  for (const group of byName.values()) {
    if (group.length < 2) continue
    const parts = group.map((s) => [s.dateOfBirth ? `born ${fmtDate(s.dateOfBirth)}` : '', { MALE: 'boy', FEMALE: 'girl' }[s.gender] || ''])
    group.forEach((s, i) => {
      // Keep the gender only when the date of birth alone does not tell them apart.
      const same = (k) => group.filter((_, j) => parts[j].slice(0, k).join() === parts[i].slice(0, k).join()).length
      const used = same(1) === 1 ? parts[i].slice(0, 1) : parts[i]
      const label = used.filter(Boolean)
      if (group.filter((_, j) => parts[j].join() === parts[i].join()).length > 1) label.push(`#${i + 1}`)
      labels[s.id] = label.join(', ')
    })
  }
  return labels
}

/** "Nguyễn Minh Anh (born 10/01/2022)" when the class has another Nguyễn Minh Anh, otherwise the name alone. */
export const nameWithNamesake = (name, id, labels) => (labels[id] ? `${name} (${labels[id]})` : name)

export const fmtBytes = (n) => {
  if (n == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${i ? v.toFixed(1) : v} ${units[i]}`
}

export const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })

// The six sections of a class journal, in the order the teacher fills them in; `time` places a section on the
// parents' timeline.
export const JOURNAL_SECTIONS = [
  { key: 'meal', label: 'Meal', time: '11:30', timeline: 'Lunch' },
  { key: 'learning', label: 'Learning', time: '09:30', timeline: 'Learning Activity' },
  { key: 'sleep', label: 'Sleep', time: '13:00', timeline: 'Nap' },
  { key: 'health', label: 'Health', timeline: 'Health' },
  { key: 'emotion', label: 'Emotion', timeline: 'Emotion' },
  { key: 'note', label: 'Special Note', timeline: 'Note from the teacher' },
]

export const JOURNAL_STATUS = { draft: 'Draft', review: 'Needs Review', approved: 'Approved', published: 'Published' }

// Points to confirm about the same spoken name ("Tùng" said in three sentences) are one decision for the teacher:
// each statement keeps its own point and section, and the teacher's choice is applied to all of them.
// Statements about an unnamed child stay separate, since each may be about another child.
const BY_NAME = new Set(['unknown_student', 'ambiguous_student', 'name_mismatch'])
export function groupIssues(issues) {
  const groups = new Map()
  for (const issue of issues) {
    const named = issue.held && BY_NAME.has(issue.type) && issue.spokenNames?.length
    const key = named ? [issue.type, norm(issue.message), issue.spokenNames.map(norm).sort().join(','), [...issue.candidates].sort().join(',')].join('|') : issue.id
    groups.set(key, [...(groups.get(key) || []), issue])
  }
  return [...groups.values()]
}
