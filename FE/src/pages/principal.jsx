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
  GraduationCap,
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
import { DEMO_PASSWORD, attendanceCounts, byId, journalOf, linksOfStudent, studentsOfClass, useStore } from '../store/store'
import { JOURNAL_STATUS, addDays, downloadCSV, fmtDate, fmtDateTime, greeting, relTime, scheduleStatus, todayISO, toISO, uid } from '../lib/utils'
import { phoneTaken, resetPasswordAction, statusActions } from '../lib/actions'
import CrudPage, { FormFields, validateFields } from '../components/CrudPage'
import { CameraBadge, CameraPlayer, CameraPreview, CameraStatusText, useCamera, useNow } from '../components/Camera'
import { ActivityList } from './admin'
import { Avatar, EmptyState, Modal, PageHeader, SegBar, Select, SkeletonCards, StatCard, StatusBadge, useFakeLoad, useToast } from '../components/ui'

const RELATIONSHIPS = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Guardian']
const ACCOUNT_STATUS = ['Active', 'Inactive']
const created = (ts) => (ts ? fmtDate(toISO(new Date(ts))) : '—')
const lastLogin = (u) => (u.lastLogin ? relTime(u.lastLogin) : 'Never')

const journalProgress = (db, classId, date) => {
  const j = journalOf(db, classId, date)
  return !j ? 'Not Started' : j.status === 'published' ? 'Completed' : 'In Progress'
}

// ---------- Dashboard ----------

function CameraRow({ camera }) {
  const { db } = useStore()
  const cam = useCamera(camera.classId)
  return (
    <li className="row-between">
      <span>
        <strong>{byId(db.classes, camera.classId)?.name}</strong>
        <span className="muted block small">
          <CameraStatusText cam={cam} />
        </span>
      </span>
      <CameraBadge state={cam.state} />
    </li>
  )
}

