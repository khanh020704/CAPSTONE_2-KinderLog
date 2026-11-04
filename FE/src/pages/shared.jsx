import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, BellOff, CheckCheck, Eye, EyeOff, KeyRound, LogOut, Pencil, ScrollText, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/store'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useSettings } from '../lib/useSettings'
import { RELATIONSHIP, errorText, label } from '../lib/labels'
import { AUDIT_ACTION_OPTIONS, AUDIT_ROLE_OPTIONS, auditActionParam, auditRoleParam, toAuditRow, toNotification } from '../lib/mappers'
import { fmtDateTime } from '../lib/utils'
import { FormFields, validateFields } from '../components/CrudPage'
import { useLogout } from '../components/Shell'
import { Avatar, EmptyState, Field, Modal, NotificationItem, PageHeader, Pagination, SearchInput, Select, SkeletonTable, StatusBadge, useToast } from '../components/ui'

const PROFILE_FIELDS = [
  { name: 'name', label: 'Full Name', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'address', label: 'Address', full: true },
]

export function ProfilePage() {
  const { user, setProfile } = useStore()
  const toast = useToast()
  const [askLogout, logoutDialog] = useLogout()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const base = `/${user.role}`
  const p = user.api

  const extra = {
    admin: [['System Role', 'Platform administration']],
    principal: [['School', p.school?.name || 'Not assigned']],
    teacher: [['Assigned Class', p.classes?.map((c) => c.name).join(', ') || 'Not assigned']],
    parent: (p.children || []).map((c) => ['Child', `${c.fullName} — ${c.class?.name || ''} (${label(RELATIONSHIP, c.relationship)})`]),
  }[user.role]

  const save = async (e) => {
    e.preventDefault()
    const errs = validateFields(PROFILE_FIELDS, form)
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const profile = await api.auth.updateProfile({
        fullName: form.name.trim(),
        email: form.email?.trim() || undefined,
        address: form.address?.trim() || undefined,
      })
      setProfile(profile)
      setEditing(false)
      toast('Profile updated successfully.')
    } catch (err) {
      setFormError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const rows = [
    ['Full Name', user.name],
    ['Phone', user.phone],
    ['Email', user.email],
    ['Address', user.address],
    ['Role', user.roleLabel],
    ...extra,
    ['Account Status', user.status],
    ['Last Login', user.lastLogin ? fmtDateTime(user.lastLogin) : ''],
  ]

  return (
    <div className="narrow">
      <PageHeader title="My Profile" subtitle="Your account information" />
      <div className="card profile-card">
        <div className="profile-top">
          <Avatar name={user.name} size={76} />
          <div>
            <h2>{user.name}</h2>
            <div className="muted">{user.roleLabel}</div>
            <StatusBadge status={user.status} />
          </div>
        </div>
        <dl className="details">
          {rows.map(([k, v], i) => (
            <div key={i}>
              <dt>{k}</dt>
              <dd>{v || '—'}</dd>
            </div>
          ))}
        </dl>
        <div className="profile-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setForm({ name: user.name, email: user.email, address: user.address })
              setErrors({})
              setFormError('')
              setEditing(true)
            }}
          >
            <Pencil size={16} /> Edit Profile
          </button>
          <Link className="btn" to={`${base}/password`}>
            <KeyRound size={16} /> Change Password
          </Link>
          <button className="btn" onClick={askLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
      <p className="privacy-note">
        <ShieldCheck size={16} /> Your phone number is your sign-in name; ask your school to change it. Your information is only visible to authorized staff.
      </p>

      <Modal open={editing} title="Edit Profile" onClose={() => !saving && setEditing(false)}>
        <form onSubmit={save} noValidate>
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormFields fields={PROFILE_FIELDS} form={form} setForm={setForm} errors={errors} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
      {logoutDialog}
    </div>
  )
}

