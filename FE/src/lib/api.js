// Client for the NestJS backend (../BE). Pages still read the local demo store; move them over one by one
// by replacing `db.*` reads and `upsert/mutate` calls with these functions.

const BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'kinderlog.token'

// FE role keys (store.jsx ROLES) ↔ backend enum
export const API_ROLE = { admin: 'SYSTEM_ADMIN', principal: 'PRINCIPAL', teacher: 'TEACHER', parent: 'PARENT' }
export const FE_ROLE = Object.fromEntries(Object.entries(API_ROLE).map(([k, v]) => [v, k]))

export class ApiError extends Error {
  constructor(status, message, body) {
    super(Array.isArray(message) ? message.join('\n') : message)
    this.status = status
    this.body = body
  }
}

export const getToken = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
export function setToken(token, remember) {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
}

const query = (params) => {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  return q.toString() ? `?${q}` : ''
}

async function request(method, path, { body, params, form, raw } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}${query(params)}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  if (res.status === 401 && token) {
    setToken(null)
    window.dispatchEvent(new Event('kinderlog:unauthorized')) // let the app send the user back to /login
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new ApiError(res.status, err.message || res.statusText, err)
  }
  if (raw) return res
  return res.status === 204 ? null : res.json()
}

const get = (path, params) => request('GET', path, { params })
const post = (path, body) => request('POST', path, { body })
const put = (path, body) => request('PUT', path, { body })
const patch = (path, body) => request('PATCH', path, { body })
const del = (path) => request('DELETE', path)

const toForm = (fields, files = {}) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.append(k, Array.isArray(v) ? v.join(',') : v)
  for (const [k, list] of Object.entries(files)) for (const file of [].concat(list)) f.append(k, file)
  return f
}

// ---------------------------------------------------------------- endpoints

export const api = {
  /** GET /health (outside the /api prefix): { status, db, dbEngine, dbLatencyMs, aiMode }. 503 = API up, database down. */
  health: async () => {
    const res = await fetch(`${BASE.replace(/\/api$/, '')}/health`)
    if (res.ok || res.status === 503) return res.json()
    throw new ApiError(res.status, 'Health check failed')
  },

  auth: {
    /** role: FE key ('teacher', …). Stores the token and returns { user, home }. */
    async login(role, phone, password, remember) {
      const res = await post('/auth/login', { phone: phone.trim(), password, role: API_ROLE[role] })
      setToken(res.accessToken, remember)
      return res
    },
    logout: () => setToken(null),
    me: () => get('/auth/me'),
    changePassword: (currentPassword, newPassword) => patch('/auth/change-password', { currentPassword, newPassword }),
    updateProfile: (data) => patch('/users/me', data),
  },

  schools: {
    list: () => get('/schools'),
    mine: () => get('/schools/me'),
    updateMine: (data) => patch('/schools/me', data),
    create: (data) => post('/schools', data),
    update: (id, data) => patch(`/schools/${id}`, data),
    remove: (id) => del(`/schools/${id}`),
  },

  users: {
    /** { role: 'TEACHER' | 'PARENT' | 'PRINCIPAL', status, search, schoolId } */
    list: (params) => get('/users', params),
    create: (data) => post('/users', data),
    update: (id, data) => patch(`/users/${id}`, data),
    setStatus: (id, status) => patch(`/users/${id}/status`, { status }),
    resetPassword: (id) => post(`/users/${id}/reset-password`),
    remove: (id) => del(`/users/${id}`),
  },

  classes: {
    list: (params) => get('/classes', params),
    get: (id) => get(`/classes/${id}`),
    create: (data) => post('/classes', data),
    update: (id, data) => patch(`/classes/${id}`, data),
    remove: (id) => del(`/classes/${id}`),
  },

  students: {
    list: (params) => get('/students', params),
    get: (id) => get(`/students/${id}`),
    create: (data) => post('/students', data),
    update: (id, data) => patch(`/students/${id}`, data),
    remove: (id) => del(`/students/${id}`),
    linkParent: (id, parentId, relationship, isPrimary) => post(`/students/${id}/parents`, { parentId, relationship, isPrimary }),
    unlinkParent: (id, parentId) => del(`/students/${id}/parents/${parentId}`),
  },

  journals: {
    /** Teacher main screen: roster + entries + summary for one day. */
    classDay: (classId, date) => get(`/daily-journals/class/${classId}`, { date }),
    /** Days with entries (newest first): [{ date, logged, approved, draft, absent, voice, updatedAt }] */
    history: (classId, from, to) => get(`/daily-journals/class/${classId}/history`, { from, to }),
    /** Parent timeline (APPROVED only). */
    timeline: (studentId, from, to) => get('/daily-journals/timeline', { studentId, from, to }),
    /** { classId, date?, defaults: {...}, exceptions: [{ studentId, ...overrides }] } */
    bulk: (payload) => post('/daily-journals/bulk', payload),
    upsertOne: (studentId, data) => put(`/daily-journals/student/${studentId}`, data),
    approve: (classId, date, studentIds) => post('/daily-journals/approve', { classId, date, studentIds }),
    remove: (id) => del(`/daily-journals/${id}`),
    uploadPhotos: ({ classId, date, studentIds, caption }, files) =>
      request('POST', '/daily-journals/photos', { form: toForm({ classId, date, studentIds, caption }, { photos: files }) }),
    removePhoto: (photoId) => del(`/daily-journals/photos/${photoId}`),
    /** Recorded Blob from MediaRecorder → Whisper → LLM → draft. apply=true saves it as DRAFT entries. */
    fromVoice: ({ classId, date, apply }, audioBlob) =>
      request('POST', '/daily-journals/ai/voice', {
        form: toForm({ classId, date, apply }, { audio: new File([audioBlob], 'recording.webm', { type: audioBlob.type || 'audio/webm' }) }),
      }),
    /** Transcript from the browser's Web Speech API → LLM → draft. */
    fromText: ({ classId, date, apply }, transcript) => post('/daily-journals/ai/text', { classId, date, apply, transcript }),
  },

  cameras: {
    list: (params) => get('/camera-streams', params),
    /** Parent: { studentId }. URL is null outside the viewing window. */
    watch: (params) => get('/camera-streams/watch', params),
    create: (data) => post('/camera-streams', data),
    update: (id, data) => patch(`/camera-streams/${id}`, data),
    remove: (id) => del(`/camera-streams/${id}`),
  },

  reports: {
    dashboard: (params) => get('/reports/dashboard', params),
    adminDashboard: () => get('/reports/admin-dashboard'),
    table: (params) => get('/reports/table', params),
    /** Triggers a browser download. params: { type, format: 'pdf' | 'xlsx', from, to, classId } */
    async download(params) {
      const res = await request('GET', '/reports/export', { params, raw: true })
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `report.${params.format}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(await res.blob())
      a.download = name
      a.click()
      URL.revokeObjectURL(a.href)
    },
  },
}
