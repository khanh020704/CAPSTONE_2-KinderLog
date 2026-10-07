import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { seed } from './seed'
import { todayISO, uid } from '../lib/utils'

const DB_KEY = 'kinderlog.db'
const SESSION_KEY = 'kinderlog.session'
export const DEMO_PASSWORD = '123456'

export const ROLES = {
  admin: { label: 'System Admin', coll: 'admins', home: '/admin' },
  principal: { label: 'Principal', coll: 'principals', home: '/principal' },
  teacher: { label: 'Teacher', coll: 'teachers', home: '/teacher' },
  parent: { label: 'Parent', coll: 'parents', home: '/parent' },
}

// Demo data is anchored to "today" (camera windows, attendance), so it is rebuilt when the day changes.
function loadDb() {
  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEY))
    const fresh = seed()
    if (saved && saved.version === fresh.version && saved.seededOn === todayISO()) return saved
    return { ...fresh, seededOn: todayISO() }
  } catch {
    return { ...seed(), seededOn: todayISO() }
  }
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [db, setDb] = useState(loadDb)
  const [session, setSession] = useState(loadSession)

  useEffect(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db))
    } catch {
      // storage full (large photos) or unavailable: the demo keeps working in memory
    }
  }, [db])

  const user = useMemo(() => {
    if (!session) return null
    const rec = db[ROLES[session.role].coll].find((u) => u.id === session.id)
    return rec ? { ...rec, role: session.role, roleLabel: ROLES[session.role].label } : null
  }, [db, session])

  const mutate = useCallback((fn) => setDb((prev) => ({ ...prev, ...fn(prev) })), [])

  const log = useCallback(
    (action, module, description, status = 'Success', actor) => {
      const who = actor || user
      setDb((prev) => ({
        ...prev,
        audit: [
          { id: uid('au'), at: Date.now(), user: who?.name || 'Unknown', role: who?.roleLabel || '—', action, module, description, status },
          ...prev.audit,
        ],
      }))
    },
    [user],
  )

  const upsert = useCallback(
    (coll, item) =>
      mutate((prev) => ({
        [coll]: prev[coll].some((x) => x.id === item.id)
          ? prev[coll].map((x) => (x.id === item.id ? { ...x, ...item } : x))
          : [item, ...prev[coll]],
      })),
    [mutate],
  )

  const remove = useCallback((coll, id) => mutate((prev) => ({ [coll]: prev[coll].filter((x) => x.id !== id) })), [mutate])

  const notify = useCallback(
    (n) => mutate((prev) => ({ notifications: [{ id: uid('n'), at: Date.now(), readBy: [], userId: null, ...n }, ...prev.notifications] })),
    [mutate],
  )

  const login = useCallback(
    (role, phone, password, remember) => {
      const meta = ROLES[role]
      const rec = db[meta.coll].find((u) => u.phone === phone.trim())
      if (!rec || (db.passwords[rec.id] ?? DEMO_PASSWORD) !== password) {
        return { ok: false, error: 'Incorrect phone number or password.' }
      }
      const actor = { ...rec, roleLabel: meta.label }
      if (rec.status !== 'Active') {
        log('Login', 'Authentication', `Sign-in blocked: account is ${rec.status.toLowerCase()}`, 'Failed', actor)
        return {
          ok: false,
          error: `This account is ${rec.status.toLowerCase()}. Please contact ${role === 'principal' ? 'the system administrator' : 'your school'}.`,
        }
      }
      const s = { role, id: rec.id }
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_KEY)
      ;(remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s))
      setSession(s)
      upsert(meta.coll, { id: rec.id, lastLogin: Date.now() })
      return { ok: true, home: meta.home }
    },
    [db, log, upsert],
  )

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }, [])

  const resetDemo = useCallback(() => setDb({ ...seed(), seededOn: todayISO() }), [])

  const value = useMemo(
    () => ({ db, user, mutate, upsert, remove, log, notify, login, logout, resetDemo }),
    [db, user, mutate, upsert, remove, log, notify, login, logout, resetDemo],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)

// ---- selectors ----

export const byId = (list, id) => list.find((x) => x.id === id)
export const classOfTeacher = (db, teacherId) => db.classes.find((c) => c.teacherId === teacherId)
export const studentsOfClass = (db, classId) => db.students.filter((s) => s.classId === classId)
export const childrenOf = (db, parentId) =>
  db.links
    .filter((l) => l.parentId === parentId && l.status === 'Active')
    .map((l) => ({ ...byId(db.students, l.studentId), relationship: l.relationship }))
    .filter((s) => s.id)
export const linksOfStudent = (db, studentId) => db.links.filter((l) => l.studentId === studentId)
export const attendanceOf = (db, classId, date) => db.attendance.find((a) => a.classId === classId && a.date === date)
export const journalOf = (db, classId, date) => db.journals.find((j) => j.classId === classId && j.date === date)

export function attendanceCounts(db, classId, date) {
  const total = studentsOfClass(db, classId).filter((s) => s.status === 'Active').length
  const rec = attendanceOf(db, classId, date)
  if (!rec) return { total, present: 0, absent: 0, unrecorded: total, recorded: false }
  const vals = studentsOfClass(db, classId).map((s) => rec.records[s.id]?.status)
  const present = vals.filter((v) => v === 'present').length
  const absent = vals.filter((v) => v === 'absent').length
  return { total, present, absent, unrecorded: Math.max(0, total - present - absent), recorded: true }
}

export function notificationsFor(db, user) {
  if (!user) return []
  const classIds =
    user.role === 'parent'
      ? childrenOf(db, user.id).map((c) => c.classId)
      : user.role === 'teacher'
        ? [classOfTeacher(db, user.id)?.id]
        : []
  return db.notifications
    .filter(
      (n) =>
        n.role === user.role &&
        (!n.userId || n.userId === user.id) &&
        (!n.classId || classIds.includes(n.classId)),
    )
    .sort((a, b) => b.at - a.at)
}

export const unreadNotifications = (db, user) => notificationsFor(db, user).filter((n) => !n.readBy.includes(user.id)).length

export function unreadMessages(db, user) {
  if (!user) return 0
  if (user.role === 'teacher') return db.messages.filter((m) => m.teacherId === user.id && m.from === 'parent' && !m.read).length
  if (user.role === 'parent') return db.messages.filter((m) => m.parentId === user.id && m.from === 'teacher' && !m.read).length
  return 0
}
