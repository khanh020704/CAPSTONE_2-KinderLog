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
import { useStore } from '../store/store'
import { addDays, dayLabel, fmtDate, fmtLongDate, greeting, toISO, todayISO } from '../lib/utils'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { toAnnouncement } from '../lib/mappers'
import { RELATIONSHIP, label } from '../lib/labels'
import { useLogout } from '../components/Shell'
import { CameraBadge, CameraPlayer, CameraPreview, CameraStatusText, useNow } from '../components/Camera'
import { DayTimeline, SECTION_ICON, SECTION_TINT } from '../components/Journal'
import { Avatar, EmptyState, Loadable, PageHeader, PhotoTile, Skeleton, StatusBadge } from '../components/ui'

const CHILD_KEY = 'kinderlog.child'

// A parent only ever sees their own linked children (from the backend profile); the chosen one is remembered.
function useChild() {
  const { user } = useStore()
  const kids = (user.api.children || []).map((c) => ({
    id: c.id,
    name: c.fullName,
    photo: c.avatarUrl,
    classId: c.classId,
    className: c.class?.name,
    allergies: c.allergies,
    relationship: label(RELATIONSHIP, c.relationship),
  }))
  const [id, setId] = useState(() => sessionStorage.getItem(CHILD_KEY))
  const child = kids.find((k) => k.id === id) || kids[0]
  const pick = (v) => {
    sessionStorage.setItem(CHILD_KEY, v)
    setId(v)
  }
  return { kids, child, pick }
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

// Published, unexpired notices meant for parents, newest first: the backend filters them for the signed-in parent.
const useAnnouncements = (limit) => useApi(() => api.announcements.list({ limit }), [limit])

const attendanceText = (a) => {
  if (!a?.attendance) return 'Not recorded yet'
  if (a.attendance === 'ABSENT') return `Absent${a.absenceReason ? ` — ${a.absenceReason}` : ''}`
  return 'Present'
}

// Camera cards poll the backend once a minute so "Scheduled" turns into "Live" on time.
function useWatch(childId) {
  const tick = useNow(60000).getMinutes()
  return useApi(() => (childId ? api.cameras.watch({ studentId: childId }) : Promise.resolve(undefined)), [childId, tick])
}

// ---------- Home ----------

function HomeCamera({ child, allowed }) {
  const q = useWatch(allowed ? child.id : null)
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
  const cam = q.data?.cameras.find((c) => c.state === 'LIVE') || q.data?.cameras[0]
  return (
    <section className="card">
      <div className="row-between">
        <div className="summary-item">
          <span className={`summary-icon ${cam?.state === 'LIVE' ? 'tint-mint' : 'tint-cream'}`}>
            {!cam || cam.state === 'UNAVAILABLE' ? <VideoOff size={18} /> : <Video size={18} />}
          </span>
          <div>
            <strong>{child.className}</strong>
            <span className="muted block">{q.initial ? 'Checking the camera…' : !cam ? 'This class has no camera.' : <CameraStatusText cam={cam} />}</span>
          </div>
        </div>
        <Link className={`btn ${cam?.state === 'LIVE' ? 'btn-primary' : ''}`} to="/parent/camera">
          {cam?.state === 'LIVE' ? 'Watch' : 'View Schedule'}
        </Link>
      </div>
    </section>
  )
}

export function ParentHome() {
  const { user, counts } = useStore()
  const latestAnnouncement = useAnnouncements(1)
  const { kids, child, pick } = useChild()
  const today = todayISO()
  const journals = useApi(() => (child ? api.journals.timeline(child.id, addDays(today, -14), today) : Promise.resolve(undefined)), [child?.id])
  const detail = useApi(() => (child ? api.students.get(child.id) : Promise.resolve(undefined)), [child?.id])
  // Attendance is shown as soon as the teacher records it, even before today's journal is shared.
  const att = useApi(() => (child ? api.journals.attendance(child.id, today) : Promise.resolve(undefined)), [child?.id])

  if (!child)
    return (
      <>
        <PageHeader title={`${greeting()}, ${user.name}`} />
        <NoChild />
      </>
    )

  const days = journals.data?.days || []
  const todayDay = days.find((d) => d.date === today)
  const latest = days[0]
  const teacher = detail.data?.class?.homeroomTeacher?.fullName
  const announcement = latestAnnouncement.data?.items.map(toAnnouncement)[0]
  const { messages, notifications } = counts
  const summary = todayDay ? todayDay.events.filter((e) => e.key !== 'attendance') : []
  const SUMMARY_KEY = { learning: 'learning', meal: 'meal', sleep: 'sleep', health: 'health', emotion: 'emotion', note: 'note', classNote: 'note' }
  const SUMMARY_TITLE = { learning: 'Learning', meal: 'Meal', sleep: 'Sleep', health: 'Health', emotion: 'Emotion', note: `About ${child.name}`, classNote: 'For the whole class' }

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name}`} subtitle={kids.length > 1 ? 'Here is how your children are doing today.' : 'Here is how your child is doing today.'} />
      <ChildSwitcher kids={kids} child={child} pick={pick} />

      <section className="card child-card">
        <Avatar name={child.name} src={child.photo} size={72} />
        <div>
          <h2>{child.name}</h2>
          <span>{child.className}</span>
          <span className="muted">Teacher: {detail.initial ? '…' : teacher || 'Not assigned'}</span>
          <StatusBadge status={att.data?.attendance === 'ABSENT' ? 'Absent today' : att.data?.attendance === 'PRESENT' ? 'Present today' : 'Not recorded'} />
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
      <Loadable
        q={journals}
        skeleton={
          <section className="card">
            <Skeleton h={80} />
          </section>
        }
      >
        {() => (
          <section className="card">
            <div className="summary-list">
              <div className="summary-item">
                <span className="summary-icon tint-mint">
                  <ClipboardCheck size={18} />
                </span>
                <div>
                  <strong>Attendance</strong>
                  <span className="block">{attendanceText(att.data)}</span>
                </div>
              </div>
              {summary.map((ev) => {
                const Icon = ev.key === 'note' ? UserRound : SECTION_ICON[SUMMARY_KEY[ev.key]]
                return (
                  <div key={ev.key} className="summary-item">
                    <span className={`summary-icon tint-${ev.key === 'note' ? 'lav' : SECTION_TINT[ev.key]}`}>
                      <Icon size={18} />
                    </span>
                    <div>
                      <strong>{SUMMARY_TITLE[ev.key]}</strong>
                      <span className="block">{ev.text}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {!todayDay && <EmptyState icon={BookOpen} title="Today's journal has not been created yet." text="The teacher usually shares it in the afternoon." soft />}
          </section>
        )}
      </Loadable>

      {latest && latest.date !== today && (
        <>
          <h2 className="section-title">Latest journal</h2>
          <section className="card">
            <div className="row-between">
              <strong>{dayLabel(latest.date)}</strong>
              <span className="muted small">{fmtLongDate(latest.date)}</span>
            </div>
            <p>{latest.events.find((e) => e.key === 'note' || e.key === 'learning')?.text || latest.events[0]?.text}</p>
            {latest.photos.length > 0 && (
              <div className="photos">
                {latest.photos.slice(0, 2).map((p) => (
                  <PhotoTile key={p.id} src={p.url} />
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

      <h2 className="section-title">Classroom camera</h2>
      <HomeCamera child={child} allowed={user.cameraAccess !== false} />
    </>
  )
}

// ---------- Journal ----------

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Calendar({ value, month, onMonth, onChange, marked }) {
  const first = new Date(`${month}-01T00:00:00`)
  const offset = (first.getDay() + 6) % 7 // weeks start on Monday
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const today = todayISO()
  const shift = (n) => onMonth(toISO(new Date(first.getFullYear(), first.getMonth() + n, 1)).slice(0, 7))

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

const monthEnd = (month) => {
  const d = new Date(`${month}-01T00:00:00`)
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function ParentJournalPage() {
  const { child, kids, pick } = useChild()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const date = params.get('date') || today
  const [month, setMonth] = useState(date.slice(0, 7))
  const end = monthEnd(month) < today ? monthEnd(month) : today
  const q = useApi(() => (child ? api.journals.timeline(child.id, `${month}-01`, end) : Promise.resolve(undefined)), [child?.id, month])
  const dayQ = useApi(() => (child && date.slice(0, 7) !== month ? api.journals.timeline(child.id, date, date) : Promise.resolve(undefined)), [child?.id, date, month])
  if (!child) return <NoChild />

  const days = q.data?.days || []
  const day = days.find((d) => d.date === date) || dayQ.data?.days.find((d) => d.date === date)
  const select = (d) => setParams(d === today ? {} : { date: d }, { replace: true })

  return (
    <>
      <PageHeader title="Daily Journal" subtitle={`${child.name} · ${child.className}`} />
      <ChildSwitcher kids={kids} child={child} pick={pick} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <Calendar value={date} month={month} onMonth={setMonth} onChange={select} marked={days.map((d) => d.date)} />
            <span className="muted small">Days with a dot have a journal.</span>
          </section>
          {days.length > 0 && (
            <section className="card list-card">
              {days.slice(0, 6).map((d) => (
                <button key={d.date} className="menu-row" onClick={() => select(d.date)}>
                  <span className="summary-icon tint-peach">
                    <BookOpen size={18} />
                  </span>
                  <span>
                    <strong>{dayLabel(d.date)}</strong>
                    <span className="muted block small">
                      {fmtLongDate(d.date)}
                      {d.teacher ? ` · ${d.teacher}` : ''}
                    </span>
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
          <Loadable q={q} skeleton={<Skeleton h={160} />}>
            {() =>
              day ? (
                <DayTimeline day={day} />
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title={date === today ? "Today's journal has not been shared yet." : 'There is no journal for this day.'}
                  text={date === today ? 'It appears here as soon as the school publishes it.' : 'Choose a day marked with a dot.'}
                  soft
                />
              )
            }
          </Loadable>
        </section>
      </div>
    </>
  )
}

// ---------- Camera ----------

export function ParentCameraPage() {
  const { user } = useStore()
  const { kids, child, pick } = useChild()
  const allowed = user.cameraAccess !== false
  const q = useWatch(allowed ? child?.id : null)
  if (!child) return <NoChild />

  const cams = q.data?.cameras || []
  const live = cams.find((c) => c.state === 'LIVE' && c.streamUrl)
  const first = live || cams[0]

  return (
    <div className="narrow wide">
      <PageHeader title="Classroom Camera" subtitle={`${child.className} · ${child.name}`} actions={allowed && first && <CameraBadge state={first.state} />} />
      <ChildSwitcher kids={kids} child={child} pick={pick} />

      {!allowed ? (
        <div className="card">
          <EmptyState icon={Lock} title="Camera access is not available for this account." text="Please contact the school office if you think this is a mistake." soft />
        </div>
      ) : (
        <Loadable
          q={q}
          skeleton={
            <section className="card">
              <div className="cam-frame">
                <span className="skeleton cam-skeleton" />
              </div>
            </section>
          }
        >
          {() => (
            <>
              <section className="card">
                {!first ? (
                  <EmptyState icon={VideoOff} title="This class has no camera." text="Please contact the school office." soft />
                ) : live ? (
                  <>
                    <CameraPlayer key={live.id} src={live.streamUrl} label={`${child.className} · ${live.name}`} />
                    <span className="muted">
                      <CameraStatusText cam={live} />
                    </span>
                  </>
                ) : (
                  <>
                    <CameraPreview state={first.state} />
                    <div>
                      <strong>{first.state === 'SCHEDULED' ? 'Scheduled' : 'The classroom camera is currently unavailable.'}</strong>
                      <span className="muted block">
                        <CameraStatusText cam={first} />. The school opens the camera only at set times.
                      </span>
                    </div>
                  </>
                )}
              </section>

              <section className="card" id="schedule">
                <div className="card-head">
                  <h2>Viewing times</h2>
                  <CalendarClock size={18} />
                </div>
                {cams.length === 0 ? (
                  <EmptyState icon={CalendarClock} title="No viewing times are scheduled." text="The school will notify you when the camera is available." soft />
                ) : (
                  <ul className="plain-list">
                    {cams.map((c) => (
                      <li key={c.id} className="row-between">
                        <span>
                          <strong>{c.name}</strong>
                          <span className="muted block small">{c.window ? `${dayLabel(c.window.date)} · ${fmtLongDate(c.window.date)}` : 'Not scheduled'}</span>
                        </span>
                        <span className="cell-user">
                          {c.window && (
                            <span className="chip">
                              {c.window.start}–{c.window.end}
                            </span>
                          )}
                          <CameraBadge state={c.state} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </Loadable>
      )}
      <p className="privacy-note">
        <ShieldCheck size={16} /> Only parents of {child.className} can watch, and only during the times set by the school.
      </p>
    </div>
  )
}

// ---------- More ----------

export function ParentMorePage() {
  const { user, counts } = useStore()
  const { child } = useChild()
  const [askLogout, logoutDialog] = useLogout()
  const unread = counts.notifications
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
            <span className="muted">{child ? `${child.relationship} of ${child.name}${child.className ? ` · ${child.className}` : ''}` : 'Parent'}</span>
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
  const q = useAnnouncements(50)
  const list = (q.data?.items || []).map(toAnnouncement)
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
