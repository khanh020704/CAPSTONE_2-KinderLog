import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { seed } from './seed'
import { todayISO, uid } from '../lib/utils'
import { FE_ROLE, api, getToken, setToken } from '../lib/api'
import { STATUS, errorText } from '../lib/labels'

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

// The session holds the role and the backend profile; the JWT itself lives in lib/api.js.
function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY))
    return s?.profile && getToken() ? s : null
  } catch {
    return null
  }
}

function saveSession(s, remember) {
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
  if (s) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s))
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [db, setDb] = useState(loadDb)
  const [session, setSession] = useState(loadSession)
  const [checking, setChecking] = useState(() => !!loadSession())

  useEffect(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db))
    } catch {
      // storage full (large photos) or unavailable: the demo keeps working in memory
    }
  }, [db])

  // Re-validate a remembered token once per page load; an expired or locked account is signed out.
  useEffect(() => {
    if (!session) return
    api.auth
      .me()
      .then((profile) =>
        setSession((s) => {
          const next = s && { ...s, profile }
          if (next) saveSession(next, !!localStorage.getItem(SESSION_KEY))
          return next
        }),
      )
      .catch((e) => {
        if (e.status === 401 || e.status === 403) {
          setToken(null)
          saveSession(null)
          setSession(null)
        }
      })
      .finally(() => setChecking(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onUnauthorized = () => {
      saveSession(null)
      setSession(null)
    }
    window.addEventListener('kinderlog:unauthorized', onUnauthorized)
    return () => window.removeEventListener('kinderlog:unauthorized', onUnauthorized)
  }, [])

  // The signed-in user comes from the backend. Features the backend does not cover yet (messages, notifications,
  // announcements, audit log) still use the local demo data, matched to the same account by phone number.
  const user = useMemo(() => {
    if (!session) return null
    const p = session.profile
    const meta = ROLES[session.role]
    const local = db[meta.coll].find((u) => u.phone === p.phone)
    return {
      ...(local || {}),
      id: local?.id ?? p.id,
      apiId: p.id,
      api: p,
      name: p.fullName,
      phone: p.phone,
      email: p.email || '',
      address: p.address || '',
      status: STATUS[p.status] || p.status,
      schoolId: p.schoolId,
      lastLogin: p.lastLoginAt ? new Date(p.lastLoginAt).getTime() : null,
      role: session.role,
      roleLabel: meta.label,
    }
  }, [db, session])

  const mutate = useCallback((fn) => setDb((prev) => ({ ...prev, ...fn(prev) })), [])

  const log = useCallback(
    (action, module, description, status = 'Success', actor) => {
      const who = actor || user
      setDb((prev) => ({
        ...prev,
        audit: [{ id: uid('au'), at: Date.now(), user: who?.name || 'Unknown', role: who?.roleLabel || '—', action, module, description, status }, ...prev.audit],
      }))
    },
    [user],
  )

  const upsert = useCallback(
    (coll, item) =>
      mutate((prev) => ({
        [coll]: prev[coll].some((x) => x.id === item.id) ? prev[coll].map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [item, ...prev[coll]],
      })),
    [mutate],
  )

  const remove = useCallback((coll, id) => mutate((prev) => ({ [coll]: prev[coll].filter((x) => x.id !== id) })), [mutate])

  const notify = useCallback((n) => mutate((prev) => ({ notifications: [{ id: uid('n'), at: Date.now(), readBy: [], userId: null, ...n }, ...prev.notifications] })), [mutate])

  const login = useCallback(async (role, phone, password, remember) => {
    try {
      const res = await api.auth.login(role, phone, password, remember)
      const s = { role: FE_ROLE[res.user.role], profile: res.user }
      saveSession(s, remember)
      setSession(s)
      return { ok: true, home: ROLES[s.role].home }
    } catch (e) {
      if (e.status === 401) return { ok: false, error: 'Incorrect phone number or password.' }
      return { ok: false, error: errorText(e) }
    }
  }, [])

  const logout = useCallback(() => {
    api.auth.logout()
    saveSession(null)
    setSession(null)
  }, [])

  // After editing the profile: refresh the copy kept in the session.
  const setProfile = useCallback(
    (profile) =>
      setSession((s) => {
        const next = s && { ...s, profile: { ...s.profile, ...profile } }
        if (next) saveSession(next, !!localStorage.getItem(SESSION_KEY))
        return next
      }),
    [],
  )

  const resetDemo = useCallback(() => setDb({ ...seed(), seededOn: todayISO() }), [])

  const value = useMemo(
    () => ({ db, user, checking, mutate, upsert, remove, log, notify, login, logout, setProfile, resetDemo }),
    [db, user, checking, mutate, upsert, remove, log, notify, login, logout, setProfile, resetDemo],
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
  const classIds = user.role === 'parent' ? childrenOf(db, user.id).map((c) => c.classId) : user.role === 'teacher' ? [classOfTeacher(db, user.id)?.id] : []
  return db.notifications.filter((n) => n.role === user.role && (!n.userId || n.userId === user.id) && (!n.classId || classIds.includes(n.classId))).sort((a, b) => b.at - a.at)
}

export const unreadNotifications = (db, user) => notificationsFor(db, user).filter((n) => !n.readBy.includes(user.id)).length

export function unreadMessages(db, user) {
  if (!user) return 0
  if (user.role === 'teacher') return db.messages.filter((m) => m.teacherId === user.id && m.from === 'parent' && !m.read).length
  if (user.role === 'parent') return db.messages.filter((m) => m.parentId === user.id && m.from === 'teacher' && !m.read).length
  return 0
}
