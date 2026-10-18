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

export const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