export function PasswordInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-affix">
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" className="icon-btn sm" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export function ChangePasswordPage() {
  const { user } = useStore()
  const { settings } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const min = Math.max(6, Number(settings.passwordMin) || 6)

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!f.current) errs.current = 'Enter your current password.'
    if (f.next.length < min) errs.next = `Password must be at least ${min} characters.`
    else if (f.next === f.current) errs.next = 'New password must be different from the current one.'
    if (f.confirm !== f.next) errs.confirm = 'Passwords do not match.'
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await api.auth.changePassword(f.current, f.next)
      toast('Your password has been changed.')
      navigate(`/${user.role}/profile`)
    } catch (err) {
      if (err.status === 400 && /current password/i.test(err.message)) setErrors({ current: 'Current password is incorrect.' })
      else setFormError(errorText(err))
      setSaving(false)
    }
  }

  return (
    <div className="narrow">
      <PageHeader title="Change Password" subtitle="Choose a password you do not use anywhere else." />
      <form className="card form-card" onSubmit={submit} noValidate>
        {formError && <FormAlert>{formError}</FormAlert>}
        <Field label="Current Password" required error={errors.current}>
          <PasswordInput value={f.current} onChange={set('current')} placeholder="Enter your current password" autoComplete="current-password" />
        </Field>
        <Field label="New Password" required error={errors.next} hint={`At least ${min} characters.`}>
          <PasswordInput value={f.next} onChange={set('next')} placeholder="Enter a new password" autoComplete="new-password" />
        </Field>
        <Field label="Confirm New Password" required error={errors.confirm}>
          <PasswordInput value={f.confirm} onChange={set('confirm')} placeholder="Re-enter the new password" autoComplete="new-password" />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Filtering and paging happen on the server (GET /audit-logs). The backend scopes the entries: the System Admin sees
// every school, a principal only the activity of their own school.
export function AuditLogPage({ scope }) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [role, setRole] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const size = 10
  // typing in the search box waits for a short pause before asking the server
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])
  const logs = useApi(
    () => api.auditLogs.list({ search, from: date, to: date, role: auditRoleParam(role), action: auditActionParam(action), page, limit: size }),
    [search, date, role, action, page],
  )
  const loading = logs.initial
  const rows = (logs.data?.items || []).map(toAuditRow)
  const filtered = !!(search || date || role || action)
  const roles = scope === 'school' ? AUDIT_ROLE_OPTIONS.filter((r) => r !== 'System Admin') : AUDIT_ROLE_OPTIONS
  const actions = AUDIT_ACTION_OPTIONS
  const pages = Math.max(1, logs.data?.pages || 1)
  const cur = Math.min(page, pages)
  const reset = (fn) => (v) => {
    fn(v)
    setPage(1)
  }

  return (
    <>
      <PageHeader title="Audit Logs" subtitle={scope === 'school' ? 'Important actions taken in your school' : 'Important actions taken across the platform'} />
      <div className="toolbar">
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Search user, module or description" />
        <input type="date" className="date-input" value={date} onChange={(e) => reset(setDate)(e.target.value)} aria-label="Date" />
        <Select value={role} onChange={reset(setRole)} options={roles} placeholder="All roles" aria-label="Role" />
        <Select value={action} onChange={reset(setAction)} options={actions} placeholder="All actions" aria-label="Action" />
      </div>
      {loading ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ScrollText}
            title={filtered ? 'No activity found.' : 'No activity yet.'}
            text={filtered ? 'Try a different search or filter.' : 'Actions taken in KinderLog will appear here.'}
          />
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Module</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td data-label="Time" className="nowrap">
                    {fmtDateTime(a.at)}
                  </td>
                  <td data-label="User" className="td-primary">
                    {a.user}
                  </td>
                  <td data-label="Role">{a.role}</td>
                  <td data-label="Action">{a.action}</td>
                  <td data-label="Module">{a.module}</td>
                  <td data-label="Description">{a.description}</td>
                  <td data-label="Status">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={cur} pages={pages} total={logs.data?.total || 0} onPage={setPage} />
        </div>
      )}
    </>
  )
}

const NOTIF_TARGET = {
  teacher: { message: '/teacher/messages', journal: '/teacher/journal' },
  parent: { message: '/parent/messages', journal: '/parent/journal', camera: '/parent/camera', announcement: '/parent/announcements' },
}
const NOTIFICATION_PAGE = 50

// The signed-in user's notifications from the backend; reading one updates the badges as well.
export function useNotifications() {
  const { refreshCounts } = useStore()
  const q = useApi(() => api.notifications.list({ limit: NOTIFICATION_PAGE }), [])
  const list = (q.data?.items || []).map(toNotification)
  const markRead = useCallback(
    async (ids) => {
      if (!ids.length) return
      // optimistic: the dot disappears at once, the server confirms
      q.setData((d) => d && { ...d, items: d.items.map((n) => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)) })
      await (ids.length > 1 ? api.notifications.markAllRead() : api.notifications.markRead(ids[0])).catch(() => q.reload())
      refreshCounts()
    },
    [q, refreshCounts],
  )
  return { list, markRead, isUnread: (n) => n.unread, loading: q.initial }
}

export function NotificationsPage() {
  const { user } = useStore()
  const navigate = useNavigate()
  const { list, markRead, isUnread } = useNotifications()
  const [open, setOpen] = useState(null)
  const unread = list.filter(isUnread)

  const click = (n) => {
    markRead([n.id])
    const target = n.link || NOTIF_TARGET[user.role]?.[n.type]
    if (target && target !== window.location.pathname) navigate(target)
    else setOpen(n)
  }

  return (
    <div className="narrow">
      <PageHeader
        title="Notifications"
        subtitle={unread.length ? `${unread.length} unread` : 'School and class updates'}
        actions={
          unread.length > 0 && (
            <button className="btn" onClick={() => markRead(unread.map((n) => n.id))}>
              <CheckCheck size={16} /> Mark all as read
            </button>
          )
        }
      />
      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={BellOff} title="You're all caught up." text="New updates will appear here." soft={user.role === 'parent'} />
        </div>
      ) : (
        <div className="card list-card">
          {list.map((n) => (
            <NotificationItem key={n.id} n={n} unread={isUnread(n)} onClick={() => click(n)} />
          ))}
        </div>
      )}
      <Modal open={!!open} title={open?.title} onClose={() => setOpen(null)} size="sm">
        <p>{open?.body}</p>
        <p className="muted">{open && fmtDateTime(open.at)}</p>
      </Modal>
    </div>
  )
}

export function FormAlert({ children }) {
  return (
    <div className="alert alert-error">
      <AlertCircle size={18} /> {children}
    </div>
  )
}
