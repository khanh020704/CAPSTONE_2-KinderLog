// Backend records → the shapes the screens already render (and back), so the pages keep their markup.
import { toISO, todayISO } from './utils'

const ROLE_LABEL = { SYSTEM_ADMIN: 'System Admin', PRINCIPAL: 'Principal', TEACHER: 'Teacher', PARENT: 'Parent' }
export const roleLabel = (role) => ROLE_LABEL[role] || role || '—'
const ts = (iso) => (iso ? new Date(iso).getTime() : null)
// An instant as the local calendar day (00:00 in Vietnam is still the previous day in UTC).
const localDay = (iso) => (iso ? toISO(new Date(iso)) : '')
const sentence = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : s)

// ---- notifications: NotificationItem reads { type (lower case), title, body, at } ----
export const toNotification = (n) => ({ ...n, type: n.type.toLowerCase(), at: ts(n.createdAt), unread: !n.readAt })

// ---- audit log rows: { at, user, role, action, module, description, status } ----
export const AUDIT_ROLE_OPTIONS = Object.values(ROLE_LABEL)
export const AUDIT_ACTION_OPTIONS = [
  'Login',
  'Create',
  'Update',
  'Delete',
  'Status',
  'Approve',
  'Bulk save',
  'Upload',
  'Reset password',
  'Change password',
  'Link',
  'Unlink',
  'Ai draft',
]
export const auditRoleParam = (label) => Object.keys(ROLE_LABEL).find((k) => ROLE_LABEL[k] === label)
export const auditActionParam = (label) => label && label.toUpperCase().replace(/ /g, '_')
export const toAuditRow = (l) => ({
  id: l.id,
  at: ts(l.createdAt),
  user: l.userName || 'Unknown',
  role: roleLabel(l.userRole),
  action: sentence(l.action),
  module: l.module,
  description: l.description,
  status: l.status === 'FAILED' ? 'Failed' : 'Success',
})

// ---- academic years: the form uses Current / Upcoming / Archived ----
export const toYear = (y) => ({
  ...y,
  start: y.startDate,
  end: y.endDate,
  status: y.status === 'ACTIVE' ? 'Current' : y.startDate > todayISO() ? 'Upcoming' : 'Archived',
})
export const fromYear = (f) => ({
  name: f.name.trim().replace(/\s*[–—-]\s*/, '-'),
  startDate: f.start,
  endDate: f.end,
  status: f.status === 'Current' ? 'ACTIVE' : 'INACTIVE',
})

// ---- announcements ----
const CATEGORY = { HOLIDAY: 'Holiday', ACTIVITY: 'School Activity', NOTICE: 'Important Notice', REMINDER: 'Reminder' }
const AUDIENCE = { TEACHERS: 'Teachers', PARENTS: 'Parents', ALL: 'Teachers & Parents' }
const key = (map, label) => Object.keys(map).find((k) => map[k] === label)
export const ANNOUNCEMENT_CATEGORIES = Object.values(CATEGORY)
export const ANNOUNCEMENT_AUDIENCES = Object.values(AUDIENCE)
export const toAnnouncement = (a) => ({
  ...a,
  category: CATEGORY[a.category] || a.category,
  audience: AUDIENCE[a.audience] || a.audience,
  // published with a later publish date: readers see it (and are notified) from that day
  status: a.status !== 'PUBLISHED' ? 'Draft' : a.publishedAt && new Date(a.publishedAt) > new Date() ? 'Scheduled' : 'Published',
  publishDate: localDay(a.publishedAt),
  expiryDate: a.expiresOn || '',
  createdAt: ts(a.createdAt),
})
export const fromAnnouncement = (f) => ({
  title: f.title.trim(),
  content: f.content.trim(),
  category: key(CATEGORY, f.category),
  audience: key(AUDIENCE, f.audience),
  status: f.status === 'Published' || f.status === 'Scheduled' ? 'PUBLISHED' : 'DRAFT',
  publishOn: f.publishDate || undefined,
  expiresOn: f.expiryDate || null,
})
export const announcementParam = { category: (label) => key(CATEGORY, label), status: (label) => label && label.toUpperCase() }

// ---- messages: bubbles read { id, text, at, mine } ----
export const toMessage = (m, meId) => ({ id: m.id, text: m.content, at: ts(m.createdAt), mine: m.senderId === meId, read: !!m.readAt })
