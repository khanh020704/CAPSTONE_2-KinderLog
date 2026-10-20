import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  UserRound,
  Video,
  VideoOff,
} from 'lucide-react'
import { attendanceOf, byId, childrenOf, unreadMessages, unreadNotifications, useStore } from '../store/store'
import { JOURNAL_SECTIONS, dayLabel, fmtDate, fmtLongDate, greeting, toISO, todayISO } from '../lib/utils'
import { useLogout } from '../components/Shell'
import { CameraBadge, CameraPlayer, CameraPreview, CameraStatusText, useCamera } from '../components/Camera'
import { JournalTimeline, SECTION_ICON, SECTION_TINT, personalNote } from '../components/Journal'
import { Avatar, EmptyState, PageHeader, PhotoTile, StatusBadge } from '../components/ui'

const CHILD_KEY = 'kinderlog.child'

// A parent only ever sees their own linked children; the chosen one is remembered for the session.
function useChild() {
  const { db, user } = useStore()
  const kids = childrenOf(db, user.id)
  const [id, setId] = useState(() => sessionStorage.getItem(CHILD_KEY))
  const child = kids.find((k) => k.id === id) || kids[0]
  const cls = child && byId(db.classes, child.classId)
  const pick = (v) => {
    sessionStorage.setItem(CHILD_KEY, v)
    setId(v)
  }
  return { kids, child, cls, teacher: cls && byId(db.teachers, cls.teacherId), pick }
}

function ChildSwitcher({ kids, child, pick }) {
  if (kids.length < 2) return null
  return (
    <div className="tabs" style={{ marginBottom: 14 }}>
      {kids.map((k) => (
        <button key={k.id} className={k.id === child.id ? 'on' : ''} onClick={() => pick(k.id)}>
          {k.name}
        </button>
      ))}
    </div>
  )
}

function NoChild() {
  return (
    <div className="card">
      <EmptyState icon={UserRound} title="No child is linked to this account yet." text="Please contact the school office." soft />
    </div>
  )
}

// A journal being changed after publishing is shown as it was published (`live`) until the change is published.
const publishedJournals = (db, classId) =>
  db.journals
    .filter((j) => j.classId === classId)
    .map((j) => (j.status === 'published' ? j : j.live))
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
const childRecord = (db, child, date) => attendanceOf(db, child.classId, date)?.records[child.id]
const ATTENDANCE_TEXT = { present: 'Present today', absent: 'Absent today' }

const visibleAnnouncements = (db) => {
  const today = todayISO()
  return db.announcements
    .filter((a) => a.status === 'Published' && a.audience.includes('Parents') && a.publishDate <= today && (!a.expiryDate || a.expiryDate >= today))
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate) || b.createdAt - a.createdAt)
}

// ---------- Home ----------

function HomeCamera({ cls, allowed }) {
  const cam = useCamera(cls.id)
  if (!allowed)
    return (
      <section className="card">
        <div className="summary-item">
          <span className="summary-icon tint-cream">
            <Lock size={18} />
          </span>
          <div>
            <strong>Classroom camera</strong>
            <span className="muted block">Camera access is not available for this account.</span>
          </div>
        </div>
      </section>
    )
  return (
    <section className="card">
      <div className="row-between">
        <div className="summary-item">
          <span className={`summary-icon ${cam.state === 'live' ? 'tint-mint' : 'tint-cream'}`}>{cam.state === 'unavailable' ? <VideoOff size={18} /> : <Video size={18} />}</span>
          <div>
            <strong>{cls.name}</strong>
            <span className="muted block">{cam.state === 'unavailable' ? 'The classroom camera is currently unavailable.' : <CameraStatusText cam={cam} />}</span>
          </div>
        </div>
        <Link className={`btn ${cam.state === 'live' ? 'btn-primary' : ''}`} to="/parent/camera">
          {cam.state === 'live' ? 'Watch' : 'View Schedule'}
        </Link>
      </div>
    </section>
  )
}

