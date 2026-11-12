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

// peer://<code>: a camera published with PeerJS by camera.html under the peer id `meetnow-cam-<code>`
// (the same scheme as viewer.html, so a camera can be watched there and here with the same code).
// The backend turns a bare "peer://" into peer://<camera id>, so players always get a code (up to 64 chars).
export const PEER_STREAM = /^peer:\/\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
export const peerCode = (src) => (PEER_STREAM.test(src || '') ? src.slice('peer://'.length) : null)

const PEER_PREFIX = 'meetnow-cam-'
const PEER_RETRY_MS = 4000 // wait before calling a camera that is off or dropped again
const PEER_HEARTBEAT_MS = 12000 // no data from the camera for this long → treat it as lost
// TURN servers come from public/ice-config.js (loaded by index.html, shared with camera.html / viewer.html)
const PEER_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(Array.isArray(window.KINDERLOG_ICE_SERVERS) ? window.KINDERLOG_ICE_SERVERS : []),
  ],
}

/**
 * Plays the stream returned by the backend: peer://<code> through PeerJS (WebRTC), anything else as HLS / MP4.
 * The URL is only ever handed out while the viewing window is open.
 */
export function CameraPlayer({ src, label }) {
  return peerCode(src) ? <PeerCameraPlayer code={peerCode(src)} label={label} /> : <HlsCameraPlayer src={src} label={label} />
}

// Overlays shared by both players while the picture is live.
function LiveOverlay({ label }) {
  const now = useNow(1000)
  return (
    <>
      <span className="cam-live">
        <span className="cam-live-dot" /> LIVE
      </span>
      <span className="cam-clock">
        {label} · {hm(now)}:{String(now.getSeconds()).padStart(2, '0')}
      </span>
    </>
  )
}

/**
 * Same flow as viewer.html: a viewer peer with a random id opens a data connection to `meetnow-cam-<code>`,
 * the camera calls back with its media stream and keeps pinging over the data channel. A camera that is off,
 * closes, errors or stops pinging is called again every few seconds.
 */
function PeerCameraPlayer({ code, label }) {
  const video = useRef(null)
  const [phase, setPhase] = useState('loading') // loading | live | offline | error
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const el = video.current
    if (!el) return
    setPhase('loading')
    const target = PEER_PREFIX + code
    let peer,
      conn,
      call,
      retryTimer,
      lastPing = 0
    let cancelled = false

    const cleanup = () => {
      const c = conn,
        k = call
      conn = call = null
      try {
        c?.close()
      } catch {
        /* already closed */
      }
      try {
        k?.close()
      } catch {
        /* already closed */
      }
    }
    const retry = () => {
      if (cancelled) return
      cleanup()
      el.srcObject = null
      setPhase('offline')
      clearTimeout(retryTimer)
      retryTimer = setTimeout(connect, PEER_RETRY_MS)
    }
    function connect() {
      if (cancelled) return
      clearTimeout(retryTimer)
      cleanup()
      if (!peer?.open) return // connects as soon as the viewer peer is open
      const c = peer.connect(target, { reliable: true, metadata: { name: 'KinderLog' } })
      conn = c
      lastPing = Date.now()
      c.on('data', () => {
        if (conn === c) lastPing = Date.now()
      })
      c.on('close', () => conn === c && retry())
      c.on('error', () => conn === c && retry())
    }

    // A camera that drops off the network often never sends 'close'.
    const heartbeat = setInterval(() => conn && Date.now() - lastPing > PEER_HEARTBEAT_MS && retry(), 2000)
    // Coming back to the tab: reconnect at once instead of waiting for the retry.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (peer?.disconnected && !peer.destroyed) peer.reconnect()
      if (!conn) connect()
      else if (el.paused && el.srcObject) el.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)

    // PeerJS is only downloaded when a PeerJS camera actually opens.
    import('peerjs')
      .then(({ Peer }) => {
        if (cancelled) return
        peer = new Peer(`meetnow-viewer-${Math.random().toString(36).slice(2, 10)}`, { debug: 1, config: PEER_ICE })
        peer.on('open', connect)
        peer.on('call', (incoming) => {
          if (incoming.peer !== target) return incoming.close()
          incoming.answer()
          if (call && call !== incoming)
            try {
              call.close()
            } catch {
              /* already closed */
            }
          call = incoming
          incoming.on('stream', (stream) => {
            if (call !== incoming) return
            el.srcObject = stream
            lastPing = Date.now()
            setPhase('live')
            el.play().catch(() => {
              // Autoplay blocked: the native controls let the viewer start it.
            })
          })
          incoming.on('close', () => call === incoming && retry())
          incoming.on('error', () => call === incoming && retry())
        })
        peer.on('error', (err) => {
          if (err.type === 'peer-unavailable') return retry() // the camera is not broadcasting
          if (['network', 'server-error', 'socket-error', 'unavailable-id'].includes(err.type)) {
            setPhase('offline')
            setTimeout(() => !cancelled && peer.disconnected && !peer.destroyed && peer.reconnect(), 3000)
            return
          }
          setPhase('error')
        })
        peer.on('disconnected', () => setTimeout(() => !cancelled && peer.disconnected && !peer.destroyed && peer.reconnect(), 1000))
      })
      .catch(() => setPhase('error'))

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisible)
      cleanup()
      peer?.destroy()
      el.srcObject = null
    }
  }, [code, attempt])

  return (
    <div className="cam-frame">
      <video ref={video} className="cam-video" muted playsInline controls autoPlay />
      {phase === 'loading' && (
        <div className="cam-loading-overlay" aria-busy="true">
          <span className="cam-loading-text">Connecting to the classroom…</span>
        </div>
      )}
      {phase === 'offline' && (
        <div className="cam-loading-overlay" aria-busy="true">
          <span className="cam-loading-text">The camera is not broadcasting right now — retrying…</span>
        </div>
      )}
      {phase === 'error' && (
        <div className="cam-loading-overlay">
          <ErrorState title="Unable to connect to the classroom camera. Please try again." onRetry={() => setAttempt((a) => a + 1)} />
        </div>
      )}
      {phase === 'live' && <LiveOverlay label={label} />}
      <span className="cam-private">
        <Lock size={12} /> Private stream
      </span>
    </div>
  )
}

/** HLS (.m3u8) or MP4. hls.js handles HLS in Chrome/Edge/Firefox; Safari plays it natively. */
function HlsCameraPlayer({ src, label }) {
  const video = useRef(null)
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
      {phase === 'live' && <LiveOverlay label={label} />}
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
