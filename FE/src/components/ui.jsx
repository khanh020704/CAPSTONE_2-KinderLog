import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Bell,
  Search,
  Shapes,
  Soup,
  X,
} from 'lucide-react'
import { initials, norm, relTime, tintOf } from '../lib/utils'
import { errorText } from '../lib/labels'

export function Logo({ size = 32, withText = true, className = '' }) {
  return (
    <span className={`logo ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <path d="M16 3.2 2.5 13.4l1.8 2.4L6 14.5V27a1.5 1.5 0 0 0 1.5 1.5h5.75V21a2.75 2.75 0 0 1 5.5 0v7.5h5.75A1.5 1.5 0 0 0 26 27V14.5l1.7 1.3 1.8-2.4L16 3.2Zm0 7.3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
      </svg>
      {withText && <span className="logo-text">KinderLog</span>}
    </span>
  )
}

export function Avatar({ name, src, size = 40 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  if (src) return <img className="avatar" style={style} src={src} alt={name} />
  return (
    <span className={`avatar tint-${tintOf(name)}`} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

const STATUS_TONE = {
  success: ['Active', 'Present', 'Present today', 'Completed', 'Published', 'Current', 'Live Now', 'Success', 'Operational', 'Healthy', 'Approved', 'Enabled'],
  warning: ['Pending', 'Needs Review', 'Not Started', 'Scheduled', 'Draft', 'In Progress', 'Not recorded', 'Degraded'],
  error: ['Failed', 'Locked', 'Inactive', 'Unavailable', 'Absent', 'Absent today', 'Recording', 'Disabled', 'Unlinked'],
}

export function StatusBadge({ status }) {
  const tone = Object.keys(STATUS_TONE).find((t) => STATUS_TONE[t].includes(status)) || 'neutral'
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" />
      {status}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="page-header">
      <div>
        {back}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, hint, tint = 'sky' }) {
  return (
    <div className="card stat-card">
      <span className={`stat-icon tint-${tint}`}>
        <Icon size={20} />
      </span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  )
}

// Status breakdown as one bar. Counts sit in the legend so nothing depends on color alone.
export function SegBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div>
      <div className="segbar" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {total === 0 ? (
          <span className="seg seg-neutral" style={{ flex: 1 }} />
        ) : (
          parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={`seg seg-${p.tone}`} style={{ flex: p.value }} title={`${p.label}: ${p.value}`} />)
        )}
      </div>
      <div className="seg-legend">
        {parts.map((p) => (
          <div key={p.label} className="seg-legend-item">
            <span className={`seg-swatch seg-${p.tone}`} />
            <span className="muted">{p.label}</span>
            <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{body}</div>
    </Modal>
  )
}

export function Field({ label, error, hint, required, children, full }) {
  return (
    <label className={`field ${full ? 'field-full' : ''} ${error ? 'has-error' : ''}`}>
      {label && (
        <span className="field-label">
          {label}
          {required && <span className="req"> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="field-error">
          <AlertCircle size={14} /> {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="search">
      <Search size={18} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button type="button" className="icon-btn sm" onClick={() => onChange('')} aria-label="Clear search">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

// Type-to-search picker; stays fast when the list grows because only the top matches render.
export function Combobox({ options, value, onChange, placeholder = 'Search…', emptyText = 'No matches found.' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  const selected = options.find((o) => o.value === value)
  const results = useMemo(() => {
    const nq = norm(q)
    return options.filter((o) => norm(`${o.label} ${o.sub || ''}`).includes(nq)).slice(0, 8)
  }, [options, q])

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (o) => {
    onChange(o.value)
    setOpen(false)
    setQ('')
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="combo" ref={ref}>
      <div className="combo-control">
        <Search size={16} />
        <input
          role="combobox"
          aria-expanded={open}
          value={open ? q : selected ? `${selected.label}${selected.sub ? ` — ${selected.sub}` : ''}` : ''}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true)
            setActive(0)
          }}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onKeyDown={onKey}
        />
        {selected && (
          <button type="button" className="icon-btn sm" onClick={() => onChange('')} aria-label="Clear selection">
            <X size={16} />
          </button>
        )}
      </div>
      {open && (
        <ul className="combo-list" role="listbox">
          {results.length === 0 && <li className="combo-empty">{emptyText}</li>}
          {results.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`combo-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}
            >
              <span>
                <strong>{o.label}</strong>
                {o.sub && <span className="muted"> — {o.sub}</span>}
              </span>
              {o.value === value && <Check size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon = Shapes, title, text, action, soft }) {
  return (
    <div className={`empty ${soft ? 'empty-soft' : ''}`}>
      <span className="empty-icon">
        <Icon size={soft ? 30 : 24} />
      </span>
      <div className="empty-title">{title}</div>
      {text && <div className="muted">{text}</div>}
      {action}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong.', onRetry }) {
  return (
    <div className="empty">
      <span className="empty-icon error">
        <AlertCircle size={24} />
      </span>
      <div className="empty-title">{title}</div>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

// Renders `children(data)` once a useApi() request has data; skeleton while loading, error card with Retry on failure.
export function Loadable({ q, skeleton = <SkeletonCards />, children }) {
  if (q.error && q.data === undefined)
    return (
      <div className="card">
        <ErrorState title={errorText(q.error)} onRetry={q.reload} />
      </div>
    )
  if (q.data === undefined) return skeleton
  return children(q.data)
}

export const Skeleton = ({ h = 16, w = '100%', r = 8 }) => <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} />

export function SkeletonTable({ rows = 6 }) {
  return (
    <div className="card skeleton-table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton h={36} w={36} r={18} />
          <Skeleton w="28%" />
          <Skeleton w="18%" />
          <Skeleton w="14%" />
          <Skeleton w="10%" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="grid stats">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton w="40%" />
          <div style={{ height: 10 }} />
          <Skeleton h={28} w="60%" />
        </div>
      ))}
    </div>
  )
}

