import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, GraduationCap, MailCheck, ShieldCheck, UserCog, Users } from 'lucide-react'
import { DEMO_PASSWORD, ROLES, useStore } from '../store/store'
import { isPhone } from '../lib/utils'
import { Field, Logo } from '../components/ui'
import { FormAlert, PasswordInput } from './shared'

const ROLE_OPTIONS = [
  { key: 'admin', icon: ShieldCheck, demo: '0901000001' },
  { key: 'principal', icon: UserCog, demo: '0902000001' },
  { key: 'teacher', icon: GraduationCap, demo: '0903000001' },
  { key: 'parent', icon: Users, demo: '0904000001' },
]

export function SchoolIllustration() {
  return (
    <svg className="auth-art" viewBox="0 0 480 360" role="img" aria-label="Children walking to preschool in the morning">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dcecf6" />
          <stop offset="1" stopColor="#f6f9f6" />
        </linearGradient>
      </defs>
      <rect width="480" height="360" fill="url(#sky)" />
      <circle className="sun" cx="396" cy="74" r="30" fill="#fbe7b8" />
      <g className="clouds" fill="#fff" opacity=".9">
        <ellipse cx="96" cy="70" rx="38" ry="13" />
        <ellipse cx="122" cy="60" rx="24" ry="12" />
        <ellipse cx="300" cy="46" rx="30" ry="10" />
      </g>
      <path d="M0 262c70-34 150-34 240-10s170 14 240-14v122H0z" fill="#dcebdc" />
      <path d="M0 292c90-22 180-16 260 0s150 8 220-8v76H0z" fill="#cfe3d2" />
      {/* school */}
      <g>
        <rect x="150" y="150" width="180" height="112" fill="#fffaf1" />
        <path d="M138 152 240 92l102 60z" fill="#e9b59b" />
        <rect x="232" y="64" width="3" height="30" fill="#8a9b93" />
        <path className="flag" d="M235 64l22 7-22 7z" fill="#7fb3a4" />
        <circle cx="240" cy="128" r="11" fill="#fffaf1" stroke="#d99f84" strokeWidth="3" />
        <path d="M240 122v6l4 3" stroke="#b9826a" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M222 262v-44a18 18 0 0 1 36 0v44z" fill="#8fbfb0" />
        <circle cx="251" cy="240" r="2.5" fill="#fffaf1" />
        {[166, 194, 268, 296].map((x) => (
          <g key={x}>
            <rect x={x} y="176" width="20" height="24" rx="3" fill="#cfe4f1" />
            <rect x={x} y="218" width="20" height="24" rx="3" fill="#cfe4f1" />
          </g>
        ))}
        <rect x="144" y="258" width="192" height="6" fill="#ead9bd" />
      </g>
      {/* trees */}
      <g>
        <rect x="88" y="232" width="6" height="32" fill="#c9ae88" />
        <circle cx="91" cy="218" r="24" fill="#b5d6bf" />
        <rect x="388" y="238" width="6" height="28" fill="#c9ae88" />
        <circle cx="391" cy="226" r="20" fill="#b5d6bf" />
      </g>
      <path d="M214 264c-6 30-40 60-90 96h232c-50-36-84-66-90-96z" fill="#f3e8d3" />
      {/* children holding hands, walking up the path to school */}
      <g className="walkers">
        <g className="walker">
          <rect x="170" y="296" width="16" height="20" rx="5" fill="#e9b59b" />
          <circle cx="186" cy="284" r="10" fill="#f1cfb4" />
          <path d="M176 280c2-9 18-10 20 0-6-3-13-3-20 0z" fill="#5d5046" />
          <path className="leg leg-a" d="M181 320v16" stroke="#5d6b74" strokeWidth="5" strokeLinecap="round" />
          <path className="leg leg-b" d="M191 320v16" stroke="#5d6b74" strokeWidth="5" strokeLinecap="round" />
          <rect x="178" y="294" width="17" height="26" rx="7" fill="#9cc3dc" />
          <path d="M195 304l17 7" stroke="#f1cfb4" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g className="walker w2">
          <rect x="206" y="300" width="15" height="18" rx="5" fill="#b9b3dc" />
          <circle cx="222" cy="290" r="9.5" fill="#f1cfb4" />
          <path d="M212 289c0-13 20-13 20 0 0 4-1 8-2 10 0-6-2-10-8-11-5 1-8 4-10 1z" fill="#6b4e3d" />
          <path className="leg leg-b" d="M218 322v14" stroke="#5d6b74" strokeWidth="5" strokeLinecap="round" />
          <path className="leg leg-a" d="M227 322v14" stroke="#5d6b74" strokeWidth="5" strokeLinecap="round" />
          <path d="M213 322l4-22h11l4 22z" fill="#f0d79a" />
          <path d="M231 308l19-4" stroke="#f1cfb4" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g transform="translate(-22 1)">
          <g className="walker w3">
            <rect x="282" y="290" width="18" height="22" rx="6" fill="#a9d3bd" />
            <circle cx="282" cy="278" r="10.5" fill="#eec7a8" />
            <path d="M272 275c1-10 19-11 21-1-7-3-14-2-21 1z" fill="#3f3a36" />
            <path className="leg leg-a" d="M276 317v18" stroke="#5d6b74" strokeWidth="5" strokeLinecap="round" />
            <path className="leg leg-b" d="M286 317v18" stroke="#5d6b74" strokeWidth="5" strokeLinecap="round" />
            <rect x="272" y="289" width="18" height="28" rx="7" fill="#e9a98a" />
          </g>
        </g>
      </g>
    </svg>
  )
}

