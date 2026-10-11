// HTTP client for the KinderLog backend. It is only used when VITE_API_URL is set
// (see FE/.env.example); without it the app keeps running on its local demo data.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKENS_KEY = 'kinderlog.tokens'

export const apiEnabled = !!BASE

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || (status ? `Request failed (${status}).` : 'Cannot reach the server. Check that the backend is running.'))
    this.status = status
    this.code = body?.error?.code
    this.fields = body?.error?.fields
  }
}

// ---------- tokens ----------
// "Remember me" keeps them in localStorage, otherwise they live as long as the tab.

let tokens = null
try {
  tokens = JSON.parse(sessionStorage.getItem(TOKENS_KEY) || localStorage.getItem(TOKENS_KEY))
} catch {
  tokens = null
}

export function setTokens(next, persistent = tokens?.persistent) {
  sessionStorage.removeItem(TOKENS_KEY)
  localStorage.removeItem(TOKENS_KEY)
  tokens = next ? { accessToken: next.accessToken, refreshToken: next.refreshToken, persistent: !!persistent } : null
  if (tokens) (tokens.persistent ? localStorage : sessionStorage).setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export const hasTokens = () => !!tokens
export const refreshTokenValue = () => tokens?.refreshToken

const parse = (text) => {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

const headersFor = (body, auth) => ({
  ...(body !== undefined && { 'Content-Type': 'application/json' }),
  ...(auth && tokens && { Authorization: `Bearer ${tokens.accessToken}` }),
})

// ---------- asynchronous requests ----------

let refreshing = null

// One refresh at a time: the backend lets a refresh token be used only once.
function refresh() {
  refreshing ||= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens?.refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, parse(await res.text()))
      setTokens(await res.json())
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function request(method, path, body, { auth = true, form } = {}) {
  const send = () =>
    fetch(`${BASE}${path}`, {
      method,
      headers: form ? headersFor(undefined, auth) : headersFor(body, auth),
      body: form || (body === undefined ? undefined : JSON.stringify(body)),
    }).catch(() => {
      throw new ApiError(0)
    })

  let res = await send()
  if (res.status === 401 && auth && tokens?.refreshToken) {
    await refresh()
    res = await send()
  }
  const data = parse(await res.text())
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

// ---------- synchronous requests ----------
// The store's login() and its first render return their result immediately, so the few
// requests they depend on block until the server answers. Everything else is asynchronous.

function sendSync(method, path, body, auth) {
  const xhr = new XMLHttpRequest()
  xhr.open(method, `${BASE}${path}`, false)
  for (const [name, value] of Object.entries(headersFor(body, auth))) xhr.setRequestHeader(name, value)
  try {
    xhr.send(body === undefined ? null : JSON.stringify(body))
  } catch {
    throw new ApiError(0)
  }
  return xhr
}

export function requestSync(method, path, body, { auth = true } = {}) {
  let xhr = sendSync(method, path, body, auth)
  if (xhr.status === 401 && auth && tokens?.refreshToken) {
    const renewed = sendSync('POST', '/auth/refresh', { refreshToken: tokens.refreshToken }, false)
    if (renewed.status !== 200) throw new ApiError(renewed.status, parse(renewed.responseText))
    setTokens(parse(renewed.responseText))
    xhr = sendSync(method, path, body, auth)
  }
  const data = parse(xhr.responseText)
  if (xhr.status < 200 || xhr.status >= 300) throw new ApiError(xhr.status, data)
  return data
}
