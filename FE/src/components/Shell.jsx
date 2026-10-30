import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  MoreHorizontal,
  ScrollText,
  Settings,
  School,
  UserRound,
  UserCog,
  Users,
  Baby,
  Video,
  X,
} from 'lucide-react'
import { ROLES, useStore } from '../store/store'
import { Avatar, ConfirmDialog, Logo } from './ui'

const NAV = {
  admin: [
    { items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      title: 'Platform',
      items: [
        { to: '/admin/schools', label: 'Schools', icon: School },
        { to: '/admin/principals', label: 'Principals', icon: UserCog },
        { to: '/admin/settings', label: 'System Settings', icon: Settings },
      ],
    },
    {
      title: 'Oversight',
      items: [
        { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
        { to: '/admin/monitoring', label: 'System Monitoring', icon: Activity },
      ],
    },
  ],
  principal: [
    { items: [{ to: '/principal', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      title: 'School',
      items: [
        { to: '/principal/school', label: 'School Profile', icon: Building2 },
        { to: '/principal/academic-year', label: 'Academic Year', icon: CalendarDays },
        { to: '/principal/classes', label: 'Classes', icon: School },
      ],
    },
    {
      title: 'People',
      items: [
        { to: '/principal/teachers', label: 'Teachers', icon: GraduationCap },
        { to: '/principal/students', label: 'Students', icon: Baby },
        { to: '/principal/parents', label: 'Parents', icon: Users },
        { to: '/principal/relationships', label: 'Parent–Child Relationships', icon: Link2 },
      ],
    },
    {
      title: 'Camera',
      items: [
        { to: '/principal/cameras', label: 'Camera Monitoring', icon: Video },
        { to: '/principal/camera-schedule', label: 'Camera Schedule', icon: CalendarClock },
      ],
    },
    {
      title: 'Communication & records',
      items: [
        { to: '/principal/reports', label: 'Reports', icon: BarChart3 },
        { to: '/principal/announcements', label: 'School Announcements', icon: Megaphone },
        { to: '/principal/audit', label: 'Audit Logs', icon: ScrollText },
      ],
    },
  ],
  teacher: [
    {
      items: [
        { to: '/teacher', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true, tab: true },
        { to: '/teacher/class', label: 'My Class', short: 'Class', icon: Users, tab: true },
        { to: '/teacher/attendance', label: 'Attendance', icon: ClipboardCheck, tab: true },
        { to: '/teacher/journal', label: 'Daily Journal', short: 'Journal', icon: BookOpen, tab: true },
        { to: '/teacher/messages', label: 'Messages', icon: MessageCircle, tab: true, badge: 'messages' },
        { to: '/teacher/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
      ],
    },
  ],
}

const PARENT_TABS = [
  { to: '/parent', label: 'Home', icon: Home, end: true },
  { to: '/parent/journal', label: 'Journal', icon: BookOpen },
  { to: '/parent/messages', label: 'Messages', icon: MessageCircle, badge: 'messages' },
  { to: '/parent/camera', label: 'Camera', icon: Video },
  { to: '/parent/more', label: 'More', icon: MoreHorizontal, badge: 'notifications' },
]

export function RequireRole({ role, children }) {
  const { user, checking } = useStore()
  // A remembered token is re-validated first (a fraction of a second), so the screens never load data with an expired one.
  if (checking) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={ROLES[user.role].home} replace />
  return children
}

function useBadges() {
  return useStore().counts
}

function useLogout() {
  const { logout } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const dialog = (
    <ConfirmDialog
      open={open}
      title="Log out of KinderLog?"
      body="You will need your phone number and password to sign in again."
      confirmLabel="Logout"
      onClose={() => setOpen(false)}
      onConfirm={() => {
        logout()
        navigate('/login')
      }}
    />
  )
  return [() => setOpen(true), dialog]
}

const Count = ({ n }) => (n > 0 ? <span className="count">{n > 9 ? '9+' : n}</span> : null)

export function AppShell({ role }) {
  const { user } = useStore()
  const badges = useBadges()
  const [askLogout, logoutDialog] = useLogout()
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  const base = `/${role}`
  const tabs = NAV[role].flatMap((g) => g.items).filter((i) => i.tab)

  useEffect(() => setDrawer(false), [pathname])

  return (
    <div className={`shell shell-${role} ${tabs.length ? 'has-tabs' : ''}`}>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="sidebar-head">
          <Link to={base}>
            <Logo />
          </Link>
          <button className="icon-btn drawer-close" onClick={() => setDrawer(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {NAV[role].map((group, i) => (
            <div key={i} className="nav-group">
              {group.title && <div className="nav-title">{group.title}</div>}
              {group.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className="nav-item">
                  <it.icon size={18} />
                  <span>{it.label}</span>
                  {it.badge && <Count n={badges[it.badge]} />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to={`${base}/profile`} className="nav-item">
            <UserRound size={18} />
            <span>My Profile</span>
          </NavLink>
          <NavLink to={`${base}/password`} className="nav-item">
            <KeyRound size={18} />
            <span>Change Password</span>
          </NavLink>
          <button className="nav-item" onClick={askLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <Link to={base} className="topbar-logo">
            <Logo size={26} />
          </Link>
          <div className="topbar-spacer" />
          {role === 'teacher' && (
            <Link to={`${base}/notifications`} className="icon-btn bell" aria-label="Notifications">
              <Bell size={20} />
              <Count n={badges.notifications} />
            </Link>
          )}
          <Link to={`${base}/profile`} className="topbar-user">
            <Avatar name={user.name} size={36} />
            <span className="topbar-user-text">
              <strong>{user.name}</strong>
              <span className="muted">{user.roleLabel}</span>
            </span>
          </Link>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      {tabs.length > 0 && (
        <nav className="tabbar" aria-label="Primary">
          {tabs.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className="tab">
              <span className="tab-icon">
                <it.icon size={22} />
                {it.badge && <Count n={badges[it.badge]} />}
              </span>
              {it.short || it.label}
            </NavLink>
          ))}
        </nav>
      )}
      {logoutDialog}
    </div>
  )
}

export function ParentShell() {
  const { user } = useStore()
  const badges = useBadges()
  return (
    <div className="shell shell-parent has-tabs">
      <header className="topbar parent-topbar">
        <Link to="/parent">
          <Logo size={26} />
        </Link>
        <nav className="parent-topnav" aria-label="Primary">
          {PARENT_TABS.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className="nav-item">
              <it.icon size={18} />
              <span>{it.label}</span>
              {it.badge && <Count n={badges[it.badge]} />}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-spacer" />
        <Link to="/parent/notifications" className="icon-btn bell" aria-label="Notifications">
          <Bell size={20} />
          <Count n={badges.notifications} />
        </Link>
        <Link to="/parent/profile" aria-label="My profile">
          <Avatar name={user.name} size={36} />
        </Link>
      </header>
      <main className="content parent-content">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Primary">
        {PARENT_TABS.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className="tab">
            <span className="tab-icon">
              <it.icon size={22} />
              {it.badge && <Count n={badges[it.badge]} />}
            </span>
            {it.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export { useLogout }
