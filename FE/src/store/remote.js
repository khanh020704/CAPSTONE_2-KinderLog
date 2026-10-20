// Bridge between the store and the KinderLog backend (Md/API2.md).
//
// The pages read one in-memory `db` object and change it with mutate/upsert, all synchronously.
// To leave them untouched, this module keeps that contract and works around it:
//   - on sign-in it loads the signed-in teacher's or parent's data from the API into the `db` shape
//   - after every change it compares `db` with what the server is known to have and sends the difference
//   - in the background it fetches new messages and notifications, and for a parent the journals the teacher
//     published or changed
// Only teachers and parents are served by the API. Admin and principal sessions stay on the demo data.

import { ApiError, apiEnabled, hasTokens, refreshTokenValue, request, requestSync, setTokens } from '../lib/api'
import { JOURNAL_SECTIONS, addDays, applyCorrections, todayISO } from '../lib/utils'

const COLL = { teacher: 'teachers', parent: 'parents' }
const ATTENDANCE_DAYS = 30 // how far back the attendance sheets are loaded
const PARENT_JOURNALS_UPFRONT = 5 // a parent's newest journals loaded before the page opens; the rest follow
const POLL_MS = 10000

export const handles = (role) => apiEnabled && role in COLL
export const isActive = () => !!me

// ---------- module state (one signed-in user per tab) ----------

let me = null // { role, id }
let classId = null // the teacher's class
let children = [] // the parent's children: { id, classId }
let password // typed at sign-in; kept in memory only, so the Change Password page can verify it
let apply = () => {} // (fn) => setDb(fn), given by the store
let expired = () => {}
let run = 0 // background loop generation
let generation = 0 // bumped whenever db is reloaded, so queued writes for the old state are dropped
let queue = Promise.resolve()

// What the server is known to have. A difference between this and `db` is a change to send.
let known
const idMap = new Map() // journal id made by the page -> id given by the server
const acked = new Set() // ids of locally created messages the server has stored
const uploaded = new Map() // data: URL of a photo -> address on the server
const lastSeen = new Map() // conversation peer -> signature of its last message
const journalSeen = new Map() // parent: `${childId}:${journalId}` -> when it was last published

// The server's ids are row numbers; ids made by the pages look like "m_k3x9a2b".
const isServerId = (id) => /^\d+$/.test(String(id))
const serverId = (id) => idMap.get(id) || id
const sortedEntries = (object) => Object.entries(object).sort(([a], [b]) => a.localeCompare(b))

// ---------- server data -> db shape ----------

const emptySections = () => Object.fromEntries(JOURNAL_SECTIONS.map((s) => [s.key, '']))

const emptyDb = () => ({
  schools: [],
  admins: [],
  principals: [],
  years: [],
  classes: [],
  teachers: [],
  students: [],
  parents: [],
  links: [],
  cameras: [],
  schedules: [],
  attendance: [],
  journals: [],
  messages: [],
  announcements: [],
  notifications: [],
  audit: [],
  passwords: {},
  settings: {},
})

const toAccount = (a) => ({ id: a.id, name: a.name, phone: a.phone || '', email: a.email || '', status: a.status, createdAt: a.createdAt, lastLogin: a.lastLogin })

const toJournal = (j) => ({
  id: j.id,
  classId: j.classId,
  date: j.date,
  status: j.status,
  source: j.source,
  sections: j.sections,
  personal: j.personal,
  photos: j.photos,
  transcript: j.transcript,
  audio: j.audio || [],
  issues: j.issues || [],
  updatedAt: j.updatedAt,
  publishedAt: j.publishedAt,
  editedAt: j.editedAt ?? null,
  revision: j.revision ?? 0,
})

// A published journal is listed at once and its content is filled in by the background loader.
const toJournalStub = (item) => ({ ...toJournal({ ...item, classId, sections: emptySections(), personal: {}, photos: [], transcript: '', publishedAt: item.publishedAt ?? item.updatedAt }), stub: true })

const toSheet = (sheet) => ({ date: sheet.date, classId: sheet.classId, savedAt: sheet.savedAt, records: sheet.records })

const toNotification = (n) => ({ id: n.id, role: me.role, userId: me.id, type: n.type, title: n.title, body: n.body, at: n.at, readBy: n.read ? [me.id] : [] })

