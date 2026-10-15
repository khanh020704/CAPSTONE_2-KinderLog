import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Baby,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
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
  Utensils,
  Video,
} from 'lucide-react'
import { DEMO_PASSWORD, useStore } from '../store/store'
import { addDays, dayLabel, fmtDate, fmtDateTime, greeting, relTime, todayISO, uid } from '../lib/utils'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { GENDER, GENDER_OPTIONS, HEALTH, MEAL, RELATIONSHIP, RELATIONSHIP_OPTIONS, STATUS, STATUS_KEY, errorText, label, weekdaysText } from '../lib/labels'
import { resetPasswordAction, statusActions } from '../lib/actions'
import CrudPage, { FormFields, validateFields } from '../components/CrudPage'
import { CameraBadge, CameraPlayer, CameraPreview, CameraStatusText } from '../components/Camera'
import { CategoryBarChart, RateTrendChart } from '../components/Charts'
import { ActivityList } from './admin'
import { Avatar, EmptyState, Loadable, Modal, PageHeader, Select, SkeletonCards, SkeletonTable, StatCard, StatusBadge, useToast } from '../components/ui'

const ACCOUNT_STATUS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
]
const USER_STATUS = ['Active', 'Inactive', 'Locked']
const dateOf = (ts) => (ts ? fmtDate(String(ts).slice(0, 10)) : '—')
const lastLogin = (u) => (u.lastLoginAt ? relTime(new Date(u.lastLoginAt).getTime()) : 'Never')
const statusOf = (r) => STATUS[r.status] || r.status
const JOURNAL_PROGRESS = { NOT_STARTED: 'Not Started', DRAFT: 'Draft', PARTIAL: 'In Progress', APPROVED: 'Completed' }
const blankToNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim())
const blankToUndef = (v) => blankToNull(v) ?? undefined

// Lists every principal page needs; each reloads independently after a change.
const useClasses = () => useApi(() => api.classes.list(), [])
const usePeople = (role) => useApi(() => api.users.list({ role }), [role])
const useStudents = () => useApi(() => api.students.list(), [])

// ---------- Dashboard ----------

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
]

