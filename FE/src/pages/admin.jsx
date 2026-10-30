import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Cpu, Database, HardDrive, Lock, RefreshCw, School, Sparkles, UserCog, CheckCircle2 } from 'lucide-react'
import { INITIAL_PASSWORD, useStore } from '../store/store'
import { fmtBytes, fmtDate, fmtDateTime, relTime, todayISO } from '../lib/utils'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { toAuditRow } from '../lib/mappers'
import { STATUS, STATUS_KEY, errorText } from '../lib/labels'
import { resetPasswordAction, statusActions } from '../lib/actions'
import CrudPage, { FormFields, validateFields } from '../components/CrudPage'
import { Avatar, Loadable, PageHeader, SkeletonCards, StatCard, StatusBadge, useToast } from '../components/ui'

const USER_STATUS = ['Active', 'Inactive', 'Locked']
const statusOf = (r) => STATUS[r.status] || r.status
const dateOf = (ts) => (ts ? fmtDate(String(ts).slice(0, 10)) : '—')
const blankToUndef = (v) => (v === undefined || v === null || String(v).trim() === '' ? undefined : String(v).trim())

// Server figures measured by the backend (GET /system/metrics) each time the page loads or is refreshed.
const useMetrics = () => useApi(() => api.system.metrics(), [])
const share = (used, total) => (total ? Math.round((used / total) * 100) : 0)

function resourcesOf(q) {
  const m = q.data
  const pending = q.error ? 'Not available' : 'Checking…'
  return [
    {
      icon: HardDrive,
      label: 'Storage',
      value: m?.disk ? share(m.disk.usedBytes, m.disk.totalBytes) : 0,
      text: m?.disk ? `${fmtBytes(m.disk.usedBytes)} of ${fmtBytes(m.disk.totalBytes)}` : pending,
    },
    { icon: Cpu, label: 'CPU', value: m ? Math.round(m.cpu.percent) : 0, text: m ? `${m.cpu.percent}% load · ${m.cpu.cores} cores` : pending },
    {
      icon: Database,
      label: 'Memory',
      value: m ? share(m.memory.usedBytes, m.memory.totalBytes) : 0,
      text: m ? `${fmtBytes(m.memory.usedBytes)} of ${fmtBytes(m.memory.totalBytes)}` : pending,
    },
  ]
}

const fileStorage = (q) => ({
  name: 'File storage',
  status: q.data ? (q.data.uploads.writable ? 'Operational' : 'Failed') : q.error ? 'Failed' : 'Pending',
  detail: q.data ? (q.data.uploads.writable ? 'Upload folder writable' : 'Upload folder is not writable') : q.error ? errorText(q.error) : 'Checking…',
})

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
  if (!items.length) return <p className="muted small">No activity yet.</p>
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
  {
    name: `Database (${h?.dbEngine || 'SQL Server'})`,
    status: h?.ok && h.db === 'up' ? 'Operational' : 'Failed',
    detail: h?.db === 'up' ? `Connected · ping ${h.dbLatencyMs} ms` : h?.ok ? 'Unreachable' : h?.error || 'Checking…',
  },
]
// ai.speechToText / ai.extraction from /health: 'ready' | 'missing-key' | 'offline' (automated tests)
const aiStep = (h, step, ready, key) => {
  const s = h?.ai?.[step]
  if (!h?.ok) return { status: h ? 'Failed' : 'Pending', detail: h?.error || 'Checking…' }
  if (s === 'missing-key') return { status: 'Not configured', detail: `Add ${key} to the backend .env` }
  return { status: 'Operational', detail: s === 'offline' ? 'Offline test mode' : ready }
}
const STT_NAMES = { groq: 'Groq Whisper large-v3', openai: 'OpenAI Whisper' }
const LLM_NAMES = { groq: 'Groq gpt-oss-120b', claude: 'Claude structured outputs', keywords: 'Built-in keyword rules (no API key)' }
const aiServices = (h) => [
  { name: 'Speech-to-Text (Whisper)', ...aiStep(h, 'speechToText', STT_NAMES[h?.ai?.speechToTextProvider] || 'Whisper', 'GROQ_API_KEY') },
  { name: 'Journal draft generation', ...aiStep(h, 'extraction', LLM_NAMES[h?.ai?.extractionProvider] || 'AI', 'GROQ_API_KEY') },
]
const aiConfigured = (h) => h?.ai && h.ai.speechToText !== 'missing-key' && h.ai.extraction !== 'missing-key'
const aiLabel = (h) =>
  !h?.ai
    ? ''
    : h.ai.mode === 'mock'
      ? 'Offline test mode'
      : aiConfigured(h)
        ? `Live (${STT_NAMES[h.ai.speechToTextProvider]} + ${LLM_NAMES[h.ai.extractionProvider]})`
        : 'Speech-to-text key not configured'

