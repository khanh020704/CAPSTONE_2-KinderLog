import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
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
  StickyNote,
  Users,
  TriangleAlert,
} from 'lucide-react'
import { attendanceCounts, attendanceOf, byId, classOfTeacher, journalOf, linksOfStudent, studentsOfClass, unreadMessages, useStore } from '../store/store'
import * as remote from '../store/remote'
import { JOURNAL_SECTIONS, JOURNAL_STATUS, dayLabel, fmtDate, fmtLongDate, applyCorrections, greeting, groupIssues, joinNew, norm, readFileAsDataURL, relTime, todayISO, uid } from '../lib/utils'
import { JournalTimeline, SECTION_ICON } from '../components/Journal'
import { Avatar, ConfirmDialog, EmptyState, Modal, PageHeader, PhotoTile, SearchInput, SegBar, Select, SkeletonCards, StatCard, StatusBadge, useFakeLoad, useToast } from '../components/ui'

function useMyClass() {
  const { db, user } = useStore()
  const cls = classOfTeacher(db, user.id)
  return { cls, students: cls ? studentsOfClass(db, cls.id).filter((s) => s.status === 'Active') : [] }
}

// The day the teacher works on, shared by the Dashboard, Attendance and Daily Journal and kept while the
// teacher moves between pages in this tab: a day picked on one page is the day of the others too.
// A day remembered from an earlier date is never in the future, so after midnight the pages still open on a valid day.
const WORKING_DATE_KEY = 'kinderlog.date.teacher'

function useWorkingDate() {
  const key = WORKING_DATE_KEY
  const today = todayISO()
  const [date, setDate] = useState(() => {
    try {
      const kept = sessionStorage.getItem(key)
      return kept && kept <= today ? kept : today
    } catch {
      return today
    }
  })
  const choose = (next) => {
    setDate(next)
    try {
      sessionStorage.setItem(key, next)
    } catch {
      // storage unavailable: the day is kept until the page is left
    }
  }
  return [date, choose]
}

function NoClass() {
  return (
    <div className="card">
      <EmptyState icon={Users} title="You have not been assigned to a class yet." text="Please contact your principal." />
    </div>
  )
}

const journalLabel = (j) => (j ? JOURNAL_STATUS[j.status] : 'Not Started')

// ---------- Dashboard ----------

