export const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

const pad = (n) => String(n).padStart(2, '0')

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => toISO(new Date())
export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const hmToMin = (s) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
export const minToHm = (min) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, min))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

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

// Parents may only watch during a schedule window set by the principal.
export function cameraState(db, classId, now = new Date()) {
  const today = toISO(now)
  const cur = now.getHours() * 60 + now.getMinutes()
  const slots = db.schedules
    .filter((s) => s.classId === classId && s.date === today && s.enabled)
    .sort((a, b) => hmToMin(a.start) - hmToMin(b.start))
  const live = slots.find((s) => hmToMin(s.start) <= cur && cur < hmToMin(s.end))
  if (live) return { state: 'live', schedule: live }
  const next = slots.find((s) => hmToMin(s.start) > cur)
  if (next) return { state: 'scheduled', schedule: next }
  return { state: 'unavailable', schedule: null }
}

export function scheduleStatus(s, now = new Date()) {
  if (!s.enabled) return 'Disabled'
  const today = toISO(now)
  const cur = now.getHours() * 60 + now.getMinutes()
  if (s.date < today || (s.date === today && hmToMin(s.end) <= cur)) return 'Ended'
  if (s.date === today && hmToMin(s.start) <= cur) return 'Live Now'
  return 'Scheduled'
}

export function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  // BOM so Excel reads Vietnamese characters correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })

export const JOURNAL_SECTIONS = [
  { key: 'meal', label: 'Meal', time: '11:30', timeline: 'Lunch' },
  { key: 'learning', label: 'Learning', time: '09:30', timeline: 'Learning Activity' },
  { key: 'sleep', label: 'Sleep', time: '13:00', timeline: 'Nap' },
  { key: 'health', label: 'Health', timeline: 'Health' },
  { key: 'emotion', label: 'Emotion', timeline: 'Emotion' },
  { key: 'note', label: 'Special Note', timeline: 'Note from the teacher' },
]

export const JOURNAL_STATUS = { draft: 'Draft', review: 'Needs Review', approved: 'Approved', published: 'Published' }