function AuthLayout({ children }) {
  return (
    <div className="auth">
      <div className="auth-side">
        <Link to="/" aria-label="KinderLog home">
          <Logo size={34} />
        </Link>
        <SchoolIllustration />
        <div className="auth-side-text">
          <h2>Every school day, gently recorded.</h2>
          <p>Daily journals, attendance and messages that keep teachers and families close.</p>
        </div>
      </div>
      <div className="auth-main">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { user, login } = useStore()
  const navigate = useNavigate()
  const [role, setRole] = useState('teacher')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user && !busy) return <Navigate to={ROLES[user.role].home} replace />
  const opt = ROLE_OPTIONS.find((r) => r.key === role)

  const submit = (e) => {
    e.preventDefault()
    const errs = {}
    if (!phone.trim()) errs.phone = 'Phone number is required.'
    else if (!isPhone(phone)) errs.phone = 'Enter a 10-digit phone number starting with 0.'
    if (!password) errs.password = 'Password is required.'
    setErrors(errs)
    setError('')
    if (Object.keys(errs).length) return
    setBusy(true)
    login(role, phone, password, remember).then((res) => {
      if (res.ok) return navigate(res.home, { replace: true })
      setBusy(false)
      setError(res.error)
    })
  }

  return (
    <AuthLayout>
      <div className="auth-mobile-logo">
        <Logo size={30} />
      </div>
      <h1>Sign in as {ROLES[role].label}</h1>
      <p className="muted">Choose your role, then enter the account provided by your school.</p>

      <div className="role-picker" role="radiogroup" aria-label="Role">
        {ROLE_OPTIONS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={role === r.key}
            className={`role-option ${role === r.key ? 'selected' : ''}`}
            onClick={() => {
              setRole(r.key)
              setError('')
            }}
          >
            <r.icon size={20} />
            {ROLES[r.key].label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <Field label="Phone Number" error={errors.phone}>
          <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter your phone number" autoComplete="username" />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />
        </Field>
        <div className="auth-row">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? 'Signing in…' : 'Login'}
        </button>
      </form>

      <div className="demo-hint">
        <div>
          <strong>Demo account</strong>
          <div className="muted">
            {opt.demo} · password {DEMO_PASSWORD}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            setPhone(opt.demo)
            setPassword(DEMO_PASSWORD)
            setErrors({})
            setError('')
          }}
        >
          Fill in
        </button>
      </div>
      <p className="auth-foot muted">Accounts are created by your school. Please contact the school office if you do not have one.</p>
    </AuthLayout>
  )
}

// The backend has no e-mail service, so a forgotten password is reset by the school (Reset Password in the
// Teachers / Parents / Principals lists sets it back to the initial password).
export function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <div className="auth-mobile-logo">
        <Logo size={30} />
      </div>
      <Link to="/login" className="back-link">
        <ArrowLeft size={16} /> Back to Login
      </Link>
      <div className="auth-center">
        <span className="auth-icon">
          <MailCheck size={30} />
        </span>
        <h1>Forgot your password?</h1>
        <p className="muted">
          Your school can reset it for you. Contact the school office (parents and teachers) or the system administrator (principals); they will set it back to the initial password{' '}
          <strong>{DEMO_PASSWORD}</strong>.
        </p>
        <p className="muted">After signing in, change it in My Profile → Change Password.</p>
        <Link to="/login" className="btn btn-primary btn-block btn-lg">
          Back to Login
        </Link>
      </div>
    </AuthLayout>
  )
}