function loadTeacher(db) {
  let roster
  try {
    roster = requestSync('GET', '/teacher/class')
  } catch (err) {
    if (err.code === 'NO_CLASS') return // the pages show "not assigned to a class yet"
    throw err
  }
  classId = roster.class.id
  db.classes = [{ id: classId, name: roster.class.name, yearId: '', teacherId: me.id, status: 'Active' }]
  for (const s of roster.students) {
    db.students.push({ id: s.id, name: s.name, dob: s.dob, gender: s.gender, classId, status: 'Active', note: s.note, photo: s.photo })
    for (const p of s.parents) {
      if (!db.parents.some((x) => x.id === p.id)) db.parents.push({ id: p.id, name: p.name, phone: p.phone || '', email: '', address: '', status: 'Active' })
      db.links.push({ id: `${p.id}:${s.id}`, parentId: p.id, studentId: s.id, relationship: p.relationship, status: 'Active' })
    }
  }

  const today = todayISO()
  const sheet = requestSync('GET', `/attendance?date=${today}`)
  if (sheet.savedAt) db.attendance.push(toSheet(sheet))

  // Journals being worked on are loaded in full before the page opens, so a save can never overwrite content
  // that was not on screen. Older published ones are filled in later and cannot be edited until they are.
  db.journals = requestSync('GET', '/journals').items.map((item) =>
    item.status === 'published' && item.date !== today ? toJournalStub(item) : toJournal(requestSync('GET', `/journals/${item.id}`)),
  )
}

// A parent's view of a journal (GET /parent/journals/by-date) put into the shape the pages read: the class
// journal with only this parent's children's notes, and the child's attendance of that day.
function withParentJournal(db, childId, j) {
  const old = db.journals.find((x) => x.id === j.id)
  const personal = { ...(old?.personal || {}) }
  if (j.personalNote) personal[childId] = j.personalNote
  else delete personal[childId]
  const journal = {
    id: j.id,
    classId: j.classId,
    date: j.date,
    status: 'published',
    source: 'manual',
    sections: j.sections,
    personal,
    photos: j.photos,
    transcript: '',
    audio: [],
    issues: [],
    updatedAt: j.editedAt || j.publishedAt,
    publishedAt: j.publishedAt,
    editedAt: j.editedAt,
  }
  const sheet = db.attendance.find((a) => a.classId === j.classId && a.date === j.date)
  const records = { ...(sheet?.records || {}) }
  if (j.attendance) records[childId] = j.attendance
  else delete records[childId]
  return {
    ...db,
    journals: [...db.journals.filter((x) => x.id !== j.id), journal],
    attendance: [...db.attendance.filter((a) => a !== sheet), { classId: j.classId, date: j.date, savedAt: sheet?.savedAt ?? null, records }],
  }
}

const parentJournal = (child, date, ask = request) => ask('GET', `/parent/journals/by-date?studentId=${child.id}&date=${date}`)
const parentJournalList = (child, ask = request) => ask('GET', `/parent/journals?studentId=${child.id}`)

function loadParent(db, account) {
  const teachers = requestSync('GET', '/conversations').items
  db.teachers = teachers.map((t) => ({ id: t.peerId, name: t.name, phone: '', email: '', status: 'Active' }))
  children = (account.children || []).filter((c) => c.classId).map((c) => ({ id: c.id, classId: c.classId }))
  for (const child of account.children || []) {
    db.students.push({ id: child.id, name: child.name, dob: '', gender: '', classId: child.classId, status: 'Active', note: '', photo: '' })
    db.links.push({ id: `${me.id}:${child.id}`, parentId: me.id, studentId: child.id, relationship: child.relationship, status: 'Active' })
    if (child.classId && !db.classes.some((c) => c.id === child.classId)) {
      const teacher = teachers.find((t) => t.sub === `Teacher · ${child.className}`)
      db.classes.push({ id: child.classId, name: child.className, yearId: '', teacherId: teacher?.peerId || '', status: 'Active' })
    }
  }
  // The newest journals are on screen at once; the background loader fetches the rest.
  let next = db
  for (const child of children) {
    for (const item of parentJournalList(child, requestSync).items.slice(0, PARENT_JOURNALS_UPFRONT)) {
      next = withParentJournal(next, child.id, parentJournal(child, item.date, requestSync))
      journalSeen.set(`${child.id}:${item.id}`, item.editedAt || item.publishedAt)
    }
  }
  db.journals = next.journals
  db.attendance = next.attendance
}

