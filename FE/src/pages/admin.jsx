import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Cpu, Database, HardDrive, Lock, RefreshCw, RotateCcw, School, ScrollText, Sparkles, UserCog, CheckCircle2 } from 'lucide-react'
import { DEMO_PASSWORD, byId, useStore } from '../store/store'
import { fmtDate, fmtDateTime, relTime, toISO, todayISO, uid } from '../lib/utils'
import { phoneTaken, resetPasswordAction, statusActions } from '../lib/actions'
import CrudPage, { FormFields, validateFields } from '../components/CrudPage'
import { Avatar, ConfirmDialog, PageHeader, SkeletonCards, StatCard, StatusBadge, useFakeLoad, useToast } from '../components/ui'

// The demo runs one school; counts come from that school's data and new schools start empty.
const schoolCounts = (db, school) =>
  school.id === 's1'
    ? { teachers: db.teachers.length, classes: db.classes.length, students: db.students.length }
    : { teachers: 0, classes: 0, students: 0 }

const SERVICES = [
  { name: 'Web application', status: 'Operational', detail: 'Response time 182 ms' },
  { name: 'Database', status: 'Operational', detail: '14 of 100 connections in use' },
  { name: 'File storage', status: 'Operational', detail: 'Photos and attachments' },
  { name: 'Notification service', status: 'Operational', detail: 'Queue empty' },
]
const AI_SERVICES = [
  { name: 'Vietnamese Speech-to-Text', status: 'Operational', detail: 'Average transcription 4.1 s' },
  { name: 'Journal draft generation', status: 'Operational', detail: 'Average processing 6.2 s' },
]
const RESOURCES = [
  { icon: HardDrive, label: 'Storage', value: 38, text: '38.4 GB of 100 GB' },
  { icon: Cpu, label: 'CPU', value: 23, text: '23% average load' },
  { icon: Database, label: 'Memory', value: 54, text: '4.3 GB of 8 GB' },
]

