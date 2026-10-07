import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, BellOff, CheckCheck, Eye, EyeOff, KeyRound, LogOut, Pencil, ScrollText, ShieldCheck } from 'lucide-react'
import { DEMO_PASSWORD, ROLES, childrenOf, classOfTeacher, byId, notificationsFor, useStore } from '../store/store'
import { fmtDateTime, norm, toISO } from '../lib/utils'
import { FormFields, validateFields } from '../components/CrudPage'
import { useLogout } from '../components/Shell'
import {
  Avatar,
  EmptyState,
  Field,
  Modal,
  NotificationItem,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  SkeletonTable,
  StatusBadge,
  useFakeLoad,
  useToast,
} from '../components/ui'

const PROFILE_FIELDS = [
  { name: 'name', label: 'Full Name', required: true },
  { name: 'phone', label: 'Phone', type: 'tel', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
]

export function ProfilePage() {
  const { db, user, upsert, log } = useStore()
  const toast = useToast()
  const [askLogout, logoutDialog] = useLogout()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const base = `/${user.role}`

  const extra = {
    admin: [['System Role', 'Platform administration']],
    principal: [['School', byId(db.schools, user.schoolId)?.name]],
    teacher: [['Assigned Class', classOfTeacher(db, user.id)?.name || 'Not assigned']],
    parent: childrenOf(db, user.id).map((c) => ['Child', `${c.name} — ${byId(db.classes, c.classId)?.name} (${c.relationship})`]),
  }[user.role]

  const save = (e) => {
    e.preventDefault()
    const errs = validateFields(PROFILE_FIELDS, form)
    if (!errs.phone && db[ROLES[user.role].coll].some((u) => u.phone === form.phone && u.id !== user.id)) errs.phone = 'This phone number is already in use.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    upsert(ROLES[user.role].coll, { id: user.id, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() })
    log('Update', 'Profile', 'Profile information updated')
    setEditing(false)
    toast('Profile updated successfully.')
  }

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
          {[['Full Name', user.name], ['Phone', user.phone], ['Email', user.email], ['Role', user.roleLabel], ...extra, ['Account Status', user.status]].map(([k, v], i) => (
            <div key={i}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="profile-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setForm({ name: user.name, phone: user.phone, email: user.email })
              setErrors({})
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
        <ShieldCheck size={16} /> Your information is only visible to authorized staff of your school.
      </p>

      <Modal open={editing} title="Edit Profile" onClose={() => setEditing(false)}>
        <form onSubmit={save} noValidate>
          <FormFields fields={PROFILE_FIELDS} form={form} setForm={setForm} errors={errors} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Changes
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
  const { db, user, mutate, log } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const min = Number(db.settings.passwordMin) || 6

  const submit = (e) => {
    e.preventDefault()
    const errs = {}
    if ((db.passwords[user.id] ?? DEMO_PASSWORD) !== f.current) errs.current = 'Current password is incorrect.'
    if (f.next.length < min) errs.next = `Password must be at least ${min} characters.`
    else if (f.next === f.current) errs.next = 'New password must be different from the current one.'
    if (f.confirm !== f.next) errs.confirm = 'Passwords do not match.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    mutate((prev) => ({ passwords: { ...prev.passwords, [user.id]: f.next } }))
    log('Update', 'Authentication', 'Password changed')
    toast('Your password has been changed.')
    navigate(`/${user.role}/profile`)
  }

  return (
    <div className="narrow">
      <PageHeader title="Change Password" subtitle="Choose a password you do not use anywhere else." />
      <form className="card form-card" onSubmit={submit} noValidate>
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
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Change Password
          </button>
        </div>
      </form>
    </div>
  )
}

// System Admin sees every entry; a principal only sees activity inside the school.
export function AuditLogPage({ scope }) {
  const { db } = useStore()
  const loading = useFakeLoad()
  const [q, setQ] = useState('')
  const [date, setDate] = useState('')
  const [role, setRole] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const source = useMemo(() => (scope === 'school' ? db.audit.filter((a) => a.role !== 'System Admin') : db.audit), [db.audit, scope])
  const roles = [...new Set(source.map((a) => a.role))]
  const actions = [...new Set(source.map((a) => a.action))]
  const rows = source.filter(
    (a) =>
      (!q || norm(`${a.user} ${a.description} ${a.module}`).includes(norm(q))) &&
      (!date || toISO(new Date(a.at)) === date) &&
      (!role || a.role === role) &&
      (!action || a.action === action),
  )
  const size = 10
  const pages = Math.max(1, Math.ceil(rows.length / size))
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
          <EmptyState icon={ScrollText} title="No activity found." text="Try a different search or filter." />
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
              {rows.slice((cur - 1) * size, cur * size).map((a) => (
                <tr key={a.id}>
                  <td data-label="Time" className="nowrap">{fmtDateTime(a.at)}</td>
                  <td data-label="User" className="td-primary">{a.user}</td>
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
          <Pagination page={cur} pages={pages} total={rows.length} onPage={setPage} />
        </div>
      )}
    </>
  )
}

const NOTIF_TARGET = {
  teacher: { message: '/teacher/messages', journal: '/teacher/journal' },
  parent: { message: '/parent/messages', journal: '/parent/journal', camera: '/parent/camera', announcement: '/parent/announcements' },
}

export function useNotifications() {
  const { db, user, mutate } = useStore()
  const list = notificationsFor(db, user)
  const markRead = (ids) =>
    mutate((prev) => ({
      notifications: prev.notifications.map((n) => (ids.includes(n.id) && !n.readBy.includes(user.id) ? { ...n, readBy: [...n.readBy, user.id] } : n)),
    }))
  return { list, markRead, isUnread: (n) => !n.readBy.includes(user.id) }
}

export function NotificationsPage() {
  const { user } = useStore()
  const navigate = useNavigate()
  const { list, markRead, isUnread } = useNotifications()
  const [open, setOpen] = useState(null)
  const unread = list.filter(isUnread)

  const click = (n) => {
    markRead([n.id])
    const target = NOTIF_TARGET[user.role]?.[n.type]
    if (target) navigate(target)
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
