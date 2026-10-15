import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Eraser,
  Eye,
  ImagePlus,
  Lock,
  MessageCircle,
  Mic,
  Pause,
  PenLine,
  Play,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  UserPlus,
  Users,
} from 'lucide-react'
import { unreadMessages, useStore } from '../store/store'
import { dayLabel, fmtDate, fmtLongDate, greeting, norm, relTime, todayISO } from '../lib/utils'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { GENDER, HEALTH_OPTIONS, JOURNAL_STATE, MEAL_OPTIONS, MOOD_OPTIONS, RELATIONSHIP, SLEEP_OPTIONS, errorText, label } from '../lib/labels'
import { DayTimeline, SECTION_ICON } from '../components/Journal'
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
  Field,
  Loadable,
  Modal,
  PageHeader,
  PhotoTile,
  SearchInput,
  SegBar,
  Select,
  Skeleton,
  SkeletonCards,
  SkeletonTable,
  StatCard,
  StatusBadge,
  useToast,
} from '../components/ui'

// The homeroom class comes from the backend profile (GET /auth/me → classes).
function useMyClass() {
  const { user } = useStore()
  return user.api.classes?.[0] || null
}

function NoClass() {
  return (
    <div className="card">
      <EmptyState icon={Users} title="You have not been assigned to a class yet." text="Please contact your principal." />
    </div>
  )
}

// One label for the state of a class journal on a day, from the class-register summary.
function journalState(summary) {
  if (!summary || summary.logged === 0) return 'Not Started'
  if (summary.approved >= summary.total && summary.total > 0) return 'Approved'
  if (summary.approved > 0) return 'In Progress'
  return 'Draft'
}

const attendanceCounts = (summary) => ({
  total: summary.total,
  present: summary.present,
  absent: summary.absent,
  unrecorded: Math.max(0, summary.total - summary.present - summary.absent),
  recorded: summary.logged > 0,
})

// ---------- Dashboard ----------

export function TeacherDashboard() {
  const { db, user } = useStore()
  const cls = useMyClass()
  const today = todayISO()
  const q = useApi(() => (cls ? api.journals.classDay(cls.id, today) : Promise.resolve(null)), [cls?.id])
  if (!cls)
    return (
      <>
        <PageHeader title={`${greeting()}, ${user.name}`} />
        <NoClass />
      </>
    )

  const summary = q.data?.summary
  const att = summary ? attendanceCounts(summary) : null
  const state = journalState(summary)
  const unread = unreadMessages(db, user)

  return (
    <>
      <div className="hero">
        <div>
          <h1>
            {greeting()}, {user.name}
          </h1>
          <p className="muted">{fmtLongDate(today)}</p>
        </div>
        <div className="hero-class">
          <span className="muted small">Your class</span>
          <strong>{cls.name}</strong>
        </div>
      </div>

      <div className="actions-grid">
        <Link to="/teacher/journal" className="action-card primary">
          <span className="action-icon">
            <BookOpen size={24} />
          </span>
          <span className="action-text">
            <strong>{state === 'Not Started' ? 'Create Daily Journal' : 'Continue Daily Journal'}</strong>
            <span>{state === 'Not Started' ? 'Record with your voice or fill in the class form' : `Today's journal: ${state}`}</span>
          </span>
          <ArrowRight size={20} />
        </Link>
        <Link to="/teacher/attendance" className="action-card">
          <span className="action-icon tint-mint">
            <ClipboardCheck size={24} />
          </span>
          <span className="action-text">
            <strong>Take Attendance</strong>
            <span>{att?.recorded ? `${att.present} present · ${att.absent} absent` : 'Not recorded yet today'}</span>
          </span>
        </Link>
        <Link to="/teacher/messages" className="action-card">
          <span className="action-icon tint-sky">
            <MessageCircle size={24} />
          </span>
          <span className="action-text">
            <strong>Messages</strong>
            <span>{unread ? `${unread} unread from parents` : 'No unread messages'}</span>
          </span>
        </Link>
      </div>

      <Loadable q={q} skeleton={<SkeletonCards count={5} />}>
        {() => (
          <>
            <div className="grid stats">
              <StatCard icon={Users} label="Students" value={summary.total} tint="peach" />
              <StatCard
                icon={ClipboardCheck}
                label="Attendance"
                value={att.recorded ? `${att.present} / ${att.total}` : '—'}
                hint={att.recorded ? 'present today' : 'not recorded'}
                tint="mint"
              />
              <StatCard icon={BookOpen} label="Journal status" value={state} hint="today" tint="cream" />
              <StatCard icon={Sparkles} label="Waiting for approval" value={summary.draft} hint="draft entries today" tint="lav" />
              <StatCard icon={MessageCircle} label="Unread parent messages" value={unread} tint="sky" />
            </div>

            <section className="card">
              <div className="card-head">
                <h2>Today's attendance</h2>
                <Link to="/teacher/attendance">{att.recorded ? 'Edit' : 'Take attendance'}</Link>
              </div>
              <SegBar
                parts={[
                  { label: 'Present', value: att.present, tone: 'success' },
                  { label: 'Absent', value: att.absent, tone: 'error' },
                  { label: 'Not recorded', value: att.unrecorded, tone: 'neutral' },
                ]}
              />
            </section>
          </>
        )}
      </Loadable>
    </>
  )
}

// ---------- My Class (read-only roster: students are managed by the principal) ----------

const ageOf = (dob) => {
  const months = Math.floor((Date.now() - new Date(`${dob}T00:00:00`).getTime()) / (30.44 * 86400000))
  return months < 24 ? `${months} months` : `${Math.floor(months / 12)} years old`
}