// Mock data resolves instantly; a short delay lets screens show their loading state.
export function useFakeLoad(ms = 450) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [ms])
  return loading
}

export function RowMenu({ items }) {
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const menu = useRef(null)
  const visible = items.filter(Boolean)

  useLayoutEffect(() => {
    if (!pos || !menu.current) return
    const r = menu.current.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 8) menu.current.style.top = `${Math.max(8, pos.top - r.height - 44)}px`
  }, [pos])

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  if (visible.length === 0) return null
  const toggle = (e) => {
    e.stopPropagation()
    if (pos) return setPos(null)
    const r = btn.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
  }
  return (
    <>
      <button ref={btn} className="icon-btn" onMouseDown={(e) => e.stopPropagation()} onClick={toggle} aria-label="Actions" aria-haspopup="menu">
        <MoreHorizontal size={20} />
      </button>
      {pos && (
        <div ref={menu} className="menu" role="menu" style={{ top: pos.top, right: pos.right }} onMouseDown={(e) => e.stopPropagation()}>
          {visible.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={`menu-item ${it.danger ? 'danger' : ''}`}
              onClick={() => {
                setPos(null)
                it.onClick()
              }}
            >
              {it.icon && <it.icon size={16} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export function Pagination({ page, pages, total, onPage }) {
  if (pages <= 1)
    return (
      <div className="pagination muted">
        {total} {total === 1 ? 'record' : 'records'}
      </div>
    )
  return (
    <div className="pagination">
      <span className="muted">
        Page {page} of {pages} · {total} records
      </span>
      <div className="pagination-btns">
        <button className="icon-btn bordered" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={18} />
        </button>
        <button className="icon-btn bordered" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <div className="select">
      <select value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        })}
      </select>
      <ChevronDown size={16} />
    </div>
  )
}

const NOTIF_ICON = { journal: BookOpen, message: MessageCircle, announcement: Megaphone, camera: Camera, system: Bell }

export function NotificationItem({ n, unread, onClick }) {
  const Icon = NOTIF_ICON[n.type] || Bell
  return (
    <button className={`notif ${unread ? 'unread' : ''}`} onClick={onClick}>
      <span className="notif-icon">
        <Icon size={18} />
      </span>
      <span className="notif-main">
        <span className="notif-title">{n.title}</span>
        <span className="muted">{n.body}</span>
        <span className="notif-time">
          {relTime(n.at)} · {unread ? 'Unread' : 'Read'}
        </span>
      </span>
      {unread && <span className="unread-dot" aria-hidden="true" />}
    </button>
  )
}

const DEMO_PHOTOS = {
  drawing: { icon: Palette, label: 'Giờ vẽ tranh', tint: 'peach' },
  meal: { icon: Soup, label: 'Bữa trưa', tint: 'cream' },
  play: { icon: Shapes, label: 'Giờ chơi', tint: 'mint' },
  book: { icon: BookOpen, label: 'Giờ kể chuyện', tint: 'lav' },
}

// Seeded journals reference "demo:<kind>" placeholders; uploaded photos are data URLs.
export function PhotoTile({ src, onRemove }) {
  const demo = src.startsWith('demo:') ? DEMO_PHOTOS[src.slice(5)] : null
  return (
    <div className={`photo ${demo ? `tint-${demo.tint}` : ''}`}>
      {demo ? (
        <>
          <demo.icon size={28} />
          <span>{demo.label}</span>
        </>
      ) : (
        <img src={src} alt="Journal attachment" />
      )}
      {onRemove && (
        <button type="button" className="photo-remove" onClick={onRemove} aria-label="Remove photo">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((text, tone = 'success') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.tone === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