export function PrincipalDashboard() {
  const { db, user } = useStore()
  const loading = useFakeLoad()
  const today = todayISO()
  const classes = db.classes.filter((c) => c.status === 'Active')
  const att = classes.map((c) => ({ cls: c, ...attendanceCounts(db, c.id, today) }))
  const sum = (k) => att.reduce((s, a) => s + a[k], 0)
  const progress = classes.map((c) => journalProgress(db, c.id, today))
  const countOf = (v) => progress.filter((p) => p === v).length

  // Items that need the principal's attention are derived from today's data, so they clear themselves.
  const attention = [
    ...db.classes.filter((c) => !c.teacherId).map((c) => ({ icon: GraduationCap, title: 'No head teacher', body: `${c.name} has no head teacher assigned.`, to: '/principal/classes' })),
    ...att.filter((a) => !a.recorded).map((a) => ({ icon: ClipboardCheck, title: 'Attendance not recorded', body: `${a.cls.name} has not recorded attendance today.` })),
    ...classes
      .map((c, i) => ({ c, p: progress[i] }))
      .filter((x) => x.p !== 'Completed')
      .map(({ c, p }) => ({
        icon: BookOpen,
        title: p === 'In Progress' ? 'Journal in progress' : 'Journal not started',
        body: p === 'In Progress' ? `${c.name} journal is still being prepared.` : `${c.name} has not started today's journal.`,
      })),
  ]

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name}`} subtitle="School overview for today" />
      {loading ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid stats">
          <StatCard icon={School} label="Classes" value={classes.length} tint="sky" />
          <StatCard icon={Baby} label="Students" value={db.students.filter((s) => s.status === 'Active').length} tint="peach" />
          <StatCard icon={GraduationCap} label="Teachers" value={db.teachers.filter((t) => t.status === 'Active').length} tint="lav" />
          <StatCard icon={CheckCircle2} label="Present Today" value={`${sum('present')} / ${sum('total')}`} tint="mint" />
          <StatCard icon={BookOpen} label="Journal Completion" value={`${countOf('Completed')} / ${classes.length}`} hint="classes published today" tint="cream" />
          <StatCard icon={MessageCircle} label="Unread Messages" value={db.messages.filter((m) => !m.read).length} hint="between teachers and parents" tint="sky" />
        </div>
      )}

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
              { label: 'Not recorded', value: sum('unrecorded'), tone: 'neutral' },
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
            {att.map((a, i) => (
              <tr key={a.cls.id}>
                <td data-label="Class" className="td-primary">{a.cls.name}</td>
                <td data-label="Teacher">{byId(db.teachers, a.cls.teacherId)?.name || <span className="muted">Not assigned</span>}</td>
                <td data-label="Students">{a.total}</td>
                <td data-label="Attendance">{a.recorded ? `${a.present} present · ${a.absent} absent` : <StatusBadge status="Not recorded" />}</td>
                <td data-label="Journal">
                  <StatusBadge status={progress[i]} />
                </td>
              </tr>
            ))}
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
            {db.cameras.map((c) => (
              <CameraRow key={c.id} camera={c} />
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
          <ActivityList items={db.audit.filter((a) => a.role !== 'System Admin').slice(0, 6)} />
        </section>
      </div>
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
  const { db, user, upsert, log } = useStore()
  const toast = useToast()
  const school = byId(db.schools, user.schoolId)
  const [form, setForm] = useState(school || {})
  const [errors, setErrors] = useState({})
  const year = db.years.find((y) => y.status === 'Current')

  if (!school)
    return (
      <div className="card">
        <EmptyState icon={School} title="No school is linked to this account yet." text="Please contact the system administrator." />
      </div>
    )

  const save = (e) => {
    e.preventDefault()
    const errs = validateFields(SCHOOL_FIELDS, form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    upsert('schools', { id: school.id, name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), email: form.email.trim() })
    log('Update', 'School Profile', `School information updated: ${form.name}`)
    toast('School profile saved successfully.')
  }

  return (
    <div className="narrow wide">
      <PageHeader title="School Profile" subtitle="Information shown to teachers and parents" />
      <form className="card form-card" onSubmit={save} noValidate>
        <h2>Basic Information</h2>
        <FormFields fields={SCHOOL_FIELDS} form={form} setForm={setForm} errors={errors} />
        <dl className="details">
          <div>
            <dt>Principal</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={school.status} />
            </dd>
          </div>
        </dl>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save Changes
          </button>
        </div>
      </form>

      <div className="card">
        <h2>School Overview</h2>
        <dl className="details compact">
          <div>
            <dt>Classes</dt>
            <dd>{db.classes.length}</dd>
          </div>
          <div>
            <dt>Teachers</dt>
            <dd>{db.teachers.length}</dd>
          </div>
          <div>
            <dt>Students</dt>
            <dd>{db.students.length}</dd>
          </div>
          <div>
            <dt>Current academic year</dt>
            <dd>{year?.name || 'Not set'}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

// ---------- Academic Year ----------

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
      years: [...prev.years.filter((y) => y.id !== item.id), item].map((y) => (item.status === 'Current' && y.id !== item.id && y.status === 'Current' ? { ...y, status: 'Archived' } : y)),
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
  const { db, mutate, upsert, log } = useStore()
  const toast = useToast()
  const teacherName = (c) => byId(db.teachers, c.teacherId)?.name
  const yearName = (c) => byId(db.years, c.yearId)?.name
  const count = (c) => studentsOfClass(db, c.id).length

  return (
    <CrudPage
      title="Classes"
      subtitle="Classes of the school and their head teachers"
      noun="Class"
      addLabel="Add Class"
      rows={db.classes}
      searchText={(c) => `${c.name} ${teacherName(c) || ''}`}
      searchPlaceholder="Search class or teacher"
      filters={[
        { key: 'year', label: 'academic years', options: db.years.map((y) => ({ value: y.id, label: y.name })), get: (c) => c.yearId },
        { key: 'status', label: 'statuses', options: ACCOUNT_STATUS, get: (c) => c.status },
      ]}
      columns={[
        { key: 'name', label: 'Class Name', sort: (c) => c.name },
        { key: 'year', label: 'Academic Year', render: yearName },
        { key: 'teacher', label: 'Head Teacher', render: (c) => teacherName(c) || <span className="muted">Not assigned</span> },
        { key: 'students', label: 'Students', sort: count, render: count },
        { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
      ]}
      fields={[
        { name: 'name', label: 'Class Name', required: true, placeholder: 'e.g. Mặt Trời 3' },
        { name: 'yearId', label: 'Academic Year', type: 'select', required: true, options: db.years.filter((y) => y.status !== 'Archived').map((y) => ({ value: y.id, label: y.name })) },
        {
          name: 'teacherId',
          label: 'Head Teacher',
          type: 'select',
          placeholder: 'Not assigned',
          hint: 'A teacher leads one class. Assigning moves them from their current class.',
          options: db.teachers.filter((t) => t.status === 'Active').map((t) => ({ value: t.id, label: t.name })),
        },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined },
      ]}
      initial={(c) => c || { name: '', yearId: db.years.find((y) => y.status === 'Current')?.id || '', teacherId: '', status: 'Active' }}
      onSave={(form, editing) => {
        if (db.classes.some((c) => c.name.trim().toLowerCase() === form.name.trim().toLowerCase() && c.id !== editing?.id)) return 'A class with this name already exists.'
        const id = editing?.id || uid('c')
        const item = { ...form, id, name: form.name.trim() }
        mutate((prev) => ({
          classes: [...(editing ? prev.classes.map((c) => (c.id === id ? item : c)) : [...prev.classes, item])].map((c) =>
            c.id !== id && item.teacherId && c.teacherId === item.teacherId ? { ...c, teacherId: '' } : c,
          ),
        }))
        log(editing ? 'Update' : 'Create', 'Classes', `Class ${editing ? 'updated' : 'created'}: ${item.name}`)
      }}
      viewRows={(c) => [
        ['Class Name', c.name],
        ['Academic Year', yearName(c)],
        ['Head Teacher', teacherName(c) || 'Not assigned'],
        ['Students', count(c)],
        ['Status', <StatusBadge status={c.status} />],
      ]}
      actions={(row) => statusActions({ row, coll: 'classes', noun: 'Class', module: 'Classes', upsert, log, toast, lock: false })}
      empty={{ icon: School, title: 'No classes have been added yet.' }}
    />
  )
}

// ---------- Teachers ----------

export function TeachersPage() {
  const { db, mutate, upsert, log } = useStore()
  const toast = useToast()
  const classOf = (t) => db.classes.find((c) => c.teacherId === t.id)

  return (
    <CrudPage
      title="Teachers"
      subtitle="Teacher accounts are created by the principal"
      noun="Teacher"
      addLabel="Add Teacher"
      rows={db.teachers}
      searchText={(t) => `${t.name} ${t.phone} ${t.email} ${classOf(t)?.name || ''}`}
      searchPlaceholder="Search name, phone or class"
      filters={[{ key: 'status', label: 'statuses', options: ['Active', 'Inactive', 'Locked'], get: (t) => t.status }]}
      columns={[
        {
          key: 'name',
          label: 'Name',
          sort: (t) => t.name,
          render: (t) => (
            <span className="cell-user">
              <Avatar name={t.name} size={34} /> {t.name}
            </span>
          ),
        },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'class', label: 'Assigned Class', render: (t) => classOf(t)?.name || <span className="muted">Not assigned</span> },
        { key: 'status', label: 'Status', render: (t) => <StatusBadge status={t.status} /> },
        { key: 'lastLogin', label: 'Last Login', render: lastLogin },
      ]}
      fields={(form, editing) => [
        { name: 'name', label: 'Full Name', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${DEMO_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email', required: true },
        {
          name: 'classId',
          label: 'Assigned Class',
          type: 'select',
          placeholder: 'Not assigned',
          options: db.classes.map((c) => ({ value: c.id, label: c.name })),
          hint: 'Assigning replaces the current head teacher of that class.',
        },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'Inactive', 'Locked'], placeholder: undefined },
      ]}
      initial={(t) => (t ? { ...t, classId: classOf(t)?.id || '' } : { name: '', phone: '', email: '', classId: '', status: 'Active' })}
      onSave={({ classId, ...form }, editing) => {
        if (phoneTaken(db, form.phone, editing?.id)) return 'This phone number is already used by another account.'
        const id = editing?.id || uid('t')
        mutate((prev) => ({
          teachers: editing ? prev.teachers.map((t) => (t.id === id ? { ...t, ...form } : t)) : [{ ...form, id, createdAt: Date.now(), lastLogin: null }, ...prev.teachers],
          classes: prev.classes.map((c) => (c.id === classId ? { ...c, teacherId: id } : c.teacherId === id ? { ...c, teacherId: '' } : c)),
        }))
        log(editing ? 'Update' : 'Create', 'Teachers', `Teacher account ${editing ? 'updated' : 'created'}: ${form.name}`)
      }}
      viewRows={(t) => [
        ['Full Name', t.name],
        ['Phone', t.phone],
        ['Email', t.email],
        ['Assigned Class', classOf(t)?.name || 'Not assigned'],
        ['Status', <StatusBadge status={t.status} />],
        ['Created Date', created(t.createdAt)],
        ['Last Login', t.lastLogin ? fmtDateTime(t.lastLogin) : 'Never'],
      ]}
      actions={(row) => [
        resetPasswordAction({ row, noun: 'Teacher', module: 'Teachers', mutate, log, toast }),
        ...statusActions({ row, coll: 'teachers', noun: 'Teacher', module: 'Teachers', upsert, log, toast }),
      ]}
      empty={{ icon: GraduationCap, title: 'No teacher accounts yet.' }}
    />
  )
}

// ---------- Students ----------

export function StudentsPage() {
  const { db, mutate, log, notify } = useStore()
  const toast = useToast()
  const className = (s) => byId(db.classes, s.classId)?.name
  const parentsOf = (s) =>
    linksOfStudent(db, s.id)
      .map((l) => byId(db.parents, l.parentId)?.name)
      .filter(Boolean)
      .join(', ')

  return (
    <CrudPage
      title="Students"
      subtitle="Students are added and managed by the principal"
      noun="Student"
      addLabel="Add Student"
      rows={db.students}
      searchText={(s) => `${s.name} ${className(s) || ''} ${parentsOf(s)}`}
      searchPlaceholder="Search student, class or parent"
      filters={[
        { key: 'class', label: 'classes', options: db.classes.map((c) => ({ value: c.id, label: c.name })), get: (s) => s.classId },
        { key: 'status', label: 'statuses', options: ACCOUNT_STATUS, get: (s) => s.status },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Full Name',
          sort: (s) => s.name,
          render: (s) => (
            <span className="cell-user">
              <Avatar name={s.name} src={s.photo} size={34} /> {s.name}
            </span>
          ),
        },
        { key: 'dob', label: 'Date of Birth', sort: (s) => s.dob, render: (s) => fmtDate(s.dob) },
        { key: 'gender', label: 'Gender' },
        { key: 'class', label: 'Class', render: (s) => className(s) || <span className="muted">Not assigned</span> },
        { key: 'parent', label: 'Parent', render: (s) => parentsOf(s) || <span className="muted">Not linked</span> },
        { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
      ]}
      fields={(form) => [
        { name: 'photo', label: 'Photo', type: 'photo', full: true },
        { name: 'name', label: 'Full Name', required: true },
        { name: 'dob', label: 'Date of Birth', type: 'date', required: true, validate: (v) => (v > todayISO() ? 'Date of birth cannot be in the future.' : '') },
        { name: 'gender', label: 'Gender', type: 'select', required: true, options: ['Male', 'Female'] },
        { name: 'classId', label: 'Class', type: 'select', required: true, options: db.classes.filter((c) => c.status === 'Active').map((c) => ({ value: c.id, label: c.name })) },
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
              { name: 'parentPhone', label: 'Parent Phone', type: 'tel', required: true, hint: `The parent signs in with this number. Initial password: ${DEMO_PASSWORD}` },
            ]
          : []),
        ...(form.parentMode === 'existing'
          ? [{ name: 'parentId', label: 'Parent', type: 'combobox', required: true, placeholder: 'Search parent by name or phone', options: db.parents.map((p) => ({ value: p.id, label: p.name, sub: p.phone })) }]
          : []),
        ...(form.parentMode !== 'later' ? [{ name: 'relationship', label: 'Relationship to the child', type: 'select', options: RELATIONSHIPS, placeholder: undefined }] : []),
        { name: 'status', label: 'Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined },
        { name: 'note', label: 'Notes for the teacher', type: 'textarea', rows: 3, placeholder: 'Allergies, pick-up arrangements, things the teacher should know' },
      ]}
      initial={(s) => {
        const link = s && linksOfStudent(db, s.id)[0]
        return s
          ? { ...s, parentMode: link ? 'existing' : 'later', parentId: link?.parentId || '', relationship: link?.relationship || 'Mother' }
          : { photo: '', name: '', dob: '', gender: '', classId: '', parentMode: 'new', parentName: '', parentPhone: '', parentId: '', relationship: 'Mother', status: 'Active', note: '' }
      }}
      onSave={({ parentMode, parentId, parentName, parentPhone, relationship, ...form }, editing) => {
        const id = editing?.id || uid('st')
        const student = { ...form, id, name: form.name.trim() }
        let newParent = null
        if (parentMode === 'new') {
          if (phoneTaken(db, parentPhone)) return "This parent's phone number already belongs to an account. Choose “Parent already has an account” instead."
          newParent = { id: uid('par'), name: parentName.trim(), phone: parentPhone.trim(), email: '', address: '', status: 'Active', cameraAccess: true, createdAt: Date.now(), lastLogin: null }
        }
        const linkTo = newParent?.id || (parentMode === 'existing' ? parentId : '')
        mutate((prev) => {
          let links = prev.links
          if (linkTo) {
            const same = links.find((l) => l.studentId === id && l.parentId === linkTo)
            const first = links.find((l) => l.studentId === id)
            if (same) links = links.map((l) => (l.id === same.id ? { ...l, relationship } : l))
            else if (first && !newParent) links = links.map((l) => (l.id === first.id ? { ...l, parentId: linkTo, relationship } : l))
            else links = [...links, { id: uid('l'), parentId: linkTo, studentId: id, relationship, status: 'Active' }]
          }
          return {
            students: editing ? prev.students.map((s) => (s.id === id ? student : s)) : [...prev.students, student],
            parents: newParent ? [newParent, ...prev.parents] : prev.parents,
            links,
          }
        })
        if (newParent) log('Create', 'Parents', `Parent account created: ${newParent.name}`)
        // The class teacher sees the roster change straight away and is told about it.
        const cls = byId(db.classes, student.classId)
        if (cls?.teacherId && (!editing || editing.classId !== student.classId))
          notify({ role: 'teacher', userId: cls.teacherId, type: 'system', title: 'Class roster updated', body: `${student.name} was added to ${cls.name}.` })
        log(editing ? 'Update' : 'Create', 'Students', `Student ${editing ? 'information updated' : 'added'}: ${student.name}`)
      }}
      viewRows={(s) => [
        ['Full Name', s.name],
        ['Date of Birth', fmtDate(s.dob)],
        ['Gender', s.gender],
        ['Class', className(s)],
        ['Parent', parentsOf(s)],
        ['Status', <StatusBadge status={s.status} />],
        ['Notes', s.note],
      ]}
      actions={(row) => [
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          confirm: { title: `Delete ${row.name}?`, body: 'The student is removed from the class roster and from linked parent accounts. This cannot be undone.' },
          onClick: () => {
            mutate((prev) => ({ students: prev.students.filter((s) => s.id !== row.id), links: prev.links.filter((l) => l.studentId !== row.id) }))
            log('Delete', 'Students', `Student deleted: ${row.name}`)
            toast(`${row.name} has been deleted.`)
          },
        },
      ]}
      empty={{ icon: Baby, title: 'No students have been added yet.' }}
    />
  )
}

// ---------- Parents ----------

export function ParentsPage() {
  const { db, mutate, upsert, log, notify } = useStore()
  const toast = useToast()
  const linksOf = (p) => db.links.filter((l) => l.parentId === p.id)
  const children = (p) =>
    linksOf(p)
      .map((l) => byId(db.students, l.studentId)?.name)
      .filter(Boolean)
      .join(', ')
  const relation = (p) => [...new Set(linksOf(p).map((l) => l.relationship))].join(', ')

  return (
    <CrudPage
      title="Parents"
      subtitle="Parent accounts are created by the school. Parents cannot register themselves."
      noun="Parent"
      addLabel="Add Parent"
      rows={db.parents}
      searchText={(p) => `${p.name} ${p.phone} ${p.email} ${children(p)}`}
      searchPlaceholder="Search parent, phone or child"
      filters={[{ key: 'status', label: 'statuses', options: ACCOUNT_STATUS, get: (p) => p.status }]}
      columns={[
        {
          key: 'name',
          label: 'Name',
          sort: (p) => p.name,
          render: (p) => (
            <span className="cell-user">
              <Avatar name={p.name} size={34} /> {p.name}
            </span>
          ),
        },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'address', label: 'Address' },
        { key: 'child', label: 'Child', render: (p) => children(p) || <span className="muted">Not linked</span> },
        { key: 'relationship', label: 'Relationship', render: (p) => relation(p) || '—' },
        { key: 'status', label: 'Status', render: (p) => <StatusBadge status={p.status} /> },
      ]}
      fields={(form, editing) => [
        { name: 'name', label: 'Full Name', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${DEMO_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email', hint: 'Needed for the parent to reset a forgotten password.' },
        { name: 'status', label: 'Account Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined },
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
            { value: 'later', label: 'Link a child later' },
          ],
        },
        ...(form.childMode === 'new'
          ? [
              { name: 'childName', label: 'Child Full Name', required: true },
              { name: 'childDob', label: 'Child Date of Birth', type: 'date', required: true, validate: (v) => (v > todayISO() ? 'Date of birth cannot be in the future.' : '') },
              { name: 'childGender', label: 'Child Gender', type: 'select', required: true, options: ['Male', 'Female'] },
              { name: 'childClassId', label: 'Class', type: 'select', required: true, options: db.classes.filter((c) => c.status === 'Active').map((c) => ({ value: c.id, label: c.name })) },
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
                options: db.students.map((s) => ({ value: s.id, label: s.name, sub: byId(db.classes, s.classId)?.name })),
              },
            ]
          : []),
        ...(form.childMode !== 'later' ? [{ name: 'relationship', label: 'Relationship to the child', type: 'select', options: RELATIONSHIPS, placeholder: undefined }] : []),
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
        const link = p && linksOf(p)[0]
        return p
          ? { ...p, childMode: link ? 'existing' : 'later', studentId: link?.studentId || '', relationship: link?.relationship || 'Mother', cameraAccess: p.cameraAccess === false ? 'no' : 'yes' }
          : { name: '', phone: '', email: '', address: '', childMode: 'new', childName: '', childDob: '', childGender: '', childClassId: '', studentId: '', relationship: 'Mother', status: 'Active', cameraAccess: 'yes' }
      }}
      onSave={({ childMode, studentId, childName, childDob, childGender, childClassId, relationship, cameraAccess, ...form }, editing) => {
        if (phoneTaken(db, form.phone, editing?.id)) return 'This phone number is already used by another account.'
        const id = editing?.id || uid('par')
        const parent = { ...form, id, name: form.name.trim(), phone: form.phone.trim(), email: (form.email || '').trim(), cameraAccess: cameraAccess === 'yes' }
        const newStudent = childMode === 'new' ? { id: uid('st'), name: childName.trim(), dob: childDob, gender: childGender, classId: childClassId, status: 'Active', note: '', photo: '' } : null
        const linkTo = newStudent?.id || (childMode === 'existing' ? studentId : '')
        mutate((prev) => {
          let links = prev.links
          if (linkTo) {
            const same = links.find((l) => l.parentId === id && l.studentId === linkTo)
            const first = links.find((l) => l.parentId === id)
            if (same) links = links.map((l) => (l.id === same.id ? { ...l, relationship } : l))
            else if (first && !newStudent) links = links.map((l) => (l.id === first.id ? { ...l, studentId: linkTo, relationship } : l))
            else links = [...links, { id: uid('l'), parentId: id, studentId: linkTo, relationship, status: 'Active' }]
          }
          return {
            parents: editing ? prev.parents.map((p) => (p.id === id ? { ...p, ...parent } : p)) : [{ ...parent, createdAt: Date.now(), lastLogin: null }, ...prev.parents],
            students: newStudent ? [...prev.students, newStudent] : prev.students,
            links,
          }
        })
        if (newStudent) {
          const cls = byId(db.classes, newStudent.classId)
          if (cls?.teacherId) notify({ role: 'teacher', userId: cls.teacherId, type: 'system', title: 'Class roster updated', body: `${newStudent.name} was added to ${cls.name}.` })
          log('Create', 'Students', `Student added: ${newStudent.name}`)
        }
        log(editing ? 'Update' : 'Create', 'Parents', `Parent account ${editing ? 'updated' : 'created'}: ${parent.name}`)
      }}
      viewRows={(p) => [
        ['Full Name', p.name],
        ['Phone', p.phone],
        ['Email', p.email],
        ['Address', p.address],
        ['Child', children(p)],
        ['Relationship', relation(p)],
        ['Classroom Camera', p.cameraAccess === false ? 'Not allowed' : 'Allowed during scheduled times'],
        ['Account Status', <StatusBadge status={p.status} />],
        ['Last Login', p.lastLogin ? fmtDateTime(p.lastLogin) : 'Never'],
      ]}
      actions={(row) => [
        resetPasswordAction({ row, noun: 'Parent', module: 'Parents', mutate, log, toast }),
        ...statusActions({ row, coll: 'parents', noun: 'Parent', module: 'Parents', upsert, log, toast, lock: false }),
      ]}
      empty={{ icon: Users, title: 'No parent accounts yet.' }}
    />
  )
}

// ---------- Parent–Child Relationships ----------

export function RelationshipsPage() {
  const { db, upsert, remove, log } = useStore()
  const toast = useToast()
  const rows = db.links.map((l) => {
    const parent = byId(db.parents, l.parentId)
    const student = byId(db.students, l.studentId)
    return { ...l, parent, student, className: byId(db.classes, student?.classId)?.name, name: `${parent?.name || 'Unknown'} → ${student?.name || 'Unknown'}` }
  })

  return (
    <CrudPage
      title="Parent–Child Relationships"
      subtitle="Which parent can see which child"
      noun="Relationship"
      addLabel="Link Parent & Child"
      rows={rows}
      searchText={(r) => `${r.name} ${r.relationship} ${r.className || ''}`}
      searchPlaceholder="Search parent or child"
      filters={[
        { key: 'relationship', label: 'relationships', options: RELATIONSHIPS, get: (r) => r.relationship },
        { key: 'status', label: 'statuses', options: ACCOUNT_STATUS, get: (r) => r.status },
      ]}
      columns={[
        { key: 'parent', label: 'Parent', sort: (r) => r.parent?.name || '', render: (r) => r.parent?.name || '—' },
        { key: 'child', label: 'Child', sort: (r) => r.student?.name || '', render: (r) => r.student?.name || '—' },
        { key: 'relationship', label: 'Relationship' },
        { key: 'className', label: 'Class' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'parentId', label: 'Parent', type: 'combobox', required: true, placeholder: 'Search parent by name or phone', options: db.parents.map((p) => ({ value: p.id, label: p.name, sub: p.phone })) },
        {
          name: 'studentId',
          label: 'Child',
          type: 'combobox',
          required: true,
          placeholder: 'Search child by name',
          options: db.students.map((s) => ({ value: s.id, label: s.name, sub: byId(db.classes, s.classId)?.name })),
        },
        { name: 'relationship', label: 'Relationship', type: 'select', required: true, options: RELATIONSHIPS, placeholder: undefined },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ACCOUNT_STATUS, placeholder: undefined },
      ]}
      initial={(r) => (r ? { id: r.id, parentId: r.parentId, studentId: r.studentId, relationship: r.relationship, status: r.status } : { parentId: '', studentId: '', relationship: 'Mother', status: 'Active' })}
      onSave={(form, editing) => {
        if (db.links.some((l) => l.parentId === form.parentId && l.studentId === form.studentId && l.id !== editing?.id)) return 'This parent is already linked to this child.'
        upsert('links', { ...form, id: editing?.id || uid('l') })
        log(editing ? 'Update' : 'Create', 'Relationships', `Parent relationship ${editing ? 'updated' : 'created'}: ${byId(db.parents, form.parentId)?.name} → ${byId(db.students, form.studentId)?.name}`)
      }}
      viewRows={(r) => [
        ['Parent', r.parent?.name],
        ['Parent Phone', r.parent?.phone],
        ['Child', r.student?.name],
        ['Class', r.className],
        ['Relationship', r.relationship],
        ['Status', <StatusBadge status={r.status} />],
      ]}
      actions={(row) => [
        {
          label: 'Unlink',
          icon: Unlink,
          danger: true,
          confirm: { title: 'Unlink this parent and child?', body: `${row.parent?.name} will no longer see ${row.student?.name}'s journal, messages or camera.` },
          onClick: () => {
            remove('links', row.id)
            log('Delete', 'Relationships', `Parent relationship removed: ${row.name}`)
            toast('Relationship removed.')
          },
        },
      ]}
      empty={{ icon: Link2, title: 'No parent–child relationships yet.' }}
    />
  )
}

