// Lower-cased and without Vietnamese accents, so "Hương" matches "huong".
export const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

export const truncate = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text)

// Epoch milliseconds, the timestamp format of the API.
export const toMillis = (value) => (value ? new Date(value).getTime() : null)

export const isDateOnly = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
export const isPhone = (value) => typeof value === 'string' && /^0\d{9}$/.test(value.trim())
export const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
export const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
