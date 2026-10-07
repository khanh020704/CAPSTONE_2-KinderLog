import { useEffect, useState } from 'react'
import { CalendarClock, Lock, VideoOff } from 'lucide-react'
import { byId, useStore } from '../store/store'
import { cameraState, hm } from '../lib/utils'
import { ErrorState, StatusBadge } from './ui'

export const CAMERA_LABEL = { live: 'Live Now', scheduled: 'Scheduled', unavailable: 'Unavailable' }

export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

// Simulated classroom feed: the demo has no physical cameras.
function Scene({ variant = 0 }) {
  const wall = variant ? '#f4efe6' : '#eef3ee'
  return (
    <svg className="cam-scene" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="180" fill={wall} />
      <rect y="128" width="320" height="52" fill="#e2d6c3" />
      <rect x="28" y="24" width="74" height="56" rx="4" fill="#d9e9f2" stroke="#fff" strokeWidth="4" />
      <path d="M65 24v56M28 52h74" stroke="#fff" strokeWidth="3" />
      <rect x="214" y="30" width="80" height="44" rx="3" fill="#fff" stroke="#d8cfbf" strokeWidth="2" />
      <path d="M224 44h40M224 54h56M224 64h30" stroke="#c9d6cf" strokeWidth="3" strokeLinecap="round" />
      <rect x="126" y="34" width="66" height="60" rx="3" fill="#d9c7a8" />
      <path d="M126 54h66M126 74h66" stroke="#c2ad88" strokeWidth="2" />
      <rect x="132" y="40" width="10" height="13" fill="#e9b9a0" />
      <rect x="146" y="42" width="8" height="11" fill="#a9c9b6" />
      <rect x="158" y="39" width="9" height="14" fill="#b9b3dc" />
      <rect x="134" y="60" width="16" height="13" fill="#f0d79a" />
      <rect x="160" y="62" width="20" height="11" fill="#a9c6dc" />
      <ellipse cx="160" cy="146" rx="78" ry="16" fill="#cdb893" />
      <rect x="100" y="120" width="120" height="10" rx="5" fill="#f3e3c6" />
      <path d="M112 130v22M208 130v22" stroke="#cdb893" strokeWidth="5" />
      <g className="cam-kid k1">
        <circle cx="112" cy="104" r="9" fill="#f1cfb4" />
        <path d="M100 126c0-9 5-14 12-14s12 5 12 14z" fill="#e9a98a" />
      </g>
      <g className="cam-kid k2">
        <circle cx="160" cy="100" r="9" fill="#eec7a8" />
        <path d="M148 122c0-9 5-14 12-14s12 5 12 14z" fill="#9fc3b0" />
      </g>
      <g className="cam-kid k3">
        <circle cx="208" cy="104" r="9" fill="#f1cfb4" />
        <path d="M196 126c0-9 5-14 12-14s12 5 12 14z" fill="#a9a2d6" />
      </g>
      <g className="cam-teacher">
        <circle cx="262" cy="92" r="10" fill="#eec7a8" />
        <path d="M246 150c0-28 6-44 16-44s16 16 16 44z" fill="#7fa79a" />
      </g>
    </svg>
  )
}

export function CameraPlayer({ classId, variant }) {
  const { db } = useStore()
  const now = useNow(1000)
  const [phase, setPhase] = useState('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setPhase('loading')
    const t = setTimeout(() => setPhase(navigator.onLine ? 'live' : 'error'), 1300)
    return () => clearTimeout(t)
  }, [classId, attempt])

  if (phase === 'loading')
    return (
      <div className="cam-frame cam-loading" aria-busy="true">
        <span className="skeleton cam-skeleton" />
        <span className="cam-loading-text">Connecting to the classroom…</span>
      </div>
    )
  if (phase === 'error')
    return (
      <div className="cam-frame cam-message">
        <ErrorState title="Unable to load the classroom stream. Please try again." onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    )
  return (
    <div className="cam-frame">
      <Scene variant={variant} />
      <span className="cam-live">
        <span className="cam-live-dot" /> LIVE
      </span>
      <span className="cam-clock">
        {byId(db.classes, classId)?.name} · {hm(now)}:{String(now.getSeconds()).padStart(2, '0')}
      </span>
      <span className="cam-private">
        <Lock size={12} /> Private stream
      </span>
    </div>
  )
}

export function CameraPreview({ state, variant }) {
  return (
    <div className={`cam-frame cam-preview ${state !== 'live' ? 'cam-dim' : ''}`}>
      <Scene variant={variant} />
      {state === 'live' ? (
        <span className="cam-live">
          <span className="cam-live-dot" /> LIVE
        </span>
      ) : (
        <span className="cam-overlay">{state === 'scheduled' ? <CalendarClock size={26} /> : <VideoOff size={26} />}</span>
      )}
    </div>
  )
}

export function useCamera(classId) {
  const { db } = useStore()
  const now = useNow()
  return cameraState(db, classId, now)
}

export function CameraStatusText({ cam }) {
  if (cam.state === 'live') return <>Live now · until {cam.schedule.end}</>
  if (cam.state === 'scheduled') return <>Scheduled · {cam.schedule.start}–{cam.schedule.end} today</>
  return <>No viewing time scheduled for the rest of today</>
}

export const CameraBadge = ({ state }) => <StatusBadge status={CAMERA_LABEL[state]} />