function Meter({ icon: Icon, label, value, text }) {
  return (
    <div className="meter">
      <div className="meter-top">
        <span>
          <Icon size={16} /> {label}
        </span>
        <span className="muted">{text}</span>
      </div>
      <div className="meter-track" role="img" aria-label={`${label}: ${text}`}>
        <span className="meter-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function ServiceList({ items }) {
  return (
    <ul className="plain-list">
      {items.map((s) => (
        <li key={s.name} className="row-between">
          <span>
            <strong>{s.name}</strong>
            <span className="muted block small">{s.detail}</span>
          </span>
          <StatusBadge status={s.status} />
        </li>
      ))}
    </ul>
  )
}

export function ActivityList({ items }) {
  return (
    <ul className="plain-list">
      {items.map((a) => (
        <li key={a.id} className="activity">
          <span className={`activity-dot ${a.status === 'Failed' ? 'failed' : ''}`} />
          <span>
            {a.description}
            <span className="muted block small">
              {a.user} · {relTime(a.at)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AdminDashboard() {
  const { db, user } = useStore()
  const loading = useFakeLoad()
  const school = db.schools[0]
  const counts = school ? schoolCounts(db, school) : null
  const active = db.schools.filter((s) => s.status === 'Active').length
  const today = db.audit.filter((a) => toISO(new Date(a.at)) === todayISO())

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Platform status · ${fmtDate(todayISO())}`} />
      {loading ? (
        <SkeletonCards />
      ) : (
        <div className="grid stats">
          <StatCard icon={School} label="Total Schools" value={db.schools.length} tint="sky" />
          <StatCard icon={CheckCircle2} label="Active Schools" value={active} tint="mint" />
          <StatCard icon={Lock} label="Inactive / Locked Schools" value={db.schools.length - active} tint="peach" />
          <StatCard icon={UserCog} label="Principal Accounts" value={db.principals.length} tint="lav" />
        </div>
      )}

      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h2>School Overview</h2>
            <Link to="/admin/schools">Manage schools</Link>
          </div>
          {school && (
            <>
              <div className="row-between">
                <div>
                  <strong className="lead">{school.name}</strong>
                  <div className="muted">{school.address}</div>
                </div>
                <StatusBadge status={school.status} />
              </div>
              <dl className="details compact">
                <div>
                  <dt>Principal</dt>
                  <dd>{byId(db.principals, school.principalId)?.name || 'Not assigned'}</dd>
                </div>
                <div>
                  <dt>Teachers</dt>
                  <dd>{counts.teachers}</dd>
                </div>
                <div>
                  <dt>Classes</dt>
                  <dd>{counts.classes}</dd>
                </div>
                <div>
                  <dt>Students</dt>
                  <dd>{counts.students}</dd>
                </div>
              </dl>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>System Monitoring</h2>
            <Link to="/admin/monitoring">View details</Link>
          </div>
          <div className="row-between">
            <span>
              <Activity size={16} /> System health
            </span>
            <StatusBadge status="Healthy" />
          </div>
          <div className="row-between">
            <span>
              <Sparkles size={16} /> AI service
            </span>
            <StatusBadge status="Operational" />
          </div>
          {RESOURCES.map((r) => (
            <Meter key={r.label} {...r} />
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Recent Activities</h2>
          </div>
          <ActivityList items={db.audit.filter((a) => a.role === 'System Admin' || a.user === user.name).slice(0, 5)} />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Audit Activity</h2>
            <Link to="/admin/audit">Open audit logs</Link>
          </div>
          <div className="mini-stats">
            <div>
              <div className="stat-value">{today.length}</div>
              <div className="muted">Events today</div>
            </div>
            <div>
              <div className="stat-value">{today.filter((a) => a.status === 'Failed').length}</div>
              <div className="muted">Failed today</div>
            </div>
          </div>
          <ActivityList items={db.audit.slice(0, 4)} />
        </section>
      </div>
    </>
  )
}

export function SchoolsPage() {
  const { db, mutate, upsert, log } = useStore()
  const toast = useToast()
  const principalName = (s) => byId(db.principals, s.principalId)?.name

  return (
    <CrudPage
      title="Schools"
      subtitle="Schools using KinderLog"
      noun="School"
      addLabel="Add School"
      rows={db.schools}
      searchText={(s) => `${s.name} ${principalName(s) || ''} ${s.address}`}
      searchPlaceholder="Search school or principal"
      filters={[{ key: 'status', label: 'statuses', options: ['Active', 'Inactive', 'Locked'], get: (s) => s.status }]}
      columns={[
        { key: 'name', label: 'School Name', sort: (s) => s.name },
        { key: 'principal', label: 'Principal', render: (s) => principalName(s) || <span className="muted">Not assigned</span> },
        { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
        { key: 'teachers', label: 'Teachers', render: (s) => schoolCounts(db, s).teachers },
        { key: 'classes', label: 'Classes', render: (s) => schoolCounts(db, s).classes },
        { key: 'students', label: 'Students', render: (s) => schoolCounts(db, s).students },
        { key: 'createdAt', label: 'Created Date', sort: (s) => s.createdAt, render: (s) => fmtDate(toISO(new Date(s.createdAt))) },
      ]}
      fields={(form, editing) => [
        { name: 'name', label: 'School Name', required: true, placeholder: 'e.g. Mầm non Hoa Sen', full: true },
        { name: 'address', label: 'Address', required: true, full: true },
        { name: 'phone', label: 'Phone', required: true, validate: (v) => (!/^0\d{9,10}$/.test(v || '') ? 'Enter a valid phone number.' : '') },
        { name: 'email', label: 'Email', type: 'email', required: true },
        {
          name: 'principalId',
          label: 'Principal',
          type: 'select',
          placeholder: 'Not assigned',
          hint: 'Principal accounts are created in Principals.',
          options: db.principals.filter((p) => !db.schools.some((s) => s.principalId === p.id && s.id !== editing?.id)).map((p) => ({ value: p.id, label: p.name })),
        },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'Inactive', 'Locked'], placeholder: undefined },
      ]}
      initial={(s) => s || { name: '', address: '', phone: '', email: '', principalId: '', status: 'Active' }}
      onSave={(form, editing) => {
        if (db.schools.some((s) => s.name.trim().toLowerCase() === form.name.trim().toLowerCase() && s.id !== editing?.id)) return 'A school with this name already exists.'
        const id = editing?.id || uid('s')
        mutate((prev) => ({
          schools: editing ? prev.schools.map((s) => (s.id === id ? { ...s, ...form } : s)) : [...prev.schools, { ...form, id, createdAt: Date.now() }],
          principals: prev.principals.map((p) => (p.id === form.principalId ? { ...p, schoolId: id } : p.schoolId === id ? { ...p, schoolId: '' } : p)),
        }))
        log(editing ? 'Update' : 'Create', 'Schools', `School ${editing ? 'updated' : 'created'}: ${form.name}`)
      }}
      viewRows={(s) => [
        ['School Name', s.name],
        ['Address', s.address],
        ['Phone', s.phone],
        ['Email', s.email],
        ['Principal', principalName(s)],
        ['Status', <StatusBadge status={s.status} />],
        ['Teachers', schoolCounts(db, s).teachers],
        ['Classes', schoolCounts(db, s).classes],
        ['Students', schoolCounts(db, s).students],
        ['Created Date', fmtDate(toISO(new Date(s.createdAt)))],
      ]}
      actions={(row) => statusActions({ row, coll: 'schools', noun: 'School', module: 'Schools', upsert, log, toast })}
      empty={{ icon: School, title: 'No schools have been added yet.' }}
    />
  )
}

export function PrincipalsPage() {
  const { db, mutate, upsert, log } = useStore()
  const toast = useToast()
  const schoolName = (p) => byId(db.schools, p.schoolId)?.name

  return (
    <CrudPage
      title="Principals"
      subtitle="Principal accounts are created by the System Admin"
      noun="Principal"
      addLabel="Add Principal"
      rows={db.principals}
      searchText={(p) => `${p.name} ${p.phone} ${p.email} ${schoolName(p) || ''}`}
      searchPlaceholder="Search name, phone or email"
      filters={[{ key: 'status', label: 'statuses', options: ['Active', 'Inactive', 'Locked'], get: (p) => p.status }]}
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
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'school', label: 'School', render: (p) => schoolName(p) || <span className="muted">Not assigned</span> },
        { key: 'status', label: 'Status', render: (p) => <StatusBadge status={p.status} /> },
        { key: 'createdAt', label: 'Created Date', sort: (p) => p.createdAt, render: (p) => fmtDate(toISO(new Date(p.createdAt))) },
        { key: 'lastLogin', label: 'Last Login', render: (p) => (p.lastLogin ? relTime(p.lastLogin) : 'Never') },
      ]}
      fields={(form, editing) => [
        { name: 'name', label: 'Full Name', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${DEMO_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'schoolId', label: 'School', type: 'select', placeholder: 'Not assigned', options: db.schools.map((s) => ({ value: s.id, label: s.name })) },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'Inactive', 'Locked'], placeholder: undefined },
      ]}
      initial={(p) => p || { name: '', phone: '', email: '', schoolId: '', status: 'Active' }}
      onSave={(form, editing) => {
        if (phoneTaken(db, form.phone, editing?.id)) return 'This phone number is already used by another account.'
        const id = editing?.id || uid('pr')
        mutate((prev) => ({
          principals: editing ? prev.principals.map((p) => (p.id === id ? { ...p, ...form } : p)) : [{ ...form, id, createdAt: Date.now(), lastLogin: null }, ...prev.principals],
          schools: prev.schools.map((s) => (s.id === form.schoolId ? { ...s, principalId: id } : s.principalId === id ? { ...s, principalId: '' } : s)),
        }))
        log(editing ? 'Update' : 'Create', 'Principals', `Principal account ${editing ? 'updated' : 'created'}: ${form.name}`)
      }}
      viewRows={(p) => [
        ['Full Name', p.name],
        ['Phone', p.phone],
        ['Email', p.email],
        ['School', schoolName(p)],
        ['Status', <StatusBadge status={p.status} />],
        ['Created Date', fmtDate(toISO(new Date(p.createdAt)))],
        ['Last Login', p.lastLogin ? fmtDateTime(p.lastLogin) : 'Never'],
      ]}
      actions={(row) => [
        resetPasswordAction({ row, noun: 'Principal', module: 'Principals', mutate, log, toast }),
        ...statusActions({ row, coll: 'principals', noun: 'Principal', module: 'Principals', upsert, log, toast }),
      ]}
      empty={{ icon: UserCog, title: 'No principal accounts yet.' }}
    />
  )
}

const SETTINGS_FIELDS = [
  { name: 'platformName', label: 'Platform Name', required: true },
  { name: 'supportEmail', label: 'Support Email', type: 'email', required: true },
  { name: 'sessionTimeout', label: 'Session Timeout (minutes)', type: 'number', required: true, validate: (v) => (Number(v) < 5 ? 'Use at least 5 minutes.' : '') },
  { name: 'passwordMin', label: 'Minimum Password Length', type: 'number', required: true, validate: (v) => (Number(v) < 6 ? 'Use at least 6 characters.' : '') },
  { name: 'sttLanguage', label: 'Speech-to-Text Language', type: 'select', options: ['Vietnamese'], placeholder: undefined },
  { name: 'maxPhotos', label: 'Photos per Journal (maximum)', type: 'number', required: true, validate: (v) => (Number(v) < 1 ? 'Allow at least 1 photo.' : '') },
]

export function SettingsPage() {
  const { db, mutate, log, resetDemo } = useStore()
  const toast = useToast()
  const [form, setForm] = useState(db.settings)
  const [errors, setErrors] = useState({})
  const [confirm, setConfirm] = useState(false)

  const save = (e) => {
    e.preventDefault()
    const errs = validateFields(SETTINGS_FIELDS, form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    mutate(() => ({ settings: form }))
    log('Update', 'System Settings', 'Global settings updated')
    toast('Settings saved successfully.')
  }

  return (
    <div className="narrow wide">
      <PageHeader title="System Settings" subtitle="Global settings for the KinderLog platform" />
      <form className="card form-card" onSubmit={save} noValidate>
        <h2>General</h2>
        <FormFields fields={SETTINGS_FIELDS} form={form} setForm={setForm} errors={errors} />
        <label className="check switch-row">
          <input type="checkbox" checked={form.aiJournal} onChange={(e) => setForm((p) => ({ ...p, aiJournal: e.target.checked }))} />
          <span>
            <strong>AI-assisted journal drafts</strong>
            <span className="muted block small">Teachers can record their voice and receive a draft. Drafts are never published automatically.</span>
          </span>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save Settings
          </button>
        </div>
      </form>

      <div className="card form-card">
        <h2>Demonstration data</h2>
        <p className="muted">Restore the sample school, accounts and journals to their original state. All changes made in this browser will be lost.</p>
        <div>
          <button className="btn" onClick={() => setConfirm(true)}>
            <RotateCcw size={16} /> Reset demo data
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Reset demo data?"
        body="Everything created or edited in this browser will be replaced with the original sample data."
        confirmLabel="Reset"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          resetDemo()
          setConfirm(false)
          toast('Demo data has been reset.')
        }}
      />
    </div>
  )
}

export function MonitoringPage() {
  const [checked, setChecked] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const refresh = () => {
    setBusy(true)
    setTimeout(() => {
      setChecked(Date.now())
      setBusy(false)
    }, 700)
  }
  return (
    <>
      <PageHeader
        title="System Monitoring"
        subtitle={`Last checked ${fmtDateTime(checked)} · sample values for demonstration`}
        actions={
          <button className="btn" onClick={refresh} disabled={busy}>
            <RefreshCw size={16} className={busy ? 'spin' : ''} /> {busy ? 'Checking…' : 'Refresh'}
          </button>
        }
      />
      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h2>System Health</h2>
            <StatusBadge status="Healthy" />
          </div>
          <ServiceList items={SERVICES} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>AI Service Status</h2>
            <StatusBadge status="Operational" />
          </div>
          <ServiceList items={AI_SERVICES} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Resource Utilization</h2>
          </div>
          {RESOURCES.map((r) => (
            <Meter key={r.label} {...r} />
          ))}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Storage Usage</h2>
          </div>
          <ul className="plain-list">
            {[
              ['Journal photos', '24.1 GB'],
              ['Voice recordings', '9.8 GB'],
              ['Profile photos', '1.3 GB'],
              ['Documents and exports', '3.2 GB'],
            ].map(([k, v]) => (
              <li key={k} className="row-between">
                <span>{k}</span>
                <strong>{v}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