// Builds the whole db for the signed-in user. Blocks until the server has answered.
function hydrate(account) {
  generation++
  classId = null
  children = []
  idMap.clear()
  acked.clear()
  lastSeen.clear()
  journalSeen.clear()

  const db = emptyDb()
  db.settings = requestSync('GET', '/settings')
  // The backend has no classroom cameras, so a parent sees "camera not available" rather than a fake feed.
  db[COLL[me.role]] = [me.role === 'parent' ? { ...toAccount(account), address: '', cameraAccess: false } : toAccount(account)]
  if (password !== undefined) db.passwords = { [me.id]: password }
  if (me.role === 'teacher') loadTeacher(db)
  else loadParent(db, account)
  remember(db)
  return db
}

// ---------- what the server has ----------

const snapshot = (j) => ({
  sections: { ...j.sections },
  personal: Object.fromEntries(Object.entries(j.personal || {}).filter(([, text]) => text.trim())),
  photos: [...j.photos],
  transcript: j.transcript || '',
  audio: [...(j.audio || [])],
  issues: (j.issues || []).map((i) => ({ ...i })),
  status: j.status,
  source: j.source,
})
// The teacher's decisions on issues, as PUT /journals/:id takes them.
const decisionsOf = (s) => s.issues.map((i) => ({ id: i.id, status: i.status, resolution: i.resolution ?? null, assignedTo: i.assignedTo || [] }))
const contentOf = (s) => JSON.stringify([s.sections, sortedEntries(s.personal), s.photos, decisionsOf(s)])
const recordsOf = (sheet) => Object.fromEntries(sortedEntries(sheet.records).filter(([, r]) => r?.status).map(([id, r]) => [id, { status: r.status, note: r.note || '' }]))
const profileOf = (rec) => JSON.stringify([rec.name, rec.phone, rec.email])

function remember(db) {
  const rec = db[COLL[me.role]].find((u) => u.id === me.id)
  known = {
    profile: rec && profileOf(rec),
    password,
    attendance: new Map(db.attendance.map((a) => [a.date, JSON.stringify(recordsOf(a))])),
    journals: new Map(db.journals.map((j) => [j.id, snapshot(j)])),
    messages: new Set(db.messages.map((m) => m.id)),
    read: new Set(db.messages.filter((m) => m.read).map((m) => m.id)),
    notified: new Set(db.notifications.filter((n) => n.readBy.includes(me.id)).map((n) => n.id)),
  }
}

// ---------- sending changes ----------

// Writes run one after another, in the order the pages made them.
function enqueue(label, task) {
  const at = generation
  queue = queue
    .then(() => (at === generation ? task() : undefined))
    .catch((err) => {
      if (at === generation) fail(label, err)
    })
}

// A refused write means the screen shows something the server does not have: reload what it does have.
function fail(label, err) {
  console.error(`[api] ${label} failed: ${err.message}`, err.fields || '')
  if (err instanceof ApiError && err.status === 401) return expired()
  try {
    const fresh = hydrate(requestSync('GET', '/me'))
    apply(() => fresh)
    loadExtras(run, fresh.journals.filter((j) => j.stub))
  } catch (again) {
    console.error(`[api] could not reload after the failure: ${again.message}`)
    expired()
  }
}

async function uploadPhoto(dataUrl) {
  if (!uploaded.has(dataUrl)) {
    const blob = await (await fetch(dataUrl)).blob()
    const form = new FormData()
    form.append('purpose', 'journal-photo')
    form.append('file', blob, 'photo')
    uploaded.set(dataUrl, (await request('POST', '/uploads', undefined, { form })).url)
  }
  return uploaded.get(dataUrl)
}

// The pages hold new photos as data: URLs; the server wants the address of an uploaded file.
const toServerPhotos = (photos) => Promise.all(photos.filter((p) => !p.startsWith('demo:')).map((p) => (p.startsWith('data:') ? uploadPhoto(p) : p)))

const saveContent = async (id, s) =>
  request('PUT', `/journals/${serverId(id)}`, { sections: s.sections, personal: s.personal, photos: await toServerPhotos(s.photos), issues: decisionsOf(s) })

