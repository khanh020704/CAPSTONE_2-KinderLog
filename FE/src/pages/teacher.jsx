import { useEffect, useRef, useState } from 'react'
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
  StickyNote,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
} from 'lucide-react'
import { useStore } from '../store/store'
import { JOURNAL_SECTIONS, JOURNAL_STATUS, dayLabel, fmtDate, fmtLongDate, greeting, groupIssues, norm, relTime, todayISO } from '../lib/utils'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { GENDER, RELATIONSHIP, errorText, label } from '../lib/labels'
import { JournalTimeline, SECTION_ICON } from '../components/Journal'
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
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

// The day being worked on is shared by Attendance and Daily Journal (and kept for the browser tab), so moving
// between them, or reopening the menu, never jumps back to today.
const JOURNAL_DATE_KEY = 'kinderlog.journalDate'
function useJournalDate() {
  const today = todayISO()
  const [date, setDateState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(JOURNAL_DATE_KEY)
      return saved && saved <= today ? saved : today
    } catch {
      return today
    }
  })
  const setDate = (d) => {
    setDateState(d)
    try {
      sessionStorage.setItem(JOURNAL_DATE_KEY, d)
    } catch {
      // storage unavailable: the date is kept for this page only
    }
  }
  return [date, setDate]
}

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

// The state of the day's class journal (classJournal of the class register): Draft / Needs Review → Approved → Published.
const journalState = (classJournal) => (classJournal ? JOURNAL_STATUS[classJournal.status] : 'Not Started')

const attendanceCounts = (summary) => ({
  total: summary.total,
  present: summary.present,
  absent: summary.absent,
  unrecorded: Math.max(0, summary.total - summary.present - summary.absent),
  recorded: summary.logged > 0,
})

// ---------- Dashboard ----------

