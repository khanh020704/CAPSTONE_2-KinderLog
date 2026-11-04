import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Baby,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  GraduationCap,
  HeartPulse,
  Link2,
  Megaphone,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  Printer,
  School,
  Send,
  ShieldCheck,
  Trash2,
  Unlink,
  Users,
  Video,
} from 'lucide-react'
import { INITIAL_PASSWORD, useStore } from '../store/store'
import { addDays, dayLabel, fmtDate, fmtDateTime, greeting, relTime, todayISO } from '../lib/utils'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_CATEGORIES, announcementParam, fromAnnouncement, fromSemester, fromYear, toAnnouncement, toAuditRow, toYear } from '../lib/mappers'
import { GENDER, GENDER_OPTIONS, HEALTH, RELATIONSHIP, RELATIONSHIP_OPTIONS, STATUS, STATUS_KEY, errorText, label, weekdaysText } from '../lib/labels'
import { resetPasswordAction, statusActions } from '../lib/actions'
import CrudPage, { FormFields, validateFields } from '../components/CrudPage'
import { CameraBadge, CameraPlayer, CameraPreview, CameraStatusText, PEER_STREAM, peerCode } from '../components/Camera'
import { ActivityList } from './admin'
import { Avatar, ConfirmDialog, EmptyState, Loadable, Modal, PageHeader, SegBar, Select, SkeletonCards, SkeletonTable, StatCard, StatusBadge, useToast } from '../components/ui'

const ACCOUNT_STATUS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
]
const USER_STATUS = ['Active', 'Inactive', 'Locked']
const dateOf = (ts) => (ts ? fmtDate(String(ts).slice(0, 10)) : '—')
const lastLogin = (u) => (u.lastLoginAt ? relTime(new Date(u.lastLoginAt).getTime()) : 'Never')
const statusOf = (r) => STATUS[r.status] || r.status
const blankToNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim())
const blankToUndef = (v) => blankToNull(v) ?? undefined

// Lists every principal page needs; each reloads independently after a change.
const useClasses = () => useApi(() => api.classes.list(), [])
const usePeople = (role) => useApi(() => api.users.list({ role }), [role])
const useStudents = () => useApi(() => api.students.list(), [])

// ---------- Dashboard ----------

// Today's journal of a class, as one of three steps for the principal.
const JOURNAL_COMPLETION = { NOT_STARTED: 'Not Started', DRAFT: 'In Progress', PARTIAL: 'In Progress', APPROVED: 'Completed' }

