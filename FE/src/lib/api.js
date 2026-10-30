// Client for the NestJS backend (../BE). Only the System Settings form is still kept in the browser (store/localData.js).
// Paginated lists answer { items, total, page, limit, pages }.

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
  /** GET /health (outside the /api prefix): { status, db, dbEngine, dbLatencyMs, aiMode, ai }. 503 = API up, database down. */
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
    /** status: 'ACTIVE' (default) | 'INACTIVE' — an inactive link hides the child from that parent. */
    linkParent: (id, parentId, relationship, isPrimary, status) => post(`/students/${id}/parents`, { parentId, relationship, isPrimary, status }),
    unlinkParent: (id, parentId) => del(`/students/${id}/parents/${parentId}`),
    /** Profile photo (File/Blob); replaces the previous one. */
    uploadAvatar: (id, file) => request('POST', `/students/${id}/avatar`, { form: toForm({}, { avatar: file }) }),
  },

  journals: {
    /** Class register for one day: roster + each child's entry (attendance) + summary + the day's classJournal. */
    classDay: (classId, date) => get(`/daily-journals/class/${classId}`, { date }),
    /** A child's days as parents see them: the published class journal, the child's own note and attendance. */
    timeline: (studentId, from, to) => get('/daily-journals/timeline', { studentId, from, to }),
    /** { attendance: 'PRESENT' | 'ABSENT' | null, absenceReason } — known as soon as the teacher saves it. */
    attendance: (studentId, date) => get('/daily-journals/attendance', { studentId, date }),
    upsertOne: (studentId, data) => put(`/daily-journals/student/${studentId}`, data),
  },

  /**
   * The class journal of a day: six sections for every parent of the class, a private note per child, photos.
   * draft (manual) / review (voice) → approve → approved → publish → published. Parents only see a published version.
   */
  classJournals: {
    /** { items: [{ id, date, status, source, updatedAt, publishedAt, revision, unpublishedChanges }] } newest first */
    list: (classId, { status, date } = {}) => get('/class-journals', { classId, status, date }),
    /** The teacher's view: { ...listItem, sections, personal: { studentId: text }, photos, transcript, audio, issues } */
    get: (id) => get(`/class-journals/${id}`),
    /** { classId, date, source: 'manual' | 'voice', sections, personal, transcript?, audio?, issues? } */
    create: (payload) => post('/class-journals', payload),
    /** { sections, personal, photos, issues: [{ id, status, resolution, assignedTo }] } — the teacher's decisions */
    update: (id, payload) => put(`/class-journals/${id}`, payload),
    approve: (id) => post(`/class-journals/${id}/approve`),
    publish: (id) => post(`/class-journals/${id}/publish`),
    /** Another recording, added to the draft: { sections, personal, transcript, audioUrl, issues } from voiceDraft */
    addRecording: (id, payload) => post(`/class-journals/${id}/recordings`, payload),
    /** Photos → { urls } to add to the journal (saved with update). */
    uploadPhotos: (files) => request('POST', '/class-journals/photos', { form: toForm({}, { photos: files }) }),
    /**
     * Recording → text (Whisper on the server knows the children's names; the browser's transcript is the fallback)
     * → { transcript, transcriptSource: 'whisper' | 'browser', audioUrl }. The recording is kept for listening back.
     */
    transcribe: (classId, audioBlob, browserTranscript) =>
      request('POST', '/class-journals/transcribe', {
        form: toForm(
          { classId, transcript: browserTranscript || undefined },
          audioBlob ? { audio: new File([audioBlob], 'recording.webm', { type: audioBlob.type || 'audio/webm' }) } : {},
        ),
      }),
    /** The text the teacher checked → { transcript, sections, personal, issues, audioUrl }. Nothing is saved. */
    voiceDraft: ({ classId, transcript, audioUrl, journalId, date }) =>
      post('/class-journals/voice-draft', { classId, transcript, audioUrl: audioUrl || undefined, journalId, date }),
  },

  cameras: {
    list: (params) => get('/camera-streams', params),
    /** Parent: { studentId }. URL is null outside the viewing window. */
    watch: (params) => get('/camera-streams/watch', params),
    create: (data) => post('/camera-streams', data),
    update: (id, data) => patch(`/camera-streams/${id}`, data),
    remove: (id) => del(`/camera-streams/${id}`),
  },

  system: {
    /** System Admin: { cpu, memory, disk, uploads, database } measured on the server */
    metrics: () => get('/system/metrics'),
  },

  academicYears: {
    /** [{ id, name: '2026-2027', startDate, endDate, status: 'ACTIVE' | 'INACTIVE' }], newest first */
    list: (params) => get('/academic-years', params),
    /** The ACTIVE year of the school, or null */
    current: () => get('/academic-years/current'),
    create: (data) => post('/academic-years', data),
    update: (id, data) => patch(`/academic-years/${id}`, data),
    remove: (id) => del(`/academic-years/${id}`),
  },

  announcements: {
    /** Paginated. { status, category, audience, search, page, limit }; teachers / parents only get published notices meant for them */
    list: (params) => get('/announcements', params),
    get: (id) => get(`/announcements/${id}`),
    create: (data) => post('/announcements', data),
    /** status: 'PUBLISHED' publishes it and notifies the audience */
    update: (id, data) => patch(`/announcements/${id}`, data),
    remove: (id) => del(`/announcements/${id}`),
  },

  notifications: {
    /** The signed-in user's notifications, paginated. { unread: 'true', type, page, limit } */
    list: (params) => get('/notifications', params),
    unreadCount: () => get('/notifications/unread-count'),
    markRead: (id) => patch(`/notifications/${id}/read`),
    markAllRead: () => patch('/notifications/read-all'),
    remove: (id) => del(`/notifications/${id}`),
    /** Principal / admin: { userIds } or { role, schoolId? }, plus { title, body, link } */
    send: (data) => post('/notifications', data),
  },

  messages: {
    /** People the user may write to: [{ user, canReply, lastMessage, unread }], most recent conversation first */
    contacts: () => get('/messages/contacts'),
    /** One conversation, newest first (paginated). { page, limit, before } */
    thread: (userId, params) => get(`/messages/thread/${userId}`, params),
    send: (receiverId, content) => post('/messages', { receiverId, content }),
    markRead: (userId) => patch(`/messages/thread/${userId}/read`),
    unreadCount: () => get('/messages/unread-count'),
    remove: (id) => del(`/messages/${id}`),
  },

  auditLogs: {
    /** Admin / principal. { from, to, userId, role, action, module, status, search, page, limit } */
    list: (params) => get('/audit-logs', params),
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