// ---------- Camera Monitoring ----------

function CameraCard({ camera, index, onOpen }) {
  const { db } = useStore()
  const cam = useCamera(camera.classId)
  const cls = byId(db.classes, camera.classId)
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{cls?.name}</h2>
          <span className="muted small">{camera.name}</span>
        </div>
        <CameraBadge state={cam.state} />
      </div>
      <CameraPreview state={cam.state} variant={index} />
      <div className="row-between">
        <span className="muted">
          <CalendarClock size={16} /> <CameraStatusText cam={cam} />
        </span>
        <button className="btn btn-primary btn-sm" onClick={onOpen}>
          <Video size={16} /> Open Camera
        </button>
      </div>
    </section>
  )
}

export function CameraMonitoringPage() {
  const { db } = useStore()
  const [open, setOpen] = useState(null)
  const cameras = db.cameras.slice(0, 2)
  return (
    <>
      <PageHeader
        title="Camera Monitoring"
        subtitle="Classroom cameras of the school. Parents can only watch during scheduled times."
        actions={
          <Link className="btn" to="/principal/camera-schedule">
            <CalendarClock size={18} /> Camera Schedule
          </Link>
        }
      />
      <div className="cam-grid">
        {cameras.map((c, i) => (
          <CameraCard key={c.id} camera={c} index={i} onOpen={() => setOpen({ camera: c, index: i })} />
        ))}
      </div>
      <p className="privacy-note">
        <ShieldCheck size={16} /> Streams are private to the school. This demonstration uses a simulated classroom view.
      </p>
      <Modal open={!!open} title={open ? `${byId(db.classes, open.camera.classId)?.name} · ${open.camera.name}` : ''} onClose={() => setOpen(null)} size="lg">
        {open && <CameraPlayer classId={open.camera.classId} variant={open.index} />}
      </Modal>
    </>
  )
}