export function ParentHome() {
  const { db, user } = useStore()
  const { kids, child, cls, teacher, pick } = useChild()
  const today = todayISO()

  if (!child)
    return (
      <>
        <PageHeader title={`${greeting()}, ${user.name}`} />
        <NoChild />
      </>
    )

  const record = childRecord(db, child, today)
  const journals = publishedJournals(db, child.classId)
  const todayJournal = journals.find((j) => j.date === today)
  const latest = journals[0]
  const announcement = visibleAnnouncements(db)[0]
  const messages = unreadMessages(db, user)
  const notifications = unreadNotifications(db, user)
  const summary = todayJournal ? JOURNAL_SECTIONS.filter((s) => s.key !== 'note' && todayJournal.sections[s.key]?.trim()) : []
  const ownNote = personalNote(todayJournal, child.id)
  const latestText = latest && (personalNote(latest, child.id) || latest.sections.note || latest.sections.learning || latest.sections.meal || latest.sections.emotion)

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name}`} subtitle={kids.length > 1 ? 'Here is how your children are doing today.' : 'Here is how your child is doing today.'} />
      <ChildSwitcher kids={kids} child={child} pick={pick} />

      <section className="card child-card">
        <Avatar name={child.name} src={child.photo} size={72} />
        <div>
          <h2>{child.name}</h2>
          <span>{cls?.name}</span>
          <span className="muted">Teacher: {teacher?.name || 'Not assigned'}</span>
          <StatusBadge status={record ? ATTENDANCE_TEXT[record.status] || 'Not recorded' : 'Not recorded'} />
        </div>
      </section>

      <h2 className="section-title">Quick actions</h2>
      <div className="quick-grid">
        <Link to="/parent/journal" className="quick">
          <span className="summary-icon tint-peach">
            <BookOpen size={20} />
          </span>
          <strong>Today's Journal</strong>
          <span className="muted">See your child's day.</span>
        </Link>
        <Link to="/parent/messages" className="quick">
          {messages > 0 && <span className="count">{messages}</span>}
          <span className="summary-icon tint-sky">
            <MessageCircle size={20} />
          </span>
          <strong>Messages</strong>
          <span className="muted">Chat with the teacher.</span>
        </Link>
        <Link to="/parent/notifications" className="quick">
          {notifications > 0 && <span className="count">{notifications}</span>}
          <span className="summary-icon tint-lav">
            <Bell size={20} />
          </span>
          <strong>Notifications</strong>
          <span className="muted">See school and teacher updates.</span>
        </Link>
        <Link to="/parent/camera" className="quick">
          <span className="summary-icon tint-mint">
            <Video size={20} />
          </span>
          <strong>Camera</strong>
          <span className="muted">Watch the classroom when available.</span>
        </Link>
      </div>

      <h2 className="section-title">Today's summary</h2>
      <section className="card">
        <div className="summary-list">
          <div className="summary-item">
            <span className="summary-icon tint-mint">
              <ClipboardCheck size={18} />
            </span>
            <div>
              <strong>Attendance</strong>
              <span className="block">
                {record?.status === 'present' ? 'Present' : record?.status === 'absent' ? `Absent${record.note ? ` — ${record.note}` : ''}` : 'Not recorded yet'}
              </span>
            </div>
          </div>
          {summary.map((s) => {
            const Icon = SECTION_ICON[s.key]
            return (
              <div key={s.key} className="summary-item">
                <span className={`summary-icon tint-${SECTION_TINT[s.key]}`}>
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{s.label}</strong>
                  <span className="block">{todayJournal.sections[s.key]}</span>
                </div>
              </div>
            )
          })}
        </div>
        {ownNote && (
          <div className="summary-item">
            <span className="summary-icon tint-lav">
              <UserRound size={18} />
            </span>
            <div>
              <strong>About {child.name}</strong>
              <span className="block">{ownNote}</span>
              <span className="chip private-chip">
                <Lock size={12} /> Only you can see this note
              </span>
            </div>
          </div>
        )}
        {!todayJournal && <EmptyState icon={BookOpen} title="Today's journal has not been created yet." text="The teacher usually shares it in the afternoon." soft />}
      </section>

      {latest && (
        <>
          <h2 className="section-title">Latest journal</h2>
          <section className="card">
            <div className="row-between">
              <strong>{dayLabel(latest.date)}</strong>
              <span className="muted small">{fmtLongDate(latest.date)}</span>
            </div>
            <p>{latestText}</p>
            {latest.photos.length > 0 && (
              <div className="photos">
                {latest.photos.slice(0, 2).map((p, i) => (
                  <PhotoTile key={i} src={p} />
                ))}
              </div>
            )}
            <div>
              <Link className="btn" to={`/parent/journal?date=${latest.date}`}>
                View Full Journal
              </Link>
            </div>
          </section>
        </>
      )}

      {announcement && (
        <>
          <h2 className="section-title">School Announcement</h2>
          <section className="card">
            <div className="summary-item">
              <span className="summary-icon tint-cream">
                <Megaphone size={18} />
              </span>
              <div>
                <strong>{announcement.title}</strong>
                <span className="muted block">{announcement.content.length > 120 ? `${announcement.content.slice(0, 120)}…` : announcement.content}</span>
              </div>
            </div>
            <div>
              <Link className="btn btn-sm" to="/parent/announcements">
                View Details
              </Link>
            </div>
          </section>
        </>
      )}

      {cls && (
        <>
          <h2 className="section-title">Classroom camera</h2>
          <HomeCamera cls={cls} allowed={user.cameraAccess !== false} />
        </>
      )}
    </>
  )
}

// ---------- Journal ----------

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Calendar({ value, onChange, marked }) {
  const [month, setMonth] = useState(value.slice(0, 7))
  const first = new Date(`${month}-01T00:00:00`)
  const offset = (first.getDay() + 6) % 7 // weeks start on Monday
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const today = todayISO()
  const shift = (n) => setMonth(toISO(new Date(first.getFullYear(), first.getMonth() + n, 1)).slice(0, 7))

  return (
    <div>
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft size={20} />
        </button>
        <strong>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button className="icon-btn" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label="Next month">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => (
          <span key={d} className="cal-dow">
            {d}
          </span>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, '0')}`
          const has = marked.includes(iso)
          return (
            <button
              key={iso}
              className={`cal-day ${has ? 'has' : ''} ${iso === value ? 'sel' : ''} ${iso === today ? 'today' : ''}`}
              disabled={iso > today}
              onClick={() => onChange(iso)}
              aria-label={`${fmtDate(iso)}${has ? ', journal available' : ''}`}
              aria-pressed={iso === value}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ParentJournalPage() {
  const { db } = useStore()
  const { kids, child, cls, pick } = useChild()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  if (!child) return <NoChild />

  const journals = publishedJournals(db, child.classId)
  const date = params.get('date') || today
  const journal = journals.find((j) => j.date === date)
  const select = (d) => setParams(d === today ? {} : { date: d }, { replace: true })

  return (
    <>
      <PageHeader title="Daily Journal" subtitle={`${child.name} · ${cls?.name}`} />
      <ChildSwitcher kids={kids} child={child} pick={pick} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <Calendar key={date.slice(0, 7)} value={date} onChange={select} marked={journals.map((j) => j.date)} />
            <span className="muted small">Days with a dot have a journal.</span>
          </section>
          {journals.length > 0 && (
            <section className="card list-card">
              {journals.slice(0, 6).map((j) => (
                <button key={j.id} className="menu-row" onClick={() => select(j.date)}>
                  <span className="summary-icon tint-peach">
                    <BookOpen size={18} />
                  </span>
                  <span>
                    <strong>{dayLabel(j.date)}</strong>
                    <span className="muted block small">{fmtLongDate(j.date)}</span>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </section>
          )}
        </div>

        <section className="card">
          <div className="card-head">
            <h2>{dayLabel(date)}</h2>
            <span className="muted small">{fmtLongDate(date)}</span>
          </div>
          {journal ? (
            <JournalTimeline journal={journal} attendance={childRecord(db, child, date)} child={child} />
          ) : (
            <EmptyState
              icon={BookOpen}
              title={date === today ? "Today's journal has not been created yet." : 'There is no journal for this day.'}
              text={date === today ? 'You will get a notification when the teacher shares it.' : 'Choose a day marked with a dot.'}
              soft
            />
          )}
        </section>
      </div>
    </>
  )
}

// ---------- Camera ----------

export function ParentCameraPage() {
  const { db, user } = useStore()
  const { kids, child, cls, pick } = useChild()
  const cam = useCamera(cls?.id)
  const today = todayISO()
  if (!child || !cls) return <NoChild />

  const allowed = user.cameraAccess !== false
  const variant = Math.max(0, db.cameras.findIndex((c) => c.classId === cls.id))
  const upcoming = db.schedules
    .filter((s) => s.classId === cls.id && s.enabled && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, 6)

  return (
    <div className="narrow wide">
      <PageHeader title="Classroom Camera" subtitle={`${cls.name} · ${child.name}`} actions={allowed && <CameraBadge state={cam.state} />} />
      <ChildSwitcher kids={kids} child={child} pick={pick} />

      {!allowed ? (
        <div className="card">
          <EmptyState icon={Lock} title="Camera access is not available for this account." text="Please contact the school office if you think this is a mistake." soft />
        </div>
      ) : (
        <>
          <section className="card">
            {cam.state === 'live' ? (
              <CameraPlayer classId={cls.id} variant={variant} />
            ) : (
              <>
                <CameraPreview state={cam.state} variant={variant} />
                {cam.state === 'scheduled' ? (
                  <div>
                    <strong>Scheduled</strong>
                    <span className="muted block">
                      The camera opens today at {cam.schedule.start} and closes at {cam.schedule.end}.
                    </span>
                  </div>
                ) : (
                  <div className="row-between">
                    <span>
                      <strong>The classroom camera is currently unavailable.</strong>
                      <span className="muted block">The school opens the camera only at scheduled times.</span>
                    </span>
                    <a className="btn" href="#schedule">
                      View Schedule
                    </a>
                  </div>
                )}
              </>
            )}
            {cam.state === 'live' && (
              <span className="muted">
                <CameraStatusText cam={cam} />
              </span>
            )}
          </section>

          <section className="card" id="schedule">
            <div className="card-head">
              <h2>Viewing schedule</h2>
              <CalendarClock size={18} />
            </div>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No viewing times are scheduled." text="The school will notify you when the camera is available." soft />
            ) : (
              <ul className="plain-list">
                {upcoming.map((s) => (
                  <li key={s.id} className="row-between">
                    <span>
                      <strong>{dayLabel(s.date)}</strong>
                      <span className="muted block small">{fmtLongDate(s.date)}</span>
                    </span>
                    <span className="chip">
                      {s.start}–{s.end}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="privacy-note">
            <ShieldCheck size={16} /> Only parents of {cls.name} can watch, and only during the times set by the school.
          </p>
        </>
      )}
    </div>
  )
}

// ---------- More ----------

export function ParentMorePage() {
  const { db, user } = useStore()
  const { child, cls } = useChild()
  const [askLogout, logoutDialog] = useLogout()
  const unread = unreadNotifications(db, user)
  const links = [
    { to: '/parent/notifications', icon: Bell, label: 'Notifications', count: unread },
    { to: '/parent/announcements', icon: Megaphone, label: 'School Announcements' },
    { to: '/parent/profile', icon: UserRound, label: 'My Profile' },
    { to: '/parent/password', icon: KeyRound, label: 'Change Password' },
  ]

  return (
    <div className="narrow">
      <PageHeader title="More" />
      <section className="card">
        <div className="profile-top">
          <Avatar name={user.name} size={60} />
          <div>
            <h2>{user.name}</h2>
            <span className="muted">{child ? `${child.relationship} of ${child.name}${cls ? ` · ${cls.name}` : ''}` : 'Parent'}</span>
          </div>
        </div>
      </section>
      <section className="card list-card">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="menu-row">
            <span className="summary-icon tint-cream">
              <l.icon size={18} />
            </span>
            <span>{l.label}</span>
            {l.count > 0 && <span className="count">{l.count}</span>}
            <ChevronRight size={18} />
          </Link>
        ))}
        <button className="menu-row" onClick={askLogout}>
          <span className="summary-icon tint-peach">
            <LogOut size={18} />
          </span>
          <span>Logout</span>
        </button>
      </section>
      {logoutDialog}
    </div>
  )
}

// ---------- School announcements ----------

export function ParentAnnouncementsPage() {
  const { db } = useStore()
  const list = visibleAnnouncements(db)
  return (
    <div className="narrow">
      <PageHeader title="School Announcements" subtitle="Notices from the school" />
      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={Megaphone} title="No announcements right now." text="School notices will appear here." soft />
        </div>
      ) : (
        list.map((a) => (
          <article key={a.id} className="card">
            <div className="row-between">
              <span className="chip">{a.category}</span>
              <span className="muted small">{fmtDate(a.publishDate)}</span>
            </div>
            <h2>{a.title}</h2>
            <p>{a.content}</p>
          </article>
        ))
      )}
    </div>
  )
}