// What a recording added: the pages append new text to the old, so the difference is the tail.
const tail = (before = '', after = '') => (after.startsWith(before) ? after.slice(before.length).trim() : after)

function syncJournals(db) {
  for (const j of db.journals) {
    if (j.classId !== classId || j.stub) continue
    const before = known.journals.get(j.id)
    const now = snapshot(j)
    // A published journal edited back to what it was is still the published version on the server.
    if (before?.status === 'published' && contentOf(now) === contentOf(before)) {
      known.journals.set(j.id, { ...now, status: 'published' })
      continue
    }
    known.journals.set(j.id, now)

    if (!before) {
      const voice = now.source === 'voice'
      enqueue(`create journal ${j.date}`, async () => {
        const body = { date: j.date, source: now.source, ...(voice && { sections: now.sections, personal: now.personal, transcript: now.transcript, audio: now.audio, issues: now.issues }) }
        idMap.set(j.id, (await request('POST', '/journals', body)).id)
        const empty = { sections: emptySections(), personal: {}, photos: [], issues: now.issues }
        if (now.photos.length || now.issues.some((i) => i.status !== 'open') || (!voice && contentOf(now) !== contentOf(empty))) await saveContent(j.id, now)
      })
      continue
    }

    const recorded = now.source === 'voice' && now.transcript !== before.transcript
    if (recorded) {
      // What the recording added is what follows the earlier text, once the statements it corrected are out.
      const added = now.issues.filter((i) => !before.issues.some((b) => b.id === i.id))
      const base = applyCorrections(before, added)
      enqueue(`add recording ${j.date}`, async () => {
        await request('POST', `/journals/${serverId(j.id)}/recordings`, {
          sections: Object.fromEntries(Object.entries(now.sections).map(([key, text]) => [key, tail(base.sections[key], text)])),
          personal: Object.fromEntries(Object.entries(now.personal).map(([sid, text]) => [sid, tail(base.personal[sid], text)]).filter(([, text]) => text)),
          transcript: tail(before.transcript, now.transcript),
          audioUrl: now.audio.find((url) => !before.audio.includes(url)) ?? null,
          issues: added,
        })
        if (JSON.stringify(now.photos) !== JSON.stringify(before.photos)) await saveContent(j.id, now)
      })
    } else if (contentOf(now) !== contentOf(before)) {
      enqueue(`save journal ${j.date}`, () => saveContent(j.id, now))
    }

    if (now.status === before.status) continue
    if (now.status === 'approved' || (now.status === 'published' && before.status !== 'approved')) {
      enqueue(`approve journal ${j.date}`, () => request('POST', `/journals/${serverId(j.id)}/approve`))
    }
    if (now.status === 'published') enqueue(`publish journal ${j.date}`, () => request('POST', `/journals/${serverId(j.id)}/publish`))
  }
}

function syncAttendance(db) {
  for (const sheet of db.attendance) {
    if (sheet.classId !== classId) continue
    const records = recordsOf(sheet)
    const signature = JSON.stringify(records)
    if (known.attendance.get(sheet.date) === signature) continue
    known.attendance.set(sheet.date, signature)
    enqueue(`save attendance ${sheet.date}`, () => request('PUT', '/attendance', { classId, date: sheet.date, records }))
  }
}

function syncMessages(db) {
  const other = me.role === 'teacher' ? 'parentId' : 'teacherId'
  const mine = me.role === 'teacher' ? 'teacherId' : 'parentId'
  const readPeers = new Set()
  for (const m of db.messages) {
    if (m[mine] !== me.id) continue
    if (!known.messages.has(m.id)) {
      known.messages.add(m.id)
      if (m.from === me.role) {
        enqueue('send message', async () => {
          known.messages.add((await request('POST', `/conversations/${m[other]}/messages`, { text: m.text })).id)
          acked.add(m.id)
        })
      }
    }
    if (m.from !== me.role && m.read && !known.read.has(m.id)) {
      known.read.add(m.id)
      readPeers.add(m[other])
    }
  }
  for (const peer of readPeers) enqueue('mark conversation read', () => request('POST', `/conversations/${peer}/read`))
}