export function TeacherDashboard() {
  const { user, counts } = useStore()
  const cls = useMyClass()
  const today = todayISO()
  const q = useApi(() => (cls ? api.journals.classDay(cls.id, today) : Promise.resolve(undefined)), [cls?.id])
  if (!cls)
    return (
      <>
        <PageHeader title={`${greeting()}, ${user.name}`} />
        <NoClass />
      </>
    )

  const summary = q.data?.summary
  const att = summary ? attendanceCounts(summary) : null
  const classJournal = q.data?.classJournal
  const state = journalState(classJournal)
  const unread = counts.messages
  // Today's journal drafted from a voice recording (AI) that the teacher has not reviewed and approved yet.
  const aiDrafts = classJournal?.source === 'voice' && classJournal.status === 'review' ? 1 : 0

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
            <span>{state === 'Not Started' ? 'Record with your voice or write it manually' : `Today's journal: ${state}`}</span>
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
              <StatCard icon={Sparkles} label="Pending reviews" value={aiDrafts} hint="AI drafts to review" tint="lav" />
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
  const day = useApi(() => (cls ? api.journals.classDay(cls.id, today) : Promise.resolve(undefined)), [cls?.id])
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
  const [date, setDate] = useJournalDate()
  const q = useApi(() => (cls ? api.journals.classDay(cls.id, date) : Promise.resolve(undefined)), [cls?.id, date])
  const [recs, setRecs] = useState({})
  const [saved, setSaved] = useState({})
  const [noteOpen, setNoteOpen] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load the saved sheet when the day's data arrives; local edits stay until Save.
  useEffect(() => {
    if (!q.data) return
    const sheet = Object.fromEntries(q.data.students.filter((x) => x.journal).map((x) => [x.student.id, { status: x.journal.attendance, note: x.journal.absenceReason || '' }]))
    setRecs(sheet)
    setSaved(sheet)
    setNoteOpen({})
    setDirty(false)
  }, [q.data])

  if (!cls) return <NoClass />
  const students = q.data?.students.map((x) => x.student) || []

  const set = (id, patch) => {
    setRecs((p) => ({ ...p, [id]: { status: p[id]?.status, note: p[id]?.note || '', ...patch } }))
    setDirty(true)
  }
  // Absence reasons are dropped; a note on a child already present (e.g. "arrived late") stays.
  const markAll = () => {
    setRecs((p) => Object.fromEntries(students.map((s) => [s.id, { status: 'PRESENT', note: p[s.id]?.status === 'PRESENT' ? p[s.id].note : '' }])))
    setDirty(true)
  }
  const present = students.filter((s) => recs[s.id]?.status === 'PRESENT').length
  const absent = students.filter((s) => recs[s.id]?.status === 'ABSENT').length
  const unmarked = students.length - present - absent

  const save = async () => {
    setSaving(true)
    try {
      // Only children marked present or absent are saved (and only when something changed): the others stay
      // "not recorded" until the teacher marks them.
      const note = (id) => recs[id]?.note?.trim() || null
      const changed = students.filter((s) => recs[s.id]?.status && (recs[s.id].status !== saved[s.id]?.status || note(s.id) !== (saved[s.id]?.note?.trim() || null)))
      for (const s of changed) await api.journals.upsertOne(s.id, { date, attendance: recs[s.id].status, absenceReason: note(s.id) })
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
                  const showNote = noteOpen[s.id] || r?.note || r?.status === 'ABSENT'
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
                        <button className="icon-btn" onClick={() => setNoteOpen((p) => ({ ...p, [s.id]: !p[s.id] }))} aria-label={`Note for ${s.fullName}`}>
                          <StickyNote size={20} />
                        </button>
                      </div>
                      {showNote && (
                        <input
                          className="att-note"
                          value={r?.note || ''}
                          onChange={(e) => set(s.id, { note: e.target.value })}
                          placeholder={r?.status === 'ABSENT' ? 'Reason for absence (optional)' : 'Note, e.g. arrived late (optional)'}
                          aria-label={`Note for ${s.fullName}`}
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
                      <strong>{unmarked}</strong> not recorded
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
// Voice → Speech-to-Text → the teacher checks the text → AI draft → teacher review/edit → approve → publish.
// AI output is always a draft.

const filledCount = (sections) => JOURNAL_SECTIONS.filter((s) => sections[s.key]?.trim()).length
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const joinText = (...parts) => parts.filter((p) => p?.trim()).join(' ')

// Live captions in the browser (Web Speech API, Vietnamese): Chrome and Edge. The recording itself goes to Whisper on
// the server, which knows the children's names; the browser's text is the fallback.
const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

const STEPS = ['Record', 'Speech-to-Text', 'Check the text', 'AI draft']
const BARS = 28

// onDone(draft): { transcript, sections, personal, issues, audio: [url on the server], audioUrl: local playback }.
function Recorder({ classId, journalId, date, onDone, onCancel }) {
  // idle → starting → recording ⇄ paused → transcribing → editing → processing | failed
  // In "editing" the teacher reads what was heard, corrects it in a text box, and presses Enter to make the draft.
  const [phase, setPhase] = useState('idle')
  const [sec, setSec] = useState(0)
  const [live, setLive] = useState('')
  const [text, setText] = useState('')
  const [heardBy, setHeardBy] = useState('')
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

  const listen = () => {
    const s = session.current
    const rec = new SpeechRecognition()
    rec.lang = 'vi-VN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const heard = e.results[i][0].transcript.trim()
        if (e.results[i].isFinal) heard && s.finals.push(heard)
        else interim += ` ${heard}`
      }
      s.interim = interim.trim()
      setLive([...s.finals, s.interim].filter(Boolean).join('. '))
    }
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') s.sttError = e.error
    }
    // The browser ends recognition after a silence; keep listening for as long as the teacher is recording.
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

  const stopListening = () => {
    const s = session.current
    s.listening = false
    s.recognition?.stop()
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
    s.recorder.start()
    s.audioCtx = new AudioContext()
    s.analyser = s.audioCtx.createAnalyser()
    s.analyser.fftSize = 64
    s.audioCtx.createMediaStreamSource(stream).connect(s.analyser)
    if (SpeechRecognition) listen()
    setSec(0)
    setLive('')
    setPhase('recording')
  }

  const pause = () => {
    const s = session.current
    stopListening()
    s.recorder.pause()
    setPhase('paused')
  }
  const resume = () => {
    const s = session.current
    s.recorder.resume()
    s.listening = !!s.recognition
    try {
      s.recognition?.start()
    } catch {
      // still winding down from the pause; onend restarts it
    }
    setPhase('recording')
  }
  const stop = () => {
    const s = session.current
    stopListening()
    s.recorder.onstop = () => {
      s.audioUrl = URL.createObjectURL(new Blob(s.chunks, { type: s.recorder.mimeType }))
      s.stream.getTracks().forEach((t) => t.stop())
    }
    s.recorder.stop()
    setPhase('transcribing')
  }

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => setSec((v) => v + 1), 1000)
    // The waveform follows the live microphone level.
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
      let current = true
      // Give the recogniser a moment to deliver its last result.
      const t = setTimeout(() => {
        const s = session.current
        const browserText = [...s.finals, s.interim].filter(Boolean).join('. ')
        const edit = (heard, by) => {
          if (!current) return
          setText(heard)
          setHeardBy(by)
          setPhase('editing')
        }
        if (!s.chunks.length) {
          if (browserText) return edit(browserText, 'browser')
          return fail("We couldn't process the recording. No speech was detected. Please try again.")
        }
        const audio = new Blob(s.chunks, { type: s.recorder.mimeType || 'audio/webm' })
        api.classJournals
          .transcribe(classId, audio, browserText)
          .then((heard) => {
            s.uploadedUrl = heard.audioUrl
            edit(heard.transcript, heard.transcriptSource)
          })
          .catch((err) => (browserText ? edit(browserText, 'browser') : current && fail(`We couldn't process the recording. ${errorText(err)}`)))
      }, 1500)
      return () => {
        current = false
        clearTimeout(t)
      }
    }
    if (phase === 'processing') {
      let current = true
      const s = session.current
      // The text the teacher confirmed goes to the server: the AI sorts it into the journal structure, and code
      // checks names, contradictions, health information and attendance.
      api.classJournals
        .voiceDraft({ classId, transcript: text.trim(), audioUrl: s.uploadedUrl, journalId, date })
        .then(
          (draft) =>
            current &&
            done.current({
              transcript: draft.transcript,
              sections: draft.sections,
              personal: draft.personal,
              issues: draft.issues || [],
              audio: draft.audioUrl ? [draft.audioUrl] : [],
              audioUrl: s.audioUrl,
            }),
        )
        .catch((err) => current && fail(`We couldn't create the draft. ${errorText(err)}`))
      return () => {
        current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Enter makes the draft; Shift+Enter starts a new line. While a Vietnamese keyboard is still composing a
  // letter, Enter belongs to the keyboard.
  const submitOnEnter = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (text.trim()) setPhase('processing')
  }

  const supported = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const stepNow = { transcribing: 1, editing: 2, processing: 3 }[phase] ?? 0
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
            <p className="muted">Tap the microphone and describe the day in Vietnamese: meals, learning, nap, health and mood. Your browser will ask to use the microphone.</p>
          ) : (
            <p className="muted">Voice recording is not available in this browser. Please write the journal manually.</p>
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

      {phase === 'editing' && (
        <>
          <h2>Check what was heard</h2>
          <p className="muted">
            Correct names and words if needed, then press <strong>Enter</strong> to make the draft. Shift+Enter starts a new line.
            {heardBy === 'browser' && ' (Heard by the browser: check the children’s names carefully.)'}
          </p>
          {session.current.audioUrl && <audio className="rec-audio" controls src={session.current.audioUrl} />}
          <textarea className="rec-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={submitOnEnter} aria-label="What you said" autoFocus />
          <div className="rec-controls">
            <button className="btn btn-primary" onClick={() => setPhase('processing')} disabled={!text.trim()}>
              <Sparkles size={18} /> Create Draft ⏎
            </button>
            <button className="btn" onClick={() => setPhase('idle')}>
              <Mic size={18} /> Record Again
            </button>
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
          {steps}
        </>
      )}

      {(phase === 'transcribing' || phase === 'processing') && (
        <>
          <span className="ring" aria-hidden="true" />
          <h2 aria-live="polite">{phase === 'transcribing' ? 'Transcribing your voice...' : 'Generating journal draft...'}</h2>
          <p className="muted">{phase === 'transcribing' ? 'Turning your recording into text.' : 'Organising the text into journal sections for you to review.'}</p>
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

const ISSUE_TITLES = {
  unknown_student: 'Name not in the class',
  ambiguous_student: 'Which child?',
  name_mismatch: 'Name does not match exactly',
  missing_student: 'No name given',
  child_named_in_class_text: 'Names a child, but shown to every parent',
  contradiction: 'Statements disagree',
  unclear: 'Unclear',
  health_alert: 'Health information to check',
  unsupported_content: 'Words the teacher did not say',
  attendance_mismatch: 'Does not match attendance',
  correction: 'Corrected by a later recording',
}

// What the system could not decide on its own. A held statement is not in the journal yet: the teacher puts
// it in a child's note, keeps it for the whole class, or leaves it out. Other points are confirmed once checked.
function ReviewIssues({ issues, students, onResolve }) {
  const [chosen, setChosen] = useState({})
  const groups = groupIssues(issues)
  const resolveAll = (group, resolution, childId) => group.forEach((issue) => onResolve(issue, resolution, childId))
  return (
    <div className="card">
      <div className="card-head">
        <h2>
          <AlertTriangle size={18} /> Needs your confirmation
        </h2>
        <span className="chip">{groups.length} to check</span>
      </div>
      <span className="muted small">Nothing below is sent to parents until you decide. KinderLog never guesses a child or diagnoses.</span>
      {groups.map((group) => {
        const [issue] = group
        const options = [...issue.candidates, ...students.map((s) => s.id).filter((id) => !issue.candidates.includes(id))]
          .map((id) => students.find((s) => s.id === id))
          .filter(Boolean)
          .map((s) => ({ value: s.id, label: issue.candidates.includes(s.id) ? `${s.name} (closest match)` : s.name }))
        const child = chosen[issue.id] ?? issue.candidates[0] ?? ''
        const several = group.length > 1
        return (
          <div key={issue.id} className="j-section">
            <div className="j-section-head">
              <span>
                <strong>{ISSUE_TITLES[issue.type] || 'Check'}</strong>
                {issue.spokenNames.length > 0 && <span className="chip">heard: {issue.spokenNames.join(', ')}</span>}
                {several && <span className="chip">{group.length} statements</span>}
              </span>
            </div>
            <span className="block">{issue.message}</span>
            {issue.previousText ? (
              <span className="muted block small">
                Before: <s>“{issue.previousText}”</s>
                <br />
                Now: “{issue.text}”
              </span>
            ) : (
              group.map(
                (i) =>
                  i.text && (
                    <span key={i.id} className="muted block small">
                      “{i.text}”
                    </span>
                  ),
              )
            )}
            {issue.held ? (
              <div className="toolbar">
                <Select value={child} onChange={(v) => setChosen((p) => ({ ...p, [issue.id]: v }))} options={options} placeholder="Choose the child" aria-label="Child" />
                <button className="btn btn-sm btn-primary" disabled={!child} onClick={() => resolveAll(group, 'assigned', child)}>
                  {several ? "Add all to this child's note" : "Add to this child's note"}
                </button>
                <button className="btn btn-sm" onClick={() => resolveAll(group, 'class')}>
                  {issue.type === 'child_named_in_class_text' ? 'Keep for the whole class' : 'For the whole class'}
                </button>
                <button className="btn btn-sm" onClick={() => resolveAll(group, 'discarded')}>
                  {several ? 'Leave all out' : 'Leave out'}
                </button>
              </div>
            ) : (
              <div className="toolbar">
                <button className="btn btn-sm" onClick={() => resolveAll(group, 'confirmed')}>
                  <CheckCircle2 size={14} /> I checked this
                </button>
                {issue.previousText && (
                  <button className="btn btn-sm" onClick={() => resolveAll(group, 'reverted')}>
                    Keep the earlier statement too
                  </button>
                )}
                <span className="muted small">Correct the text in the sections below if needed.</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// The teacher's decisions on the points of a voice draft, as PUT /class-journals/:id takes them.
const decisionsOf = (issues) => issues.map((i) => ({ id: i.id, status: i.status, resolution: i.resolution, assignedTo: i.assignedTo }))

function JournalEditor({ cls, students, absentIds, initial, onClose, onChanged }) {
  const { db } = useStore()
  const toast = useToast()
  const [journal, setJournal] = useState(initial)
  const [sections, setSections] = useState(initial.sections)
  const [personal, setPersonal] = useState(initial.personal || {})
  const [photos, setPhotos] = useState(initial.photos)
  const [status, setStatus] = useState(initial.status)
  // Points of a voice draft the teacher must confirm before approving (names, contradictions, health).
  const [issues, setIssues] = useState(initial.issues || [])
  const [audios, setAudios] = useState(initial.audio || [])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [leave, setLeave] = useState(false)
  const maxPhotos = Number(db.settings.maxPhotos) || 6
  const voice = journal.source === 'voice'
  const unapproved = voice ? 'review' : 'draft'
  const noted = students.filter((s) => s.id in personal)
  const personalCount = noted.filter((s) => personal[s.id].trim()).length
  const filled = filledCount(sections)
  const openIssues = issues.filter((i) => i.status === 'open')
  // Published before: parents see the published version until a change is approved and published again.
  const wasPublished = journal.revision > 0

  const load = (j) => {
    setJournal(j)
    setSections(j.sections)
    setPersonal(j.personal)
    setPhotos(j.photos)
    setStatus(j.status)
    setIssues(j.issues)
    setAudios(j.audio)
    setDirty(false)
    onChanged()
  }

  // Any change after approval or publishing needs the teacher to approve again before publishing.
  const touch = () => {
    setDirty(true)
    if (status === 'approved' || status === 'published') setStatus(unapproved)
  }
  const content = () => ({ sections, personal: Object.fromEntries(Object.entries(personal).filter(([, text]) => text.trim())), photos })
  const save = async () => load(await api.classJournals.update(journal.id, { ...content(), issues: decisionsOf(issues) }))

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
    await save()
    toast('Draft saved.')
  })

  const approve = run('approve', async () => {
    if (openIssues.length) return toast(`${openIssues.length} ${openIssues.length === 1 ? 'point still needs' : 'points still need'} your confirmation before approving.`, 'error')
    if (filled === 0 && personalCount === 0) return toast('Add content to at least one section before approving.', 'error')
    if (dirty) await save()
    load(await api.classJournals.approve(journal.id))
    toast('Journal approved. You can now publish it.')
  })

  const publish = run('publish', async () => {
    await api.classJournals.publish(journal.id)
    setConfirm(false)
    toast(wasPublished ? 'Changes published. Parents now see the updated journal.' : 'Journal published successfully.')
    onChanged()
    onClose()
  })

  const setNote = (id, text) => {
    setPersonal((p) => ({ ...p, [id]: text }))
    touch()
  }

  // Another recording adds to the draft instead of replacing it, and always sends it back to review. Unsaved changes
  // are saved first, so the server adds the new text to what is on screen.
  const addRecording = async (draft) => {
    if (dirty) await save()
    const res = await api.classJournals.addRecording(journal.id, {
      sections: draft.sections,
      personal: draft.personal,
      transcript: draft.transcript,
      audioUrl: draft.audio[0],
      issues: draft.issues,
    })
    load(res)
    setRecording(false)
    toast('Added to the draft. Please review the new text.')
  }

  const pickPhotos = async (e) => {
    const files = [...e.target.files].slice(0, Math.max(0, maxPhotos - photos.length))
    e.target.value = ''
    if (!files.length) return
    setBusy('photos')
    try {
      const { urls } = await api.classJournals.uploadPhotos(files)
      setPhotos((p) => [...p, ...urls])
      touch()
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy('')
    }
  }

  // The teacher's decision on one point. A held statement goes where the teacher says; nothing else changes text.
  const resolveIssue = (issue, resolution, childId) => {
    if (resolution === 'assigned') {
      const children = [...new Set([...(issue.studentIds || []), childId])]
      setPersonal((p) => ({ ...p, ...Object.fromEntries(children.map((id) => [id, joinText(p[id], issue.text)])) }))
    }
    if (resolution === 'class') setSections((p) => ({ ...p, [issue.section]: joinText(p[issue.section], issue.text) }))
    // Undoing a correction keeps the earlier statement as well, where it was.
    if (resolution === 'reverted') {
      const [child] = issue.studentIds || []
      if (child) setPersonal((p) => ({ ...p, [child]: joinText(issue.previousText, p[child]) }))
      else setSections((p) => ({ ...p, [issue.section]: joinText(issue.previousText, p[issue.section]) }))
    }
    setIssues((list) => list.map((i) => (i.id === issue.id ? { ...i, status: 'resolved', resolution, assignedTo: resolution === 'assigned' ? [childId] : [] } : i)))
    touch()
  }

  return (
    <div className="narrow wide">
      <PageHeader
        back={
          <button className="back-link" onClick={() => (dirty ? setLeave(true) : onClose())}>
            <ArrowLeft size={16} /> Daily Journal
          </button>
        }
        title={`Journal · ${dayLabel(journal.date)}`}
        subtitle={`${cls.name} · ${fmtLongDate(journal.date)}`}
        actions={<StatusBadge status={JOURNAL_STATUS[status]} />}
      />

      {voice && status === 'review' && (
        <div className="alert alert-info">
          <Sparkles size={18} />
          <span>
            <strong>AI-generated draft — Please review.</strong> Check every section, correct mistakes and add what is missing. Nothing is sent to parents until you approve and
            publish.
          </span>
        </div>
      )}

      {wasPublished && (
        <div className="alert alert-info">
          <Send size={18} />
          <span>
            {status === 'published' ? (
              <>
                <strong>This journal is published.</strong> You can still change it. Parents keep seeing the published version until you approve and publish your changes.
              </>
            ) : (
              <>
                <strong>Changed after publishing.</strong> Parents still see the published version. Approve and publish to send them the update.
              </>
            )}
          </span>
        </div>
      )}

      {openIssues.length > 0 && <ReviewIssues issues={openIssues} students={students} onResolve={resolveIssue} />}

      {db.settings.aiJournal && (
        <div className="card">
          <div className="row-between">
            <span>
              <strong>{voice ? 'Forgot something?' : 'Prefer to speak?'}</strong>
              <span className="muted block small">Record {voice ? 'again' : 'with your voice'}: the new text is added to this draft, nothing is replaced.</span>
            </span>
            <button className="btn" onClick={() => setRecording(true)}>
              <Mic size={18} /> {voice ? 'Record more' : 'Record with voice'}
            </button>
          </div>
          {voice && journal.transcript && (
            <details>
              <summary>
                <strong>What you said</strong> <span className="muted small">— transcript of your recording{audios.length > 1 ? 's' : ''}</span>
              </summary>
              {audios.map((url) => (
                <audio key={url} className="rec-audio" controls src={url} />
              ))}
              <p className="transcript">{journal.transcript}</p>
            </details>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>For the whole class</h2>
          <span className="chip">
            <Users size={14} /> All parents of {cls.name}
          </span>
        </div>
        {JOURNAL_SECTIONS.map((s) => {
          const Icon = SECTION_ICON[s.key]
          return (
            <div key={s.key} className="j-section">
              <div className="j-section-head">
                <span>
                  <Icon size={18} /> <label htmlFor={`j-${s.key}`}>{s.label}</label>
                </span>
                {sections[s.key] && (
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setSections((p) => ({ ...p, [s.key]: '' }))
                      touch()
                    }}
                  >
                    <Eraser size={14} /> Clear
                  </button>
                )}
              </div>
              <textarea
                id={`j-${s.key}`}
                rows={s.key === 'note' ? 3 : 2}
                value={sections[s.key]}
                placeholder={s.key === 'note' ? 'Reminders and notes for all parents of the class' : `Write about ${s.label.toLowerCase()}`}
                onChange={(e) => {
                  setSections((p) => ({ ...p, [s.key]: e.target.value }))
                  touch()
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>For individual children</h2>
          <span className="chip">
            <Lock size={14} /> Only that child's parents
          </span>
        </div>
        <span className="muted small">When you say a child's name while recording, that sentence lands here instead of in the class journal.</span>
        {noted.map((s) => (
          <div key={s.id} className="j-section">
            <div className="j-section-head">
              <span>
                <Avatar name={s.name} src={s.photo} size={28} /> <label htmlFor={`p-${s.id}`}>{s.name}</label>
                {absentIds.has(s.id) && <span className="chip">Absent this day</span>}
              </span>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setPersonal(({ [s.id]: _removed, ...rest }) => rest)
                  touch()
                }}
              >
                <Eraser size={14} /> Remove
              </button>
            </div>
            <textarea id={`p-${s.id}`} rows={2} value={personal[s.id]} placeholder={`A note only ${s.name}'s parents will see`} onChange={(e) => setNote(s.id, e.target.value)} />
          </div>
        ))}
        {noted.length < students.length && (
          <Select
            value=""
            onChange={(id) => id && setNote(id, '')}
            options={students.filter((s) => !(s.id in personal)).map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Add a note for a child…"
            aria-label="Add a note for a child"
          />
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Photos</h2>
          <span className="muted small">
            {photos.length} of {maxPhotos}
          </span>
        </div>
        <div className="photos">
          {photos.map((p, i) => (
            <PhotoTile
              key={p}
              src={p}
              onRemove={() => {
                setPhotos((list) => list.filter((_, j) => j !== i))
                touch()
              }}
            />
          ))}
          {photos.length < maxPhotos && (
            <label className="photo photo-add">
              <ImagePlus size={24} />
              <span>{busy === 'photos' ? 'Uploading…' : 'Add photo'}</span>
              <input type="file" accept="image/*" multiple hidden onChange={pickPhotos} disabled={busy === 'photos'} />
            </label>
          )}
        </div>
      </div>

      <div className="card">
        <div className="principle">
          <Sparkles size={16} /> AI suggests <ArrowRight size={14} /> Teacher verifies <ArrowRight size={14} /> <strong>Teacher decides</strong>
        </div>
        <div className="editor-actions">
          <button className="btn" disabled={!!busy || status === 'published'} onClick={saveDraft}>
            <Save size={18} /> {busy === 'save' ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="btn" onClick={() => setPreview(true)}>
            <Eye size={18} /> Preview
          </button>
          <button className="btn" onClick={approve} disabled={!!busy || (status === 'approved' && !dirty) || status === 'published' || openIssues.length > 0}>
            <CheckCircle2 size={18} /> {busy === 'approve' ? 'Approving…' : status === 'approved' ? 'Approved' : 'Approve'}
          </button>
          <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={!!busy || status !== 'approved' || dirty}>
            <Send size={18} /> {wasPublished ? 'Publish Changes' : 'Publish'}
          </button>
        </div>
        {openIssues.length > 0 ? (
          <span className="muted small">Confirm the {openIssues.length === 1 ? 'point' : `${openIssues.length} points`} above to enable approving.</span>
        ) : (
          status !== 'approved' && status !== 'published' && <span className="muted small">Approve the journal after reviewing it to enable publishing.</span>
        )}
      </div>

      <Modal open={preview} title="Preview — as parents will see it" onClose={() => setPreview(false)}>
        {filled === 0 && personalCount === 0 && photos.length === 0 ? (
          <EmptyState title="Nothing to preview yet." text="Write at least one section first." />
        ) : (
          <JournalTimeline journal={content()} students={students} />
        )}
      </Modal>

      <Modal open={recording} title="Record more" onClose={() => setRecording(false)}>
        {recording && (
          <Recorder
            classId={cls.id}
            journalId={journal.id}
            date={journal.date}
            onDone={(d) => addRecording(d).catch((e) => toast(errorText(e), 'error'))}
            onCancel={() => setRecording(false)}
          />
        )}
      </Modal>

      <Modal
        open={confirm}
        title={wasPublished ? 'Publish these changes to parents?' : 'Ready to publish this journal to parents?'}
        onClose={() => setConfirm(false)}
        size="sm"
        footer={
          <>
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={publish} disabled={busy === 'publish'}>
              {busy === 'publish' ? 'Publishing…' : 'Publish Journal'}
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
            <dd>{fmtDate(journal.date)}</dd>
          </div>
          <div>
            <dt>Completed sections</dt>
            <dd>
              {filled} of {JOURNAL_SECTIONS.length}
            </dd>
          </div>
          <div>
            <dt>Individual notes</dt>
            <dd>{personalCount ? `${personalCount} (private to each family)` : 'None'}</dd>
          </div>
          <div>
            <dt>Photos</dt>
            <dd>{photos.length}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={JOURNAL_STATUS[status]} />
            </dd>
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
  { key: 'draft', label: 'Drafts', match: (j) => j.status === 'draft' },
  { key: 'review', label: 'Needs Review', match: (j) => j.status === 'review' || j.status === 'approved' },
  { key: 'published', label: 'Published', match: (j) => j.status === 'published' },
]

export function DailyJournalPage() {
  const cls = useMyClass()
  if (!cls) return <NoClass />
  return <JournalWorkspace cls={cls} />
}

function JournalWorkspace({ cls }) {
  const { db } = useStore()
  const toast = useToast()
  const today = todayISO()
  const [date, setDate] = useJournalDate()
  const [view, setView] = useState({ mode: 'home' }) // home | record | edit | read
  const [tab, setTab] = useState('all')
  const list = useApi(() => api.classJournals.list(cls.id), [cls.id])
  // The day's register: the children of the class and who was absent.
  const day = useApi(() => api.journals.classDay(cls.id, date), [cls.id, date])
  const opened = useApi(() => (view.id ? api.classJournals.get(view.id) : Promise.resolve(null)), [view.id, view.mode])

  const aiOn = db.settings.aiJournal
  const history = list.data?.items || []
  const journal = history.find((j) => j.date === date)
  const shown = history.filter(HISTORY_TABS.find((t) => t.key === tab).match)
  const students = (day.data?.students || []).map(({ student }) => ({ id: student.id, name: student.fullName, photo: student.avatarUrl }))
  const absentIds = new Set((day.data?.students || []).filter(({ journal: j }) => j?.attendance === 'ABSENT').map(({ student }) => student.id))

  const create = async (source, { audioUrl: _local, ...draft } = {}) => {
    try {
      const j = await api.classJournals.create({ classId: cls.id, date, source, ...draft })
      list.reload()
      setView({ mode: 'edit', id: j.id })
      if (source === 'voice') toast('Draft ready. Please review it.')
    } catch (e) {
      toast(errorText(e), 'error')
      if (e.status === 409) list.reload()
    }
  }
  // The backend decides: a teacher changes today's journal only, earlier days are read-only (the principal corrects them).
  const canWrite = date >= today
  const open = (j) => {
    setDate(j.date)
    setView({ mode: j.status === 'published' || !j.editable ? 'read' : 'edit', id: j.id })
  }
  const home = () => setView({ mode: 'home' })

  if (view.mode === 'record')
    return (
      <div className="narrow">
        <PageHeader title="Record with Voice" subtitle={`${cls.name} · ${fmtLongDate(date)}`} />
        <Recorder classId={cls.id} date={date} onCancel={home} onDone={(draft) => create('voice', draft)} />
      </div>
    )

  if (view.mode === 'edit' || view.mode === 'read') {
    const current = opened.data
    if (!current || current.id !== view.id || !day.data || day.data.date !== current.date) return <SkeletonTable />
    if (view.mode === 'edit' && current.editable)
      return <JournalEditor key={current.id} cls={cls} students={students} absentIds={absentIds} initial={current} onChanged={list.reload} onClose={home} />
    const published = current.status === 'published'
    return (
      <div className="narrow wide">
        <PageHeader
          back={
            <button className="back-link" onClick={home}>
              <ArrowLeft size={16} /> Daily Journal
            </button>
          }
          title={`Journal · ${dayLabel(current.date)}`}
          subtitle={
            published
              ? `${cls.name} · published ${relTime(current.publishedAt)}${current.editedAt ? ` · updated ${relTime(current.editedAt)}` : ''}`
              : `${cls.name} · not published · last edited ${relTime(current.updatedAt)}`
          }
          actions={
            <>
              <StatusBadge status={JOURNAL_STATUS[current.status]} />
              {current.editable && (
                <button className="btn" onClick={() => setView({ mode: 'edit', id: current.id })}>
                  <PenLine size={18} /> Edit Journal
                </button>
              )}
            </>
          }
        />
        {!current.editable && (
          <p className="privacy-note">
            <Lock size={16} /> Read only: a journal can be changed on its own day only. Ask the principal to correct an earlier day.
          </p>
        )}
        <div className="card">
          <JournalTimeline journal={current} students={students} />
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Daily Journal"
        subtitle={`${cls.name} · ${fmtLongDate(date)}`}
        actions={<input type="date" className="date-input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Journal date" />}
      />

      <Loadable
        q={list}
        skeleton={
          <section className="card">
            <Skeleton h={90} />
          </section>
        }
      >
        {() =>
          journal ? (
            <section className="card">
              <div className="row-between">
                <div>
                  <h2>Journal for {date === today ? 'today' : fmtDate(date)}</h2>
                  <span className="muted small">
                    {journal.source === 'voice' ? 'Created with voice (AI-assisted)' : 'Written manually'} · last edited {relTime(journal.updatedAt)}
                  </span>
                </div>
                <StatusBadge status={JOURNAL_STATUS[journal.status]} />
              </div>
              <div>
                <button className="btn btn-primary" onClick={() => open(journal)}>
                  {journal.status === 'published' || !journal.editable ? (
                    <>
                      <Eye size={18} /> View Journal
                    </>
                  ) : (
                    <>
                      <PenLine size={18} /> {journal.status === 'review' ? 'Review Draft' : 'Continue Editing'}
                    </>
                  )}
                </button>
              </div>
            </section>
          ) : !canWrite ? (
            <div className="card">
              <EmptyState
                icon={Lock}
                title={`No journal for ${fmtDate(date)}.`}
                text="A journal can be written on its own day only. Ask the principal to add or correct an earlier day."
              />
            </div>
          ) : (
            <section className="stack">
              <div className="choice-grid">
                <button className="choice primary" onClick={() => setView({ mode: 'record' })} disabled={!aiOn}>
                  <span className="action-icon tint-mint">
                    <Mic size={24} />
                  </span>
                  <strong>Record with Voice</strong>
                  <span className="muted">
                    {aiOn ? 'Describe the day in Vietnamese. AI prepares a draft for you to review and edit.' : 'AI-assisted drafts are turned off by the system administrator.'}
                  </span>
                </button>
                <button className="choice" onClick={() => create('manual')}>
                  <span className="action-icon tint-cream">
                    <PenLine size={24} />
                  </span>
                  <strong>Write Manually</strong>
                  <span className="muted">Type each section yourself: meal, learning, sleep, health, emotion and notes.</span>
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
      <Loadable q={list} skeleton={<SkeletonTable rows={4} />}>
        {() =>
          shown.length === 0 ? (
            <div className="card">
              <EmptyState icon={BookOpen} title={history.length === 0 ? 'No journals yet.' : 'No journals with this status.'} />
            </div>
          ) : (
            <div className="card table-card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Status</th>
                    <th>Last edited</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((j) => (
                    <tr key={j.id}>
                      <td data-label="Date" className="td-primary">
                        {dayLabel(j.date)}
                      </td>
                      <td data-label="Class">{cls.name}</td>
                      <td data-label="Status">
                        <StatusBadge status={JOURNAL_STATUS[j.status]} />
                        {j.unpublishedChanges && <span className="muted block small">Published before · changes not sent yet</span>}
                      </td>
                      <td data-label="Last edited">{relTime(j.updatedAt)}</td>
                      <td data-label="Actions" className="td-plain" style={{ textAlign: 'right' }}>
                        <button className="btn btn-sm" onClick={() => open(j)}>
                          {j.status === 'published' || !j.editable ? 'View' : 'Open'}
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