// A stat card with an optional 0–100 meter under the value.
function Kpi({ icon: Icon, label: text, value, hint, tint, meter }) {
  return (
    <div className="card stat-card">
      <span className={`stat-icon tint-${tint}`}>
        <Icon size={20} />
      </span>
      <div style={{ flex: 1 }}>
        <div className="stat-label">{text}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
        {meter !== undefined && meter !== null && (
          <div className="kpi-meter" role="img" aria-label={`${text}: ${value}`}>
            <span style={{ width: `${Math.min(100, meter)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

export function PrincipalDashboard() {
  const { db, user } = useStore()
  const today = todayISO()
  const [range, setRange] = useState('7')
  const dash = useApi(() => api.reports.dashboard({ from: addDays(today, -(Number(range) - 1)), to: today }), [range])
  const cams = useApi(() => api.cameras.list(), [])
  const classes = useClasses()
  const teacherOf = (classId) => classes.data?.find((c) => c.id === classId)?.homeroomTeacher?.fullName

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name}`} subtitle="School overview" actions={<Select value={range} onChange={setRange} options={RANGES} aria-label="Period" />} />
      <Loadable q={dash} skeleton={<SkeletonCards count={6} />}>
        {(d) => {
          const todays = d.today.classes
          const sum = (k) => todays.reduce((s, c) => s + c[k], 0)
          const done = todays.filter((c) => c.journalState === 'APPROVED').length
          const attention = [
            ...(classes.data || [])
              .filter((c) => !c.homeroomTeacherId && c.status === 'ACTIVE')
              .map((c) => ({ icon: GraduationCap, title: 'No head teacher', body: `${c.name} has no head teacher assigned.` })),
            ...todays
              .filter((c) => c.logged === 0)
              .map((c) => ({ icon: ClipboardCheck, title: 'Nothing recorded yet', body: `${c.className} has not recorded attendance or a journal today.` })),
            ...todays
              .filter((c) => c.logged > 0 && c.journalState !== 'APPROVED')
              .map((c) => ({ icon: BookOpen, title: 'Journal not approved', body: `${c.className}: ${c.approved} of ${c.total} entries approved.` })),
            ...d.healthAlerts
              .filter((h) => h.date === today)
              .map((h) => ({
                icon: HeartPulse,
                title: `Health: ${h.studentName}`,
                body: `${label(HEALTH, h.healthStatus)}${h.temperature ? ` · ${h.temperature}°C` : ''}${h.note ? ` · ${h.note}` : ''}`,
              })),
          ]
          const meals = Object.entries(d.nutrition.distribution).map(([k, v]) => ({ label: MEAL[k], value: v }))
          return (
            <>
              <div className="grid stats">
                <StatCard icon={School} label="Classes" value={d.overview.classes} tint="sky" />
                <StatCard icon={Baby} label="Students" value={d.overview.students} tint="peach" />
                <StatCard icon={GraduationCap} label="Teachers" value={d.overview.teachers} tint="lav" />
                <StatCard icon={CheckCircle2} label="Present Today" value={`${sum('present')} / ${sum('total')}`} tint="mint" />
                <StatCard icon={BookOpen} label="Journals Approved Today" value={`${done} / ${todays.length}`} hint="classes" tint="cream" />
                <StatCard icon={MessageCircle} label="Unread Messages" value={db.messages.filter((m) => !m.read).length} hint="between teachers and parents" tint="sky" />
              </div>

              <h2 className="section-title">
                {RANGES.find((r) => r.value === range).label} · {fmtDate(d.range.from)} – {fmtDate(d.range.to)}
              </h2>
              <div className="grid stats">
                <Kpi icon={ClipboardCheck} label="Attendance rate" value={`${d.kpis.attendanceRate}%`} tint="mint" meter={d.kpis.attendanceRate} />
                <Kpi
                  icon={BookOpen}
                  label="Journal submission rate"
                  value={`${d.kpis.submissionRate}%`}
                  hint="entries approved / expected"
                  tint="cream"
                  meter={d.kpis.submissionRate}
                />
                <Kpi
                  icon={Utensils}
                  label="Nutrition index"
                  value={d.kpis.nutritionIndex ?? '—'}
                  hint="100 = every child ate everything"
                  tint="peach"
                  meter={d.kpis.nutritionIndex}
                />
                <Kpi icon={HeartPulse} label="Health alerts" value={d.kpis.healthAlerts} hint="children to monitor or unwell" tint="lav" />
              </div>

              <div className="grid cols-2">
                <section className="card">
                  <div className="card-head">
                    <h2>Attendance &amp; journal approval</h2>
                    <span className="muted small">% per school day</span>
                  </div>
                  {d.attendanceTrend.length ? <RateTrendChart data={d.attendanceTrend} /> : <EmptyState title="No school days in this period." />}
                </section>
                <section className="card">
                  <div className="card-head">
                    <h2>Meals eaten</h2>
                    <span className="muted small">child-meals in the period</span>
                  </div>
                  {meals.some((m) => m.value) ? <CategoryBarChart data={meals} valueName="Meals" /> : <EmptyState title="No meals recorded yet." />}
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
                      <th>Today</th>
                      <th>Journal today</th>
                      <th>Attendance</th>
                      <th>Submission</th>
                      <th>Nutrition</th>
                      <th>Avg. nap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todays.map((c) => {
                      const p = d.classes.find((x) => x.classId === c.classId)
                      return (
                        <tr key={c.classId}>
                          <td data-label="Class" className="td-primary">
                            {c.className}
                          </td>
                          <td data-label="Teacher">{teacherOf(c.classId) || <span className="muted">Not assigned</span>}</td>
                          <td data-label="Today">{c.logged ? `${c.present} present · ${c.absent} absent` : <StatusBadge status="Not recorded" />}</td>
                          <td data-label="Journal today">
                            <StatusBadge status={JOURNAL_PROGRESS[c.journalState]} />
                          </td>
                          <td data-label="Attendance">{p ? `${p.attendanceRate}%` : '—'}</td>
                          <td data-label="Submission">{p ? `${p.submissionRate}%` : '—'}</td>
                          <td data-label="Nutrition">{p?.nutritionIndex ?? '—'}</td>
                          <td data-label="Avg. nap">{p?.avgSleepMinutes ? `${p.avgSleepMinutes} min` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>

              <div className="grid cols-2">
                <section className="card">
                  <div className="card-head">
                    <h2>Camera Overview</h2>
                    <Link className="btn btn-sm" to="/principal/cameras">
                      <Video size={16} /> View Cameras
                    </Link>
                  </div>
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
                    <h2>Recent health alerts</h2>
                    <Link to="/principal/reports">Health report</Link>
                  </div>
                  {d.healthAlerts.length === 0 ? (
                    <EmptyState icon={HeartPulse} title="No health alerts in this period." />
                  ) : (
                    <ul className="plain-list">
                      {d.healthAlerts.slice(0, 6).map((h) => (
                        <li key={`${h.studentId}-${h.date}`} className="summary-item">
                          <span className="summary-icon tint-peach">
                            <AlertTriangle size={18} />
                          </span>
                          <div>
                            <strong>
                              {h.studentName} · {fmtDate(h.date)}
                            </strong>
                            <span className="muted block small">
                              {label(HEALTH, h.healthStatus)}
                              {h.temperature ? ` · ${h.temperature}°C` : ''}
                              {h.note ? ` · ${h.note}` : ''}
                            </span>
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
                  <ActivityList items={db.audit.filter((a) => a.role !== 'System Admin').slice(0, 6)} />
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
  const { db, user } = useStore()
  const toast = useToast()
  const school = useApi(() => api.schools.mine(), [])
  const dash = useApi(() => api.reports.dashboard(), [])
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const year = db.years.find((y) => y.status === 'Current')
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

// ---------- Academic Year (local demo data: the backend stores the year on each class) ----------

const YEAR_FIELDS = [
  { name: 'name', label: 'Academic Year', required: true, placeholder: 'e.g. 2027–2028' },
  { name: 'status', label: 'Status', type: 'select', required: true, options: ['Current', 'Upcoming', 'Archived'], placeholder: undefined },
  { name: 'start', label: 'Start Date', type: 'date', required: true },
  { name: 'end', label: 'End Date', type: 'date', required: true, validate: (v, f) => (f.start && v <= f.start ? 'End date must be after the start date.' : '') },
]

export function AcademicYearPage() {
  const { db, mutate, log } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const current = db.years.find((y) => y.status === 'Current')
  const years = [...db.years].sort((a, b) => b.start.localeCompare(a.start))

  const open = (y) => {
    setForm(y || { name: '', status: 'Upcoming', start: '', end: '' })
    setErrors({})
    setEditing(y)
  }

  const save = (e) => {
    e.preventDefault()
    const errs = validateFields(YEAR_FIELDS, form)
    if (!errs.name && db.years.some((y) => y.name.trim() === form.name.trim() && y.id !== editing?.id)) errs.name = 'This academic year already exists.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const item = { ...form, name: form.name.trim(), id: editing?.id || uid('y') }
    // Only one year can be current: the previous one is archived.
    mutate((prev) => ({
      years: [...prev.years.filter((y) => y.id !== item.id), item].map((y) =>
        item.status === 'Current' && y.id !== item.id && y.status === 'Current' ? { ...y, status: 'Archived' } : y,
      ),
    }))
    log(editing ? 'Update' : 'Create', 'Academic Year', `Academic year ${editing ? 'updated' : 'created'}: ${item.name}`)
    toast(`Academic year ${editing ? 'updated' : 'created'} successfully.`)
    setEditing(undefined)
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
                <dd>{db.classes.filter((c) => c.yearId === current.id).length}</dd>
              </div>
            </dl>
          </>
        ) : (
          <EmptyState icon={CalendarDays} title="No current academic year." text="Create one or mark an existing year as current." />
        )}
      </div>

      <div className="card">
        <h2>All Academic Years</h2>
        <ul className="plain-list">
          {years.map((y) => (
            <li key={y.id} className="row-between">
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
        { key: 'ageGroup', label: 'Age Group' },
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
        { name: 'ageGroup', label: 'Age Group', placeholder: 'e.g. 4-5 tuổi' },
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
          ? { name: c.name, academicYear: c.academicYear, ageGroup: c.ageGroup || '', homeroomTeacherId: c.homeroomTeacherId || '', status: statusOf(c) }
          : { name: '', academicYear: rows[0]?.academicYear || '2026-2027', ageGroup: '', homeroomTeacherId: '' }
      }
      onSave={async (form, editing) => {
        const body = { name: form.name.trim(), academicYear: form.academicYear.trim(), ageGroup: blankToUndef(form.ageGroup), homeroomTeacherId: form.homeroomTeacherId || null }
        if (editing) await api.classes.update(editing.id, { ...body, status: STATUS_KEY[form.status] })
        else await api.classes.create(body)
        classes.reload()
      }}
      viewRows={(c) => [
        ['Class Name', c.name],
        ['Academic Year', c.academicYear],
        ['Age Group', c.ageGroup],
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
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${DEMO_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email' },
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
      ]}
      initial={(t) =>
        t ? { fullName: t.fullName, phone: t.phone, email: t.email || '', classId: classesOf(t)[0]?.id || '' } : { fullName: '', phone: '', email: '', classId: '' }
      }
      onSave={async ({ classId, ...form }, editing) => {
        const body = { fullName: form.fullName.trim(), phone: form.phone.trim(), email: blankToUndef(form.email) }
        const saved = editing ? await api.users.update(editing.id, body) : await api.users.create({ ...body, role: 'TEACHER' })
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
      fields={(form, editing) => [
        { name: 'fullName', label: 'Full Name', required: true },
        { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true, validate: (v) => (v > todayISO() ? 'Date of birth cannot be in the future.' : '') },
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
            { value: 'later', label: editing ? 'Keep the current parents' : 'Add the parent later' },
          ],
        },
        ...(form.parentMode === 'new'
          ? [
              { name: 'parentName', label: 'Parent Full Name', required: true },
              { name: 'parentPhone', label: 'Parent Phone', type: 'tel', required: true, hint: `The parent signs in with this number. Initial password: ${DEMO_PASSWORD}` },
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
        ...(editing ? [{ name: 'status', label: 'Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined }] : []),
        { name: 'allergies', label: 'Allergies', placeholder: 'e.g. Dị ứng tôm, đậu phộng', hint: 'Shown to the teacher on every journal.' },
        { name: 'medicalNote', label: 'Medical notes', type: 'textarea', rows: 3, placeholder: 'Medication, pick-up arrangements, things the teacher should know' },
      ]}
      initial={(s) =>
        s
          ? {
              fullName: s.fullName,
              dateOfBirth: s.dateOfBirth,
              gender: s.gender,
              classId: s.classId,
              parentMode: 'later',
              parentId: '',
              relationship: 'MOTHER',
              status: statusOf(s),
              allergies: s.allergies || '',
              medicalNote: s.medicalNote || '',
            }
          : {
              fullName: '',
              dateOfBirth: '',
              gender: '',
              classId: '',
              parentMode: 'new',
              parentName: '',
              parentPhone: '',
              parentId: '',
              relationship: 'MOTHER',
              allergies: '',
              medicalNote: '',
            }
      }
      onSave={async ({ parentMode, parentId, parentName, parentPhone, relationship, status, ...form }, editing) => {
        // Create the parent first: a phone number already in use fails before the student is created.
        let linkTo = parentMode === 'existing' ? parentId : ''
        if (parentMode === 'new') linkTo = (await api.users.create({ fullName: parentName.trim(), phone: parentPhone.trim(), role: 'PARENT' })).id
        const body = { ...form, fullName: form.fullName.trim(), allergies: blankToNull(form.allergies), medicalNote: blankToNull(form.medicalNote) }
        const saved = editing ? await api.students.update(editing.id, { ...body, status: STATUS_KEY[status] }) : await api.students.create(body)
        if (linkTo) await api.students.linkParent(saved.id, linkTo, relationship, !saved.parentLinks?.length)
        students.reload()
        if (parentMode === 'new') parents.reload()
      }}
      viewRows={(s) => [
        ['Full Name', s.fullName],
        ['Date of Birth', fmtDate(s.dateOfBirth)],
        ['Gender', label(GENDER, s.gender)],
        ['Class', s.class?.name],
        ['Parent', s.parentLinks.map((l) => `${l.parent?.fullName} (${label(RELATIONSHIP, l.relationship)})`).join(', ')],
        ['Allergies', s.allergies],
        ['Medical notes', s.medicalNote],
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
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${DEMO_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email' },
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
      ]}
      initial={(p) =>
        p
          ? { fullName: p.fullName, phone: p.phone, email: p.email || '', address: p.address || '', childMode: 'later', studentId: '', relationship: 'MOTHER' }
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
            }
      }
      onSave={async ({ childMode, studentId, childName, childDob, childGender, childClassId, relationship, ...form }, editing) => {
        const body = { fullName: form.fullName.trim(), phone: form.phone.trim(), email: blankToUndef(form.email), address: blankToUndef(form.address) }
        const saved = editing ? await api.users.update(editing.id, body) : await api.users.create({ ...body, role: 'PARENT' })
        let linkTo = childMode === 'existing' ? studentId : ''
        if (childMode === 'new') linkTo = (await api.students.create({ fullName: childName.trim(), dateOfBirth: childDob, gender: childGender, classId: childClassId })).id
        if (linkTo) await api.students.linkParent(linkTo, saved.id, relationship, false)
        reload()
      }}
      viewRows={(p) => [
        ['Full Name', p.fullName],
        ['Phone', p.phone],
        ['Email', p.email],
        ['Address', p.address],
        ['Child', children(p)],
        ['Relationship', relation(p)],
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
        {
          name: 'isPrimary',
          label: 'Primary contact',
          type: 'select',
          placeholder: undefined,
          options: [
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes — the school calls this parent first' },
          ],
        },
      ]}
      initial={(r) =>
        r
          ? { parentId: r.parentId, studentId: r.studentId, relationship: r.relationship, isPrimary: r.isPrimary ? 'yes' : 'no' }
          : { parentId: '', studentId: '', relationship: 'MOTHER', isPrimary: 'no' }
      }
      onSave={async (form, editing) => {
        if (!editing && rows.some((r) => r.parentId === form.parentId && r.studentId === form.studentId)) return 'This parent is already linked to this child.'
        if (editing && (editing.parentId !== form.parentId || editing.studentId !== form.studentId)) await api.students.unlinkParent(editing.studentId, editing.parentId)
        await api.students.linkParent(form.studentId, form.parentId, form.relationship, form.isPrimary === 'yes')
        students.reload()
      }}
      viewRows={(r) => [
        ['Parent', r.parent?.fullName],
        ['Parent Phone', r.parent?.phone],
        ['Child', r.student.fullName],
        ['Class', r.student.class?.name],
        ['Relationship', label(RELATIONSHIP, r.relationship)],
        ['Primary contact', r.isPrimary ? 'Yes' : 'No'],
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
        <ShieldCheck size={16} /> Streams are private to the school. The demo uses public sample HLS streams.
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
          label: 'Stream URL (HLS .m3u8 or MP4)',
          required: true,
          full: true,
          validate: (v) => (!/^https?:\/\/\S+$/.test(v || '') ? 'Enter a full http(s) URL.' : ''),
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
              streamUrl: c.streamUrl,
              allowedWeekdays: DAY_PRESETS.some((d) => Number(d.value) === c.allowedWeekdays) ? String(c.allowedWeekdays) : '62',
              isActive: c.isActive ? 'yes' : 'no',
              allowedStartTime: hhmm(c.allowedStartTime),
              allowedEndTime: hhmm(c.allowedEndTime),
            }
          : {
              classId: '',
              name: '',
              streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
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

const REPORTS = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'journals', label: 'Journal Submission' },
  { key: 'nutrition', label: 'Nutrition & Sleep' },
  { key: 'health', label: 'Health Alerts' },
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
  const q = useApi(() => api.reports.table({ type, from, to, classId: classId || undefined }), [type, from, to, classId])
  const meta = REPORTS.find((r) => r.key === type)
  const report = q.data
  const cell = (c, v) => (v === null || v === undefined || v === '' ? '—' : c.format === 'percent' ? `${v}%` : c.format === 'date' ? fmtDate(v) : v)

  const download = async (format) => {
    setBusy(format)
    try {
      await api.reports.download({ type, format, from, to, classId: classId || undefined })
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
        subtitle="Attendance, journals, nutrition and health — generated by the server"
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
        <input type="date" className="date-input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From date" />
        <span className="muted">to</span>
        <input type="date" className="date-input" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To date" />
        <Select value={classId} onChange={setClassId} options={(classes.data || []).map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" aria-label="Class" />
      </div>

      <Loadable q={q} skeleton={<SkeletonTable />}>
        {(r) =>
          r.rows.length === 0 ? (
            <div className="card">
              <EmptyState title="No records for this selection." text="Try a wider date range or another class." />
            </div>
          ) : (
            <div className="card table-card">
              <div className="card-head pad">
                <h2>{meta.label}</h2>
                <span className="muted small">
                  {fmtDate(from)} – {fmtDate(to)} · {r.rows.length} {r.rows.length === 1 ? 'row' : 'rows'}
                </span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    {r.columns.map((c) => (
                      <th key={c.key}>{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i}>
                      {r.columns.map((c, j) => (
                        <td key={c.key} data-label={c.header} className={j === 0 ? 'td-primary' : ''}>
                          {c.key === 'healthStatus' ? <StatusBadge status={label(HEALTH, row[c.key])} /> : cell(c, row[c.key])}
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

// ---------- School Announcements (local demo data: the backend has no announcements module) ----------

const AUDIENCES = ['Teachers', 'Parents', 'Teachers & Parents']
const CATEGORIES = ['Holiday', 'School Activity', 'Important Notice', 'Reminder']

export function AnnouncementsPage() {
  const { db, upsert, remove, log, notify } = useStore()
  const toast = useToast()

  // Publishing sends one notification to each audience; it shows up in their Notifications with read state.
  const distribute = (a) => {
    const roles = a.audience === 'Teachers' ? ['teacher'] : a.audience === 'Parents' ? ['parent'] : ['teacher', 'parent']
    roles.forEach((role) => notify({ role, type: 'announcement', title: a.title, body: a.content.length > 110 ? `${a.content.slice(0, 110)}…` : a.content }))
    log('Publish', 'Announcements', `Announcement published: ${a.title}`)
  }

  return (
    <CrudPage
      title="School Announcements"
      subtitle="School-wide notices for teachers and parents"
      noun="Announcement"
      addLabel="Create Announcement"
      rows={[...db.announcements].sort((a, b) => b.createdAt - a.createdAt)}
      searchText={(a) => `${a.title} ${a.content} ${a.category}`}
      searchPlaceholder="Search announcements"
      filters={[
        { key: 'category', label: 'categories', options: CATEGORIES, get: (a) => a.category },
        { key: 'status', label: 'statuses', options: ['Draft', 'Published'], get: (a) => a.status },
      ]}
      columns={[
        { key: 'title', label: 'Title', sort: (a) => a.title },
        { key: 'category', label: 'Category' },
        { key: 'audience', label: 'Audience' },
        { key: 'publishDate', label: 'Publish Date', sort: (a) => a.publishDate, render: (a) => fmtDate(a.publishDate) },
        { key: 'expiryDate', label: 'Expiry Date', render: (a) => fmtDate(a.expiryDate) },
        { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
      ]}
      fields={[
        { name: 'title', label: 'Title', required: true, full: true, placeholder: 'e.g. Holiday Notice' },
        { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES },
        { name: 'audience', label: 'Audience', type: 'select', required: true, options: AUDIENCES },
        { name: 'publishDate', label: 'Publish Date', type: 'date', required: true },
        {
          name: 'expiryDate',
          label: 'Expiry Date',
          type: 'date',
          validate: (v, f) => (v && f.publishDate && v < f.publishDate ? 'Expiry date cannot be before the publish date.' : ''),
        },
        { name: 'content', label: 'Content', type: 'textarea', required: true, rows: 5 },
      ]}
      submitOptions={[
        { label: 'Save Draft', patch: { status: 'Draft' } },
        { label: 'Publish', primary: true, patch: { status: 'Published' } },
      ]}
      initial={(a) => a || { title: '', category: '', audience: 'Teachers & Parents', publishDate: todayISO(), expiryDate: '', content: '', status: 'Draft' }}
      onSave={(form, editing) => {
        const item = { ...form, id: editing?.id || uid('an'), title: form.title.trim(), createdAt: editing?.createdAt || Date.now() }
        upsert('announcements', item)
        if (item.status === 'Published' && editing?.status !== 'Published') distribute(item)
        else log(editing ? 'Update' : 'Create', 'Announcements', `Announcement ${editing ? 'updated' : 'saved as draft'}: ${item.title}`)
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
        row.status !== 'Published' && {
          label: 'Publish',
          icon: Send,
          confirm: { title: `Publish “${row.title}”?`, body: `${row.audience} will receive this announcement in their notifications.` },
          onClick: () => {
            upsert('announcements', { id: row.id, status: 'Published' })
            distribute(row)
            toast('Announcement published.')
          },
        },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          confirm: { title: `Delete “${row.title}”?`, body: 'The announcement will be removed for everyone.' },
          onClick: () => {
            remove('announcements', row.id)
            log('Delete', 'Announcements', `Announcement deleted: ${row.title}`)
            toast('Announcement deleted.')
          },
        },
      ]}
      empty={{ icon: Megaphone, title: 'No announcements yet.' }}
    />
  )
}