export function TeacherDashboard() {
  const { db, user } = useStore()
  const { cls, students } = useMyClass()
  const loading = useFakeLoad()
  // The dashboard shows the working day: the one picked here, on Attendance or on Daily Journal.
  const [date, setDate] = useWorkingDate()
  const today = todayISO()
  const isToday = date === today
  const when = isToday ? 'today' : `on ${fmtDate(date)}`
  if (!cls)
    return (
      <>
        <PageHeader title={`${greeting()}, ${user.name}`} />
        <NoClass />
      </>
    )

  const att = attendanceCounts(db, cls.id, date)
  const journal = journalOf(db, cls.id, date)
  const pending = db.journals.filter((j) => j.classId === cls.id && j.status === 'review').length
  const unread = unreadMessages(db, user)

  return (
    <>
      <div className="hero">
        <div>
          <h1>
            {greeting()}, {user.name}
          </h1>
          <p className="muted">{fmtLongDate(date)}</p>
        </div>
        <div className="hero-class">
          <span className="muted small">Your class</span>
          <strong>{cls.name}</strong>
          <span className="toolbar">
            <input type="date" className="date-input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Working day" />
            {!isToday && (
              <button className="btn btn-sm" onClick={() => setDate(today)}>
                Today
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="actions-grid">
        <Link to="/teacher/journal" className="action-card primary">
          <span className="action-icon">
            <BookOpen size={24} />
          </span>
          <span className="action-text">
            <strong>{journal ? 'Continue Daily Journal' : 'Create Daily Journal'}</strong>
            <span>{journal ? `${isToday ? "Today's" : `${fmtDate(date)}`} journal: ${journalLabel(journal)}` : 'Record with your voice or write it yourself'}</span>
          </span>
          <ArrowRight size={20} />
        </Link>
        <Link to="/teacher/attendance" className="action-card">
          <span className="action-icon tint-mint">
            <ClipboardCheck size={24} />
          </span>
          <span className="action-text">
            <strong>Take Attendance</strong>
            <span>{att.recorded ? `${att.present} present · ${att.absent} absent` : `Not recorded yet ${when}`}</span>
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

      {loading ? (
        <SkeletonCards count={5} />
      ) : (
        <div className="grid stats">
          <StatCard icon={Users} label="Students" value={students.length} tint="peach" />
          <StatCard icon={ClipboardCheck} label="Attendance" value={att.recorded ? `${att.present} / ${att.total}` : '—'} hint={att.recorded ? `present ${when}` : 'not recorded'} tint="mint" />
          <StatCard icon={BookOpen} label="Journal status" value={journalLabel(journal)} hint={isToday ? 'today' : fmtDate(date)} tint="cream" />
          <StatCard icon={Sparkles} label="Pending reviews" value={pending} hint="AI drafts to review" tint="lav" />
          <StatCard icon={MessageCircle} label="Unread parent messages" value={unread} tint="sky" />
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h2>{isToday ? "Today's attendance" : `Attendance · ${fmtDate(date)}`}</h2>
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
  )
}

// ---------- My Class (read-only roster: students are managed by the principal) ----------

const ageOf = (dob) => {
  const months = Math.floor((Date.now() - new Date(`${dob}T00:00:00`).getTime()) / (30.44 * 86400000))
  return months < 24 ? `${months} months` : `${Math.floor(months / 12)} years old`
}

export function MyClassPage() {
  const { db } = useStore()
  const { cls, students } = useMyClass()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  if (!cls) return <NoClass />

  const today = attendanceOf(db, cls.id, todayISO())
  const statusOf = (s) => ({ present: 'Present', absent: 'Absent' })[today?.records[s.id]?.status] || 'Not recorded'
  const list = students.filter((s) => norm(s.name).includes(norm(q)))

  return (
    <>
      <PageHeader title="My Class" subtitle={`${cls.name} · ${students.length} students`} />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search student" />
      </div>
      {students.length === 0 ? (
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
              <Avatar name={s.name} src={s.photo} size={48} />
              <span>
                <strong>{s.name}</strong>
                <span className="muted small">
                  {s.gender} · {ageOf(s.dob)}
                </span>
              </span>
              <StatusBadge status={statusOf(s)} />
            </button>
          ))}
        </div>
      )}
      <p className="privacy-note">
        <ShieldCheck size={16} /> Students are added and removed by the principal. Changes appear here automatically.
      </p>

      <Modal open={!!open} title="Student Details" onClose={() => setOpen(null)}>
        {open && (
          <div className="stack">
            <div className="profile-top">
              <Avatar name={open.name} src={open.photo} size={64} />
              <div>
                <h2>{open.name}</h2>
                <span className="muted">{cls.name}</span>
                <StatusBadge status={statusOf(open)} />
              </div>
            </div>
            <dl className="details">
              <div>
                <dt>Date of Birth</dt>
                <dd>{fmtDate(open.dob)}</dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd>{open.gender}</dd>
              </div>
              {linksOfStudent(db, open.id)
                .filter((l) => l.status === 'Active')
                .map((l) => {
                  const p = byId(db.parents, l.parentId)
                  return (
                    p && (
                      <div key={l.id}>
                        <dt>{l.relationship}</dt>
                        <dd>
                          {p.name}
                          <span className="muted block small">{p.phone}</span>
                        </dd>
                      </div>
                    )
                  )
                })}
              <div>
                <dt>Notes</dt>
                <dd>{open.note || 'No notes'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </>
  )
}

// ---------- Attendance ----------

export function AttendancePage() {
  const { db, mutate, log } = useStore()
  const toast = useToast()
  const { cls, students } = useMyClass()
  const today = todayISO()
  const [date, setDate] = useWorkingDate()
  const [recs, setRecs] = useState({})
  const [noteOpen, setNoteOpen] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const saved = cls && attendanceOf(db, cls.id, date)

  // Load the saved sheet when the day changes; local edits stay until Save.
  useEffect(() => {
    setRecs(saved?.records || {})
    setNoteOpen({})
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls?.id, date])

  // Older days arrive from the server in the background, possibly after the day was picked: show the sheet
  // when it comes, unless the teacher has already started changing this day.
  useEffect(() => {
    if (!dirty) setRecs(saved?.records || {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.savedAt])

  if (!cls) return <NoClass />

  const set = (id, patch) => {
    setRecs((p) => ({ ...p, [id]: { status: p[id]?.status, note: p[id]?.note || '', ...patch } }))
    setDirty(true)
  }
  const markAll = () => {
    setRecs((p) => Object.fromEntries(students.map((s) => [s.id, { status: 'present', note: p[s.id]?.status === 'present' ? p[s.id].note : '' }])))
    setDirty(true)
  }
  const present = students.filter((s) => recs[s.id]?.status === 'present').length
  const absent = students.filter((s) => recs[s.id]?.status === 'absent').length
  const unmarked = students.length - present - absent

  const save = () => {
    setSaving(true)
    setTimeout(() => {
      mutate((prev) => ({
        attendance: [...prev.attendance.filter((a) => !(a.classId === cls.id && a.date === date)), { date, classId: cls.id, savedAt: Date.now(), records: recs }],
      }))
      log('Update', 'Attendance', `Attendance saved: ${cls.name}`)
      setSaving(false)
      setDirty(false)
      toast('Attendance saved.')
    }, 450)
  }

  return (
    <div className="narrow wide">
      <PageHeader
        title="Attendance"
        subtitle={`${cls.name} · ${dayLabel(date)}${saved ? ` · saved ${relTime(saved.savedAt)}` : ''}`}
        actions={<input type="date" className="date-input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />}
      />
      {students.length === 0 ? (
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
              const showNote = noteOpen[s.id] || r?.note || r?.status === 'absent'
              return (
                <div key={s.id} className="att-row">
                  <div className="att-who">
                    <Avatar name={s.name} src={s.photo} size={42} />
                    <strong>{s.name}</strong>
                  </div>
                  <div className="att-controls">
                    <div className="att-toggle" role="group" aria-label={`Attendance for ${s.name}`}>
                      <button className={r?.status === 'present' ? 'on-present' : ''} aria-pressed={r?.status === 'present'} onClick={() => set(s.id, { status: 'present' })}>
                        Present
                      </button>
                      <button className={r?.status === 'absent' ? 'on-absent' : ''} aria-pressed={r?.status === 'absent'} onClick={() => set(s.id, { status: 'absent' })}>
                        Absent
                      </button>
                    </div>
                    <button className="icon-btn" onClick={() => setNoteOpen((p) => ({ ...p, [s.id]: !p[s.id] }))} aria-label={`Note for ${s.name}`}>
                      <StickyNote size={20} />
                    </button>
                  </div>
                  {showNote && (
                    <input
                      className="att-note"
                      value={r?.note || ''}
                      onChange={(e) => set(s.id, { note: e.target.value })}
                      placeholder={r?.status === 'absent' ? 'Reason for absence (optional)' : 'Note, e.g. arrived late (optional)'}
                      aria-label={`Note for ${s.name}`}
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
              <Save size={18} /> {saving ? 'Saving…' : dirty || !saved ? 'Save Attendance' : 'Saved'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Daily Journal ----------
// Voice → Speech-to-Text → AI draft → teacher review/edit → approve → publish. AI output is always a draft.

const emptySections = () => Object.fromEntries(JOURNAL_SECTIONS.map((s) => [s.key, '']))
const filledCount = (sections) => JOURNAL_SECTIONS.filter((s) => sections[s.key]?.trim()).length
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// Speech-to-Text runs in the browser (Web Speech API, Vietnamese). Chrome and Edge support it; Firefox does not.
const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

const SECTION_KEYWORDS = {
  sleep: ['ngủ', 'giấc', 'nghỉ trưa'],
  meal: ['ăn', 'bữa', 'cơm', 'cháo', 'súp', 'canh', 'phở', 'sữa', 'uống'],
  health: ['sức khỏe', 'sức khoẻ', 'sốt', 'ho', 'ốm', 'mệt', 'đau', 'sổ mũi', 'thuốc'],
  emotion: ['vui', 'buồn', 'khóc', 'cười', 'hào hứng', 'ngoan', 'hoạt bát', 'thích thú'],
  learning: ['học', 'vẽ', 'hát', 'kể chuyện', 'chơi', 'hoạt động', 'tập', 'đọc', 'múa', 'tô màu', 'đếm', 'xếp hình'],
}

const CHILD_PREFIXES = ['bé', 'bạn', 'con', 'em', 'cháu']

// Which students of the class a sentence is about: by full name, by the last two words of the name ("Minh An"),
// or by "bé An" style when only one child in the class has that given name. "các bạn nam" is not a child called Nam.
function mentionedStudents(text, students) {
  const has = (k) => text.includes(` ${k} `)
  const hits = new Set()
  const byGiven = {}
  for (const s of students) {
    const words = s.name.normalize('NFC').toLowerCase().split(/\s+/)
    if (has(words.join(' ')) || has(words.slice(-2).join(' '))) hits.add(s.id)
    ;(byGiven[words[words.length - 1]] ||= []).push(s)
  }
  for (const [given, list] of Object.entries(byGiven)) {
    if (list.length === 1 && CHILD_PREFIXES.some((p) => has(`${p} ${given}`) && !has(`các ${p} ${given}`))) hits.add(list[0].id)
  }
  return [...hits]
}

const joinText = (...parts) => parts.filter((p) => p?.trim()).join(' ')

// Sorts what the teacher said into the journal. A sentence that names a child goes to that child only (`personal`);
// everything else is sorted by topic words into the sections shared with the whole class.
// This stands in for the AI drafting service until a backend is connected. The result is only ever a draft.
function draftFromTranscript(parts, students) {
  const segments = parts
    .flatMap((p) => p.split(/[.!?\n]+/))
    .flatMap((p) => (p.trim().split(/\s+/).length > 14 ? p.split(/,\s*/) : [p]))
    .map((p) => p.trim())
    .filter(Boolean)
  const buckets = Object.fromEntries(JOURNAL_SECTIONS.map((s) => [s.key, []]))
  const personal = {}
  for (const seg of segments) {
    const text = ` ${seg.normalize('NFC').toLowerCase().replace(/[,;:]/g, ' ').replace(/\s+/g, ' ')} `
    const sentence = `${seg[0].toUpperCase()}${seg.slice(1)}.`
    const about = mentionedStudents(text, students)
    if (about.length) {
      about.forEach((id) => (personal[id] = joinText(personal[id], sentence)))
      continue
    }
    const has = (k) => text.includes(` ${k} `)
    buckets[Object.keys(SECTION_KEYWORDS).find((k) => SECTION_KEYWORDS[k].some(has)) || 'note'].push(sentence)
  }
  return {
    transcript: segments.join('. '),
    sections: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.join(' ')])),
    personal,
  }
}

const STEPS = ['Record', 'Speech-to-Text', 'Check the text', 'AI draft']
const BARS = 28

// With the backend connected the recording itself is sent to the server (Whisper), so the browser's
// own speech recognition is a fallback and recording works in browsers without it.
const serverSpeech = () => remote.isActive()

function Recorder({ students, journalId, date, onDone, onCancel }) {
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
    if (s.audioCtx?.state !== 'closed') s.audioCtx?.close()
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
        const text = e.results[i][0].transcript.trim()
        if (e.results[i].isFinal) text && s.finals.push(text)
        else interim += ` ${text}`
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
        // With the backend connected, the recording goes to the server: Whisper writes the text, knowing the
        // children's names. The browser's own text is the fallback.
        if (serverSpeech() && s.chunks.length) {
          const audio = new Blob(s.chunks, { type: s.recorder.mimeType || 'audio/webm' })
          remote
            .transcribe(audio, browserText)
            .then((heard) => {
              s.uploadedUrl = heard.audioUrl
              edit(heard.transcript, heard.transcriptSource)
            })
            .catch((err) => (browserText ? edit(browserText, 'browser') : current && fail(err.message)))
          return
        }
        if (browserText) return edit(browserText, 'browser')
        fail(
          s.sttError === 'network'
            ? "We couldn't process the recording. Speech-to-Text needs an internet connection. Please try again."
            : "We couldn't process the recording. No speech was detected. Please try again.",
        )
      }, 1500)
      return () => {
        current = false
        clearTimeout(t)
      }
    }
    if (phase === 'processing') {
      const s = session.current
      const said = text.trim()
      // With the backend connected, the text the teacher confirmed goes to the server: the AI sorts it into the
      // journal structure, and code checks names, contradictions, health information and attendance.
      // Without the backend, the keyword rules above are used.
      if (serverSpeech()) {
        let current = true
        remote
          .voiceDraft(said, s.uploadedUrl, journalId, date)
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
          .catch((err) => current && fail(err.message))
        return () => {
          current = false
        }
      }
      const t = setTimeout(() => done.current({ ...draftFromTranscript([said], students), audioUrl: s.audioUrl }), 900)
      return () => clearTimeout(t)
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

  const supported = (!!SpeechRecognition || serverSpeech()) && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
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
            <p className="muted">Voice recording with Speech-to-Text is not available in this browser. Please use Chrome or Edge, or write the journal manually.</p>
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
            {live || 'Listening… start speaking.'}
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
          <textarea
            className="rec-text"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={submitOnEnter}
            aria-label="What you said"
            autoFocus
          />
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
          <TriangleAlert size={18} /> Needs your confirmation
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
              group.map((i) => i.text && <span key={i.id} className="muted block small">“{i.text}”</span>)
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

function JournalEditor({ cls, students, journal, audioUrl, onClose }) {
  const { db, upsert, notify, log } = useStore()
  const toast = useToast()
  const [sections, setSections] = useState(journal.sections)
  const [personal, setPersonal] = useState(journal.personal || {})
  const [photos, setPhotos] = useState(journal.photos)
  const [status, setStatus] = useState(journal.status)
  const [source, setSource] = useState(journal.source)
  const [transcript, setTranscript] = useState(journal.transcript || '')
  // Points of a voice draft the teacher must confirm before approving (names, contradictions, health).
  const [issues, setIssues] = useState(journal.issues || [])
  const [audios, setAudios] = useState(audioUrl ? [audioUrl] : [])
  const [dirty, setDirty] = useState(false)
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [leave, setLeave] = useState(false)
  const maxPhotos = Number(db.settings.maxPhotos) || 6
  const voice = source === 'voice'
  const unapproved = voice ? 'review' : 'draft'
  const noted = students.filter((s) => s.id in personal)
  const personalCount = noted.filter((s) => personal[s.id].trim()).length
  const filled = filledCount(sections)
  const openIssues = issues.filter((i) => i.status === 'open')
  // A note about a child marked absent that day is shown with that, so it can be checked.
  const dayAttendance = attendanceOf(db, cls.id, journal.date)
  // Published before: parents see the published version until a change is approved and published again.
  const wasPublished = !!journal.publishedAt

  // Any change after approval or publishing needs the teacher to approve again before publishing.
  const touch = () => {
    setDirty(true)
    if (status === 'approved' || status === 'published') setStatus(unapproved)
  }
  const build = (st, over = {}) => {
    const next = { sections, personal, photos, source, transcript, issues, ...over }
    const { live: _live, ...current } = journal
    return {
      ...journal,
      ...next,
      personal: Object.fromEntries(Object.entries(next.personal).filter(([, text]) => text.trim())),
      status: st,
      updatedAt: Date.now(),
      publishedAt: journal.publishedAt || (st === 'published' ? Date.now() : null),
      // Without the backend, the version parents see while a published journal is being changed.
      live: st === 'published' ? undefined : journal.live || (journal.status === 'published' ? current : undefined),
    }
  }
  const record = (st) => build(st)
  const persist = (st, extra = {}) => {
    upsert('journals', { ...record(st), ...extra })
    setStatus(st)
    setDirty(false)
  }
  const setNote = (id, text) => {
    setPersonal((p) => ({ ...p, [id]: text }))
    touch()
  }

  // Another recording adds to the draft instead of replacing it, and always sends it back to review.
  const addRecording = (draft) => {
    // A statement the new recording corrects is taken out first ("Cô nhầm, bé An ăn hết suất").
    const kept = applyCorrections({ sections, personal }, draft.issues || [])
    const over = {
      sections: Object.fromEntries(JOURNAL_SECTIONS.map((s) => [s.key, joinNew(kept.sections[s.key], draft.sections[s.key])])),
      personal: Object.fromEntries(
        Object.entries({ ...kept.personal, ...Object.fromEntries(Object.entries(draft.personal).map(([id, text]) => [id, joinNew(kept.personal[id], text)])) }).filter(([, text]) => text.trim()),
      ),
      transcript: joinText(transcript, draft.transcript),
      issues: [...issues, ...(draft.issues || [])],
      audio: [...(journal.audio || []), ...(draft.audio || [])],
      source: 'voice',
    }
    setSections(over.sections)
    setPersonal(over.personal)
    setTranscript(over.transcript)
    setIssues(over.issues)
    setSource('voice')
    if (draft.audioUrl) setAudios((a) => [...a, draft.audioUrl])
    upsert('journals', build('review', over))
    setStatus('review')
    setDirty(false)
    setRecording(false)
    toast('Added to the draft. Please review the new text.')
  }

  const addPhotos = async (e) => {
    const files = [...e.target.files].slice(0, maxPhotos - photos.length)
    e.target.value = ''
    if (!files.length) return
    const urls = await Promise.all(files.map(readFileAsDataURL))
    setPhotos((p) => [...p, ...urls])
    touch()
  }

  // The teacher's decision on one issue. A held statement goes where the teacher says; nothing else changes text.
  const resolveIssue = (issue, resolution, childId) => {
    if (resolution === 'assigned') {
      const children = [...new Set([...(issue.studentIds || []), childId])]
      setPersonal((p) => ({ ...p, ...Object.fromEntries(children.map((id) => [id, joinText(p[id], issue.text)])) }))
    }
    if (resolution === 'class') setSections((p) => ({ ...p, [issue.section]: joinText(p[issue.section], issue.text) }))
    // Undoing a correction keeps the earlier statement as well, where it was.
    if (resolution === 'reverted') {
      const [childId] = issue.studentIds || []
      if (childId) setPersonal((p) => ({ ...p, [childId]: joinText(issue.previousText, p[childId]) }))
      else setSections((p) => ({ ...p, [issue.section]: joinText(issue.previousText, p[issue.section]) }))
    }
    setIssues((list) => list.map((i) => (i.id === issue.id ? { ...i, status: 'resolved', resolution, assignedTo: resolution === 'assigned' ? [childId] : [] } : i)))
    touch()
  }

  const approve = () => {
    if (openIssues.length) return toast(`${openIssues.length} ${openIssues.length === 1 ? 'point still needs' : 'points still need'} your confirmation before approving.`, 'error')
    if (filled === 0 && personalCount === 0) return toast('Add content to at least one section before approving.', 'error')
    persist('approved')
    toast('Journal approved. You can now publish it.')
  }

  // A published change is announced only to the parents it concerns, as the backend does.
  const publishChanges = () => {
    const before = journal.live || journal
    const after = record('published')
    persist('published', { editedAt: Date.now(), revision: (journal.revision || 1) + 1 })
    if (JSON.stringify([before.sections, before.photos]) !== JSON.stringify([after.sections, after.photos])) {
      notify({ role: 'parent', classId: cls.id, type: 'journal', title: 'Journal updated', body: `The teacher updated the journal of ${journal.date} for ${cls.name}.` })
    }
    for (const s of students.filter((x) => (before.personal?.[x.id] || '') !== (after.personal[x.id] || ''))) {
      for (const l of db.links.filter((x) => x.studentId === s.id && x.status === 'Active')) {
        notify({ role: 'parent', userId: l.parentId, type: 'journal', title: `Note about ${s.name} updated`, body: `The teacher changed the personal note in the journal of ${journal.date}.` })
      }
    }
    log('Update', 'Daily Journal', `Published journal updated: ${cls.name}`)
    toast('Changes published. Parents now see the updated journal.')
    onClose()
  }

  const publish = () => {
    if (wasPublished) return publishChanges()
    persist('published', { revision: 1 })
    notify({ role: 'parent', classId: cls.id, type: 'journal', title: 'New journal published', body: `The daily journal for ${cls.name} is ready to view.` })
    // A note about one child is announced to that child's parents only.
    for (const s of noted.filter((x) => personal[x.id].trim())) {
      for (const l of db.links.filter((x) => x.studentId === s.id && x.status === 'Active')) {
        notify({ role: 'parent', userId: l.parentId, type: 'journal', title: `A note about ${s.name}`, body: "The teacher wrote a personal note in today's journal." })
      }
    }
    log('Publish', 'Daily Journal', `Journal published: ${cls.name}`)
    toast('Journal published successfully.')
    onClose()
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
            <strong>AI-generated draft — Please review.</strong> Check every section, correct mistakes and add what is missing. Nothing is sent to parents until you approve and publish.
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
          {voice && transcript && (
            <details>
              <summary>
                <strong>What you said</strong> <span className="muted small">— transcript of your recording{audios.length > 1 ? 's' : ''}</span>
              </summary>
              {audios.map((url) => (
                <audio key={url} className="rec-audio" controls src={url} />
              ))}
              <p className="transcript">{transcript}</p>
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
                {dayAttendance?.records[s.id]?.status === 'absent' && <span className="chip">Absent this day</span>}
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
              key={i}
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
              <span>Add photo</span>
              <input type="file" accept="image/*" multiple hidden onChange={addPhotos} />
            </label>
          )}
        </div>
      </div>

      <div className="card">
        <div className="principle">
          <Sparkles size={16} /> AI suggests <ArrowRight size={14} /> Teacher verifies <ArrowRight size={14} /> <strong>Teacher decides</strong>
        </div>
        <div className="editor-actions">
          <button
            className="btn"
            disabled={status === 'published'}
            onClick={() => {
              persist(status === 'approved' ? 'approved' : unapproved)
              toast('Draft saved.')
            }}
          >
            <Save size={18} /> Save Draft
          </button>
          <button className="btn" onClick={() => setPreview(true)}>
            <Eye size={18} /> Preview
          </button>
          <button className="btn" onClick={approve} disabled={(status === 'approved' && !dirty) || status === 'published' || openIssues.length > 0}>
            <CheckCircle2 size={18} /> {status === 'approved' ? 'Approved' : 'Approve'}
          </button>
          <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={status !== 'approved'}>
            <Send size={18} /> {wasPublished ? 'Publish Changes' : 'Publish'}
          </button>
        </div>
        {openIssues.length > 0 ? (
          <span className="muted small">Confirm the {openIssues.length === 1 ? 'point' : `${openIssues.length} points`} above to enable approving.</span>
        ) : (
          status !== 'approved' &&
          status !== 'published' && <span className="muted small">Approve the journal after reviewing it to enable publishing.</span>
        )}
      </div>

      <Modal open={preview} title="Preview — as parents will see it" onClose={() => setPreview(false)}>
        {filled === 0 && personalCount === 0 && photos.length === 0 ? (
          <EmptyState title="Nothing to preview yet." text="Write at least one section first." />
        ) : (
          <JournalTimeline journal={record(status)} students={students} />
        )}
      </Modal>

      <Modal open={recording} title="Record more" onClose={() => setRecording(false)}>
        {recording && <Recorder students={students} journalId={journal.id} date={journal.date} onDone={addRecording} onCancel={() => setRecording(false)} />}
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
            <button className="btn btn-primary" onClick={publish}>
              Publish Journal
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
            <dd>{personalCount ? `${personalCount} (private to each family)` : "None"}</dd>
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
  const { db, upsert } = useStore()
  const toast = useToast()
  const { cls, students } = useMyClass()
  const today = todayISO()
  const [date, setDate] = useWorkingDate()
  const [view, setView] = useState({ mode: 'home' }) // home | record | edit | read
  const [tab, setTab] = useState('all')
  if (!cls) return <NoClass />

  const journal = journalOf(db, cls.id, date)
  const aiOn = db.settings.aiJournal
  const history = db.journals.filter((j) => j.classId === cls.id).sort((a, b) => b.date.localeCompare(a.date))
  const shown = history.filter(HISTORY_TABS.find((t) => t.key === tab).match)

  const create = (source, { audioUrl, ...extra } = {}) => {
    const j = { id: uid('j'), classId: cls.id, date, status: source === 'voice' ? 'review' : 'draft', source, sections: emptySections(), photos: [], updatedAt: Date.now(), publishedAt: null, ...extra }
    upsert('journals', j)
    setView({ mode: 'edit', id: j.id, audioUrl })
  }
  const open = (j) => setView({ mode: j.status === 'published' ? 'read' : 'edit', id: j.id })
  const current = view.id && byId(db.journals, view.id)

  if (view.mode === 'record')
    return (
      <div className="narrow">
        <PageHeader title="Record with Voice" subtitle={`${cls.name} · ${fmtLongDate(date)}`} />
        <Recorder
          students={students}
          date={date}
          onCancel={() => setView({ mode: 'home' })}
          onDone={(draft) => {
            create('voice', draft)
            toast('Draft ready. Please review it.')
          }}
        />
      </div>
    )

  if (view.mode === 'edit' && current) return <JournalEditor key={current.id} cls={cls} students={students} journal={current} audioUrl={view.audioUrl} onClose={() => setView({ mode: 'home' })} />

  if (view.mode === 'read' && current)
    return (
      <div className="narrow wide">
        <PageHeader
          back={
            <button className="back-link" onClick={() => setView({ mode: 'home' })}>
              <ArrowLeft size={16} /> Daily Journal
            </button>
          }
          title={`Journal · ${dayLabel(current.date)}`}
          subtitle={`${cls.name} · published ${relTime(current.publishedAt || current.updatedAt)}${current.editedAt ? ` · updated ${relTime(current.editedAt)}` : ''}`}
          actions={
            <>
              <StatusBadge status="Published" />
              {/* An older journal is still loading its content; it can be edited once it is on screen. */}
              <button className="btn" onClick={() => setView({ mode: 'edit', id: current.id })} disabled={!!current.stub}>
                <PenLine size={18} /> Edit Journal
              </button>
            </>
          }
        />
        <div className="card">
          <JournalTimeline journal={current} students={students} />
        </div>
      </div>
    )

  return (
    <>
      <PageHeader
        title="Daily Journal"
        subtitle={`${cls.name} · ${fmtLongDate(date)}`}
        actions={<input type="date" className="date-input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Journal date" />}
      />

      {journal ? (
        <section className="card">
          <div className="row-between">
            <div>
              <h2>Journal for {dayLabel(date).toLowerCase() === 'today' ? 'today' : fmtDate(date)}</h2>
              <span className="muted small">
                {journal.source === 'voice' ? 'Created with voice (AI-assisted)' : 'Written manually'} · last edited {relTime(journal.updatedAt)}
              </span>
            </div>
            <StatusBadge status={JOURNAL_STATUS[journal.status]} />
          </div>
          <div>
            <button className="btn btn-primary" onClick={() => open(journal)}>
              {journal.status === 'published' ? (
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
      ) : (
        <section className="stack">
          <div className="choice-grid">
            <button className="choice primary" onClick={() => setView({ mode: 'record' })} disabled={!aiOn}>
              <span className="action-icon tint-mint">
                <Mic size={24} />
              </span>
              <strong>Record with Voice</strong>
              <span className="muted">{aiOn ? 'Describe the day in Vietnamese. AI prepares a draft for you to review and edit.' : 'AI-assisted drafts are turned off by the system administrator.'}</span>
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
      )}

      <h2 className="section-title">Journal History</h2>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {HISTORY_TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
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
                  <td data-label="Date" className="td-primary">{dayLabel(j.date)}</td>
                  <td data-label="Class">{cls.name}</td>
                  <td data-label="Status">
                    <StatusBadge status={JOURNAL_STATUS[j.status]} />
                    {j.publishedAt && j.status !== 'published' && <span className="muted block small">Published before · changes not sent yet</span>}
                  </td>
                  <td data-label="Last edited">{relTime(j.updatedAt)}</td>
                  <td data-label="Actions" className="td-plain" style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => open(j)}>
                      {j.status === 'published' ? 'View' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
