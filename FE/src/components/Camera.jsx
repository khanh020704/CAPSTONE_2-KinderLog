import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Lock, VideoOff } from 'lucide-react'
import { dayLabel, hm } from '../lib/utils'
import { ErrorState, StatusBadge } from './ui'

// Backend states: LIVE | SCHEDULED | UNAVAILABLE (see BE camera-schedule.ts)
export const CAMERA_LABEL = { LIVE: 'Live Now', SCHEDULED: 'Scheduled', UNAVAILABLE: 'Unavailable' }

export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

// Placeholder picture of a classroom, shown while the camera is closed.
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
      <ellipse cx="160" cy="146" rx="78" ry="16" fill="#cdb893" />
      <rect x="100" y="120" width="120" height="10" rx="5" fill="#f3e3c6" />
      <path d="M112 130v22M208 130v22" stroke="#cdb893" strokeWidth="5" />
    </svg>
  )
}

/**
 * Plays the HLS (.m3u8) or MP4 stream returned by the backend. hls.js handles HLS in Chrome/Edge/Firefox;
 * Safari plays it natively. The URL is only ever handed out while the viewing window is open.
 */
export function CameraPlayer({ src, label }) {
  const video = useRef(null)
  const now = useNow(1000)
  const [phase, setPhase] = useState('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const el = video.current
    if (!el || !src) return
    setPhase('loading')
    // Ready as soon as the first frames can play; start playback then (muted, so autoplay is allowed).
    const ready = () => {
      setPhase('live')
      el.play().catch(() => {
        // Autoplay blocked: the native controls let the viewer start it.
      })
    }
    const failed = () => setPhase('error')
    // Browsers refuse to start media in a background tab: try again when the viewer comes back to it.
    const resume = () => document.visibilityState === 'visible' && el.paused && el.readyState >= 3 && el.play().catch(() => {})
    el.addEventListener('canplay', ready)
    el.addEventListener('error', failed)
    document.addEventListener('visibilitychange', resume)
    let hls
    let cancelled = false
    const native = el.canPlayType('application/vnd.apple.mpegurl') // Safari plays HLS itself
    if (/\.m3u8($|\?)/.test(src) && !native) {
      // hls.js (light build: no subtitles/DRM) is only downloaded when a player actually opens.
      import('hls.js/light')
        .then(({ default: Hls }) => {
          if (cancelled) return
          if (!Hls.isSupported()) return failed()
          hls = new Hls({ lowLatencyMode: true })
          hls.on(Hls.Events.ERROR, (_e, data) => data.fatal && failed())
          hls.loadSource(src)
          hls.attachMedia(el)
        })
        .catch(failed)
    } else {
      el.src = src
    }
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', resume)
      el.removeEventListener('canplay', ready)
      el.removeEventListener('error', failed)
      hls?.destroy()
      el.removeAttribute('src')
      el.load()
    }
  }, [src, attempt])

  if (!src)
    return (
      <div className="cam-frame cam-message">
        <ErrorState title="The stream is not available right now." />
      </div>
    )

  return (
    <div className="cam-frame">
      <video ref={video} className="cam-video" muted playsInline controls autoPlay />
      {phase === 'loading' && (
        <div className="cam-loading-overlay" aria-busy="true">
          <span className="cam-loading-text">Connecting to the classroom…</span>
        </div>
      )}
      {phase === 'error' && (
        <div className="cam-loading-overlay">
          <ErrorState title="Unable to load the classroom stream. Please try again." onRetry={() => setAttempt((a) => a + 1)} />
        </div>
      )}
      {phase === 'live' && (
        <>
          <span className="cam-live">
            <span className="cam-live-dot" /> LIVE
          </span>
          <span className="cam-clock">
            {label} · {hm(now)}:{String(now.getSeconds()).padStart(2, '0')}
          </span>
        </>
      )}
      <span className="cam-private">
        <Lock size={12} /> Private stream
      </span>
    </div>
  )
}

export function CameraPreview({ state, variant }) {
  return (
    <div className={`cam-frame cam-preview ${state !== 'LIVE' ? 'cam-dim' : ''}`}>
      <Scene variant={variant} />
      {state === 'LIVE' ? (
        <span className="cam-live">
          <span className="cam-live-dot" /> LIVE
        </span>
      ) : (
        <span className="cam-overlay">{state === 'SCHEDULED' ? <CalendarClock size={26} /> : <VideoOff size={26} />}</span>
      )}
    </div>
  )
}

// cam: { state, window: { date, start, end } | null }
export function CameraStatusText({ cam }) {
  const w = cam.window
  if (cam.state === 'LIVE') return <>Live now · until {w.end}</>
  if (cam.state === 'SCHEDULED')
    return (
      <>
        Opens {dayLabel(w.date).toLowerCase() === 'today' ? 'today' : dayLabel(w.date)} · {w.start}–{w.end}
      </>
    )
  return <>No viewing time is scheduled</>
}

export const CameraBadge = ({ state }) => <StatusBadge status={CAMERA_LABEL[state]} />