export function PrincipalDashboard() {
  const { user } = useStore()
  const activity = useApi(() => api.auditLogs.list({ limit: 6 }), [])
  const today = todayISO()
  const dash = useApi(() => api.reports.dashboard({ from: today, to: today }), [])
  const cams = useApi(() => api.cameras.list(), [])
  const classes = useClasses()
  const teacherOf = (classId) => classes.data?.find((c) => c.id === classId)?.homeroomTeacher?.fullName

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name}`} subtitle="School overview for today" />
      <Loadable q={dash} skeleton={<SkeletonCards count={6} />}>
        {(d) => {
          const todays = d.today.classes
          const sum = (k) => todays.reduce((s, c) => s + c[k], 0)
          const unrecorded = todays.reduce((s, c) => s + Math.max(0, c.total - c.present - c.absent), 0)
          const progress = todays.map((c) => JOURNAL_COMPLETION[c.journalState])
          const countOf = (v) => progress.filter((p) => p === v).length
          const attention = [
            ...(classes.data || [])
              .filter((c) => !c.homeroomTeacherId && c.status === 'ACTIVE')
              .map((c) => ({ icon: GraduationCap, title: 'No head teacher', body: `${c.name} has no head teacher assigned.` })),
            ...todays
              .filter((c) => c.logged === 0)
              .map((c) => ({ icon: ClipboardCheck, title: 'Attendance not recorded', body: `${c.className} has not recorded attendance today.` })),
            ...todays
              .map((c, i) => ({ c, p: progress[i] }))
              .filter((x) => x.p !== 'Completed')
              .map(({ c, p }) => ({
                icon: BookOpen,
                title: p === 'In Progress' ? 'Journal in progress' : 'Journal not started',
                body: p === 'In Progress' ? `${c.className} journal is still being prepared.` : `${c.className} has not started today's journal.`,
              })),
            ...d.healthAlerts
              .filter((h) => h.date === today)
              .map((h) => ({
                icon: HeartPulse,
                title: `Health: ${h.studentName}`,
                body: `${label(HEALTH, h.healthStatus)}${h.temperature ? ` · ${h.temperature}°C` : ''}${h.note ? ` · ${h.note}` : ''}`,
              })),
          ]
          return (
            <>
              <div className="grid stats">
                <StatCard icon={School} label="Classes" value={d.overview.classes} tint="sky" />
                <StatCard icon={Baby} label="Students" value={d.overview.students} tint="peach" />
                <StatCard icon={GraduationCap} label="Teachers" value={d.overview.teachers} tint="lav" />
                <StatCard icon={CheckCircle2} label="Present Today" value={`${sum('present')} / ${sum('total')}`} tint="mint" />
                <StatCard icon={BookOpen} label="Journal Completion" value={`${countOf('Completed')} / ${todays.length}`} hint="classes approved today" tint="cream" />
                <StatCard icon={MessageCircle} label="Unread Messages" value={d.overview.unreadMessages ?? 0} hint="between teachers and parents" tint="sky" />
              </div>

              <div className="grid cols-2">
                <section className="card">
                  <div className="card-head">
                    <h2>Attendance Overview</h2>
                    <span className="muted small">{fmtDate(today)}</span>
                  </div>
                  <SegBar
                    parts={[
                      { label: 'Present', value: sum('present'), tone: 'success' },
                      { label: 'Absent', value: sum('absent'), tone: 'error' },
                      { label: 'Not recorded', value: unrecorded, tone: 'neutral' },
                    ]}
                  />
                </section>

                <section className="card">
                  <div className="card-head">
                    <h2>Journal Completion</h2>
                    <span className="muted small">by class</span>
                  </div>
                  <SegBar
                    parts={[
                      { label: 'Completed', value: countOf('Completed'), tone: 'success' },
                      { label: 'In Progress', value: countOf('In Progress'), tone: 'warning' },
                      { label: 'Not Started', value: countOf('Not Started'), tone: 'neutral' },
                    ]}
                  />
                </section>
              </div>

              <section className="card table-card" style={{ margin: '16px 0' }}>
                <div className="card-head pad">
                  <h2>Class Overview</h2>
                  <Link to="/principal/classes">Manage classes</Link>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Teacher</th>
                      <th>Students</th>
                      <th>Attendance</th>
                      <th>Journal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todays.map((c, i) => (
                      <tr key={c.classId}>
                        <td data-label="Class" className="td-primary">
                          {c.className}
                        </td>
                        <td data-label="Teacher">{teacherOf(c.classId) || <span className="muted">Not assigned</span>}</td>
                        <td data-label="Students">{c.total}</td>
                        <td data-label="Attendance">{c.logged ? `${c.present} present · ${c.absent} absent` : <StatusBadge status="Not recorded" />}</td>
                        <td data-label="Journal">
                          <StatusBadge status={progress[i]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {todays.length === 0 && <EmptyState icon={School} title="No classes yet." text="Create the first class in Classes." />}
              </section>

              <div className="grid cols-2">
                <section className="card">
                  <div className="card-head">
                    <h2>Camera Overview</h2>
                    <Link className="btn btn-sm" to="/principal/cameras">
                      <Video size={16} /> View Cameras
                    </Link>
                  </div>
                  {cams.data?.length === 0 && <p className="muted small">No cameras have been added yet.</p>}
                  <ul className="plain-list">
                    {(cams.data || []).map((c) => (
                      <li key={c.id} className="row-between">
                        <span>
                          <strong>
                            {c.class?.name} · {c.name}
                          </strong>
                          <span className="muted block small">
                            <CameraStatusText cam={c} />
                          </span>
                        </span>
                        <CameraBadge state={c.state} />
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="card">
                  <div className="card-head">
                    <h2>Important Notifications</h2>
                  </div>
                  {attention.length === 0 ? (
                    <EmptyState icon={CheckCircle2} title="You're all caught up." text="Nothing needs your attention right now." />
                  ) : (
                    <ul className="plain-list">
                      {attention.map((n, i) => (
                        <li key={i} className="summary-item">
                          <span className="summary-icon tint-cream">
                            <n.icon size={18} />
                          </span>
                          <div>
                            <strong>{n.title}</strong>
                            <span className="muted block small">{n.body}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="card">
                  <div className="card-head">
                    <h2>Recent Activity</h2>
                    <Link to="/principal/audit">Open audit logs</Link>
                  </div>
                  <ActivityList items={(activity.data?.items || []).map(toAuditRow)} />
                </section>
              </div>
            </>
          )
        }}
      </Loadable>
    </>
  )
}

// ---------- School Profile ----------

const SCHOOL_FIELDS = [
  { name: 'name', label: 'School Name', required: true, full: true },
  { name: 'address', label: 'Address', required: true, full: true },
  { name: 'phone', label: 'Phone', required: true, validate: (v) => (!/^0\d{9,10}$/.test(v || '') ? 'Enter a valid phone number.' : '') },
  { name: 'email', label: 'Email', type: 'email', required: true },
]

export function SchoolProfilePage() {
  const { user } = useStore()
  const toast = useToast()
  const school = useApi(() => api.schools.mine(), [])
  const dash = useApi(() => api.reports.dashboard(), [])
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const currentYear = useApi(() => api.academicYears.current(), [])
  const year = currentYear.data
  const values = form || school.data

  const save = async (e) => {
    e.preventDefault()
    const errs = validateFields(SCHOOL_FIELDS, values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const saved = await api.schools.updateMine({ name: values.name.trim(), address: values.address.trim(), phone: values.phone.trim(), email: values.email.trim() })
      school.setData(saved)
      setForm(null)
      toast('School profile saved successfully.')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="narrow wide">
      <PageHeader title="School Profile" subtitle="Information shown to teachers and parents" />
      <Loadable q={school} skeleton={<SkeletonTable rows={3} />}>
        {(s) => (
          <>
            <form className="card form-card" onSubmit={save} noValidate>
              <h2>Basic Information</h2>
              <FormFields fields={SCHOOL_FIELDS} form={values} setForm={(fn) => setForm((f) => fn(f || s))} errors={errors} />
              <dl className="details">
                <div>
                  <dt>Principal</dt>
                  <dd>{user.name}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={statusOf(s)} />
                  </dd>
                </div>
              </dl>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving || !form}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>

            <div className="card">
              <h2>School Overview</h2>
              <dl className="details compact">
                <div>
                  <dt>Classes</dt>
                  <dd>{dash.data?.overview.classes ?? '…'}</dd>
                </div>
                <div>
                  <dt>Teachers</dt>
                  <dd>{dash.data?.overview.teachers ?? '…'}</dd>
                </div>
                <div>
                  <dt>Students</dt>
                  <dd>{dash.data?.overview.students ?? '…'}</dd>
                </div>
                <div>
                  <dt>Parents</dt>
                  <dd>{dash.data?.overview.parents ?? '…'}</dd>
                </div>
                <div>
                  <dt>Cameras</dt>
                  <dd>{dash.data?.overview.cameras ?? '…'}</dd>
                </div>
                <div>
                  <dt>Current academic year</dt>
                  <dd>{year?.name || 'Not set'}</dd>
                </div>
              </dl>
            </div>
          </>
        )}
      </Loadable>
    </div>
  )
}

// ---------- Academic Year (classes store the year name, e.g. 2026-2027) ----------

const YEAR_FIELDS = [
  { name: 'name', label: 'Academic Year', required: true, placeholder: 'e.g. 2027–2028' },
  { name: 'status', label: 'Status', type: 'select', required: true, options: ['Current', 'Upcoming', 'Archived'], placeholder: undefined },
  { name: 'start', label: 'Start Date', type: 'date', required: true },
  { name: 'end', label: 'End Date', type: 'date', required: true, validate: (v, f) => (f.start && v <= f.start ? 'End date must be after the start date.' : '') },
]

export function AcademicYearPage() {
  const toast = useToast()
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const classes = useClasses()
  const yearsQ = useApi(() => api.academicYears.list(), [])
  const years = (yearsQ.data || []).map(toYear) // newest first
  const current = years.find((y) => y.status === 'Current')
  // Classes store the year as "2026-2027"; the year name may be typed with an en dash.
  const classCount = (y) => (classes.data || []).filter((c) => c.academicYear === y.name.trim().replace(/\s*[–—-]\s*/, '-')).length

  const open = (y) => {
    setForm(y || { name: '', status: 'Upcoming', start: '', end: '' })
    setErrors({})
    setEditing(y)
  }

  const save = async (e) => {
    e.preventDefault()
    const errs = validateFields(YEAR_FIELDS, form)
    const body = fromYear(form)
    if (!errs.name && !/^\d{4}-\d{4}$/.test(body.name)) errs.name = 'Use two consecutive years, e.g. 2027–2028.'
    if (!errs.name && years.some((y) => y.name === body.name && y.id !== editing?.id)) errs.name = 'This academic year already exists.'
    setErrors(errs)
    if (Object.keys(errs).length || saving) return
    // Only one year can be current: the backend makes the previous current year inactive.
    setSaving(true)
    try {
      if (editing) await api.academicYears.update(editing.id, body)
      else await api.academicYears.create(body)
      yearsQ.reload()
      toast(`Academic year ${editing ? 'updated' : 'created'} successfully.`)
      setEditing(undefined)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="narrow wide">
      <PageHeader
        title="Academic Year"
        subtitle="Classes are organised by academic year"
        actions={
          <button className="btn btn-primary" onClick={() => open(null)}>
            <Plus size={18} /> Create Academic Year
          </button>
        }
      />
      <div className="card">
        <div className="card-head">
          <h2>Current Academic Year</h2>
          {current && (
            <button className="btn btn-sm" onClick={() => open(current)}>
              <Pencil size={16} /> Edit
            </button>
          )}
        </div>
        {current ? (
          <>
            <div className="row-between">
              <strong className="stat-value">{current.name}</strong>
              <StatusBadge status={current.status} />
            </div>
            <dl className="details compact">
              <div>
                <dt>Start date</dt>
                <dd>{fmtDate(current.start)}</dd>
              </div>
              <div>
                <dt>End date</dt>
                <dd>{fmtDate(current.end)}</dd>
              </div>
              <div>
                <dt>Classes</dt>
                <dd>{classes.data ? classCount(current) : '—'}</dd>
              </div>
              <div>
                <dt>Current semester</dt>
                <dd>{current.semesters.find((s) => s.status === 'Current')?.name || '—'}</dd>
              </div>
            </dl>
          </>
        ) : (
          <EmptyState icon={CalendarDays} title="No current academic year." text="Create one or mark an existing year as current." />
        )}
      </div>

      <div className="card">
        <h2>All Academic Years</h2>
        {years.length === 0 && <EmptyState icon={CalendarDays} title="No academic years yet." text="Use Create Academic Year to add the first one." />}
        <ul className="plain-list">
          {years.map((y) => (
            <li key={y.id}>
              <div className="row-between">
                <span>
                  <strong>{y.name}</strong>
                  <span className="muted block small">
                    {fmtDate(y.start)} – {fmtDate(y.end)}
                  </span>
                </span>
                <span className="cell-user">
                  <StatusBadge status={y.status} />
                  <button className="icon-btn" onClick={() => open(y)} aria-label={`Edit ${y.name}`}>
                    <Pencil size={18} />
                  </button>
                </span>
              </div>
              <SemesterList year={y} onChange={yearsQ.reload} />
            </li>
          ))}
        </ul>
      </div>

      <Modal open={editing !== undefined} title={editing ? 'Edit Academic Year' : 'Create Academic Year'} onClose={() => setEditing(undefined)}>
        <form onSubmit={save} noValidate>
          <FormFields fields={YEAR_FIELDS} form={form} setForm={setForm} errors={errors} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save Changes' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ---------- Semesters (học kỳ) of an academic year ----------

const semesterFields = (year) => [
  { name: 'name', label: 'Semester', required: true, placeholder: 'e.g. Học kỳ 1' },
  {
    name: 'start',
    label: 'Start Date',
    type: 'date',
    required: true,
    validate: (v) => (v && (v < year.start || v > year.end) ? `Must be within ${year.name}.` : ''),
  },
  {
    name: 'end',
    label: 'End Date',
    type: 'date',
    required: true,
    validate: (v, f) => (f.start && v <= f.start ? 'End date must be after the start date.' : v && v > year.end ? `Must be within ${year.name}.` : ''),
  },
]

function SemesterList({ year, onChange }) {
  const toast = useToast()
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new
  const [removing, setRemoving] = useState(null)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const fields = semesterFields(year)

  const open = (s) => {
    setForm(s ? { name: s.name, start: s.start, end: s.end } : { name: `Học kỳ ${year.semesters.length + 1}`, start: '', end: '' })
    setErrors({})
    setEditing(s)
  }

  const save = async (e) => {
    e.preventDefault()
    const errs = validateFields(fields, form)
    const body = fromSemester(form)
    const others = year.semesters.filter((s) => s.id !== editing?.id)
    if (!errs.name && others.some((s) => s.name.toLowerCase() === body.name.toLowerCase())) errs.name = 'This semester already exists.'
    const overlap = !errs.start && !errs.end && others.find((s) => body.startDate <= s.end && s.start <= body.endDate)
    if (overlap) errs.start = `Overlaps ${overlap.name} (${fmtDate(overlap.start)} – ${fmtDate(overlap.end)}).`
    setErrors(errs)
    if (Object.keys(errs).length || saving) return
    setSaving(true)
    try {
      if (editing) await api.academicYears.updateSemester(editing.id, body)
      else await api.academicYears.addSemester(year.id, body)
      onChange()
      toast(`Semester ${editing ? 'updated' : 'added'} successfully.`)
      setEditing(undefined)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await api.academicYears.removeSemester(removing.id)
      onChange()
      toast(`${removing.name} deleted.`)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="semester-list">
      {year.semesters.length === 0 && <span className="muted small">No semesters yet.</span>}
      {year.semesters.map((s) => (
        <div key={s.id} className="row-between semester-row">
          <span>
            <strong>{s.name}</strong>
            <span className="muted small">
              {' '}
              · {fmtDate(s.start)} – {fmtDate(s.end)}
            </span>
          </span>
          <span className="cell-user">
            <StatusBadge status={s.status} />
            <button className="icon-btn" onClick={() => open(s)} aria-label={`Edit ${s.name}`}>
              <Pencil size={16} />
            </button>
            <button className="icon-btn" onClick={() => setRemoving(s)} aria-label={`Delete ${s.name}`}>
              <Trash2 size={16} />
            </button>
          </span>
        </div>
      ))}
      <button className="btn btn-sm semester-add" onClick={() => open(null)}>
        <Plus size={16} /> Add Semester
      </button>

      <Modal open={editing !== undefined} title={`${editing ? 'Edit' : 'Add'} Semester · ${year.name}`} onClose={() => setEditing(undefined)}>
        <form onSubmit={save} noValidate>
          <FormFields fields={fields} form={form} setForm={setForm} errors={errors} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save Changes' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!removing}
        title="Delete semester?"
        body={removing && `${removing.name} (${fmtDate(removing.start)} – ${fmtDate(removing.end)}) will be removed from ${year.name}.`}
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}

// ---------- Classes ----------

export function ClassesPage() {
  const toast = useToast()
  const classes = useClasses()
  const teachers = usePeople('TEACHER')
  const rows = classes.data || []
  const years = [...new Set(rows.map((c) => c.academicYear))].sort().reverse()
  const teacherName = (c) => c.homeroomTeacher?.fullName

  return (
    <CrudPage
      title="Classes"
      subtitle="Classes of the school and their head teachers"
      noun="Class"
      addLabel="Add Class"
      rows={rows}
      loading={classes.loading}
      error={classes.error}
      onRetry={classes.reload}
      searchText={(c) => `${c.name} ${teacherName(c) || ''}`}
      searchPlaceholder="Search class or teacher"
      filters={[
        { key: 'year', label: 'academic years', options: years, get: (c) => c.academicYear },
        { key: 'status', label: 'statuses', options: ACCOUNT_STATUS, get: statusOf },
      ]}
      columns={[
        { key: 'name', label: 'Class Name', sort: (c) => c.name },
        { key: 'year', label: 'Academic Year', render: (c) => c.academicYear },
        { key: 'teacher', label: 'Head Teacher', render: (c) => teacherName(c) || <span className="muted">Not assigned</span> },
        { key: 'students', label: 'Students', sort: (c) => c.studentCount, render: (c) => c.studentCount },
        { key: 'status', label: 'Status', render: (c) => <StatusBadge status={statusOf(c)} /> },
      ]}
      fields={(form, editing) => [
        { name: 'name', label: 'Class Name', required: true, placeholder: 'e.g. Mặt Trời 3' },
        {
          name: 'academicYear',
          label: 'Academic Year',
          required: true,
          placeholder: '2026-2027',
          validate: (v) => (!/^\d{4}-\d{4}$/.test(v || '') ? 'Use the form 2026-2027.' : ''),
        },
        {
          name: 'homeroomTeacherId',
          label: 'Head Teacher',
          type: 'select',
          placeholder: 'Not assigned',
          options: (teachers.data || []).filter((t) => t.status === 'ACTIVE').map((t) => ({ value: t.id, label: t.fullName })),
        },
        ...(editing ? [{ name: 'status', label: 'Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined }] : []),
      ]}
      initial={(c) =>
        c
          ? { name: c.name, academicYear: c.academicYear, homeroomTeacherId: c.homeroomTeacherId || '', status: statusOf(c) }
          : { name: '', academicYear: rows[0]?.academicYear || '2026-2027', homeroomTeacherId: '' }
      }
      onSave={async (form, editing) => {
        const body = { name: form.name.trim(), academicYear: form.academicYear.trim(), homeroomTeacherId: form.homeroomTeacherId || null }
        if (editing) await api.classes.update(editing.id, { ...body, status: STATUS_KEY[form.status] })
        else await api.classes.create(body)
        classes.reload()
      }}
      viewRows={(c) => [
        ['Class Name', c.name],
        ['Academic Year', c.academicYear],
        ['Head Teacher', teacherName(c) || 'Not assigned'],
        ['Students', c.studentCount],
        ['Status', <StatusBadge status={statusOf(c)} />],
      ]}
      actions={(row) => [
        ...statusActions({ row, name: row.name, noun: 'Class', save: (status) => api.classes.update(row.id, { status }), done: classes.reload, toast, lock: false }),
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          confirm: { title: `Delete ${row.name}?`, body: 'Only an empty class can be deleted. Move or remove its students first.' },
          onClick: async () => {
            await api.classes.remove(row.id)
            toast(`${row.name} has been deleted.`)
            classes.reload()
          },
        },
      ]}
      empty={{ icon: School, title: 'No classes have been added yet.' }}
    />
  )
}

// ---------- Teachers ----------

export function TeachersPage() {
  const toast = useToast()
  const teachers = usePeople('TEACHER')
  const classes = useClasses()
  const classesOf = (t) => (classes.data || []).filter((c) => c.homeroomTeacherId === t.id)
  const reload = () => {
    teachers.reload()
    classes.reload()
  }

  return (
    <CrudPage
      title="Teachers"
      subtitle="Teacher accounts are created by the principal"
      noun="Teacher"
      addLabel="Add Teacher"
      rows={teachers.data || []}
      loading={teachers.loading}
      error={teachers.error}
      onRetry={teachers.reload}
      searchText={(t) =>
        `${t.fullName} ${t.phone} ${t.email || ''} ${classesOf(t)
          .map((c) => c.name)
          .join(' ')}`
      }
      searchPlaceholder="Search name, phone or class"
      filters={[{ key: 'status', label: 'statuses', options: USER_STATUS, get: statusOf }]}
      columns={[
        {
          key: 'name',
          label: 'Name',
          sort: (t) => t.fullName,
          render: (t) => (
            <span className="cell-user">
              <Avatar name={t.fullName} size={34} /> {t.fullName}
            </span>
          ),
        },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        {
          key: 'class',
          label: 'Assigned Class',
          render: (t) =>
            classesOf(t)
              .map((c) => c.name)
              .join(', ') || <span className="muted">Not assigned</span>,
        },
        { key: 'status', label: 'Status', render: (t) => <StatusBadge status={statusOf(t)} /> },
        { key: 'lastLogin', label: 'Last Login', render: lastLogin },
      ]}
      fields={(form, editing) => [
        { name: 'fullName', label: 'Full Name', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${INITIAL_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email', required: true },
        {
          name: 'classId',
          label: 'Assigned Class',
          type: 'select',
          placeholder: 'Not assigned',
          options: (classes.data || []).map((c) => ({
            value: c.id,
            label: `${c.name}${c.homeroomTeacher && c.homeroomTeacherId !== editing?.id ? ` (now: ${c.homeroomTeacher.fullName})` : ''}`,
          })),
          hint: 'Assigning replaces the current head teacher of that class.',
        },
        { name: 'status', label: 'Status', type: 'select', required: true, options: USER_STATUS, placeholder: undefined },
      ]}
      initial={(t) =>
        t
          ? { fullName: t.fullName, phone: t.phone, email: t.email || '', classId: classesOf(t)[0]?.id || '', status: statusOf(t) }
          : { fullName: '', phone: '', email: '', classId: '', status: 'Active' }
      }
      onSave={async ({ classId, status, ...form }, editing) => {
        const body = { fullName: form.fullName.trim(), phone: form.phone.trim(), email: blankToUndef(form.email) }
        const saved = editing ? await api.users.update(editing.id, body) : await api.users.create({ ...body, role: 'TEACHER' })
        // New accounts start Active; any other status (or a change) goes through the status endpoint.
        if (status !== (editing ? statusOf(editing) : 'Active')) await api.users.setStatus(saved.id, STATUS_KEY[status])
        const before = editing ? classesOf(editing)[0]?.id || '' : ''
        if (classId !== before) {
          if (before) await api.classes.update(before, { homeroomTeacherId: null })
          if (classId) await api.classes.update(classId, { homeroomTeacherId: saved.id })
        }
        reload()
      }}
      viewRows={(t) => [
        ['Full Name', t.fullName],
        ['Phone', t.phone],
        ['Email', t.email],
        [
          'Assigned Class',
          classesOf(t)
            .map((c) => c.name)
            .join(', ') || 'Not assigned',
        ],
        ['Status', <StatusBadge status={statusOf(t)} />],
        ['Created Date', dateOf(t.createdAt)],
        ['Last Login', t.lastLoginAt ? fmtDateTime(new Date(t.lastLoginAt).getTime()) : 'Never'],
      ]}
      actions={(row) => [
        resetPasswordAction({ row, reset: () => api.users.resetPassword(row.id), toast }),
        ...statusActions({ row, noun: 'Teacher', save: (s) => api.users.setStatus(row.id, s), done: teachers.reload, toast }),
      ]}
      empty={{ icon: GraduationCap, title: 'No teacher accounts yet.' }}
    />
  )
}

// ---------- Students ----------

const parentsText = (s) =>
  s.parentLinks
    .map((l) => l.parent?.fullName)
    .filter(Boolean)
    .join(', ')

// The parent shown first for a child: the primary contact, else the first linked parent.
const mainLink = (s) => s.parentLinks?.find((l) => l.isPrimary) || s.parentLinks?.[0]

export function StudentsPage() {
  const toast = useToast()
  const students = useStudents()
  const classes = useClasses()
  const parents = usePeople('PARENT')

  return (
    <CrudPage
      title="Students"
      subtitle="Students are added and managed by the principal"
      noun="Student"
      addLabel="Add Student"
      rows={students.data || []}
      loading={students.loading}
      error={students.error}
      onRetry={students.reload}
      searchText={(s) => `${s.fullName} ${s.class?.name || ''} ${parentsText(s)}`}
      searchPlaceholder="Search student, class or parent"
      // the child's age is compared with the class's age group: a mismatch is a warning, not an error
      filters={[
        { key: 'class', label: 'classes', options: (classes.data || []).map((c) => ({ value: c.id, label: c.name })), get: (s) => s.classId },
        { key: 'status', label: 'statuses', options: ACCOUNT_STATUS, get: statusOf },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Full Name',
          sort: (s) => s.fullName,
          render: (s) => (
            <span className="cell-user">
              <Avatar name={s.fullName} src={s.avatarUrl} size={34} /> {s.fullName}
            </span>
          ),
        },
        { key: 'dob', label: 'Date of Birth', sort: (s) => s.dateOfBirth, render: (s) => fmtDate(s.dateOfBirth) },
        { key: 'gender', label: 'Gender', render: (s) => label(GENDER, s.gender) },
        { key: 'class', label: 'Class', render: (s) => s.class?.name },
        { key: 'parent', label: 'Parent', render: (s) => parentsText(s) || <span className="muted">Not linked</span> },
        { key: 'allergies', label: 'Allergies', render: (s) => s.allergies || <span className="muted">None</span> },
        { key: 'status', label: 'Status', render: (s) => <StatusBadge status={statusOf(s)} /> },
      ]}
      fields={(form) => [
        { name: 'avatarUrl', label: 'Photo', type: 'photo', full: true },
        { name: 'fullName', label: 'Full Name', required: true },
        {
          name: 'dateOfBirth',
          label: 'Date of Birth',
          type: 'date',
          required: true,
          validate: (v) => (v > todayISO() ? 'Date of birth cannot be in the future.' : ''),
        },
        { name: 'gender', label: 'Gender', type: 'select', required: true, options: GENDER_OPTIONS },
        {
          name: 'classId',
          label: 'Class',
          type: 'select',
          required: true,
          options: (classes.data || []).filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name })),
        },
        // A new student usually arrives with a parent who has no account yet, so the parent can be created right here.
        {
          name: 'parentMode',
          label: 'Parent / Guardian',
          type: 'select',
          full: true,
          placeholder: undefined,
          options: [
            { value: 'new', label: 'New parent — create an account now' },
            { value: 'existing', label: 'Parent already has an account (e.g. a sibling is enrolled)' },
            { value: 'later', label: 'Add the parent later' },
          ],
        },
        ...(form.parentMode === 'new'
          ? [
              { name: 'parentName', label: 'Parent Full Name', required: true },
              { name: 'parentPhone', label: 'Parent Phone', type: 'tel', required: true, hint: `The parent signs in with this number. Initial password: ${INITIAL_PASSWORD}` },
            ]
          : []),
        ...(form.parentMode === 'existing'
          ? [
              {
                name: 'parentId',
                label: 'Parent',
                type: 'combobox',
                required: true,
                placeholder: 'Search parent by name or phone',
                options: (parents.data || []).map((p) => ({ value: p.id, label: p.fullName, sub: p.phone })),
              },
            ]
          : []),
        ...(form.parentMode !== 'later'
          ? [{ name: 'relationship', label: 'Relationship to the child', type: 'select', options: RELATIONSHIP_OPTIONS, placeholder: undefined }]
          : []),
        { name: 'status', label: 'Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined },
        { name: 'medicalNote', label: 'Notes for the teacher', type: 'textarea', rows: 3, placeholder: 'Allergies, pick-up arrangements, things the teacher should know' },
      ]}
      initial={(s) => {
        // Editing shows the child's main parent, already selected, so it can be kept or changed.
        const link = s && mainLink(s)
        return s
          ? {
              avatarUrl: s.avatarUrl || '',
              fullName: s.fullName,
              dateOfBirth: s.dateOfBirth,
              gender: s.gender,
              classId: s.classId,
              parentMode: link ? 'existing' : 'later',
              parentId: link?.parentId || '',
              relationship: link?.relationship || 'MOTHER',
              status: statusOf(s),
              medicalNote: s.medicalNote || '',
            }
          : {
              avatarUrl: '',
              fullName: '',
              dateOfBirth: '',
              gender: '',
              classId: '',
              parentMode: 'new',
              parentName: '',
              parentPhone: '',
              parentId: '',
              relationship: 'MOTHER',
              status: 'Active',
              medicalNote: '',
            }
      }}
      onSave={async ({ parentMode, parentId, parentName, parentPhone, relationship, status, avatarUrl, ...form }, editing) => {
        // Create the parent first: a phone number already in use fails before the student is created.
        let linkTo = parentMode === 'existing' ? parentId : ''
        if (parentMode === 'new') linkTo = (await api.users.create({ fullName: parentName.trim(), phone: parentPhone.trim(), role: 'PARENT' })).id
        const body = { ...form, fullName: form.fullName.trim(), medicalNote: blankToNull(form.medicalNote) }
        let saved
        try {
          saved = editing ? await api.students.update(editing.id, { ...body, status: STATUS_KEY[status] }) : await api.students.create(body)
          // a new student starts Active; another status chosen in the form is applied right after
          if (!editing && status !== 'Active') saved = await api.students.update(saved.id, { status: STATUS_KEY[status] })
        } catch (err) {
          // do not leave a parent account behind for a student that was not saved (a retry would hit "phone in use")
          if (parentMode === 'new') await api.users.remove(linkTo).catch(() => {})
          throw err
        }
        // The chosen parent replaces the main one; nothing is sent when the parent and relationship are unchanged.
        const current = editing && mainLink(editing)
        if (linkTo && (current?.parentId !== linkTo || current.relationship !== relationship)) {
          await api.students.linkParent(saved.id, linkTo, relationship, current ? current.isPrimary || current.parentId !== linkTo : true)
          if (current && current.parentId !== linkTo) await api.students.unlinkParent(saved.id, current.parentId)
        }
        // A newly picked photo is still a data URL in the form: upload it as a file.
        if (avatarUrl?.startsWith('data:')) {
          const blob = await (await fetch(avatarUrl)).blob()
          await api.students.uploadAvatar(saved.id, new File([blob], `avatar.${blob.type.split('/')[1] || 'jpg'}`, { type: blob.type }))
        }
        students.reload()
        if (parentMode === 'new') parents.reload()
      }}
      viewRows={(s) => [
        ['Full Name', s.fullName],
        ['Date of Birth', fmtDate(s.dateOfBirth)],
        ['Gender', label(GENDER, s.gender)],
        ['Class', s.class?.name],
        ['Parent', s.parentLinks.map((l) => `${l.parent?.fullName} (${label(RELATIONSHIP, l.relationship)})`).join(', ')],
        ['Notes for the teacher', s.medicalNote],
        ['Status', <StatusBadge status={statusOf(s)} />],
      ]}
      actions={(row) => [
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          confirm: { title: `Delete ${row.fullName}?`, body: 'The student, their journals and photos, and the links to parent accounts are removed. This cannot be undone.' },
          onClick: async () => {
            await api.students.remove(row.id)
            toast(`${row.fullName} has been deleted.`)
            students.reload()
          },
        },
      ]}
      empty={{ icon: Baby, title: 'No students have been added yet.' }}
    />
  )
}

// ---------- Parents ----------

export function ParentsPage() {
  const toast = useToast()
  const parents = usePeople('PARENT')
  const students = useStudents()
  const classes = useClasses()
  const linksOf = (p) => (students.data || []).flatMap((s) => s.parentLinks.filter((l) => l.parentId === p.id).map((l) => ({ ...l, student: s })))
  const children = (p) =>
    linksOf(p)
      .map((l) => l.student.fullName)
      .join(', ')
  const relation = (p) => [...new Set(linksOf(p).map((l) => label(RELATIONSHIP, l.relationship)))].join(', ')
  const reload = () => {
    parents.reload()
    students.reload()
  }

  return (
    <CrudPage
      title="Parents"
      subtitle="Parent accounts are created by the school. Parents cannot register themselves."
      noun="Parent"
      addLabel="Add Parent"
      rows={parents.data || []}
      loading={parents.loading}
      error={parents.error}
      onRetry={parents.reload}
      searchText={(p) => `${p.fullName} ${p.phone} ${p.email || ''} ${children(p)}`}
      searchPlaceholder="Search parent, phone or child"
      filters={[{ key: 'status', label: 'statuses', options: USER_STATUS, get: statusOf }]}
      columns={[
        {
          key: 'name',
          label: 'Name',
          sort: (p) => p.fullName,
          render: (p) => (
            <span className="cell-user">
              <Avatar name={p.fullName} size={34} /> {p.fullName}
            </span>
          ),
        },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'address', label: 'Address' },
        { key: 'child', label: 'Child', render: (p) => children(p) || <span className="muted">Not linked</span> },
        { key: 'relationship', label: 'Relationship', render: (p) => relation(p) || '—' },
        { key: 'status', label: 'Status', render: (p) => <StatusBadge status={statusOf(p)} /> },
      ]}
      fields={(form, editing) => [
        { name: 'fullName', label: 'Full Name', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${INITIAL_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email', hint: 'Needed for the parent to reset a forgotten password.' },
        { name: 'status', label: 'Account Status', type: 'select', required: true, options: USER_STATUS, placeholder: undefined },
        { name: 'address', label: 'Address', full: true },
        // The child may not be enrolled yet, so a new parent can bring a new student with them.
        {
          name: 'childMode',
          label: 'Child',
          type: 'select',
          full: true,
          placeholder: undefined,
          options: [
            { value: 'new', label: 'New student — enrol the child now' },
            { value: 'existing', label: 'Child is already a student of the school' },
            { value: 'later', label: editing ? 'Keep the current children' : 'Link a child later' },
          ],
        },
        ...(form.childMode === 'new'
          ? [
              { name: 'childName', label: 'Child Full Name', required: true },
              { name: 'childDob', label: 'Child Date of Birth', type: 'date', required: true, validate: (v) => (v > todayISO() ? 'Date of birth cannot be in the future.' : '') },
              { name: 'childGender', label: 'Child Gender', type: 'select', required: true, options: GENDER_OPTIONS },
              {
                name: 'childClassId',
                label: 'Class',
                type: 'select',
                required: true,
                options: (classes.data || []).filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name })),
              },
            ]
          : []),
        ...(form.childMode === 'existing'
          ? [
              {
                name: 'studentId',
                label: 'Student',
                type: 'combobox',
                required: true,
                placeholder: 'Search child by name',
                options: (students.data || []).map((s) => ({ value: s.id, label: s.fullName, sub: s.class?.name })),
              },
            ]
          : []),
        ...(form.childMode !== 'later'
          ? [{ name: 'relationship', label: 'Relationship to the child', type: 'select', options: RELATIONSHIP_OPTIONS, placeholder: undefined }]
          : []),
        {
          name: 'cameraAccess',
          label: 'Classroom Camera',
          type: 'select',
          placeholder: undefined,
          options: [
            { value: 'yes', label: 'Allowed during scheduled times' },
            { value: 'no', label: 'Not allowed' },
          ],
        },
      ]}
      initial={(p) => {
        // Editing shows the parent's first linked child, already selected, so it can be kept or changed.
        const link = p && linksOf(p)[0]
        return p
          ? {
              fullName: p.fullName,
              phone: p.phone,
              email: p.email || '',
              status: statusOf(p),
              address: p.address || '',
              childMode: link ? 'existing' : 'later',
              studentId: link?.studentId || '',
              relationship: link?.relationship || 'MOTHER',
              cameraAccess: p.cameraAccess === false ? 'no' : 'yes',
            }
          : {
              fullName: '',
              phone: '',
              email: '',
              address: '',
              childMode: 'new',
              childName: '',
              childDob: '',
              childGender: '',
              childClassId: '',
              studentId: '',
              relationship: 'MOTHER',
              status: 'Active',
              cameraAccess: 'yes',
            }
      }}
      onSave={async ({ childMode, studentId, childName, childDob, childGender, childClassId, relationship, status, cameraAccess, ...form }, editing) => {
        const body = {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: blankToUndef(form.email),
          address: blankToUndef(form.address),
          cameraAccess: cameraAccess === 'yes',
        }
        const saved = editing ? await api.users.update(editing.id, body) : await api.users.create({ ...body, role: 'PARENT' })
        // New accounts start Active; any other status (or a change) goes through the status endpoint.
        if (status !== (editing ? statusOf(editing) : 'Active')) await api.users.setStatus(saved.id, STATUS_KEY[status])
        let linkTo = childMode === 'existing' ? studentId : ''
        try {
          if (childMode === 'new') linkTo = (await api.students.create({ fullName: childName.trim(), dateOfBirth: childDob, gender: childGender, classId: childClassId })).id
        } catch (err) {
          // a new parent whose child could not be saved is removed again, so the form can simply be resubmitted
          if (!editing) await api.users.remove(saved.id).catch(() => {})
          throw err
        }
        // The chosen child replaces the first linked one; nothing is sent when the child and relationship are unchanged.
        const current = editing && linksOf(editing)[0]
        if (linkTo && (current?.studentId !== linkTo || current.relationship !== relationship)) {
          await api.students.linkParent(linkTo, saved.id, relationship, current?.studentId === linkTo ? current.isPrimary : false)
          if (current && current.studentId !== linkTo) await api.students.unlinkParent(current.studentId, saved.id)
        }
        reload()
      }}
      viewRows={(p) => [
        ['Full Name', p.fullName],
        ['Phone', p.phone],
        ['Email', p.email],
        ['Address', p.address],
        ['Child', children(p)],
        ['Relationship', relation(p)],
        ['Classroom Camera', p.cameraAccess === false ? 'Not allowed' : 'Allowed during scheduled times'],
        ['Account Status', <StatusBadge status={statusOf(p)} />],
        ['Last Login', p.lastLoginAt ? fmtDateTime(new Date(p.lastLoginAt).getTime()) : 'Never'],
      ]}
      actions={(row) => [
        resetPasswordAction({ row, reset: () => api.users.resetPassword(row.id), toast }),
        ...statusActions({ row, noun: 'Parent', save: (s) => api.users.setStatus(row.id, s), done: parents.reload, toast }),
      ]}
      empty={{ icon: Users, title: 'No parent accounts yet.' }}
    />
  )
}

// ---------- Parent–Child Relationships (parent_student_map) ----------

export function RelationshipsPage() {
  const toast = useToast()
  const students = useStudents()
  const parents = usePeople('PARENT')
  const rows = (students.data || []).flatMap((s) =>
    s.parentLinks.map((l) => ({
      id: `${l.parentId}:${s.id}`,
      parentId: l.parentId,
      studentId: s.id,
      parent: l.parent,
      student: s,
      relationship: l.relationship,
      isPrimary: l.isPrimary,
      status: l.status,
    })),
  )
  const name = (r) => `${r.parent?.fullName || 'Unknown'} → ${r.student.fullName}`

  return (
    <CrudPage
      title="Parent–Child Relationships"
      subtitle="Which parent can see which child"
      noun="Relationship"
      addLabel="Link Parent & Child"
      rows={rows}
      loading={students.loading}
      error={students.error}
      onRetry={students.reload}
      searchText={(r) => `${name(r)} ${label(RELATIONSHIP, r.relationship)} ${r.student.class?.name || ''}`}
      searchPlaceholder="Search parent or child"
      filters={[{ key: 'relationship', label: 'relationships', options: RELATIONSHIP_OPTIONS, get: (r) => r.relationship }]}
      columns={[
        { key: 'parent', label: 'Parent', sort: (r) => r.parent?.fullName || '', render: (r) => r.parent?.fullName || '—' },
        { key: 'phone', label: 'Parent Phone', render: (r) => r.parent?.phone },
        { key: 'child', label: 'Child', sort: (r) => r.student.fullName, render: (r) => r.student.fullName },
        { key: 'relationship', label: 'Relationship', render: (r) => label(RELATIONSHIP, r.relationship) },
        { key: 'className', label: 'Class', render: (r) => r.student.class?.name },
        { key: 'primary', label: 'Primary contact', render: (r) => (r.isPrimary ? <span className="chip">Yes</span> : <span className="muted">—</span>) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={statusOf(r)} /> },
      ]}
      fields={[
        {
          name: 'parentId',
          label: 'Parent',
          type: 'combobox',
          required: true,
          placeholder: 'Search parent by name or phone',
          options: (parents.data || []).map((p) => ({ value: p.id, label: p.fullName, sub: p.phone })),
        },
        {
          name: 'studentId',
          label: 'Child',
          type: 'combobox',
          required: true,
          placeholder: 'Search child by name',
          options: (students.data || []).map((s) => ({ value: s.id, label: s.fullName, sub: s.class?.name })),
        },
        { name: 'relationship', label: 'Relationship', type: 'select', required: true, options: RELATIONSHIP_OPTIONS, placeholder: undefined },
        // Inactive keeps the link on record, but the parent no longer sees the child (journal, camera, messages).
        { name: 'status', label: 'Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined },
      ]}
      initial={(r) =>
        r
          ? { parentId: r.parentId, studentId: r.studentId, relationship: r.relationship, status: statusOf(r) }
          : { parentId: '', studentId: '', relationship: 'MOTHER', status: 'Active' }
      }
      onSave={async (form, editing) => {
        if (rows.some((r) => r !== editing && r.parentId === form.parentId && r.studentId === form.studentId)) return 'This parent is already linked to this child.'
        if (editing && (editing.parentId !== form.parentId || editing.studentId !== form.studentId)) await api.students.unlinkParent(editing.studentId, editing.parentId)
        // An edited link keeps its primary flag; a child's first parent becomes the primary contact.
        const isPrimary = editing ? editing.isPrimary : !rows.some((r) => r.studentId === form.studentId)
        await api.students.linkParent(form.studentId, form.parentId, form.relationship, isPrimary, STATUS_KEY[form.status])
        students.reload()
      }}
      viewRows={(r) => [
        ['Parent', r.parent?.fullName],
        ['Parent Phone', r.parent?.phone],
        ['Child', r.student.fullName],
        ['Class', r.student.class?.name],
        ['Relationship', label(RELATIONSHIP, r.relationship)],
        ['Status', <StatusBadge status={statusOf(r)} />],
      ]}
      actions={(row) => [
        {
          label: 'Unlink',
          icon: Unlink,
          danger: true,
          confirm: { title: 'Unlink this parent and child?', body: `${row.parent?.fullName} will no longer see ${row.student.fullName}'s journal or camera.` },
          onClick: async () => {
            await api.students.unlinkParent(row.studentId, row.parentId)
            toast('Relationship removed.')
            students.reload()
          },
        },
      ]}
      empty={{ icon: Link2, title: 'No parent–child relationships yet.' }}
    />
  )
}

// ---------- Camera Monitoring ----------

function CameraCard({ camera, index, onOpen }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{camera.class?.name}</h2>
          <span className="muted small">{camera.name}</span>
        </div>
        <CameraBadge state={camera.state} />
      </div>
      <CameraPreview state={camera.state} variant={index % 2} />
      <div className="row-between">
        <span className="muted">
          <CalendarClock size={16} /> <CameraStatusText cam={camera} /> · {weekdaysText(camera.allowedWeekdays)}
        </span>
        <button className="btn btn-primary btn-sm" onClick={onOpen} disabled={!camera.isActive}>
          <Video size={16} /> Open Camera
        </button>
      </div>
    </section>
  )
}

export function CameraMonitoringPage() {
  const cams = useApi(() => api.cameras.list(), [])
  const [open, setOpen] = useState(null)
  return (
    <>
      <PageHeader
        title="Camera Monitoring"
        subtitle="Classroom cameras of the school. Staff can watch at any time; parents only inside the viewing window."
        actions={
          <Link className="btn" to="/principal/camera-schedule">
            <CalendarClock size={18} /> Camera Schedule
          </Link>
        }
      />
      <Loadable q={cams} skeleton={<SkeletonCards count={2} />}>
        {(list) =>
          list.length === 0 ? (
            <div className="card">
              <EmptyState icon={Video} title="No cameras yet." text="Add a camera stream in Camera Schedule." />
            </div>
          ) : (
            <div className="cam-grid">
              {list.map((c, i) => (
                <CameraCard key={c.id} camera={c} index={i} onOpen={() => setOpen(c)} />
              ))}
            </div>
          )
        }
      </Loadable>
      <p className="privacy-note">
        <ShieldCheck size={16} /> Streams are private to the school: parents only receive the link during the viewing times.
      </p>
      <Modal open={!!open} title={open ? `${open.class?.name} · ${open.name}` : ''} onClose={() => setOpen(null)} size="lg">
        {open && <CameraPlayer src={open.streamUrl} label={open.class?.name} />}
      </Modal>
    </>
  )
}

// ---------- Camera Schedule (camera_streams: one viewing window per camera) ----------

const DAY_PRESETS = [
  { value: '62', label: 'Monday – Friday' },
  { value: '126', label: 'Monday – Saturday' },
  { value: '254', label: 'Every day' },
]
const hhmm = (t) => (t || '').slice(0, 5)

export function CameraSchedulePage() {
  const toast = useToast()
  const cams = useApi(() => api.cameras.list(), [])
  const classes = useClasses()
  const camStatus = (c) => (!c.isActive ? 'Disabled' : { LIVE: 'Live Now', SCHEDULED: 'Scheduled', UNAVAILABLE: 'Unavailable' }[c.state])

  return (
    <CrudPage
      title="Camera Schedule"
      subtitle="Each classroom camera has a daily viewing window. Parents of that class can watch only inside it."
      noun="Camera"
      addLabel="Add Camera"
      rows={cams.data || []}
      loading={cams.loading}
      error={cams.error}
      onRetry={cams.reload}
      searchText={(c) => `${c.class?.name} ${c.name}`}
      searchPlaceholder="Search class or camera"
      filters={[
        { key: 'class', label: 'classes', options: (classes.data || []).map((c) => ({ value: c.id, label: c.name })), get: (c) => c.classId },
        { key: 'status', label: 'statuses', options: ['Live Now', 'Scheduled', 'Unavailable', 'Disabled'], get: camStatus },
      ]}
      columns={[
        { key: 'class', label: 'Class', sort: (c) => c.class?.name || '', render: (c) => c.class?.name },
        { key: 'name', label: 'Camera' },
        { key: 'source', label: 'Camera Code', render: (c) => peerCode(c.streamUrl) || 'HLS / MP4 URL' },
        { key: 'days', label: 'Days', render: (c) => weekdaysText(c.allowedWeekdays) },
        { key: 'window', label: 'Viewing Time', render: (c) => `${hhmm(c.allowedStartTime)}–${hhmm(c.allowedEndTime)}` },
        { key: 'next', label: 'Next / Current', render: (c) => (c.window ? `${dayLabel(c.window.date)} ${c.window.start}` : '—') },
        { key: 'status', label: 'Status', render: (c) => <StatusBadge status={camStatus(c)} /> },
      ]}
      fields={[
        { name: 'classId', label: 'Class', type: 'select', required: true, options: (classes.data || []).map((c) => ({ value: c.id, label: c.name })) },
        { name: 'name', label: 'Camera Name', required: true, placeholder: 'e.g. Camera 01 – Phòng học' },
        {
          name: 'streamUrl',
          label: 'Stream (peer:// = PeerJS camera, its code is the camera id · or an HLS / MP4 URL)',
          required: true,
          full: true,
          placeholder: 'peer://',
          validate: (v) =>
            v === 'peer://' || PEER_STREAM.test(v || '') || /^https?:\/\/\S+$/.test(v || '')
              ? ''
              : 'Enter peer://, peer://<code> (lowercase letters, digits, -) or a full http(s) URL.',
        },
        { name: 'allowedWeekdays', label: 'Days', type: 'select', required: true, options: DAY_PRESETS, placeholder: undefined },
        {
          name: 'isActive',
          label: 'Status',
          type: 'select',
          required: true,
          placeholder: undefined,
          options: [
            { value: 'yes', label: 'Enabled' },
            { value: 'no', label: 'Disabled' },
          ],
        },
        { name: 'allowedStartTime', label: 'Opens at', type: 'time', required: true },
        {
          name: 'allowedEndTime',
          label: 'Closes at',
          type: 'time',
          required: true,
          validate: (v, f) => (f.allowedStartTime && v <= f.allowedStartTime ? 'Closing time must be after the opening time.' : ''),
        },
      ]}
      initial={(c) =>
        c
          ? {
              classId: c.classId,
              name: c.name,
              // the backend sends peer://<id> for a camera coded by its id: edit it as the bare peer:// again
              streamUrl: peerCode(c.streamUrl) === c.id.toLowerCase() ? 'peer://' : c.streamUrl,
              allowedWeekdays: DAY_PRESETS.some((d) => Number(d.value) === c.allowedWeekdays) ? String(c.allowedWeekdays) : '62',
              isActive: c.isActive ? 'yes' : 'no',
              allowedStartTime: hhmm(c.allowedStartTime),
              allowedEndTime: hhmm(c.allowedEndTime),
            }
          : {
              classId: '',
              name: '',
              streamUrl: 'peer://',
              allowedWeekdays: '62',
              isActive: 'yes',
              allowedStartTime: '08:00',
              allowedEndTime: '09:30',
            }
      }
      onSave={async (form, editing) => {
        const body = { ...form, name: form.name.trim(), streamUrl: form.streamUrl.trim(), allowedWeekdays: Number(form.allowedWeekdays), isActive: form.isActive === 'yes' }
        if (editing) await api.cameras.update(editing.id, body)
        else await api.cameras.create(body)
        cams.reload()
      }}
      actions={(row) => [
        ...(peerCode(row.streamUrl)
          ? [
              {
                // Opens the broadcast page (FE/public/camera.html) on this device, already set to this camera's code
                label: 'Mở trang phát',
                icon: ExternalLink,
                onClick: () => {
                  window.open(`/camera.html?cam=${encodeURIComponent(peerCode(row.streamUrl))}`, '_blank', 'noopener')
                },
              },
            ]
          : []),
        {
          label: row.isActive ? 'Disable' : 'Enable',
          icon: Power,
          onClick: async () => {
            await api.cameras.update(row.id, { isActive: !row.isActive })
            toast(`${row.name} ${row.isActive ? 'disabled' : 'enabled'}.`)
            cams.reload()
          },
        },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          confirm: { title: `Delete ${row.name}?`, body: `Parents of ${row.class?.name} will no longer be able to watch this camera.` },
          onClick: async () => {
            await api.cameras.remove(row.id)
            toast('Camera deleted.')
            cams.reload()
          },
        },
      ]}
      empty={{ icon: CalendarClock, title: 'No cameras yet.', text: 'Parents cannot watch the classroom until a camera and its viewing time are added.' }}
    />
  )
}

// ---------- Reports (built and exported by the backend) ----------

const REPORT_STATE = { PUBLISHED: 'Published', APPROVED: 'Approved', PENDING: 'Pending', IN_PROGRESS: 'In Progress', DRAFT: 'Draft' }
const REPORT_SOURCE = { VOICE: 'Voice (AI-assisted)', MANUAL: 'Manual entry' }

// What each tab shows: the backend rows carry codes; headers and labels are the screen's (exported files use their own).
const REPORTS = [
  {
    key: 'attendance',
    label: 'Attendance',
    dated: true,
    columns: [
      { key: 'date', header: 'Date', format: 'date' },
      { key: 'className', header: 'Class' },
      { key: 'present', header: 'Present' },
      { key: 'absent', header: 'Absent' },
      { key: 'unrecorded', header: 'Not recorded' },
      { key: 'rate', header: 'Attendance rate', format: 'percent' },
    ],
  },
  {
    key: 'journals',
    label: 'Journal Completion',
    dated: true,
    columns: [
      { key: 'date', header: 'Date', format: 'date' },
      { key: 'className', header: 'Class' },
      { key: 'status', header: 'Status', badge: REPORT_STATE },
      { key: 'createdWith', header: 'Created with', labels: REPORT_SOURCE },
      { key: 'photos', header: 'Photos' },
      { key: 'lastEdited', header: 'Last edited', format: 'datetime' },
    ],
  },
  {
    key: 'activity',
    label: 'Class Activity',
    dated: true,
    columns: [
      { key: 'className', header: 'Class' },
      { key: 'teacher', header: 'Head Teacher' },
      { key: 'students', header: 'Students' },
      { key: 'attendanceDays', header: 'Days with attendance' },
      { key: 'journalsPublished', header: 'Journals published' },
      { key: 'photos', header: 'Photos shared' },
      { key: 'messages', header: 'Messages' },
    ],
  },
  {
    key: 'students',
    label: 'Students',
    columns: [
      { key: 'fullName', header: 'Full Name' },
      { key: 'dateOfBirth', header: 'Date of Birth', format: 'date' },
      { key: 'gender', header: 'Gender', labels: GENDER },
      { key: 'className', header: 'Class' },
      { key: 'parents', header: 'Parent' },
      { key: 'status', header: 'Status', badge: STATUS },
    ],
  },
  {
    key: 'parents',
    label: 'Parents',
    columns: [
      { key: 'parent', header: 'Parent' },
      { key: 'phone', header: 'Phone' },
      { key: 'child', header: 'Child' },
      { key: 'className', header: 'Class' },
      { key: 'relationship', header: 'Relationship', labels: RELATIONSHIP },
      { key: 'status', header: 'Status', badge: STATUS },
    ],
  },
]

export function ReportsPage() {
  const toast = useToast()
  const today = todayISO()
  const [type, setType] = useState('attendance')
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [classId, setClassId] = useState('')
  const [busy, setBusy] = useState('')
  const classes = useClasses()
  const meta = REPORTS.find((r) => r.key === type)
  const range = meta.dated ? { from, to } : {}
  const q = useApi(() => api.reports.table({ type, ...range, classId: classId || undefined }), [type, meta.dated && from, meta.dated && to, classId])
  const report = q.data
  const cell = (c, v) => {
    if (v === null || v === undefined || v === '') return '—'
    if (c.badge) return <StatusBadge status={c.badge[v] || v} />
    if (c.labels) return c.labels[v] || v
    if (c.format === 'percent') return `${v}%`
    if (c.format === 'date') return fmtDate(v)
    if (c.format === 'datetime') return fmtDateTime(new Date(String(v).replace(' ', 'T')).getTime())
    return v
  }

  const download = async (format) => {
    setBusy(format)
    try {
      await api.reports.download({ type, format, ...range, classId: classId || undefined })
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Attendance, journals and class records"
        actions={
          <>
            <button className="btn" onClick={() => download('pdf')} disabled={!report?.rows.length || !!busy}>
              <Printer size={18} /> {busy === 'pdf' ? 'Preparing…' : 'Export PDF'}
            </button>
            <button className="btn btn-primary" onClick={() => download('xlsx')} disabled={!report?.rows.length || !!busy}>
              <Download size={18} /> {busy === 'xlsx' ? 'Preparing…' : 'Export Excel'}
            </button>
          </>
        }
      />
      <div className="tabs" style={{ marginBottom: 14 }}>
        {REPORTS.map((r) => (
          <button key={r.key} className={type === r.key ? 'on' : ''} onClick={() => setType(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        {meta.dated && (
          <>
            <input type="date" className="date-input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From date" />
            <span className="muted">to</span>
            <input type="date" className="date-input" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To date" />
          </>
        )}
        <Select value={classId} onChange={setClassId} options={(classes.data || []).map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" aria-label="Class" />
      </div>

      <Loadable q={q} skeleton={<SkeletonTable />}>
        {(r) =>
          r.rows.length === 0 ? (
            <div className="card">
              <EmptyState title="No records for this selection." text={meta.dated ? 'Try a wider date range or another class.' : 'Try another class.'} />
            </div>
          ) : (
            <div className="card table-card">
              <div className="card-head pad">
                <h2>{meta.label}</h2>
                <span className="muted small">
                  {meta.dated ? `${fmtDate(from)} – ${fmtDate(to)} · ` : ''}
                  {r.rows.length} {r.rows.length === 1 ? 'row' : 'rows'}
                </span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    {meta.columns.map((c) => (
                      <th key={c.key}>{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i}>
                      {meta.columns.map((c, j) => (
                        <td key={c.key} data-label={c.header} className={j === 0 ? 'td-primary' : ''}>
                          {cell(c, row[c.key])}
                        </td>
                      ))}
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

// ---------- School Announcements ----------

const AUDIENCES = ANNOUNCEMENT_AUDIENCES
const CATEGORIES = ANNOUNCEMENT_CATEGORIES

export function AnnouncementsPage() {
  const toast = useToast()
  // Publishing makes the backend notify every teacher / parent of the audience (in their Notifications).
  const q = useApi(() => api.announcements.list({ limit: 100 }), [])

  return (
    <CrudPage
      title="School Announcements"
      subtitle="School-wide notices for teachers and parents"
      noun="Announcement"
      addLabel="Create Announcement"
      rows={(q.data?.items || []).map(toAnnouncement)}
      loading={q.loading}
      error={q.error}
      onRetry={q.reload}
      searchText={(a) => `${a.title} ${a.content} ${a.category}`}
      searchPlaceholder="Search announcements"
      filters={[
        { key: 'category', label: 'categories', options: CATEGORIES, get: (a) => a.category },
        { key: 'status', label: 'statuses', options: ['Draft', 'Scheduled', 'Published'], get: (a) => a.status },
      ]}
      columns={[
        { key: 'title', label: 'Title', sort: (a) => a.title },
        { key: 'category', label: 'Category' },
        { key: 'audience', label: 'Audience' },
        { key: 'publishDate', label: 'Publish Date', sort: (a) => a.publishDate, render: (a) => fmtDate(a.publishDate) },
        { key: 'expiryDate', label: 'Expiry Date', render: (a) => fmtDate(a.expiryDate) },
        { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
      ]}
      fields={(form, editing) => [
        { name: 'title', label: 'Title', required: true, full: true, placeholder: 'e.g. Holiday Notice' },
        { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES },
        { name: 'audience', label: 'Audience', type: 'select', required: true, options: AUDIENCES },
        // Today publishes at once; a later day schedules it. Once readers have it, the date no longer changes.
        {
          name: 'publishDate',
          label: 'Publish Date',
          type: 'date',
          required: true,
          validate: (v) => (editing?.status !== 'Published' && v < todayISO() ? 'Publish date cannot be in the past.' : ''),
        },
        {
          name: 'expiryDate',
          label: 'Expiry Date',
          type: 'date',
          validate: (v) => (v && v < todayISO() ? 'Expiry date cannot be in the past.' : v && v < form.publishDate ? 'Expiry date is before the publish date.' : ''),
        },
        { name: 'content', label: 'Content', type: 'textarea', required: true, rows: 5 },
      ]}
      submitOptions={[
        { label: 'Save Draft', patch: { status: 'Draft' } },
        { label: 'Publish', primary: true, patch: { status: 'Published' } },
      ]}
      initial={(a) =>
        a
          ? { ...a, publishDate: a.publishDate || todayISO() }
          : { title: '', category: '', audience: 'Teachers & Parents', publishDate: todayISO(), expiryDate: '', content: '', status: 'Draft' }
      }
      onSave={async (form, editing) => {
        if (editing) await api.announcements.update(editing.id, fromAnnouncement(form))
        else await api.announcements.create(fromAnnouncement(form))
        q.reload()
      }}
      viewRows={(a) => [
        ['Title', a.title],
        ['Category', a.category],
        ['Audience', a.audience],
        ['Status', <StatusBadge status={a.status} />],
        ['Publish Date', fmtDate(a.publishDate)],
        ['Expiry Date', fmtDate(a.expiryDate)],
        ['Content', a.content],
      ]}
      actions={(row) => [
        row.status === 'Draft' && {
          label: 'Publish',
          icon: Send,
          confirm: { title: `Publish “${row.title}”?`, body: 'Teachers will receive this announcement in their notifications.' },
          onClick: async () => {
            await api.announcements.update(row.id, { status: announcementParam.status('Published'), publishOn: row.publishDate || undefined })
            q.reload()
            toast(row.publishDate > todayISO() ? `Scheduled for ${fmtDate(row.publishDate)}.` : 'Announcement published.')
          },
        },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          confirm: { title: `Delete “${row.title}”?`, body: 'The announcement will be removed for everyone.' },
          onClick: async () => {
            await api.announcements.remove(row.id)
            q.reload()
            toast('Announcement deleted.')
          },
        },
      ]}
      empty={{ icon: Megaphone, title: 'No announcements yet.' }}
    />
  )
}