export function MyClassPage() {
  const cls = useMyClass()
  const today = todayISO()
  const roster = useApi(() => (cls ? api.students.list({ classId: cls.id, status: 'ACTIVE' }) : Promise.resolve([])), [cls?.id])
  const day = useApi(() => (cls ? api.journals.classDay(cls.id, today) : Promise.resolve(null)), [cls?.id])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  if (!cls) return <NoClass />

  const students = roster.data || []
  const entry = (id) => day.data?.students.find((x) => x.student.id === id)?.journal
  const statusOf = (s) => ({ PRESENT: 'Present', ABSENT: 'Absent' })[entry(s.id)?.attendance] || 'Not recorded'
  const list = students.filter((s) => norm(s.fullName).includes(norm(q)))

  return (
    <>
      <PageHeader title="My Class" subtitle={`${cls.name} · ${students.length} students`} />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search student" />
      </div>
      <Loadable q={roster} skeleton={<SkeletonTable />}>
        {() =>
          students.length === 0 ? (
            <div className="card">
              <EmptyState icon={Users} title="No students have been added to this class yet." text="The principal manages the class roster." />
            </div>
          ) : list.length === 0 ? (
            <div className="card">
              <EmptyState title="No results found." text="Try a different name." />
            </div>
          ) : (
            <div className="student-grid">
              {list.map((s) => (
                <button key={s.id} className="student-card" onClick={() => setOpen(s)}>
                  <Avatar name={s.fullName} src={s.avatarUrl} size={48} />
                  <span>
                    <strong>{s.fullName}</strong>
                    <span className="muted small">
                      {label(GENDER, s.gender)} · {ageOf(s.dateOfBirth)}
                      {s.allergies ? ' · ⚠ allergy' : ''}
                    </span>
                  </span>
                  <StatusBadge status={statusOf(s)} />
                </button>
              ))}
            </div>
          )
        }
      </Loadable>
      <p className="privacy-note">
        <ShieldCheck size={16} /> Students are added and removed by the principal. Changes appear here automatically.
      </p>

      <Modal open={!!open} title="Student Details" onClose={() => setOpen(null)}>
        {open && (
          <div className="stack">
            <div className="profile-top">
              <Avatar name={open.fullName} src={open.avatarUrl} size={64} />
              <div>
                <h2>{open.fullName}</h2>
                <span className="muted">{cls.name}</span>
                <StatusBadge status={statusOf(open)} />
              </div>
            </div>
            <dl className="details">
              <div>
                <dt>Date of Birth</dt>
                <dd>{fmtDate(open.dateOfBirth)}</dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd>{label(GENDER, open.gender)}</dd>
              </div>
              {open.parentLinks.map((l) => (
                <div key={l.parentId}>
                  <dt>{label(RELATIONSHIP, l.relationship)}</dt>
                  <dd>
                    {l.parent?.fullName}
                    <span className="muted block small">{l.parent?.phone}</span>
                  </dd>
                </div>
              ))}
              <div>
                <dt>Allergies</dt>
                <dd>{open.allergies || 'None recorded'}</dd>
              </div>
              <div>
                <dt>Medical notes</dt>
                <dd>{open.medicalNote || 'None'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </>
  )
}

// ---------- Attendance ----------
// Saved through bulk logging: everyone present by default, absent children as exceptions.

export function AttendancePage() {
  const toast = useToast()
  const cls = useMyClass()
  const today = todayISO()
  const [date, setDate] = useState(today)
  const q = useApi(() => (cls ? api.journals.classDay(cls.id, date) : Promise.resolve(null)), [cls?.id, date])
  const [recs, setRecs] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load the saved sheet when the day's data arrives; local edits stay until Save.
  useEffect(() => {
    if (!q.data) return
    setRecs(Object.fromEntries(q.data.students.filter((x) => x.journal).map((x) => [x.student.id, { status: x.journal.attendance, note: x.journal.absenceReason || '' }])))
    setDirty(false)
  }, [q.data])

  if (!cls) return <NoClass />
  const students = q.data?.students.map((x) => x.student) || []

  const set = (id, patch) => {
    setRecs((p) => ({ ...p, [id]: { status: p[id]?.status, note: p[id]?.note || '', ...patch } }))
    setDirty(true)
  }
  const markAll = () => {
    setRecs(Object.fromEntries(students.map((s) => [s.id, { status: 'PRESENT', note: '' }])))
    setDirty(true)
  }
  const present = students.filter((s) => recs[s.id]?.status === 'PRESENT').length
  const absent = students.filter((s) => recs[s.id]?.status === 'ABSENT').length
  const unmarked = students.length - present - absent

  const save = async () => {
    setSaving(true)
    try {
      await api.journals.bulk({
        classId: cls.id,
        date,
        defaults: { attendance: 'PRESENT' },
        exceptions: students.filter((s) => recs[s.id]?.status === 'ABSENT').map((s) => ({ studentId: s.id, attendance: 'ABSENT', absenceReason: recs[s.id].note.trim() || null })),
      })
      toast('Attendance saved.')
      q.reload()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="narrow wide">
      <PageHeader
        title="Attendance"
        subtitle={`${cls.name} · ${dayLabel(date)}${q.data?.summary.logged ? ' · saved' : ''}`}
        actions={<input type="date" className="date-input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />}
      />
      <Loadable q={q} skeleton={<SkeletonTable />}>
        {() =>
          students.length === 0 ? (
            <div className="card">
              <EmptyState icon={Users} title="No students have been added to this class yet." text="The principal manages the class roster." />
            </div>
          ) : (
            <>
              <div className="toolbar">
                <button className="btn btn-primary" onClick={markAll}>
                  <CheckCheck size={18} /> Mark all present
                </button>
                <span className="muted">Then change only the children who are absent.</span>
              </div>
              <div className="card list-card">
                {students.map((s) => {
                  const r = recs[s.id]
                  return (
                    <div key={s.id} className="att-row">
                      <div className="att-who">
                        <Avatar name={s.fullName} src={s.avatarUrl} size={42} />
                        <strong>{s.fullName}</strong>
                      </div>
                      <div className="att-controls">
                        <div className="att-toggle" role="group" aria-label={`Attendance for ${s.fullName}`}>
                          <button className={r?.status === 'PRESENT' ? 'on-present' : ''} aria-pressed={r?.status === 'PRESENT'} onClick={() => set(s.id, { status: 'PRESENT' })}>
                            Present
                          </button>
                          <button className={r?.status === 'ABSENT' ? 'on-absent' : ''} aria-pressed={r?.status === 'ABSENT'} onClick={() => set(s.id, { status: 'ABSENT' })}>
                            Absent
                          </button>
                        </div>
                      </div>
                      {r?.status === 'ABSENT' && (
                        <input
                          className="att-note"
                          value={r.note}
                          onChange={(e) => set(s.id, { note: e.target.value })}
                          placeholder="Reason for absence (optional)"
                          aria-label={`Reason for absence of ${s.fullName}`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="savebar">
                <div className="att-summary">
                  <span>
                    <strong>{present}</strong> present
                  </span>
                  <span>
                    <strong>{absent}</strong> absent
                  </span>
                  {unmarked > 0 && (
                    <span className="muted">
                      <strong>{unmarked}</strong> not marked — saved as present
                    </span>
                  )}
                </div>
                <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
                  <Save size={18} /> {saving ? 'Saving…' : dirty ? 'Save Attendance' : 'Saved'}
                </button>
              </div>
            </>
          )
        }
      </Loadable>
    </div>
  )
}

// ---------- Daily Journal ----------
// Voice → (browser Speech-to-Text or Whisper) → AI draft on the backend → teacher reviews the class form and
// the exceptions → Save (DRAFT) → Approve (parents can see it). AI output is always a draft.

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const STEPS = ['Record', 'Speech-to-Text', 'AI draft', 'Your review']
const BARS = 28

// onDone({ transcript, audio }) must return a promise; the recorder shows "Generating…" until it settles.
function Recorder({ onDone, onCancel }) {
  const [phase, setPhase] = useState('idle') // idle → starting → recording ⇄ paused → transcribing → processing | failed
  const [sec, setSec] = useState(0)
  const [live, setLive] = useState('')
  const [error, setError] = useState('')
  const session = useRef({ finals: [], interim: '' })
  const wave = useRef(null)
  const done = useRef(onDone)
  done.current = onDone

  const release = () => {
    const s = session.current
    s.listening = false
    try {
      s.recognition?.abort()
    } catch {
      // already stopped
    }
    s.stream?.getTracks().forEach((t) => t.stop())
    if (s.audioCtx && s.audioCtx.state !== 'closed') s.audioCtx.close()
  }
  useEffect(() => release, [])

  const fail = (message) => {
    release()
    setError(message)
    setPhase('failed')
  }

  // Live captions in the browser (Chrome/Edge). Without it, the recording itself goes to Whisper on the backend.
  const listen = () => {
    if (!SpeechRecognition) return
    const s = session.current
    const rec = new SpeechRecognition()
    rec.lang = 'vi-VN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim()
        if (e.results[i].isFinal) text && s.finals.push(text)
        else interim += ` ${text}`
      }
      s.interim = interim.trim()
      setLive([...s.finals, s.interim].filter(Boolean).join('. '))
    }
    rec.onerror = () => {}
    rec.onend = () => {
      if (!s.listening) return
      try {
        rec.start()
      } catch {
        // already restarting
      }
    }
    s.recognition = rec
    s.listening = true
    rec.start()
  }

  const start = async () => {
    setPhase('starting')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return fail('The microphone is blocked or not available. Allow microphone access for this site and try again.')
    }
    const s = (session.current = { finals: [], interim: '', chunks: [], stream })
    s.recorder = new MediaRecorder(stream)
    s.recorder.ondataavailable = (e) => e.data.size && s.chunks.push(e.data)
    s.recorder.onstop = () => {
      s.blob = new Blob(s.chunks, { type: s.recorder.mimeType || 'audio/webm' })
      s.stream.getTracks().forEach((t) => t.stop())
    }
    s.recorder.start()
    s.audioCtx = new AudioContext()
    s.analyser = s.audioCtx.createAnalyser()
    s.analyser.fftSize = 64
    s.audioCtx.createMediaStreamSource(stream).connect(s.analyser)
    listen()
    setSec(0)
    setLive('')
    setPhase('recording')
  }

  const pause = () => {
    const s = session.current
    s.listening = false
    s.recognition?.stop()
    s.recorder.pause()
    setPhase('paused')
  }
  const resume = () => {
    const s = session.current
    s.recorder.resume()
    if (s.recognition) {
      s.listening = true
      try {
        s.recognition.start()
      } catch {
        // still winding down from the pause; onend restarts it
      }
    }
    setPhase('recording')
  }
  const stop = () => {
    const s = session.current
    s.listening = false
    s.recognition?.stop()
    s.recorder.stop()
    setPhase('transcribing')
  }

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => setSec((v) => v + 1), 1000)
    const { analyser } = session.current
    const data = new Uint8Array(analyser.frequencyBinCount)
    let frame
    const draw = () => {
      analyser.getByteFrequencyData(data)
      Array.from(wave.current?.children || []).forEach((bar, i) => {
        bar.style.transform = `scaleY(${Math.max(0.08, data[(i + 2) % data.length] / 255)})`
      })
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      clearInterval(t)
      cancelAnimationFrame(frame)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'transcribing') {
      // Give the recogniser a moment to deliver its last result.
      const t = setTimeout(() => setPhase('processing'), SpeechRecognition ? 1500 : 300)
      return () => clearTimeout(t)
    }
    if (phase === 'processing') {
      const s = session.current
      const transcript = [...s.finals, s.interim].filter(Boolean).join('. ')
      done
        .current({ transcript, audio: s.blob })
        .then(release)
        .catch((e) => fail(`We couldn't create the draft. ${errorText(e)}`))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const supported = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const stepNow = phase === 'transcribing' ? 1 : phase === 'processing' ? 2 : 0
  const steps = (
    <div className="steps">
      {STEPS.map((s, i) => (
        <span key={s} className={`step ${i < stepNow ? 'done' : i === stepNow ? 'now' : ''}`}>
          {i < stepNow && <CheckCircle2 size={14} />} {s}
        </span>
      ))}
    </div>
  )

  return (
    <div className="card recorder">
      {(phase === 'idle' || phase === 'starting') && (
        <>
          <button className="rec-btn" onClick={start} disabled={!supported || phase === 'starting'} aria-label="Record Journal">
            <Mic size={34} />
          </button>
          <h2>{phase === 'starting' ? 'Waiting for the microphone…' : 'Record Journal'}</h2>
          {supported ? (
            <p className="muted">Describe the day in Vietnamese: meals, learning, nap, health and mood. Name a child (“bé An ăn ít”) to record an exception just for them.</p>
          ) : (
            <p className="muted">Voice recording is not available in this browser. Please fill in the class form instead.</p>
          )}
          {steps}
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </>
      )}

      {(phase === 'recording' || phase === 'paused') && (
        <>
          <StatusBadge status={phase === 'recording' ? 'Recording' : 'Paused'} />
          <div className="rec-timer">{mmss(sec)}</div>
          <div ref={wave} className={`wave live ${phase === 'paused' ? 'paused' : ''}`} aria-hidden="true">
            {Array.from({ length: BARS }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
          <p className="transcript rec-live" aria-live="polite">
            {live || (SpeechRecognition ? 'Listening… start speaking.' : 'Recording… the server will transcribe it when you stop.')}
          </p>
          <div className="rec-controls">
            <button className="btn" onClick={phase === 'recording' ? pause : resume}>
              {phase === 'recording' ? <Pause size={18} /> : <Play size={18} />} {phase === 'recording' ? 'Pause' : 'Resume'}
            </button>
            <button className="btn btn-primary" onClick={stop}>
              <Square size={16} /> Stop
            </button>
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {(phase === 'transcribing' || phase === 'processing') && (
        <>
          <span className="ring" aria-hidden="true" />
          <h2 aria-live="polite">{phase === 'transcribing' ? 'Transcribing your voice...' : 'Generating journal draft...'}</h2>
          <p className="muted">{phase === 'transcribing' ? 'Turning your recording into text.' : 'The AI is sorting what you said into the class form and the exceptions.'}</p>
          {steps}
        </>
      )}

      {phase === 'failed' && (
        <>
          <EmptyState icon={Mic} title={error} />
          <div className="rec-controls">
            <button className="btn btn-primary" onClick={() => setPhase('idle')}>
              Retry
            </button>
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---- form model ----

// What the whole class shares, and what one child may override.
const CLASS_FIELDS = ['mealLevel', 'mealNote', 'sleepMinutes', 'sleepQuality', 'learningNote', 'healthStatus', 'healthNote', 'mood', 'teacherNote']
const EXCEPTION_FIELDS = [
  'attendance',
  'absenceReason',
  'mealLevel',
  'mealNote',
  'sleepMinutes',
  'sleepQuality',
  'healthStatus',
  'temperature',
  'healthNote',
  'mood',
  'teacherNote',
]
const IN_CLASS = ['mealLevel', 'mealNote', 'sleepMinutes', 'sleepQuality', 'learningNote', 'mood']
const TEXT_FIELDS = new Set(['mealNote', 'learningNote', 'healthNote', 'teacherNote', 'absenceReason'])
const PRESET = { mealLevel: 'ALL', mealNote: '', sleepMinutes: 90, sleepQuality: 'GOOD', learningNote: '', healthStatus: 'NORMAL', healthNote: '', mood: 'HAPPY', teacherNote: '' }

const blank = (v) => v === null || v === undefined || v === ''
const same = (a, b) => (blank(a) && blank(b)) || String(a) === String(b)
const joinText = (a, b) => [a, b].filter((x) => !blank(x)).join(' ')

// Blank counts as a value: if most children have no note, the class has no note.
function mostCommon(values) {
  const counts = new Map()
  for (const v of values) {
    const k = blank(v) ? '' : v
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  let best = ''
  let n = 0
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c]
  return best
}

// Saved entries → class form + exceptions: the class value is what most present children share; a child whose
// value differs (or who was absent) becomes an exception with only the differing fields.
function formFromDay(day) {
  const entries = day.students.map((x) => x.journal).filter(Boolean)
  if (!entries.length) return { defaults: { ...PRESET }, exceptions: {} }
  const present = entries.filter((e) => e.attendance === 'PRESENT')
  const defaults = Object.fromEntries(CLASS_FIELDS.map((f) => [f, mostCommon(present.map((e) => e[f])) ?? '']))
  const exceptions = {}
  for (const e of entries) {
    const diff = {}
    if (e.attendance === 'ABSENT') {
      diff.attendance = 'ABSENT'
      if (e.absenceReason) diff.absenceReason = e.absenceReason
    } else {
      for (const f of EXCEPTION_FIELDS) {
        if (f === 'attendance' || f === 'absenceReason') continue
        if (f === 'temperature' ? !blank(e[f]) : !same(e[f], defaults[f])) diff[f] = e[f] ?? ''
      }
    }
    if (Object.keys(diff).length) exceptions[e.studentId] = diff
  }
  return { defaults, exceptions }
}

// An AI draft adds to the form: notes are appended, levels and numbers replace what was there.
function mergeDraft(form, draft) {
  const put = (target, src) => {
    const out = { ...target }
    for (const [k, v] of Object.entries(src)) {
      if (blank(v) || k === 'studentId' || k === 'studentName') continue
      out[k] = TEXT_FIELDS.has(k) ? joinText(out[k], v) : v
    }
    return out
  }
  const { attendance: _ignored, absenceReason: _ignored2, temperature: _t, ...classPart } = draft.classDefaults
  const exceptions = { ...form.exceptions }
  for (const ex of draft.exceptions) exceptions[ex.studentId] = put(exceptions[ex.studentId] || {}, ex)
  return { defaults: put(form.defaults, classPart), exceptions }
}

const toValue = (f, v) => (blank(v) ? null : f === 'sleepMinutes' ? Number(v) : f === 'temperature' ? Number(String(v).replace(',', '.')) : v)

function payloadFrom(form, roster) {
  const ids = new Set(roster.map((s) => s.id))
  return {
    defaults: { attendance: 'PRESENT', ...Object.fromEntries(CLASS_FIELDS.map((f) => [f, toValue(f, form.defaults[f])])) },
    exceptions: Object.entries(form.exceptions)
      .filter(([id]) => ids.has(id))
      .map(([studentId, o]) => {
        const absent = o.attendance === 'ABSENT'
        const fields = Object.entries(o).filter(([k, v]) => !blank(v) && (!absent || !IN_CLASS.includes(k)))
        return { studentId, ...Object.fromEntries(fields.map(([k, v]) => [k, toValue(k, v)])) }
      })
      .filter((e) => Object.keys(e).length > 1),
  }
}

// ---- editor ----

function ClassForm({ value, onChange }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v })
  const Icon = SECTION_ICON
  return (
    <div className="card">
      <div className="card-head">
        <h2>For the whole class</h2>
        <span className="chip">
          <Users size={14} /> Applied to every child, except the ones below
        </span>
      </div>
      <div className="j-grid">
        <div className="j-block">
          <div className="j-section-head">
            <span>
              <Icon.meal size={18} /> Meal
            </span>
          </div>
          <Select value={value.mealLevel} onChange={set('mealLevel')} options={MEAL_OPTIONS} placeholder="Not recorded" aria-label="How much the class ate" />
          <textarea rows={2} value={value.mealNote} onChange={(e) => set('mealNote')(e.target.value)} placeholder="Dishes, how the children ate" aria-label="Meal note" />
        </div>
        <div className="j-block">
          <div className="j-section-head">
            <span>
              <Icon.sleep size={18} /> Nap
            </span>
          </div>
          <div className="j-inline">
            <input type="number" min="0" max="300" value={value.sleepMinutes} onChange={(e) => set('sleepMinutes')(e.target.value)} aria-label="Nap minutes" />
            <span className="muted">minutes</span>
          </div>
          <Select value={value.sleepQuality} onChange={set('sleepQuality')} options={SLEEP_OPTIONS} placeholder="Not recorded" aria-label="Sleep quality" />
        </div>
        <div className="j-block j-wide">
          <div className="j-section-head">
            <span>
              <Icon.learning size={18} /> Learning
            </span>
          </div>
          <textarea rows={2} value={value.learningNote} onChange={(e) => set('learningNote')(e.target.value)} placeholder="Activities of the day" aria-label="Learning" />
        </div>
        <div className="j-block">
          <div className="j-section-head">
            <span>
              <Icon.health size={18} /> Health
            </span>
          </div>
          <Select value={value.healthStatus} onChange={set('healthStatus')} options={HEALTH_OPTIONS} placeholder="Not recorded" aria-label="Health" />
          <textarea rows={2} value={value.healthNote} onChange={(e) => set('healthNote')(e.target.value)} placeholder="Health note (optional)" aria-label="Health note" />
        </div>
        <div className="j-block">
          <div className="j-section-head">
            <span>
              <Icon.emotion size={18} /> Emotion
            </span>
          </div>
          <Select value={value.mood} onChange={set('mood')} options={MOOD_OPTIONS} placeholder="Not recorded" aria-label="Mood" />
        </div>
        <div className="j-block j-wide">
          <div className="j-section-head">
            <span>
              <Icon.note size={18} /> Note for all parents
            </span>
          </div>
          <textarea
            rows={2}
            value={value.teacherNote}
            onChange={(e) => set('teacherNote')(e.target.value)}
            placeholder="Reminders for the families of the class"
            aria-label="Note for all parents"
          />
        </div>
      </div>
    </div>
  )
}

function ExceptionRow({ student, value, onChange, onRemove, warnings }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v })
  const absent = value.attendance === 'ABSENT'
  return (
    <div className="exc-row">
      <div className="exc-head">
        <span className="cell-user">
          <Avatar name={student.fullName} src={student.avatarUrl} size={32} />
          <strong>{student.fullName}</strong>
          {student.allergies && <span className="chip chip-warn">⚠ {student.allergies}</span>}
        </span>
        <button className="btn btn-sm" onClick={onRemove}>
          <Eraser size={14} /> Same as class
        </button>
      </div>
      {warnings?.length > 0 && (
        <div className="exc-warn">
          <AlertTriangle size={14} /> {warnings.join(' · ')}
        </div>
      )}
      <div className="exc-grid">
        <Field label="Attendance">
          <Select
            value={value.attendance || 'PRESENT'}
            onChange={set('attendance')}
            options={[
              { value: 'PRESENT', label: 'Present' },
              { value: 'ABSENT', label: 'Absent' },
            ]}
          />
        </Field>
        {absent ? (
          <Field label="Reason for absence" full>
            <input value={value.absenceReason || ''} onChange={(e) => set('absenceReason')(e.target.value)} placeholder="e.g. Gia đình xin nghỉ" />
          </Field>
        ) : (
          <>
            <Field label="Meal">
              <Select value={value.mealLevel || ''} onChange={set('mealLevel')} options={MEAL_OPTIONS} placeholder="Same as class" />
            </Field>
            <Field label="Nap (minutes)">
              <input type="number" min="0" max="300" value={value.sleepMinutes ?? ''} onChange={(e) => set('sleepMinutes')(e.target.value)} placeholder="Same as class" />
            </Field>
            <Field label="Health">
              <Select value={value.healthStatus || ''} onChange={set('healthStatus')} options={HEALTH_OPTIONS} placeholder="Same as class" />
            </Field>
            <Field label="Temperature (°C)">
              <input inputMode="decimal" value={value.temperature ?? ''} onChange={(e) => set('temperature')(e.target.value)} placeholder="e.g. 37.8" />
            </Field>
            <Field label="Mood">
              <Select value={value.mood || ''} onChange={set('mood')} options={MOOD_OPTIONS} placeholder="Same as class" />
            </Field>
            <Field label="Health / meal detail" full>
              <input value={value.healthNote || ''} onChange={(e) => set('healthNote')(e.target.value)} placeholder="e.g. Bé hơi sốt, cô đã báo phụ huynh" />
            </Field>
          </>
        )}
        <Field label="Personal note (only this family sees it)" full>
          <textarea rows={2} value={value.teacherNote || ''} onChange={(e) => set('teacherNote')(e.target.value)} placeholder="Replaces the class note for this child" />
        </Field>
      </div>
    </div>
  )
}

function JournalEditor({ cls, date, day, initialDraft, onClose, onSaved }) {
  const { db } = useStore()
  const toast = useToast()
  const roster = day.students.map((x) => x.student)
  const byStudent = useMemo(() => Object.fromEntries(roster.map((s) => [s.id, s])), [roster])
  const [form, setForm] = useState(() => (initialDraft ? mergeDraft(formFromDay(day), initialDraft.draft) : formFromDay(day)))
  const [ai, setAi] = useState(
    initialDraft
      ? { transcripts: [initialDraft.transcript], audios: initialDraft.audioUrl ? [initialDraft.audioUrl] : [], unrecognized: initialDraft.draft.unrecognizedNames }
      : null,
  )
  const [dirty, setDirty] = useState(!!initialDraft)
  const [busy, setBusy] = useState('')
  const [warnings, setWarnings] = useState({})
  const [recording, setRecording] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [leave, setLeave] = useState(false)
  const [preview, setPreview] = useState(null)
  const summary = day.summary
  const state = journalState(summary)
  const maxPhotos = Number(db.settings.maxPhotos) || 6

  // Photos are stored per child; show each file once.
  const photos = useMemo(() => {
    const byUrl = new Map()
    for (const { journal } of day.students) for (const p of journal?.photos || []) byUrl.set(p.url, [...(byUrl.get(p.url) || []), p.id])
    return [...byUrl].map(([url, ids]) => ({ url, ids }))
  }, [day])

  const update = (fn) => {
    setForm(fn)
    setDirty(true)
  }
  const setException = (id, v) => update((f) => ({ ...f, exceptions: { ...f.exceptions, [id]: v } }))
  const removeException = (id) => update((f) => ({ ...f, exceptions: Object.fromEntries(Object.entries(f.exceptions).filter(([k]) => k !== id)) }))
  const exceptionIds = Object.keys(form.exceptions).filter((id) => byStudent[id])

  const save = async () => {
    const res = await api.journals.bulk({ classId: cls.id, date, source: ai ? 'VOICE' : 'BULK', ...payloadFrom(form, roster) })
    setWarnings(Object.fromEntries(res.warnings.map((w) => [w.studentId, w.messages])))
    setDirty(false)
    return res
  }

  const run = (kind, fn) => async () => {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy('')
    }
  }

  const saveDraft = run('save', async () => {
    const res = await save()
    toast(`Draft saved for ${res.total} children${res.exceptions ? ` (${res.exceptions} exceptions)` : ''}.`)
    onSaved()
  })

  const approve = run('approve', async () => {
    if (dirty) await save()
    const res = await api.journals.approve(cls.id, date)
    setConfirm(false)
    toast(`Journal approved: ${res.approved} entries are now visible to parents.`)
    onSaved()
    onClose()
  })

  const addRecording = async ({ transcript, audio }) => {
    const res = transcript ? await api.journals.fromText({ classId: cls.id, date }, transcript) : await api.journals.fromVoice({ classId: cls.id, date }, audio)
    setForm((f) => mergeDraft(f, res.draft))
    setAi((a) => ({
      transcripts: [...(a?.transcripts || []), res.transcript],
      audios: audio ? [...(a?.audios || []), URL.createObjectURL(audio)] : a?.audios || [],
      unrecognized: [...(a?.unrecognized || []), ...res.draft.unrecognizedNames],
    }))
    setDirty(true)
    setRecording(false)
    toast('Added to the draft. Please review the changes.')
  }

  const onPhotos = async (e) => {
    const files = [...e.target.files].slice(0, Math.max(0, maxPhotos - photos.length))
    e.target.value = ''
    if (!files.length) return
    setBusy('photos')
    try {
      if (dirty) await save()
      await api.journals.uploadPhotos({ classId: cls.id, date }, files)
      toast(`${files.length} photo${files.length > 1 ? 's' : ''} added for the children present.`)
      onSaved()
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy('')
    }
  }
  const removePhoto = (p) =>
    run('photos', async () => {
      for (const id of p.ids) await api.journals.removePhoto(id)
      toast('Photo removed.')
      onSaved()
    })()

  const openPreview = (studentId) =>
    run('preview', async () => {
      const t = await api.journals.timeline(studentId, date, date)
      setPreview({ studentId, day: t.days[0] || null })
    })()

  return (
    <div className="narrow wide">
      <PageHeader
        back={
          <button className="back-link" onClick={() => (dirty ? setLeave(true) : onClose())}>
            <ArrowLeft size={16} /> Daily Journal
          </button>
        }
        title={`Journal · ${dayLabel(date)}`}
        subtitle={`${cls.name} · ${fmtLongDate(date)} · ${summary.total} children`}
        actions={<StatusBadge status={dirty ? 'Draft' : state} />}
      />

      {ai && (
        <div className="alert alert-info">
          <Sparkles size={18} />
          <span>
            <strong>AI-generated draft — please review.</strong> Check the class form and every exception, correct mistakes and add what is missing. Nothing reaches parents until
            you approve.
            {ai.unrecognized.length > 0 && <> Names the AI could not match: {ai.unrecognized.join(', ')}.</>}
          </span>
        </div>
      )}

      {db.settings.aiJournal && (
        <div className="card">
          <div className="row-between">
            <span>
              <strong>{ai ? 'Forgot something?' : 'Prefer to speak?'}</strong>
              <span className="muted block small">Record {ai ? 'again' : 'with your voice'}: notes are added to the form and named children become exceptions.</span>
            </span>
            <button className="btn" onClick={() => setRecording(true)}>
              <Mic size={18} /> {ai ? 'Record more' : 'Record with voice'}
            </button>
          </div>
          {ai && (
            <details>
              <summary>
                <strong>What you said</strong> <span className="muted small">— transcript sent to the AI</span>
              </summary>
              {ai.audios.map((url) => (
                <audio key={url} className="rec-audio" controls src={url} />
              ))}
              {ai.transcripts.map((t, i) => (
                <p key={i} className="transcript">
                  {t}
                </p>
              ))}
            </details>
          )}
        </div>
      )}

      <ClassForm value={form.defaults} onChange={(defaults) => update((f) => ({ ...f, defaults }))} />

      <div className="card">
        <div className="card-head">
          <h2>Exceptions</h2>
          <span className="chip">
            <Lock size={14} /> {exceptionIds.length} of {roster.length} children differ from the class
          </span>
        </div>
        <span className="muted small">Only fill in what is different for that child. Empty fields keep the class value.</span>
        {exceptionIds.map((id) => (
          <ExceptionRow
            key={id}
            student={byStudent[id]}
            value={form.exceptions[id]}
            warnings={warnings[id]}
            onChange={(v) => setException(id, v)}
            onRemove={() => removeException(id)}
          />
        ))}
        {exceptionIds.length < roster.length && (
          <div className="cell-user">
            <UserPlus size={18} />
            <Select
              value=""
              onChange={(id) => id && setException(id, {})}
              options={roster.filter((s) => !form.exceptions[s.id]).map((s) => ({ value: s.id, label: `${s.fullName}${s.allergies ? ' ⚠' : ''}` }))}
              placeholder="Add an exception for a child…"
              aria-label="Add an exception for a child"
            />
          </div>
        )}
        {Object.entries(warnings)
          .filter(([id]) => !form.exceptions[id])
          .map(([id, msgs]) => (
            <div key={id} className="exc-warn">
              <AlertTriangle size={14} /> {byStudent[id]?.fullName}: {msgs.join(' · ')}
            </div>
          ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Photos</h2>
          <span className="muted small">
            {photos.length} of {maxPhotos} · shared with the families of the children present
          </span>
        </div>
        <div className="photos">
          {photos.map((p) => (
            <PhotoTile key={p.url} src={p.url} onRemove={busy ? undefined : () => removePhoto(p)} />
          ))}
          {photos.length < maxPhotos && (
            <label className={`photo photo-add ${busy === 'photos' ? 'disabled' : ''}`}>
              <ImagePlus size={24} />
              <span>{busy === 'photos' ? 'Uploading…' : 'Add photo'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPhotos} disabled={!!busy} />
            </label>
          )}
        </div>
      </div>

      <div className="card">
        <div className="principle">
          <Sparkles size={16} /> AI suggests <ArrowRight size={14} /> Teacher verifies <ArrowRight size={14} /> <strong>Teacher decides</strong>
        </div>
        <div className="editor-actions">
          <button className="btn" onClick={saveDraft} disabled={!!busy}>
            <Save size={18} /> {busy === 'save' ? 'Saving…' : 'Save Draft'}
          </button>
          <Select
            value=""
            onChange={(id) => id && openPreview(id)}
            options={roster.map((s) => ({ value: s.id, label: s.fullName }))}
            placeholder={dirty ? 'Preview (save first)' : 'Preview as a parent…'}
            aria-label="Preview as the parent of"
            disabled={dirty || !!busy}
          />
          <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={!!busy || (state === 'Approved' && !dirty)}>
            <Send size={18} /> {state === 'Approved' && !dirty ? 'Approved' : 'Approve & Publish'}
          </button>
        </div>
        <span className="muted small">Saving keeps everything as a draft. Parents see the journal only after you approve it; any later change needs approval again.</span>
      </div>

      <Modal open={!!preview} title={`Preview — ${byStudent[preview?.studentId]?.fullName || ''}`} onClose={() => setPreview(null)}>
        {preview && (preview.day ? <DayTimeline day={preview.day} /> : <EmptyState title="Nothing saved for this child yet." soft />)}
      </Modal>

      <Modal open={recording} title="Record more" onClose={() => setRecording(false)}>
        {recording && <Recorder onDone={addRecording} onCancel={() => setRecording(false)} />}
      </Modal>

      <Modal
        open={confirm}
        title="Approve and publish this journal to parents?"
        onClose={() => setConfirm(false)}
        size="sm"
        footer={
          <>
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={approve} disabled={!!busy}>
              {busy === 'approve' ? 'Publishing…' : 'Approve & Publish'}
            </button>
          </>
        }
      >
        <dl className="details">
          <div>
            <dt>Class</dt>
            <dd>{cls.name}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{fmtDate(date)}</dd>
          </div>
          <div>
            <dt>Children</dt>
            <dd>{roster.length}</dd>
          </div>
          <div>
            <dt>Exceptions</dt>
            <dd>{exceptionIds.length}</dd>
          </div>
          <div>
            <dt>Photos</dt>
            <dd>{photos.length}</dd>
          </div>
          <div>
            <dt>Unsaved changes</dt>
            <dd>{dirty ? 'Will be saved first' : 'None'}</dd>
          </div>
        </dl>
      </Modal>

      <ConfirmDialog
        open={leave}
        title="Leave without saving?"
        body="Your latest changes to this journal have not been saved."
        confirmLabel="Leave"
        danger
        onClose={() => setLeave(false)}
        onConfirm={onClose}
      />
    </div>
  )
}

const HISTORY_TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'draft', label: 'Drafts', match: (h) => h.draft > 0 },
  { key: 'approved', label: 'Approved', match: (h) => h.draft === 0 },
]

export function DailyJournalPage() {
  const { db } = useStore()
  const toast = useToast()
  const cls = useMyClass()
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [view, setView] = useState({ mode: 'home' }) // home | record | edit
  const [tab, setTab] = useState('all')
  const q = useApi(() => (cls ? api.journals.classDay(cls.id, date) : Promise.resolve(null)), [cls?.id, date])
  const history = useApi(() => (cls ? api.journals.history(cls.id) : Promise.resolve([])), [cls?.id])
  if (!cls) return <NoClass />

  const aiOn = db.settings.aiJournal
  const summary = q.data?.summary
  const state = journalState(summary)
  const shown = (history.data || []).filter(HISTORY_TABS.find((t) => t.key === tab).match)
  const reloadAll = () => {
    q.reload()
    history.reload()
  }

  if (view.mode === 'record')
    return (
      <div className="narrow">
        <PageHeader title="Record with Voice" subtitle={`${cls.name} · ${fmtLongDate(date)}`} />
        <Recorder
          onCancel={() => setView({ mode: 'home' })}
          onDone={async ({ transcript, audio }) => {
            const res = transcript ? await api.journals.fromText({ classId: cls.id, date }, transcript) : await api.journals.fromVoice({ classId: cls.id, date }, audio)
            setView({ mode: 'edit', draft: { ...res, audioUrl: audio ? URL.createObjectURL(audio) : null } })
            toast('Draft ready. Please review it.')
          }}
        />
      </div>
    )

  if (view.mode === 'edit')
    // Wait for the selected day (the previous day's data is kept while a new one loads).
    return q.data?.date === date ? (
      <JournalEditor
        key={`${date}-${view.draft ? 'ai' : 'form'}`}
        cls={cls}
        date={date}
        day={q.data}
        initialDraft={view.draft}
        onSaved={reloadAll}
        onClose={() => setView({ mode: 'home' })}
      />
    ) : (
      <SkeletonTable />
    )

  return (
    <>
      <PageHeader
        title="Daily Journal"
        subtitle={`${cls.name} · ${fmtLongDate(date)}`}
        actions={<input type="date" className="date-input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Journal date" />}
      />

      <Loadable
        q={q}
        skeleton={
          <section className="card">
            <Skeleton h={90} />
          </section>
        }
      >
        {() =>
          summary.logged > 0 ? (
            <section className="card">
              <div className="row-between">
                <div>
                  <h2>Journal for {date === today ? 'today' : fmtDate(date)}</h2>
                  <span className="muted small">
                    {summary.logged} of {summary.total} children · {summary.approved} approved · {summary.draft} draft · {summary.absent} absent
                  </span>
                </div>
                <StatusBadge status={state} />
              </div>
              <div className="cell-user">
                <button className="btn btn-primary" onClick={() => setView({ mode: 'edit' })}>
                  {state === 'Approved' ? (
                    <>
                      <Eye size={18} /> Open Journal
                    </>
                  ) : (
                    <>
                      <PenLine size={18} /> {summary.draft ? 'Review & Approve' : 'Continue'}
                    </>
                  )}
                </button>
                {aiOn && (
                  <button className="btn" onClick={() => setView({ mode: 'record' })}>
                    <Mic size={18} /> Record more
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="stack">
              <div className="choice-grid">
                <button className="choice primary" onClick={() => setView({ mode: 'record' })} disabled={!aiOn}>
                  <span className="action-icon tint-mint">
                    <Mic size={24} />
                  </span>
                  <strong>Record with Voice</strong>
                  <span className="muted">
                    {aiOn
                      ? 'Describe the day in Vietnamese. AI fills in the class form and the exceptions for you to review.'
                      : 'AI-assisted drafts are turned off by the system administrator.'}
                  </span>
                </button>
                <button className="choice" onClick={() => setView({ mode: 'edit' })}>
                  <span className="action-icon tint-cream">
                    <PenLine size={24} />
                  </span>
                  <strong>Fill in the Class Form</strong>
                  <span className="muted">Set what the whole class did once, then mark only the 2–3 children who were different.</span>
                </button>
              </div>
              <div className="principle">
                <Sparkles size={16} /> AI suggests <ArrowRight size={14} /> Teacher verifies <ArrowRight size={14} /> <strong>Teacher decides</strong>
                <span>· Nothing is published automatically.</span>
              </div>
            </section>
          )
        }
      </Loadable>

      <h2 className="section-title">Journal History</h2>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {HISTORY_TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <Loadable q={history} skeleton={<SkeletonTable rows={4} />}>
        {() =>
          shown.length === 0 ? (
            <div className="card">
              <EmptyState icon={BookOpen} title={history.data.length === 0 ? 'No journals yet.' : 'No journals with this status.'} />
            </div>
          ) : (
            <div className="card table-card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Entries</th>
                    <th>Status</th>
                    <th>Created with</th>
                    <th>Last edited</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((h) => (
                    <tr key={h.date}>
                      <td data-label="Date" className="td-primary">
                        {dayLabel(h.date)}
                      </td>
                      <td data-label="Entries">
                        {h.logged} · {h.absent} absent
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={h.draft ? (h.approved ? 'In Progress' : JOURNAL_STATE.DRAFT) : JOURNAL_STATE.APPROVED} />
                      </td>
                      <td data-label="Created with">{h.voice ? 'Voice (AI-assisted)' : 'Class form'}</td>
                      <td data-label="Last edited">{relTime(new Date(h.updatedAt).getTime())}</td>
                      <td data-label="Actions" className="td-plain" style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setDate(h.date)
                            setView({ mode: 'edit' })
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loadable>
    </>
  )
}