function syncNotifications(db) {
  const ids = db.notifications.filter((n) => isServerId(n.id) && n.readBy.includes(me.id) && !known.notified.has(n.id)).map((n) => n.id)
  if (!ids.length) return
  ids.forEach((id) => known.notified.add(id))
  enqueue('mark notifications read', () => request('POST', '/notifications/read', { ids }))
}

function syncAccount(db) {
  const rec = db[COLL[me.role]].find((u) => u.id === me.id)
  if (rec && profileOf(rec) !== known.profile) {
    known.profile = profileOf(rec)
    enqueue('update profile', () => request('PATCH', '/me', { name: rec.name, phone: rec.phone, email: rec.email }))
  }

  const next = db.passwords?.[me.id]
  if (next === undefined || next === known.password) return
  const current = known.password
  known.password = password = next
  if (current === undefined) return console.warn('[api] the password was not changed on the server: sign in again first, then change it.')
  enqueue('change password', async () => {
    await request('PUT', '/me/password', { currentPassword: current, newPassword: next })
    // Changing the password ends every session on the server, this one included: start a new one.
    const rec2 = db[COLL[me.role]].find((u) => u.id === me.id)
    setTokens(await request('POST', '/auth/login', { phone: rec2.phone, password: next, role: me.role }, { auth: false }))
  })
}

// Called by the store after every change of db.
export function sync(db, session) {
  if (!me || session?.id !== me.id) return
  syncAccount(db)
  if (me.role === 'teacher' && classId) {
    syncAttendance(db)
    syncJournals(db)
  }
  syncMessages(db)
  syncNotifications(db)
}

// ---------- background loading ----------

const alive = (at) => at === run && !!me

async function refreshNotifications(at) {
  const { items } = await request('GET', '/notifications')
  if (!alive(at)) return
  items.filter((n) => n.read).forEach((n) => known.notified.add(n.id))
  apply((db) => ({ ...db, notifications: items.map(toNotification) }))
}

async function refreshMessages(at) {
  const other = me.role === 'teacher' ? 'parentId' : 'teacherId'
  const mine = me.role === 'teacher' ? 'teacherId' : 'parentId'
  const { items: conversations } = await request('GET', '/conversations')
  for (const c of conversations) {
    const signature = `${c.last?.id}:${c.unread}`
    if (lastSeen.get(c.peerId) === signature) continue
    const { items } = await request('GET', `/conversations/${c.peerId}/messages?limit=100`)
    if (!alive(at)) return
    lastSeen.set(c.peerId, signature)
    for (const m of items) {
      known.messages.add(m.id)
      if (m.read) known.read.add(m.id)
    }
    apply((db) => {
      const inPair = (m) => m[mine] === me.id && m[other] === c.peerId
      // Messages typed here that the server has not stored yet stay on screen.
      const pending = db.messages.filter((m) => inPair(m) && !isServerId(m.id) && !acked.has(m.id))
      return { ...db, messages: [...db.messages.filter((m) => !inPair(m)), ...items, ...pending] }
    })
  }
}

async function loadAttendanceHistory(at) {
  const today = todayISO()
  const days = Array.from({ length: ATTENDANCE_DAYS }, (_, i) => addDays(today, -(i + 1)))
  const sheets = await Promise.all(days.map((day) => request('GET', `/attendance?date=${day}`).catch(() => null)))
  if (!alive(at)) return
  // A day the teacher already saved in this session is newer than what was just fetched.
  const fresh = sheets.filter((s) => s?.savedAt && !known.attendance.has(s.date)).map(toSheet)
  fresh.forEach((s) => known.attendance.set(s.date, JSON.stringify(recordsOf(s))))
  if (fresh.length) apply((db) => ({ ...db, attendance: [...db.attendance.filter((a) => !fresh.some((s) => s.date === a.date)), ...fresh] }))
}

async function loadJournalStubs(at, stubs) {
  for (const stub of stubs) {
    const full = toJournal(await request('GET', `/journals/${stub.id}`))
    if (!alive(at)) return
    known.journals.set(full.id, snapshot(full))
    apply((db) => ({ ...db, journals: db.journals.map((j) => (j.id === full.id && j.stub ? full : j)) }))
  }
}