export function AdminDashboard() {
  const { user } = useStore()
  const ad = useApi(() => api.reports.adminDashboard(), [])
  const today = todayISO()
  const mine = useApi(() => api.auditLogs.list({ userId: user.apiId, limit: 5 }), [user.apiId])
  const recent = useApi(() => api.auditLogs.list({ limit: 4 }), [])
  const todayAll = useApi(() => api.auditLogs.list({ from: today, to: today, limit: 1 }), [today])
  const todayFailed = useApi(() => api.auditLogs.list({ from: today, to: today, status: 'FAILED', limit: 1 }), [today])
  const schools = useApi(() => api.schools.list(), [])
  const health = useHealth()
  const metrics = useMetrics()

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Platform status · ${fmtDate(todayISO())}`} />
      <Loadable q={ad} skeleton={<SkeletonCards />}>
        {(d) => (
          <div className="grid stats">
            <StatCard icon={School} label="Total Schools" value={d.totals.schools} tint="sky" />
            <StatCard icon={CheckCircle2} label="Active Schools" value={d.totals.activeSchools} tint="mint" />
            <StatCard icon={Lock} label="Inactive / Locked Schools" value={d.totals.schools - d.totals.activeSchools} tint="peach" />
            <StatCard icon={UserCog} label="Principal Accounts" value={d.totals.users.PRINCIPAL.total} tint="lav" />
          </div>
        )}
      </Loadable>

      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h2>School Overview</h2>
            <Link to="/admin/schools">Manage schools</Link>
          </div>
          {schools.data?.length === 0 && <p className="muted small">No schools yet.</p>}
          <ul className="plain-list school-overview">
            {(schools.data || []).map((s) => (
              <li key={s.id}>
                <div className="row-between school-overview-head">
                  <span>
                    <strong className="school-overview-name">{s.name}</strong>
                    {s.address && <span className="muted block">{s.address}</span>}
                  </span>
                  <StatusBadge status={statusOf(s)} />
                </div>
                <dl className="details compact">
                  <div>
                    <dt>Principal</dt>
                    <dd>{s.principals[0]?.fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Teachers</dt>
                    <dd>{s.teacherCount}</dd>
                  </div>
                  <div>
                    <dt>Classes</dt>
                    <dd>{s.classCount}</dd>
                  </div>
                  <div>
                    <dt>Students</dt>
                    <dd>{s.studentCount}</dd>
                  </div>
                </dl>
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
            <StatusBadge status={health.data ? (health.data.ok && health.data.db === 'up' ? 'Healthy' : 'Failed') : 'Pending'} />
          </div>
          <div className="row-between">
            <span>
              <Sparkles size={16} /> AI service
            </span>
            <span className="cell-user">
              <span className="muted small">{aiLabel(health.data)}</span>
              <StatusBadge status={!health.data?.ok ? 'Pending' : aiConfigured(health.data) ? 'Operational' : 'Not configured'} />
            </span>
          </div>
          {resourcesOf(metrics).map((r) => (
            <Meter key={r.label} {...r} />
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Recent Activities</h2>
          </div>
          <ActivityList items={(mine.data?.items || []).map(toAuditRow)} />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Audit Activity</h2>
            <Link to="/admin/audit">Open audit logs</Link>
          </div>
          <div className="mini-stats">
            <div>
              <div className="stat-value">{todayAll.data?.total ?? '…'}</div>
              <div className="muted">Events today</div>
            </div>
            <div>
              <div className="stat-value">{todayFailed.data?.total ?? '…'}</div>
              <div className="muted">Failed today</div>
            </div>
          </div>
          <ActivityList items={(recent.data?.items || []).map(toAuditRow)} />
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
        { key: 'students', label: 'Students', sort: (s) => s.studentCount, render: (s) => s.studentCount },
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
        ['Students', s.studentCount],
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
        { name: 'phone', label: 'Phone', type: 'tel', required: true, hint: editing ? undefined : `Used to sign in. Initial password: ${INITIAL_PASSWORD}` },
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
  const { db, mutate } = useStore()
  const toast = useToast()
  const [form, setForm] = useState(db.settings)
  const [errors, setErrors] = useState({})

  const save = (e) => {
    e.preventDefault()
    const errs = validateFields(SETTINGS_FIELDS, form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    mutate(() => ({ settings: form }))
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
    </div>
  )
}

export function MonitoringPage() {
  const health = useHealth()
  const metrics = useMetrics()
  const [checked, setChecked] = useState(Date.now())
  const refresh = () => {
    health.reload()
    metrics.reload()
    setChecked(Date.now())
  }
  const ok = health.data?.ok && health.data.db === 'up'
  return (
    <>
      <PageHeader
        title="System Monitoring"
        subtitle={`Last checked ${fmtDateTime(checked)} · all figures are measured on the server`}
        actions={
          <button className="btn" onClick={refresh} disabled={health.loading || metrics.loading}>
            <RefreshCw size={16} className={health.loading || metrics.loading ? 'spin' : ''} /> {health.loading || metrics.loading ? 'Checking…' : 'Refresh'}
          </button>
        }
      />
      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h2>System Health</h2>
            <StatusBadge status={health.data ? (ok ? 'Healthy' : 'Failed') : 'Pending'} />
          </div>
          <ServiceList items={[...liveServices(health.data), fileStorage(metrics)]} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>AI Service Status</h2>
            <StatusBadge status={!ok ? 'Pending' : aiConfigured(health.data) ? 'Operational' : 'Not configured'} />
          </div>
          <ServiceList items={aiServices(health.data)} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Resource Utilization</h2>
          </div>
          {resourcesOf(metrics).map((r) => (
            <Meter key={r.label} {...r} />
          ))}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Storage Usage</h2>
          </div>
          <ul className="plain-list">
            {[
              ['Journal photos', metrics.data ? `${metrics.data.uploads.photoFiles} files · ${fmtBytes(metrics.data.uploads.photoBytes)}` : '—'],
              ['Database (records and profile photos)', metrics.data ? fmtBytes(metrics.data.database.sizeBytes) : '—'],
              ['Voice recordings', 'Not stored (sent to speech-to-text only)'],
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