// ---------- Camera Schedule ----------

export function CameraSchedulePage() {
  const { db, upsert, remove, log, notify } = useStore()
  const toast = useToast()
  const now = useNow()
  const className = (id) => byId(db.classes, id)?.name
  const rows = [...db.schedules].sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start))
  const label = (s) => `${className(s.classId)} · ${fmtDate(s.date)} ${s.start}–${s.end}`

  return (
    <CrudPage
      title="Camera Schedule"
      subtitle="Parents can watch the classroom camera only inside these time windows"
      noun="Schedule"
      addLabel="Add Schedule"
      rows={rows}
      searchText={(s) => `${className(s.classId)} ${byId(db.cameras, s.cameraId)?.name} ${s.date}`}
      searchPlaceholder="Search class or camera"
      filters={[
        { key: 'class', label: 'classes', options: db.classes.map((c) => ({ value: c.id, label: c.name })), get: (s) => s.classId },
        { key: 'status', label: 'statuses', options: ['Live Now', 'Scheduled', 'Ended', 'Disabled'], get: (s) => scheduleStatus(s, now) },
      ]}
      columns={[
        { key: 'class', label: 'Class', render: (s) => className(s.classId) },
        { key: 'camera', label: 'Camera', render: (s) => byId(db.cameras, s.cameraId)?.name },
        { key: 'date', label: 'Date', sort: (s) => s.date, render: (s) => fmtDate(s.date) },
        { key: 'start', label: 'Start Time' },
        { key: 'end', label: 'End Time' },
        { key: 'status', label: 'Status', render: (s) => <StatusBadge status={scheduleStatus(s, now)} /> },
      ]}
      fields={(form) => [
        { name: 'classId', label: 'Class', type: 'select', required: true, options: db.classes.map((c) => ({ value: c.id, label: c.name })) },
        {
          name: 'cameraId',
          label: 'Camera',
          type: 'select',
          required: true,
          options: db.cameras.filter((c) => !form.classId || c.classId === form.classId).map((c) => ({ value: c.id, label: `${c.name} — ${className(c.classId)}` })),
          validate: (v, f) => (byId(db.cameras, v)?.classId !== f.classId ? 'This camera belongs to another class.' : ''),
        },
        { name: 'date', label: 'Date', type: 'date', required: true },
        {
          name: 'enabled',
          label: 'Status',
          type: 'select',
          required: true,
          placeholder: undefined,
          options: [
            { value: 'yes', label: 'Enabled' },
            { value: 'no', label: 'Disabled' },
          ],
        },
        { name: 'start', label: 'Start Time', type: 'time', required: true },
        { name: 'end', label: 'End Time', type: 'time', required: true, validate: (v, f) => (f.start && v <= f.start ? 'End time must be after the start time.' : '') },
      ]}
      initial={(s) => (s ? { ...s, enabled: s.enabled ? 'yes' : 'no' } : { classId: '', cameraId: '', date: todayISO(), start: '08:00', end: '09:30', enabled: 'yes' })}
      onSave={(form, editing) => {
        const item = { ...form, id: editing?.id || uid('sch'), enabled: form.enabled === 'yes' }
        const clash = db.schedules.some((s) => s.id !== item.id && s.cameraId === item.cameraId && s.date === item.date && s.enabled && item.enabled && s.start < item.end && item.start < s.end)
        if (clash) return 'This camera already has a viewing time that overlaps with this one.'
        upsert('schedules', item)
        if (item.enabled) notify({ role: 'parent', classId: item.classId, type: 'camera', title: 'Camera schedule updated', body: `${className(item.classId)} camera: ${fmtDate(item.date)}, ${item.start}–${item.end}.` })
        log(editing ? 'Update' : 'Create', 'Camera Schedule', `Camera schedule ${editing ? 'updated' : 'created'}: ${label(item)}`)
      }}
      actions={(row) => [
        {
          label: row.enabled ? 'Disable' : 'Enable',
          icon: Power,
          onClick: () => {
            upsert('schedules', { id: row.id, enabled: !row.enabled })
            log('Update', 'Camera Schedule', `Camera schedule ${row.enabled ? 'disabled' : 'enabled'}: ${label(row)}`)
            toast(`Schedule ${row.enabled ? 'disabled' : 'enabled'}.`)
          },
        },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          confirm: { title: 'Delete this schedule?', body: `Parents will no longer be able to watch ${className(row.classId)} during ${row.start}–${row.end}.` },
          onClick: () => {
            remove('schedules', row.id)
            log('Delete', 'Camera Schedule', `Camera schedule deleted: ${label(row)}`)
            toast('Schedule deleted.')
          },
        },
      ]}
      empty={{ icon: CalendarClock, title: 'No camera schedules yet.', text: 'Parents cannot watch the camera until a viewing time is added.' }}
    />
  )
}