// A parent: journals published since the last look, and those whose published version the teacher changed.
async function refreshParentJournals(at) {
  for (const child of children) {
    const { items } = await parentJournalList(child)
    if (!alive(at)) return
    const listed = new Set(items.map((i) => i.id))
    for (const item of items) {
      const key = `${child.id}:${item.id}`
      const version = item.editedAt || item.publishedAt
      if (journalSeen.get(key) === version) continue
      const journal = await parentJournal(child, item.date)
      if (!alive(at)) return
      journalSeen.set(key, version)
      apply((db) => withParentJournal(db, child.id, journal))
    }
    // A journal the school removed disappears from the page too.
    apply((db) => ({ ...db, journals: db.journals.filter((j) => j.classId !== child.classId || listed.has(j.id)) }))
  }
}

function loadExtras(at, stubs = []) {
  const report = (what) => (err) => console.error(`[api] could not load ${what}: ${err.message}`)
  refreshNotifications(at).catch(report('notifications'))
  refreshMessages(at).catch(report('messages'))
  if (me.role === 'teacher' && classId) {
    loadAttendanceHistory(at).catch(report('attendance history'))
    loadJournalStubs(at, stubs).catch(report('published journals'))
  }
  if (me.role === 'parent') refreshParentJournals(at).catch(report('journals'))
}

// Starts the background loader for a remote session; returns the function that stops it.
export function start(db, applyDb, onExpired) {
  apply = applyDb
  expired = onExpired
  const at = ++run
  loadExtras(at, db.journals.filter((j) => j.stub))
  const timer = setInterval(() => {
    if (!alive(at)) return
    const quiet = (err) => (err instanceof ApiError && err.status === 401 ? expired() : undefined)
    refreshNotifications(at).catch(quiet)
    refreshMessages(at).catch(quiet)
    if (me.role === 'parent') refreshParentJournals(at).catch(quiet)
  }, POLL_MS)
  return () => {
    clearInterval(timer)
    if (at === run) run++
  }
}

// ---------- voice ----------

// Step 1 of a voice journal: the recording becomes text on the server (Whisper; the browser's text is the
// fallback), for the teacher to read and correct. Resolves to { transcript, transcriptSource, audioUrl }.
export function transcribe(audio, browserTranscript) {
  const form = new FormData()
  form.append('audio', audio, 'recording.webm')
  form.append('transcript', browserTranscript)
  return request('POST', '/journals/transcribe', undefined, { form })
}

// Step 2: the text the teacher confirmed becomes a draft: the AI sorts it into the journal structure and code
// checks it. Resolves to { transcript, sections, personal, issues, audioUrl }; nothing is saved. `audioUrl` is
// the recording stored by step 1, `journalId` the journal a further recording is for, `date` the journal's day
// (its attendance is checked).
export function voiceDraft(transcript, audioUrl, journalId, date) {
  const serverJournalId = journalId && serverId(journalId)
  return request('POST', '/journals/voice-draft', {
    transcript,
    ...(audioUrl && { audioUrl }),
    ...(serverJournalId && { journalId: serverJournalId }),
    ...(date && { date }),
  })
}

// ---------- session ----------

// Signs in and loads the user's data. Returns at once, like the store's own login().
export function login(role, phone, pass, remember) {
  try {
    const res = requestSync('POST', '/auth/login', { phone: phone.trim(), password: pass, role, remember: !!remember }, { auth: false })
    setTokens(res, !!remember)
    me = { role, id: res.user.id }
    password = pass
    return { ok: true, id: me.id, db: hydrate(res.user) }
  } catch (err) {
    end()
    return { ok: false, error: err.message }
  }
}

// After a page reload: rebuilds db for the saved session, or returns null when it is no longer valid.
export function restore(session) {
  if (!apiEnabled || !hasTokens() || !(session.role in COLL)) return null
  try {
    me = { role: session.role, id: session.id }
    password = undefined
    const account = requestSync('GET', '/me')
    if (account.id !== session.id || account.role !== session.role) throw new Error('The saved session belongs to another account.')
    return hydrate(account)
  } catch {
    end()
    return null
  }
}

function end() {
  setTokens(null)
  me = null
  classId = null
  children = []
  password = undefined
  generation++
  run++
}

export function logout() {
  if (!me) return
  request('POST', '/auth/logout', { refreshToken: refreshTokenValue() }).catch(() => {})
  end()
}
