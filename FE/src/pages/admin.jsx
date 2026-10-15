import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Cpu, Database, HardDrive, Lock, RefreshCw, RotateCcw, School, Sparkles, UserCog, CheckCircle2 } from 'lucide-react'
import { DEMO_PASSWORD, useStore } from '../store/store'
import { fmtDate, fmtDateTime, relTime, todayISO } from '../lib/utils'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { STATUS, STATUS_KEY, errorText } from '../lib/labels'
import { resetPasswordAction, statusActions } from '../lib/actions'
import CrudPage, { FormFields, validateFields } from '../components/CrudPage'
import { CategoryBarChart } from '../components/Charts'
import { Avatar, ConfirmDialog, Loadable, PageHeader, SkeletonCards, StatCard, StatusBadge, useToast } from '../components/ui'

const USER_STATUS = ['Active', 'Inactive', 'Locked']
const statusOf = (r) => STATUS[r.status] || r.status
const dateOf = (ts) => (ts ? fmtDate(String(ts).slice(0, 10)) : '—')
const blankToUndef = (v) => (v === undefined || v === null || String(v).trim() === '' ? undefined : String(v).trim())

// Sample infrastructure figures: the demo has no metrics agent. The API/database row is checked live.
const SERVICES = [
  { name: 'File storage', status: 'Operational', detail: 'Photos and attachments' },
  { name: 'Notification service', status: 'Operational', detail: 'Queue empty' },
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

// Live backend check: GET /health (database ping + AI mode).
function useHealth() {
  return useApi(async () => {
    const started = performance.now()
    try {
      const h = await api.health()
      return { ok: true, ms: Math.round(performance.now() - started), ...h }
    } catch (e) {
      return { ok: false, error: errorText(e) }
    }
  }, [])
}

const liveServices = (h) => [
  { name: 'API server', status: h?.ok ? 'Operational' : 'Failed', detail: h?.ok ? `Response time ${h.ms} ms` : h?.error || 'Checking…' },
  { name: 'Database (PostgreSQL)', status: h?.ok && h.db === 'up' ? 'Operational' : 'Failed', detail: h?.ok ? 'Connected' : 'Unreachable' },
]
const aiServices = (h) => [
  { name: 'Speech-to-Text (Whisper)', status: h?.ok ? 'Operational' : 'Failed', detail: h?.aiMode === 'live' ? 'OpenAI Whisper' : 'Demo mode (offline transcript)' },
  { name: 'Journal draft generation', status: h?.ok ? 'Operational' : 'Failed', detail: h?.aiMode === 'live' ? 'Claude structured outputs' : 'Demo mode (rule-based extractor)' },
]

export function AdminDashboard() {
  const { db, user } = useStore()
  const ad = useApi(() => api.reports.adminDashboard(), [])
  const schools = useApi(() => api.schools.list(), [])
  const health = useHealth()
  const today = db.audit.filter((a) => new Date(a.at).toISOString().slice(0, 10) === todayISO())

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Platform status · ${fmtDate(todayISO())}`} />
      <Loadable q={ad} skeleton={<SkeletonCards />}>
        {(d) => (
          <>
            <div className="grid stats">
              <StatCard icon={School} label="Total Schools" value={d.totals.schools} tint="sky" />
              <StatCard icon={CheckCircle2} label="Active Schools" value={d.totals.activeSchools} tint="mint" />
              <StatCard icon={Lock} label="Inactive / Locked Schools" value={d.totals.schools - d.totals.activeSchools} tint="peach" />
              <StatCard
                icon={UserCog}
                label="Principal Accounts"
                value={d.totals.users.PRINCIPAL.total}
                hint={`${d.totals.users.TEACHER.total} teachers · ${d.totals.users.PARENT.total} parents`}
                tint="lav"
              />
            </div>
            <section className="card">
              <div className="card-head">
                <h2>Journal entries in the last 7 days</h2>
                <span className="muted small">per school</span>
              </div>
              <CategoryBarChart
                data={d.last7Days.map((s) => ({ label: s.schoolName, value: s.journalEntries }))}
                valueName="Entries"
                height={Math.max(120, d.last7Days.length * 48)}
              />
            </section>
          </>
        )}
      </Loadable>

      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h2>School Overview</h2>
            <Link to="/admin/schools">Manage schools</Link>
          </div>
          <ul className="plain-list">
            {(schools.data || []).map((s) => (
              <li key={s.id} className="row-between">
                <span>
                  <strong>{s.name}</strong>
                  <span className="muted block small">
                    {s.principals[0]?.fullName || 'No principal'} · {s.classCount} classes · {s.teacherCount} teachers · {s.parentCount} parents
                  </span>
                </span>
                <StatusBadge status={statusOf(s)} />
              </li>
            ))}
          </ul>
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
            <StatusBadge status={health.data ? (health.data.ok ? 'Healthy' : 'Failed') : 'Pending'} />
          </div>
          <div className="row-between">
            <span>
              <Sparkles size={16} /> AI service
            </span>
            <span className="cell-user">
              <span className="muted small">{health.data?.aiMode === 'live' ? 'Live (Whisper + Claude)' : 'Demo mode'}</span>
              <StatusBadge status={health.data?.ok ? 'Operational' : 'Pending'} />
            </span>
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
  const toast = useToast()
  const schools = useApi(() => api.schools.list(), [])
  const principalName = (s) => s.principals.map((p) => p.fullName).join(', ')

  return (
    <CrudPage
      title="Schools"
      subtitle="Schools using KinderLog. Principals are assigned in Principals."
      noun="School"
      addLabel="Add School"
      rows={schools.data || []}
      loading={schools.loading}
      error={schools.error}
      onRetry={schools.reload}
      searchText={(s) => `${s.name} ${principalName(s)} ${s.address || ''}`}
      searchPlaceholder="Search school or principal"
      filters={[{ key: 'status', label: 'statuses', options: USER_STATUS, get: statusOf }]}
      columns={[
        { key: 'name', label: 'School Name', sort: (s) => s.name },
        { key: 'principal', label: 'Principal', render: (s) => principalName(s) || <span className="muted">Not assigned</span> },
        { key: 'status', label: 'Status', render: (s) => <StatusBadge status={statusOf(s)} /> },
        { key: 'teachers', label: 'Teachers', sort: (s) => s.teacherCount, render: (s) => s.teacherCount },
        { key: 'classes', label: 'Classes', sort: (s) => s.classCount, render: (s) => s.classCount },
        { key: 'parents', label: 'Parents', sort: (s) => s.parentCount, render: (s) => s.parentCount },
        { key: 'createdAt', label: 'Created Date', sort: (s) => s.createdAt, render: (s) => dateOf(s.createdAt) },
      ]}
      fields={(form, editing) => [
        { name: 'name', label: 'School Name', required: true, placeholder: 'e.g. Mầm non Hoa Sen', full: true },
        { name: 'address', label: 'Address', required: true, full: true },
        { name: 'phone', label: 'Phone', required: true, validate: (v) => (!/^0\d{9,10}$/.test(v || '') ? 'Enter a valid phone number.' : '') },
        { name: 'email', label: 'Email', type: 'email', required: true },
        ...(editing ? [{ name: 'status', label: 'Status', type: 'select', required: true, options: USER_STATUS, placeholder: undefined }] : []),
      ]}
      initial={(s) =>
        s ? { name: s.name, address: s.address || '', phone: s.phone || '', email: s.email || '', status: statusOf(s) } : { name: '', address: '', phone: '', email: '' }
      }
      onSave={async (form, editing) => {
        const body = { name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), email: form.email.trim() }
        if (editing) await api.schools.update(editing.id, { ...body, status: STATUS_KEY[form.status] })
        else await api.schools.create(body)
        schools.reload()
      }}
      viewRows={(s) => [
        ['School Name', s.name],
        ['Address', s.address],
        ['Phone', s.phone],
        ['Email', s.email],
        ['Principal', principalName(s)],
        ['Status', <StatusBadge status={statusOf(s)} />],
        ['Teachers', s.teacherCount],
        ['Classes', s.classCount],
        ['Parents', s.parentCount],
        ['Created Date', dateOf(s.createdAt)],
      ]}
      actions={(row) => statusActions({ row, name: row.name, noun: 'School', save: (status) => api.schools.update(row.id, { status }), done: schools.reload, toast })}
      empty={{ icon: School, title: 'No schools have been added yet.' }}
    />
  )
}

export function PrincipalsPage() {
  const toast = useToast()
  const principals = useApi(() => api.users.list({ role: 'PRINCIPAL' }), [])
  const schools = useApi(() => api.schools.list(), [])

  return (
    <CrudPage
      title="Principals"
      subtitle="Principal accounts are created by the System Admin"
      noun="Principal"
      addLabel="Add Principal"
      rows={principals.data || []}
      loading={principals.loading}
      error={principals.error}
      onRetry={principals.reload}
      searchText={(p) => `${p.fullName} ${p.phone} ${p.email || ''} ${p.school?.name || ''}`}
      searchPlaceholder="Search name, phone or email"
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
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'school', label: 'School', render: (p) => p.school?.name || <span className="muted">Not assigned</span> },
        { key: 'status', label: 'Status', render: (p) => <StatusBadge status={statusOf(p)} /> },
        { key: 'createdAt', label: 'Created Date', sort: (p) => p.createdAt, render: (p) => dateOf(p.createdAt) },
        { key: 'lastLogin', label: 'Last Login', render: (p) => (p.lastLoginAt ? relTime(new Date(p.lastLoginAt).getTime()) : 'Never') },
      ]}
      fields={(form, editing) => [
        { name: 'fullName', label: 'Full Name', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${DEMO_PASSWORD}` },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'schoolId', label: 'School', type: 'select', required: true, options: (schools.data || []).map((s) => ({ value: s.id, label: s.name })) },
      ]}
      initial={(p) => (p ? { fullName: p.fullName, phone: p.phone, email: p.email || '', schoolId: p.schoolId || '' } : { fullName: '', phone: '', email: '', schoolId: '' })}
      onSave={async (form, editing) => {
        const body = { fullName: form.fullName.trim(), phone: form.phone.trim(), email: blankToUndef(form.email), schoolId: form.schoolId }
        if (editing) await api.users.update(editing.id, body)
        else await api.users.create({ ...body, role: 'PRINCIPAL' })
        principals.reload()
        schools.reload()
      }}
      viewRows={(p) => [
        ['Full Name', p.fullName],
        ['Phone', p.phone],
        ['Email', p.email],
        ['School', p.school?.name],
        ['Status', <StatusBadge status={statusOf(p)} />],
        ['Created Date', dateOf(p.createdAt)],
        ['Last Login', p.lastLoginAt ? fmtDateTime(new Date(p.lastLoginAt).getTime()) : 'Never'],
      ]}
      actions={(row) => [
        resetPasswordAction({ row, reset: () => api.users.resetPassword(row.id), toast }),
        ...statusActions({ row, noun: 'Principal', save: (s) => api.users.setStatus(row.id, s), done: principals.reload, toast }),
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
        <p className="muted">
          Restore the local sample data (messages, notifications, announcements, audit log) kept in this browser. Data stored in the backend is reset with <code>npm run seed</code>{' '}
          in the BE folder.
        </p>
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
  const health = useHealth()
  const [checked, setChecked] = useState(Date.now())
  const refresh = () => {
    health.reload()
    setChecked(Date.now())
  }
  const ok = health.data?.ok
  return (
    <>
      <PageHeader
        title="System Monitoring"
        subtitle={`Last checked ${fmtDateTime(checked)} · API and database are checked live; resource figures are sample values`}
        actions={
          <button className="btn" onClick={refresh} disabled={health.loading}>
            <RefreshCw size={16} className={health.loading ? 'spin' : ''} /> {health.loading ? 'Checking…' : 'Refresh'}
          </button>
        }
      />
      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h2>System Health</h2>
            <StatusBadge status={health.data ? (ok ? 'Healthy' : 'Failed') : 'Pending'} />
          </div>
          <ServiceList items={[...liveServices(health.data), ...SERVICES]} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>AI Service Status</h2>
            <StatusBadge status={ok ? 'Operational' : 'Pending'} />
          </div>
          <ServiceList items={aiServices(health.data)} />
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
              ['Voice recordings', 'Not stored (sent to speech-to-text only)'],
              ['Profile photos', '1.3 GB'],
              ['Documents and exports', 'Generated on demand'],
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
