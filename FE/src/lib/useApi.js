import { useCallback, useEffect, useRef, useState } from 'react'

// Loads data from the backend. Keeps the previous data while reloading so screens don't flash.
// `deps` re-run the request (e.g. a selected date); `reload()` re-runs it after a mutation.
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, loading: true, error: null })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState((s) => ({ data: s.data, loading: false, error })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })), [])
  return { ...state, reload, setData, initial: state.loading && state.data === undefined }
}