// ---------- Reports ----------

const REPORTS = [
  { key: 'attendance', label: 'Attendance', dated: true },
  { key: 'journal', label: 'Journal Completion', dated: true },
  { key: 'activity', label: 'Class Activity', dated: true },
  { key: 'students', label: 'Students' },
  { key: 'parents', label: 'Parents' },
]

function buildReport(db, type, { from, to, classId }) {
  const classes = db.classes.filter((c) => !classId || c.id === classId)
  const ids = classes.map((c) => c.id)
  const cname = (id) => byId(db.classes, id)?.name || '—'
  const inRange = (d) => d >= from && d <= to
  const byDate = (a, b) => b.date.localeCompare(a.date) || cname(a.classId).localeCompare(cname(b.classId))

  if (type === 'attendance')
    return {
      head: ['Date', 'Class', 'Present', 'Absent', 'Not recorded', 'Attendance rate'],
      rows: db.attendance
        .filter((a) => inRange(a.date) && ids.includes(a.classId))
        .sort(byDate)
        .map((a) => {
          const c = attendanceCounts(db, a.classId, a.date)
          return [fmtDate(a.date), cname(a.classId), c.present, c.absent, c.unrecorded, c.total ? `${Math.round((c.present / c.total) * 100)}%` : '—']
        }),
    }

  if (type === 'journal')
    return {
      head: ['Date', 'Class', 'Status', 'Created with', 'Photos', 'Last edited'],
      rows: db.journals
        .filter((j) => inRange(j.date) && ids.includes(j.classId))
        .sort(byDate)
        .map((j) => [fmtDate(j.date), cname(j.classId), JOURNAL_STATUS[j.status], j.source === 'voice' ? 'Voice (AI-assisted)' : 'Manual entry', j.photos.length, fmtDateTime(j.updatedAt)]),
    }

  if (type === 'activity')
    return {
      head: ['Class', 'Head Teacher', 'Students', 'Days with attendance', 'Journals published', 'Photos shared', 'Messages'],
      rows: classes.map((c) => {
        const journals = db.journals.filter((j) => j.classId === c.id && j.status === 'published' && inRange(j.date))
        return [
          c.name,
          byId(db.teachers, c.teacherId)?.name || 'Not assigned',
          studentsOfClass(db, c.id).length,
          db.attendance.filter((a) => a.classId === c.id && inRange(a.date)).length,
          journals.length,
          journals.reduce((s, j) => s + j.photos.length, 0),
          db.messages.filter((m) => m.teacherId === c.teacherId && inRange(toISO(new Date(m.at)))).length,
        ]
      }),
    }

  if (type === 'students')
    return {
      head: ['Full Name', 'Date of Birth', 'Gender', 'Class', 'Parent', 'Status'],
      rows: db.students
        .filter((s) => ids.includes(s.classId))
        .map((s) => [
          s.name,
          fmtDate(s.dob),
          s.gender,
          cname(s.classId),
          linksOfStudent(db, s.id)
            .map((l) => byId(db.parents, l.parentId)?.name)
            .filter(Boolean)
            .join(', '),
          s.status,
        ]),
    }

  return {
    head: ['Parent', 'Phone', 'Child', 'Class', 'Relationship', 'Status'],
    rows: db.links
      .map((l) => ({ l, p: byId(db.parents, l.parentId), s: byId(db.students, l.studentId) }))
      .filter((x) => x.p && x.s && ids.includes(x.s.classId))
      .map(({ l, p, s }) => [p.name, p.phone, s.name, cname(s.classId), l.relationship, p.status]),
  }
}

