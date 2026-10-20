// The local calendar day, 'YYYY-MM-DD'. Calendar dates are kept as these strings so they never shift with the time zone.
export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Every table has CreatedAt (or a renamed equivalent) and most have UpdatedAt, set by the application in UTC.
export const created = (column) => ({ type: 'datetime', auto: 'created', ...(column && { column }) })
export const updated = () => ({ type: 'datetime', auto: 'updated' })
