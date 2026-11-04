import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LOCAL_DATA_VERSION, emptyLocalData } from './localData'
import { FE_ROLE, api, getToken, setToken } from '../lib/api'
import { STATUS, errorText } from '../lib/labels'

const DB_KEY = 'kinderlog.db'
const SESSION_KEY = 'kinderlog.session'
// Initial password of accounts created or reset by an admin / principal: must match DEFAULT_PASSWORD of the backend.
export const INITIAL_PASSWORD = import.meta.env.VITE_INITIAL_PASSWORD || '123456'

export const ROLES = {
  admin: { label: 'System Admin', home: '/admin' },
  principal: { label: 'Principal', home: '/principal' },
  teacher: { label: 'Teacher', home: '/teacher' },
  parent: { label: 'Parent', home: '/parent' },
}

// Unread messages / notifications for the menu badges: refreshed on this interval, on focus, and after reading.
const COUNTS_REFRESH_MS = 30000
const INBOX_ROLES = ['teacher', 'parent']

// Browser-only settings survive reloads; data saved by an older version of the app is replaced.
function loadDb() {
  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEY))
    if (saved && saved.version === LOCAL_DATA_VERSION) return { ...emptyLocalData(), ...saved }
  } catch {
    // unreadable: start empty
  }
  return emptyLocalData()
}

// A token that is unreadable or past its `exp` is dropped here, without asking the backend (no 401 on reload).
function tokenAlive(token) {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return !exp || exp * 1000 > Date.now()
  } catch {
    return false
  }
}

// The session holds the role and the backend profile; the JWT itself lives in lib/api.js.
function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY))
    const token = getToken()
    if (token && !tokenAlive(token)) {
      setToken(null)
      saveSession(null)
      return null
    }
    return s?.profile && token ? s : null
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
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 })

  useEffect(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db))
    } catch {
      // storage full or unavailable: the app keeps working in memory
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

  const refreshCounts = useCallback(() => {
    if (!getToken()) return
    Promise.all([api.messages.unreadCount(), api.notifications.unreadCount()])
      .then(([m, n]) => setCounts({ messages: m?.unread ?? 0, notifications: n?.unread ?? 0 }))
      .catch(() => setCounts({ messages: 0, notifications: 0 })) // badges are best effort
  }, [])

  // Counted only once a remembered token has been re-validated, so an expired session never asks for them; the
  // principal and the system admin have no messages or notification inbox.
  const signedIn = !!session && !checking && INBOX_ROLES.includes(session.role)
  useEffect(() => {
    if (!signedIn) {
      setCounts({ messages: 0, notifications: 0 })
      return
    }
    refreshCounts()
    const timer = setInterval(refreshCounts, COUNTS_REFRESH_MS)
    window.addEventListener('focus', refreshCounts)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refreshCounts)
    }
  }, [signedIn, refreshCounts])

  // The signed-in user is the backend profile, in the shape the screens use.
  const user = useMemo(() => {
    if (!session) return null
    const p = session.profile
    const meta = ROLES[session.role]
    return {
      id: p.id,
      apiId: p.id,
      api: p,
      name: p.fullName,
      phone: p.phone,
      email: p.email || '',
      address: p.address || '',
      status: STATUS[p.status] || p.status,
      schoolId: p.schoolId,
      cameraAccess: p.cameraAccess !== false,
      lastLogin: p.lastLoginAt ? new Date(p.lastLoginAt).getTime() : null,
      role: session.role,
      roleLabel: meta.label,
    }
  }, [session])

  const mutate = useCallback((fn) => setDb((prev) => ({ ...prev, ...fn(prev) })), [])

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

  const value = useMemo(
    () => ({ db, user, checking, counts, refreshCounts, mutate, login, logout, setProfile }),
    [db, user, checking, counts, refreshCounts, mutate, login, logout, setProfile],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)