export function ReportsPage() {
  const { db } = useStore()
  const today = todayISO()
  const [type, setType] = useState('attendance')
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [classId, setClassId] = useState('')
  const meta = REPORTS.find((r) => r.key === type)
  const report = buildReport(db, type, { from, to, classId })
  const statusCol = report.head.indexOf('Status')

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Attendance, journals and class records"
        actions={
          <>
            <button className="btn" onClick={() => window.print()} disabled={report.rows.length === 0}>
              <Printer size={18} /> Export PDF
            </button>
            <button className="btn btn-primary" onClick={() => downloadCSV(`kinderlog-${type}-${today}.csv`, [report.head, ...report.rows])} disabled={report.rows.length === 0}>
              <Download size={18} /> Export Excel
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
        <Select value={classId} onChange={setClassId} options={db.classes.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" aria-label="Class" />
      </div>

      {report.rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No records for this selection." text="Try a wider date range or another class." />
        </div>
      ) : (
        <div className="card table-card">
          <div className="card-head pad">
            <h2>{meta.label}</h2>
            <span className="muted small">
              {meta.dated ? `${fmtDate(from)} – ${fmtDate(to)} · ` : ''}
              {report.rows.length} {report.rows.length === 1 ? 'row' : 'rows'}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                {report.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} data-label={report.head[j]} className={j === 0 ? 'td-primary' : ''}>
                      {j === statusCol ? <StatusBadge status={v} /> : v === '' ? '—' : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------- School Announcements ----------

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
        { name: 'expiryDate', label: 'Expiry Date', type: 'date', validate: (v, f) => (v && f.publishDate && v < f.publishDate ? 'Expiry date cannot be before the publish date.' : '') },
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
